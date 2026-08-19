// dsh-lan-manager — LAN exposure orchestration for the dsh web profile.
//
// Host-side plugin that manages:
//   - a native Caddy https reverse proxy in front of dsh (spawn/kill/restart,
//     pidfile + health-checked, idempotent),
//   - the local-CA TLS certificate (status via crypto.X509Certificate,
//     regeneration via the gen-cert.sh next to the deploy root),
//   - the "install the CA" banner on the dsh page (OFF by default; toggled
//     through the settings page or the setCertNotice action; state persists
//     in <deployDir>/caddy/cert-notice.json),
//   - optional Tailscale control (up/down/funnel/serve) via the system binary,
//   - an mDNS/avahi readiness probe for the banner detection.
//
// The deploy root is DERIVED from this file's location: plugins live at
// <deployDir>/plugins/dsh-lan-manager/, so the plugin works after a plain
// copy of the whole deploy directory to any machine — no hardcoded paths,
// IPs, or hostnames. All defaults are environment/derivation based; the
// cordis.patch.yml row only overrides what a deployment must customize.
//
// HTTP surface (registered on the webserver, outside /api):
//   GET  /lan.status.json → status + checks
//   POST /lan.action      → { action: 'start'|'stop'|'restart'|'regenCert'
//                              |'autoConfig'|'setCertNotice'|'tailscaleUp'
//                              |'tailscaleDown'|'tailscaleFunnel'|'tailscaleServe' }
//
// On disposal the proxy is left running (the process may restart without
// dropping the URL); use the stop action or the launcher to bring it down.
import { spawn, execFile } from 'node:child_process'
import { promises as fs, openSync, closeSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import { fileURLToPath } from 'node:url'
import { X509Certificate, randomBytes } from 'node:crypto'

export const name = 'dsh-lan-manager'
export const inject = ['webServer']

// No Config schema on purpose: the plugin imports nothing outside node's
// built-ins, so it runs from any location without a node_modules of its own
// (a schema would drag in schemastery, whose bare import resolves from the
// plugin's real path — broken once the plugin lives outside the profile).
// All defaults are applied in apply(); cordis passes the raw row config
// through unchanged when a plugin exports no Config.
const DEFAULTS = {
  deployDir: '', // derived from this file's location
  port: 3080,
  localPort: 3081,
  lanIp: '',
  caddyBin: 'caddy',
  autoStart: true,
  tailscale: true,
  certNotice: false,
  probeHost: '',
  probePort: 3080,
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** First non-internal IPv4, preferring RFC1918 — mirrors the launcher. */
function detectIp() {
  const nets = os.networkInterfaces()
  const ips = []
  for (const list of Object.values(nets)) {
    for (const it of list || []) {
      if (it.family === 'IPv4' && !it.internal) ips.push(it.address)
    }
  }
  if (ips.length === 1) return ips[0]
  const rfc1918 = ips.find((ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(ip))
  return rfc1918 || ips[0] || '127.0.0.1'
}

export function apply(ctx, rawConfig) {
  // Merge raw row config over portable defaults (no schema: cordis passes
  // the raw config through unchanged).
  const config = { ...DEFAULTS, ...(rawConfig || {}) }
  // Deploy root derived from this file's real location (symlinks resolved).
  const here = path.dirname(fileURLToPath(import.meta.url))
  const deployDir = config.deployDir || path.resolve(here, '..', '..')
  const caddyDir = path.join(deployDir, 'caddy')
  const pidFile = path.join(caddyDir, 'caddy.pid')
  const runLog = path.join(caddyDir, 'caddy-run.log')
  const caddyConf = path.join(caddyDir, 'Caddyfile')
  const certFile = path.join(caddyDir, 'certs', 'dsh.crt')
  const caFile = path.join(caddyDir, 'certs', 'ca', 'ca.crt')
  const genCert = path.join(deployDir, 'gen-cert.sh')
  const noticeStateFile = path.join(caddyDir, 'cert-notice.json')
  const log = ctx.logger

  const readPid = async () => {
    try {
      const s = (await fs.readFile(pidFile, 'utf8')).trim()
      const n = Number.parseInt(s, 10)
      return Number.isFinite(n) && n > 0 ? n : 0
    } catch {
      return 0
    }
  }

  const alive = (pid) => {
    if (!pid) return false
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  /** TLS-health probe of the https endpoint (accepts the local CA leaf). */
  const healthy = () =>
    new Promise((resolve) => {
      const ip = config.lanIp || detectIp()
      const req = https.request(
        { hostname: ip, port: config.port, path: '/', method: 'HEAD', rejectUnauthorized: false, timeout: 2000 },
        (res) => {
          res.resume()
          resolve(res.statusCode ? res.statusCode < 500 : false)
        },
      )
      req.on('timeout', () => req.destroy())
      req.on('error', () => resolve(false))
      req.end()
    })

  /** TLS-health probe against an arbitrary host. */
  const reachUrl = (host, port) =>
    new Promise((resolve) => {
      const req = https.request(
        { hostname: host, port, path: '/', method: 'HEAD', rejectUnauthorized: false, timeout: 2500 },
        (res) => {
          res.resume()
          resolve(res.statusCode ? res.statusCode < 500 : false)
        },
      )
      req.on('timeout', () => req.destroy())
      req.on('error', () => resolve(false))
      req.end()
    })

  /** Plain-HTTP reachability probe (dsh's own loopback listener is http). */
  const reachHttp = (host, port) =>
    new Promise((resolve) => {
      const req = http.request({ hostname: host, port, path: '/', method: 'HEAD', timeout: 2500 }, (res) => {
        res.resume()
        resolve(res.statusCode ? res.statusCode < 500 : false)
      })
      req.on('timeout', () => req.destroy())
      req.on('error', () => resolve(false))
      req.end()
    })

  const caddyRunning = async () => {
    const pid = await readPid()
    if (!alive(pid)) return { running: false, pid: 0 }
    // The pidfile may be stale (crash, kill -9) and the pid reused by an
    // unrelated process — kill -0 alone would false-positive. On Linux,
    // verify the process is actually caddy before reporting running.
    try {
      const comm = (await fs.readFile(`/proc/${pid}/comm`, 'utf8')).trim()
      if (comm !== 'caddy') return { running: false, pid, stale: true }
    } catch {
      // Non-Linux or unreadable /proc: fall back to pid-alive only.
    }
    return { running: true, pid }
  }

  const exec = (cmd, args) =>
    new Promise((resolve) => {
      execFile(cmd, args, { timeout: 15000 }, (err, stdout, stderr) => {
        if (err) resolve({ ok: false, code: err.code, message: (stderr || err.message || '').toString().trim() })
        else resolve({ ok: true, output: stdout.toString().trim() })
      })
    })

  async function certInfo() {
    try {
      const pem = await fs.readFile(certFile, 'utf8')
      const leaf = new X509Certificate(pem)
      const san = leaf.subjectAltName || ''
      let ca = 'missing'
      try {
        ca = (await fs.stat(caFile)).size > 0 ? 'present' : 'missing'
      } catch {
        ca = 'missing'
      }
      const ip = config.lanIp || detectIp()
      return {
        present: true,
        subject: leaf.subject,
        issuer: leaf.issuer,
        san: san.split('\n').map((l) => l.trim()),
        coversLanIp: san.includes(`IP Address:${ip}`),
        validFrom: leaf.validFrom,
        validTo: leaf.validTo,
        ca,
      }
    } catch {
      return { present: false, reason: 'no leaf cert' }
    }
  }

  async function tailscaleStatus() {
    if (!config.tailscale) return { enabled: false }
    const found = await exec('tailscale', ['version'])
    if (!found.ok) return { enabled: true, installed: false, detail: found.message }
    const st = await exec('tailscale', ['status', '--json'])
    if (!st.ok) return { enabled: true, installed: true, accessDenied: true, detail: st.message }
    let parsed
    try {
      parsed = JSON.parse(st.output)
    } catch {
      return { enabled: true, installed: true, detail: 'unparsable status' }
    }
    const self = parsed.Self || {}
    const funnel = await exec('tailscale', ['funnel', 'status'])
    const serve = await exec('tailscale', ['serve', 'status'])
    const serves = serve.ok && serve.output
      ? serve.output.split('\n').filter((l) => l.includes('http')).map((l) => l.trim())
      : []
    return {
      enabled: true,
      installed: true,
      running: parsed.BackendState === 'Running',
      hostname: self.HostName || '',
      dnsName: (self.DNSName || '').replace(/\.$/, ''),
      tailnetIPs: Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs : [],
      funnel: funnel.ok ? funnel.output.trim() : undefined,
      serve: serves.length ? serves : serve.ok ? 'off' : 'unknown',
      serveDetail: serve.ok ? serve.output.trim() : serve.message,
      serveUrl: serves[0] || '',
    }
  }

  async function mdnsStatus() {
    const r = await exec('systemctl', ['is-active', 'avahi-daemon'])
    return r.ok && r.output === 'active'
  }

  async function checks() {
    const ip = config.lanIp || detectIp()
    const caddyBin = await exec('bash', ['-lc', `command -v ${config.caddyBin}`])
    const confPresent = await fs
      .access(caddyConf)
      .then(() => true)
      .catch(() => false)
    const caddyProbe = await caddyRunning()
    const ts = await tailscaleStatus()
    const port = {
      lan: await reachUrl(ip, config.port),
      tailnet: ts.running && ts.tailnetIPs.length ? await reachUrl(ts.tailnetIPs[0], config.port) : false,
      local: await reachHttp('127.0.0.1', config.localPort),
    }
    return {
      caddy: {
        installed: caddyBin.ok,
        path: caddyBin.ok ? caddyBin.output : null,
        configPresent: confPresent,
        running: caddyProbe.running,
      },
      port,
      tailscale: ts,
    }
  }

  async function status() {
    const caddy = await caddyRunning()
    const ip = config.lanIp || detectIp()
    return {
      lanIp: ip,
      url: `https://${ip}:${config.port}/`,
      port: config.port,
      dshLocalPort: config.localPort,
      autoStart: config.autoStart,
      caddy: { ...caddy, config: caddyConf, healthy: caddy.running ? await healthy() : false },
      cert: await certInfo(),
      mdns: await mdnsStatus(),
      tailscale: await tailscaleStatus(),
      certNotice: { ...noticeState },
      checks: await checks(),
    }
  }

  function spawnCaddy() {
    return new Promise((resolve, reject) => {
      const errFd = openSync(runLog, 'w')
      const child = spawn(config.caddyBin, ['run', '--config', caddyConf, '--adapter', 'caddyfile'], {
        env: {
          ...process.env,
          DSH_DEPLOY_DIR: deployDir,
          XDG_DATA_HOME: path.join(caddyDir, 'data'),
          XDG_CONFIG_HOME: path.join(caddyDir, 'config'),
        },
        stdio: ['ignore', 'ignore', errFd],
        detached: false,
      })
      closeSync(errFd)
      child.once('error', reject)
      child.once('spawn', () => resolve(child))
    })
  }

  async function start() {
    const cur = await caddyRunning()
    if (cur.running && (await healthy())) {
      return { ok: true, alreadyRunning: true, pid: cur.pid }
    }
    let child
    try {
      child = await spawnCaddy()
    } catch (e) {
      return { ok: false, message: `cannot spawn caddy: ${e.message}` }
    }
    await fs.writeFile(pidFile, String(child.pid))
    child.on('exit', () => {
      fs.unlink(pidFile).catch(() => {})
    })
    for (let i = 0; i < 40; i++) {
      if (await healthy()) return { ok: true, pid: child.pid }
      if (child.exitCode !== null) break
      await sleep(250)
    }
    const msg = `caddy did not become healthy within 10s; see ${runLog}`
    log.warn(`[lan-manager] ${msg}`)
    return { ok: false, message: msg, exitCode: child.exitCode }
  }

  async function stop() {
    const pid = await readPid()
    if (!alive(pid)) {
      await fs.unlink(pidFile).catch(() => {})
      return { ok: true, alreadyStopped: true }
    }
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      return { ok: false, message: `cannot signal pid ${pid}` }
    }
    for (let i = 0; i < 40; i++) {
      if (!alive(pid)) break
      await sleep(250)
    }
    await fs.unlink(pidFile).catch(() => {})
    return { ok: !alive(pid), message: alive(pid) ? 'caddy did not exit' : `stopped pid ${pid}` }
  }

  async function regenCert() {
    const r = await exec('bash', [genCert])
    if (r.ok && r.output.includes('cert regenerated')) {
      await stop()
      const st2 = await start()
      return { ok: st2.ok, regenerated: true, message: `cert regenerated; caddy restart ${st2.ok ? 'ok' : 'failed'}` }
    }
    return { ok: r.ok, regenerated: false, message: r.output || r.message }
  }

  async function action(body) {
    switch (body && body.action) {
      case 'start':
        return { ...(await start()), message: 'proxy started' }
      case 'stop':
        return { ...(await stop()), message: 'proxy stopped' }
      case 'restart': {
        await stop()
        return { ...(await start()), message: 'proxy restarted' }
      }
      case 'regenCert':
        return regenCert()
      case 'tailscaleUp': {
        const r = await exec('tailscale', ['up', '--operator=' + os.userInfo().username])
        return r.ok ? { ok: true, message: 'tailscale up requested' } : { ok: false, message: r.message }
      }
      case 'tailscaleDown': {
        const r = await exec('tailscale', ['down'])
        return r.ok ? { ok: true, message: 'tailscale down' } : { ok: false, message: r.message }
      }
      case 'tailscaleFunnel': {
        const on = body.funnelOn !== false
        const r = on
          ? await exec('tailscale', ['funnel', String(config.port)])
          : await exec('tailscale', ['funnel', 'off'])
        return r.ok
          ? { ok: true, message: on ? `funnel on port ${config.port}` : 'funnel off' }
          : { ok: false, message: r.message }
      }
      case 'tailscaleServe': {
        const on = body.serveOn !== false
        const r = on
          ? await exec('tailscale', ['serve', '--bg', '--https=443', String(config.localPort)])
          : await exec('tailscale', ['serve', 'off'])
        if (!r.ok) return { ok: false, message: r.message }
        const st = await tailscaleStatus()
        return {
          ok: true,
          message: on ? `tailscale serve up: ${st.serveUrl || st.serveDetail}` : 'tailscale serve off',
          serveUrl: st.serveUrl || '',
        }
      }
      case 'setCertNotice': {
        noticeState.enabled = body.on === true
        if (body.probeHost) noticeState.probeHost = String(body.probeHost)
        await fs
          .mkdir(caddyDir, { recursive: true })
          .then(() => fs.writeFile(noticeStateFile, JSON.stringify(noticeState, null, 2)))
        applyNoticeTap()
        return { ok: true, message: `证书安装提示已${noticeState.enabled ? '开启' : '关闭'}` }
      }
      case 'autoConfig': {
        // One-click bring-up: cert, Caddyfile template, then start the proxy.
        const steps = []
        const certOk = await fs
          .access(certFile)
          .then(() => true)
          .catch(() => false)
        if (!certOk) {
          const g = await exec('bash', [genCert])
          steps.push(g.ok ? 'cert generated' : `cert generation failed: ${g.message}`)
        }
        const confOk = await fs
          .access(caddyConf)
          .then(() => true)
          .catch(() => false)
        if (!confOk) {
          const ip = config.lanIp || detectIp()
          await fs.mkdir(caddyDir, { recursive: true })
          await fs.writeFile(
            caddyConf,
            [
              '{',
              '\tadmin off',
              '\tauto_https off',
              '}',
              '',
              `https://:${config.port} {`,
              `\ttls {$DSH_DEPLOY_DIR}/caddy/certs/dsh.crt {$DSH_DEPLOY_DIR}/caddy/certs/dsh.key`,
              '',
              '\thandle /ca.crt {',
              '\t\troot * {$DSH_DEPLOY_DIR}/caddy/certs/ca',
              '\t\theader Content-Type "application/x-x509-ca-cert"',
              '\t\tfile_server',
              '\t}',
              '\thandle /ca-install.html {',
              '\t\troot * {$DSH_DEPLOY_DIR}/caddy/static',
              '\t\tfile_server',
              '\t}',
              '',
              '\thandle {',
              `\t\treverse_proxy 127.0.0.1:${config.localPort} {`,
              '\t\t\ttransport http {',
              '\t\t\t\tdial_timeout 10s',
              '\t\t\t\tkeepalive off',
              '\t\t\t}',
              `\t\t\theader_up Host 127.0.0.1:${config.localPort}`,
              `\t\t\theader_up Origin "http://127.0.0.1:${config.localPort}"`,
              '\t\t}',
              '\t}',
              '',
              '\tencode gzip',
              '}',
              '',
            ].join('\n'),
          )
          steps.push(`Caddyfile written (https://:${config.port})`)
        }
        const st = await start()
        steps.push(st.ok ? `proxy ${st.alreadyRunning ? 'already running' : 'started'}` : `proxy start failed: ${st.message}`)
        return { ok: st.ok, steps }
      }
      default:
        return { ok: false, message: `unknown action ${body && body.action}` }
    }
  }

  // ── CA banner (certNotice) ───────────────────────────────────────────────
  // Probe logic: the page at https://<LAN_IP>:3080 probes
  // https://<probeHost>:<probePort>/probe-<ts> (no-cors). Only a device that
  // has installed caddy/certs/ca/ca.crt AND can resolve the mDNS hostname
  // completes the handshake — anything else rejects and the banner appears.
  const BANNER = `(function () {
  var probeHost = %PROBE_HOST%;
  var probePort = %PROBE_PORT%;
  var BANNER_ID = "dsh-ca-banner";
  var NOW = Date.now();
  if (document.getElementById(BANNER_ID)) return;
  if (location.hostname === "127.0.0.1" || location.hostname === "localhost") return;
  if (location.hostname.indexOf(".ts.net") !== -1) return;
  if (location.protocol !== "https:") return;
  function probe() {
    return fetch("https://" + probeHost + ":" + probePort + "/probe-" + NOW, {
      mode: "no-cors",
      cache: "no-store",
    }).then(function () { return true; }).catch(function () { return false; });
  }
  function dismissedRecently() {
    try {
      var t = parseInt(localStorage.getItem("dsh-ca-dismiss") || "0", 10);
      return t && (NOW - t) < 7 * 24 * 3600 * 1000;
    } catch (e) { return false; }
  }
  function show() {
    var b = document.createElement("div");
    b.id = BANNER_ID;
    b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;" +
      "background:#fff8e6;color:#3d2c00;border-top:2px solid #e6a700;" +
      "padding:8px 14px;font:13px/1.5 system-ui,sans-serif;display:flex;gap:10px;" +
      "align-items:center;flex-wrap:wrap;box-shadow:0 -2px 8px rgba(0,0,0,.15)";
    b.innerHTML =
      "<span><b>安全连接未验证</b>：安装本机局域网证书后，此提示不再出现，浏览器也不会再报警“不安全”。</span>" +
      '<a href="/ca.crt" style="background:#e6a700;color:#fff;text-decoration:none;padding:4px 10px;border-radius:4px;font-weight:600">下载证书</a>' +
      '<a href="/ca-install.html" style="color:#7a5b00">安装说明</a>' +
      '<button type="button" style="background:none;border:none;color:#7a5b00;cursor:pointer;font-size:12px" data-act="dismiss">稍后再说</button>';
    document.body.appendChild(b);
    var btn = b.querySelector('[data-act="dismiss"]');
    if (btn) btn.onclick = function () {
      try { localStorage.setItem("dsh-ca-dismiss", Date.now()); } catch (e) {}
      b.remove();
    };
  }
  window.setTimeout(function () {
    probe().then(function (ok) { if (!ok && !dismissedRecently()) show(); });
  }, 1200);
})();`

  const noticeState = {
    enabled: config.certNotice,
    probeHost: config.probeHost || `${os.hostname()}.local`,
    probePort: config.probePort,
  }
  let tapDispose = null

  const applyNoticeTap = () => {
    if (tapDispose) {
      tapDispose()
      tapDispose = null
    }
    if (!noticeState.enabled) return
    const script = BANNER.replace('%PROBE_HOST%', JSON.stringify(noticeState.probeHost)).replace(
      '%PROBE_PORT%',
      String(noticeState.probePort),
    )
    const inject = `<script>${script}</script>`
    tapDispose = ctx.webServer.tapIndex((html) => {
      if (html.includes('dsh-ca-banner')) return html
      return html.replace('</head>', `${inject}\n</head>`)
    })
  }

  // Persisted runtime state wins over config (so the settings toggle survives
  // restarts without editing cordis.patch.yml).
  void (async () => {
    try {
      const saved = JSON.parse(await fs.readFile(noticeStateFile, 'utf8'))
      if (typeof saved.enabled === 'boolean') noticeState.enabled = saved.enabled
      if (typeof saved.probeHost === 'string' && saved.probeHost) noticeState.probeHost = saved.probeHost
    } catch {
      /* first run: keep config default */
    }
    applyNoticeTap()
  })()

  // The per-boot action token, delivered to the browser only via the served
  // index page (meta tag). Rotates on every dsh restart. Declared before the
  // routes so no handler can observe it uninitialized.
  const actionToken = randomBytes(24).toString('hex')
  const tokenTap = ctx.webServer.tapIndex((html) => {
    if (html.includes('name="dsh-lan-token"')) return html
    return html.replace('</head>', `<meta name="dsh-lan-token" content="${actionToken}">\n</head>`)
  })

  // ── HTTP surface ─────────────────────────────────────────────────────────
  const sendJson = (res, code, obj) => {
    const body = JSON.stringify(obj)
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  }
  const readBody = (req) =>
    new Promise((resolve) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
        } catch {
          resolve(null)
        }
      })
      req.on('error', () => resolve(null))
    })

  const disposers = []
  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/lan.status.json',
      handler: async (req, res) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { ok: false, message: 'GET only' })
          return
        }
        sendJson(res, 200, await status())
      },
    }),
  )
  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/lan.action',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, message: 'POST only' })
          return
        }
        // Mutating surface is gated by the per-boot token injected into the
        // served index.html — the settings page carries it automatically;
        // anonymous LAN POSTs get 401.
        if (req.headers['x-lan-token'] !== actionToken) {
          sendJson(res, 401, { ok: false, message: 'unauthorized: missing or stale X-Lan-Token (refresh the dsh page)' })
          return
        }
        const body = await readBody(req)
        let out
        try {
          out = await action(body)
        } catch (e) {
          out = { ok: false, message: `action error: ${e.message}` }
        }
        sendJson(res, out.ok ? 200 : 400, { ...out, status: await status() })
      },
    }),
  )

  // ── auto-start ───────────────────────────────────────────────────────────
  if (config.autoStart) {
    setTimeout(() => {
      start()
        .then((r) =>
          log.info(`[lan-manager] auto-start => ${r.ok ? 'ok' : 'failed'} pid=${r.pid || 0} msg=${r.message || ''}`),
        )
        .catch((e) => log.warn(`[lan-manager] auto-start error: ${e.message}`))
    }, 750)
  }
  log.info(`[lan-manager] active deployDir=${deployDir} port=${config.port}`)

  return () => {
    if (tokenTap) {
      try {
        tokenTap()
      } catch {
        /* best effort */
      }
    }
    for (const d of disposers) {
      try {
        d()
      } catch {
        /* best effort */
      }
    }
    if (tapDispose) {
      try {
        tapDispose()
      } catch {
        /* best effort */
      }
    }
  }
}