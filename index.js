// dsh-lan-manager — LAN exposure orchestration for the dsh web profile.
//
// Host-side plugin that manages:
//   - a native Caddy https reverse proxy in front of dsh (spawn/kill/restart,
//     pidfile + health-checked, idempotent),
//   - the local-CA TLS certificate (status via crypto.X509Certificate,
//     regeneration via the gen-cert.sh next to the deploy root),
//   - the "install the CA" banner on the dsh page (OFF by default; toggled
//     through the settings page or the setCertNotice action; state persists
//     in <stateDir>/caddy/cert-notice.json),
//   - optional Tailscale control (up/down/funnel/serve) via the system binary,
//   - an mDNS/avahi readiness probe for the banner detection.
//
// The deploy root is this package's own directory. Runtime state lives under
// <dsh-home>/dsh-lan-manager (see README), so the package directory stays
// portable and contains no machine-specific paths, IPs, or hostnames.
//
// HTTP surface (registered on the webserver, outside /api):
//   GET  /lan.status.json → status + checks
//   POST /lan.action      → { action: 'start'|'stop'|'restart'|'regenCert'
//                              |'autoConfig'|'setCertNotice'|'tailscaleUp'
//                              |'tailscaleDown'|'tailscaleFunnel'|'tailscaleServe' }
//
// On disposal, SIGINT/SIGTERM, or process exit the plugin stops only the
// services it owns (or that are demonstrably dsh-lan — same Caddyfile path).
// A caddy or Tailscale session started by the user is left untouched.
import { spawn, execFile, spawnSync } from 'node:child_process'
import { promises as fs, openSync, closeSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import { fileURLToPath } from 'node:url'
import { X509Certificate, randomBytes, timingSafeEqual } from 'node:crypto'

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
  stateDir: '', // runtime config/state; defaults to $DSH_HOME/dsh-lan-manager (~/.dsh/dsh-lan-manager)
  port: 3081,
  localPort: 3080,
  tailscalePort: 3082,
  lanIp: '',
  caddyBin: 'caddy',
  // Nothing auto-starts without the user turning it on in the settings
  // page (or opting in via cordis.patch.yml): the reverse proxy and
  // Tailscale both default to OFF at boot.
  autoStart: false,
  tailscaleAutoStart: false,
  tailscale: true,
  certNotice: false,
  probeHost: '',
  probePort: 3081,
  // Access-control defaults: both optional for private paths; Funnel always
  // requires a configured Basic Auth credential before it may be enabled.
  lanAuth: false,
  serveAuth: false,
  funnelRequiresAuth: true,
  basicAuthUser: 'dsh',
  basicAuthHash: '',
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
  // The plugin package root is the deploy root: it ships the Caddyfile
  // template, static CA page, and gen-cert.sh alongside index.js.
  const deployDir = config.deployDir || here
  // dsh keeps all user data under one home root: explicit config first,
  // then $DSH_HOME, then ~/.dsh. Runtime state for this plugin lives in
  // <dsh-home>/dsh-lan-manager, so the deploy directory stays read-only and
  // portable across machines.
  const dshHome = config.stateDir || (process.env.DSH_HOME && process.env.DSH_HOME.trim()) || path.join(os.homedir(), '.dsh')
  const stateDir = path.resolve(dshHome, 'dsh-lan-manager')
  const caddyDir = path.join(stateDir, 'caddy')
  const pidFile = path.join(caddyDir, 'caddy.pid')
  const runLog = path.join(caddyDir, 'caddy-run.log')
  const caddyConf = path.join(caddyDir, 'Caddyfile')
  const certFile = path.join(caddyDir, 'certs', 'dsh.crt')
  const caFile = path.join(caddyDir, 'certs', 'ca', 'ca.crt')
  const genCert = path.join(deployDir, 'gen-cert.sh')
  const noticeStateFile = path.join(caddyDir, 'cert-notice.json')
  const lanStateFile = path.join(caddyDir, 'lan-state.json')
  const authStateFile = path.join(caddyDir, 'auth-state.json')
  const log = ctx.logger

  // Runtime-toggled settings: persisted so the settings page can change them
  // without editing cordis.patch.yml. Effective value = state file first,
  // then row config, then defaults.
  let autoStart = config.autoStart
  let tailscaleAutoStart = config.tailscaleAutoStart
  let lanAuth = config.lanAuth === true
  let serveAuth = config.serveAuth === true
  const funnelRequiresAuth = config.funnelRequiresAuth !== false
  let basicAuthUser = config.basicAuthUser || 'dsh'
  let basicAuthHash = typeof config.basicAuthHash === 'string' ? config.basicAuthHash : ''
  let resolveSettingsLoaded
  const settingsLoaded = new Promise((resolve) => {
    resolveSettingsLoaded = resolve
  })
  void (async () => {
    try {
      const saved = JSON.parse(await fs.readFile(lanStateFile, 'utf8'))
      if (typeof saved.autoStart === 'boolean') autoStart = saved.autoStart
      if (typeof saved.tailscaleAutoStart === 'boolean') tailscaleAutoStart = saved.tailscaleAutoStart
      if (typeof saved.lanAuth === 'boolean') lanAuth = saved.lanAuth
      if (typeof saved.serveAuth === 'boolean') serveAuth = saved.serveAuth
    } catch {
      /* first run */
    }
    try {
      const auth = JSON.parse(await fs.readFile(authStateFile, 'utf8'))
      if (typeof auth.user === 'string' && auth.user) basicAuthUser = auth.user
      if (typeof auth.hash === 'string' && auth.hash) basicAuthHash = auth.hash
    } catch {
      /* credentials are generated on demand */
    }
    resolveSettingsLoaded()
  })()

  const persistRuntimeSettings = async () => {
    await fs.mkdir(caddyDir, { recursive: true })
    await fs.writeFile(lanStateFile, JSON.stringify({ autoStart, tailscaleAutoStart, lanAuth, serveAuth }, null, 2) + '\n')
  }

  const persistAuthState = async () => {
    await fs.mkdir(caddyDir, { recursive: true })
    await fs.writeFile(authStateFile, JSON.stringify({ user: basicAuthUser, hash: basicAuthHash }, null, 2) + '\n', { mode: 0o600 })
  }

  const proxyToDsh = () => [
    `\t\treverse_proxy 127.0.0.1:{$DSH_LOCAL_PORT} {`,
    '\t\t\ttransport http {',
    '\t\t\t\tdial_timeout 10s',
    '\t\t\t\tkeepalive off',
    '\t\t\t}',
    '\t\t\theader_up Host 127.0.0.1:{$DSH_LOCAL_PORT}',
    '\t\t\theader_up Origin "http://127.0.0.1:{$DSH_LOCAL_PORT}"',
    '\t\t}',
  ]

  const basicAuthLines = () => [
    '\t\tbasic_auth {',
    `\t\t\t${basicAuthUser} ${basicAuthHash}`,
    '\t\t}',
  ]

  const buildCaddyfile = () => {
    const lanAuthLines = lanAuth && basicAuthHash ? basicAuthLines() : []
    const serveAuthLines = serveAuth && basicAuthHash ? basicAuthLines() : []
    const funnelLines = basicAuthHash
      ? [...basicAuthLines(), ...proxyToDsh()]
      : ['\t\trespond "Funnel access is disabled because no Basic Auth credential is configured" 403']
    const lines = [
      '# dsh LAN https proxy — native Caddy. Generated by dsh-lan-manager.',
      '#',
      '# Topology:',
      '#   LAN clients -> https://<LAN_IP>:{$DSH_PORT}',
      '#   Tailscale    -> https://<host>.ts.net -> tailscaled -> http://127.0.0.1:{$DSH_TAILSCALE_PORT}',
      '#   Caddy        -> dsh at 127.0.0.1:{$DSH_LOCAL_PORT}',
      '#',
      '{',
      '\tadmin off',
      '\tauto_https off',
      '\tgrace_period 3s',
      '}',
      '',
      'https://:{$DSH_PORT} {',
      '\ttls {$DSH_CADDY_DIR}/certs/dsh.crt {$DSH_CADDY_DIR}/certs/dsh.key',
      '',
      '\thandle /ca.crt {',
      '\t\troot * {$DSH_CADDY_DIR}/certs/ca',
      '\t\theader Content-Type "application/x-x509-ca-cert"',
      '\t\tfile_server',
      '\t}',
      '\thandle /ca-install.html {',
      '\t\troot * {$DSH_DEPLOY_DIR}/caddy/static',
      '\t\tfile_server',
      '\t}',
      '',
      '\thandle {',
      ...lanAuthLines,
      ...proxyToDsh(),
      '\t}',
      '',
      '\tencode gzip',
      '',
      '\tlog {',
      '\t\toutput file {$DSH_CADDY_DIR}/caddy.log',
      '\t\tlevel INFO',
      '\t}',
      '}',
      '',
      'http://:{$DSH_TAILSCALE_PORT} {',
      '\tbind 127.0.0.1',
      '\t@tailnet header Tailscale-User-Login *',
      '',
      '\thandle @tailnet {',
      ...serveAuthLines,
      ...proxyToDsh(),
      '\t}',
      '',
      '\thandle {',
      ...funnelLines,
      '\t}',
      '',
      '\tencode gzip',
      '}',
      '',
    ]
    return lines.join('\n')
  }

  const writeCaddyfile = async () => {
    await fs.mkdir(caddyDir, { recursive: true })
    await fs.writeFile(caddyConf, buildCaddyfile(), { mode: 0o600 })
  }

  const applyCaddyfile = async () => {
    await writeCaddyfile()
    const current = await caddyRunning()
    if (!current.running) return { ok: true, message: 'caddy config written' }
    const stopped = await stopCaddyPid(current.pid)
    if (!stopped.ok) return { ok: false, message: `caddy restart failed: ${stopped.message}` }
    const started = await start()
    return { ok: started.ok, message: started.ok ? 'caddy config applied' : started.message }
  }

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

  const readPidSync = () => {
    try {
      const s = readFileSync(pidFile, 'utf8').trim()
      const n = Number.parseInt(s, 10)
      return Number.isFinite(n) && n > 0 ? n : 0
    } catch {
      return 0
    }
  }

  /** Match `caddy run --config <our Caddyfile>` exactly (argv keeps spaces intact). */
  const usesOurCaddyConfig = (args) => {
    const i = args.indexOf('--config')
    return i !== -1 && args[i + 1] === caddyConf
  }

  /**
   * Process-identity check for the pidfile. Returns `ours: true` only when
   * the pid belongs to a caddy running OUR Caddyfile; user/system caddies
   * (e.g. /etc/caddy/Caddyfile) are reported as foreign.
   */
  async function identifyCaddy(pid) {
    if (!alive(pid)) return { ours: false, stale: true }
    try {
      const comm = (await fs.readFile(`/proc/${pid}/comm`, 'utf8')).trim()
      if (comm !== 'caddy') return { ours: false, foreign: true }
      const cmdline = (await fs.readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean)
      return usesOurCaddyConfig(cmdline) ? { ours: true } : { ours: false, foreign: true }
    } catch {
      // Non-Linux or unreadable /proc: never guess before killing.
      return { ours: false, unknown: true }
    }
  }

  function identifyCaddySync(pid) {
    if (!alive(pid)) return { ours: false, stale: true }
    try {
      const comm = readFileSync(`/proc/${pid}/comm`, 'utf8').trim()
      if (comm !== 'caddy') return { ours: false, foreign: true }
      const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean)
      return usesOurCaddyConfig(cmdline) ? { ours: true } : { ours: false, foreign: true }
    } catch {
      return { ours: false, unknown: true }
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
        { hostname: host, port, path: '/', method: 'HEAD', rejectUnauthorized: false, timeout: 1500 },
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
      const req = http.request({ hostname: host, port, path: '/', method: 'HEAD', timeout: 1500 }, (res) => {
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
    // unrelated process — kill -0 alone would false-positive. Verify both
    // that the process is caddy AND that it is running OUR Caddyfile.
    const identity = await identifyCaddy(pid)
    if (identity.ours) return { running: true, pid }
    return { running: false, pid, stale: true }
  }

  const exec = (cmd, args, env) =>
    new Promise((resolve) => {
      execFile(cmd, args, { timeout: 15000, env: { ...process.env, ...(env || {}) } }, (err, stdout, stderr) => {
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

    // Run the three status commands concurrently; sequential execFile calls
    // were the main reason /lan.status.json felt slow while Tailscale was up.
    const [st, funnelJson, serveJson] = await Promise.all([
      exec('tailscale', ['status', '--json']),
      exec('tailscale', ['funnel', 'status', '--json']),
      exec('tailscale', ['serve', 'status', '--json']),
    ])
    if (!st.ok) return { enabled: true, installed: true, accessDenied: true, detail: st.message }
    let parsed
    try {
      parsed = JSON.parse(st.output)
    } catch {
      return { enabled: true, installed: true, detail: 'unparsable status' }
    }
    const self = parsed.Self || {}

    // Prefer the structured `status --json` output for Serve/Funnel. Older
    // CLI versions without --json fall back to plain text with simple
    // substring checks — no regular expressions.
    const parseJson = (output) => {
      try {
        return JSON.parse(output)
      } catch {
        return null
      }
    }

    const routesFromConfig = (config) => {
      const routes = []
      let target = ''
      const web = config && config.Web ? config.Web : {}
      for (const [hostPort, entry] of Object.entries(web)) {
        const colon = hostPort.lastIndexOf(':')
        const host = colon > 0 ? hostPort.slice(0, colon) : hostPort
        routes.push(`https://${host}/`)
        const handlers = entry && entry.Handlers ? entry.Handlers : {}
        const handler = handlers['/'] || handlers[''] || Object.values(handlers)[0]
        if (handler && typeof handler.Proxy === 'string') target = handler.Proxy
      }
      return { routes, target }
    }

    let funnelConfig = parseJson(funnelJson.output)
    let funnelText = ''
    if (!funnelConfig) {
      const funnelPlain = await exec('tailscale', ['funnel', 'status'])
      if (funnelPlain.ok) funnelText = funnelPlain.output.trim()
    }
    let funnelOn = false
    if (funnelConfig) {
      const allowed = funnelConfig.AllowFunnel || {}
      funnelOn = Object.values(allowed).some((value) => value === true)
    } else {
      funnelOn = funnelText.toLowerCase().includes('funnel on')
    }

    let serveConfig = parseJson(serveJson.output)
    let serveText = ''
    if (!serveConfig) {
      const servePlain = await exec('tailscale', ['serve', 'status'])
      if (servePlain.ok) serveText = servePlain.output.trim()
    }

    const routeInfo = routesFromConfig(serveConfig)
    const serveRoutes = routeInfo.routes
    const fallbackRoutes = serveText ? serveText.split('\n').filter((line) => line.includes('http')).map((line) => line.trim()) : []
    const routes = serveConfig ? serveRoutes : fallbackRoutes
    const serveTarget = routeInfo.target
    const dnsName = (self.DNSName || '').endsWith('.') ? self.DNSName.slice(0, -1) : (self.DNSName || '')

    return {
      enabled: true,
      installed: true,
      running: parsed.BackendState === 'Running',
      hostname: self.HostName || '',
      dnsName,
      tailnetIPs: Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs : [],
      funnel: funnelConfig ? JSON.stringify(funnelConfig) : funnelText || undefined,
      funnelOn,
      serve: routes.length ? routes : serveConfig ? 'off' : serveJson.ok ? 'off' : 'unknown',
      serveDetail: serveConfig ? JSON.stringify(serveConfig) : serveText || serveJson.message,
      serveUrl: routes[0] || '',
      serveTarget,
    }
  }


  async function mdnsStatus() {
    const r = await exec('systemctl', ['is-active', 'avahi-daemon'])
    return r.ok && r.output === 'active'
  }

  async function checks() {
    const ip = config.lanIp || detectIp()
    // Run every probe concurrently — the status endpoint must stay fast so
    // the settings page opens immediately. `caddyBin` probes the binary
    // directly instead of going through a shell.
    const [caddyBin, confPresent, caddyProbe, ts] = await Promise.all([
      exec(config.caddyBin, ['version']),
      fs.access(caddyConf).then(() => true).catch(() => false),
      caddyRunning(),
      tailscaleStatus(),
    ])
    const tailnetIp = (ts.tailnetIPs || []).find((ip) => !ip.includes(':')) || ts.tailnetIPs?.[0]
    const [lan, tailnet, local] = await Promise.all([
      reachUrl(ip, config.port),
      ts.running && tailnetIp ? reachUrl(tailnetIp, config.port) : Promise.resolve(false),
      reachHttp('127.0.0.1', config.localPort),
    ])
    const port = { lan, tailnet, local }
    return {
      caddy: {
        installed: caddyBin.ok,
        path: caddyBin.ok ? config.caddyBin : null,
        configPresent: confPresent,
        running: caddyProbe.running,
      },
      port,
      tailscale: ts,
    }
  }

  async function status() {
    const ip = config.lanIp || detectIp()
    const checked = await checks()
    const caddy = checked.caddy
    return {
      lanIp: ip,
      url: `https://${ip}:${config.port}/`,
      port: config.port,
      dshLocalPort: config.localPort,
      tailscalePort: config.tailscalePort,
      autoStart,
      tailscaleAutoStart,
      access: {
        lanAuth,
        serveAuth,
        funnelRequiresAuth,
        basicAuthUser,
        basicAuthConfigured: basicAuthHash.length > 0,
      },
      caddy: { ...caddy, config: caddyConf, healthy: caddy.running ? await healthy() : false },
      cert: await certInfo(),
      mdns: await mdnsStatus(),
      tailscale: checked.tailscale,
      certNotice: { ...noticeState },
      checks: checked,
    }
  }

  // ── ownership tracking for shutdown ─────────────────────────────────────
  // When dsh exits, we stop ONLY what this plugin brought up (or what is
  // demonstrably the dsh-lan caddy — same Caddyfile path). A caddy the user
  // started for something else, or a Tailscale session the user connected
  // themselves, is left alone.
  const weStartedTailscale = { v: false }
  const weEnabledServe = { v: false }
  const weEnabledFunnel = { v: false }
  const spawnedCaddyPids = new Set()

  async function stopCaddyPid(pid) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      return { ok: false, message: `cannot signal pid ${pid}` }
    }
    for (let i = 0; i < 40; i++) {
      if (!alive(pid)) break
      await sleep(250)
    }
    if (!alive(pid)) {
      const current = await readPid()
      if (current === pid) await fs.unlink(pidFile).catch(() => {})
      return { ok: true, message: `stopped pid ${pid}` }
    }
    // Caddy can hang in graceful shutdown when a long-lived Tailscale proxy
    // or browser connection never closes. The Caddyfile sets grace_period 3s,
    // but keep SIGKILL as a final fallback so a config apply can always make
    // progress instead of leaving the proxy half-dead.
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      return { ok: false, message: 'caddy did not exit and SIGKILL failed' }
    }
    for (let i = 0; i < 20; i++) {
      if (!alive(pid)) break
      await sleep(250)
    }
    if (!alive(pid)) {
      const current = await readPid()
      if (current === pid) await fs.unlink(pidFile).catch(() => {})
      return { ok: true, message: `force-stopped pid ${pid}` }
    }
    return { ok: false, message: 'caddy did not exit even after SIGKILL' }
  }

  async function stop() {
    const pid = await readPid()
    if (!alive(pid)) {
      await fs.unlink(pidFile).catch(() => {})
      return { ok: true, alreadyStopped: true }
    }
    // User/action stop must also refuse to kill a foreign caddy that a stale
    // pidfile may point to.
    const identity = await identifyCaddy(pid)
    if (!identity.ours) {
      log.info(`[lan-manager] leaving foreign/unverified caddy alone (pid ${pid})`)
      await fs.unlink(pidFile).catch(() => {})
      return { ok: false, message: identity.foreign ? 'pidfile points to a caddy that is not dsh-lan; not stopping it' : 'cannot verify caddy identity; not stopping it' }
    }
    return stopCaddyPid(pid)
  }

  async function stopOwnedCaddy() {
    const pid = await readPid()
    if (!alive(pid)) {
      await fs.unlink(pidFile).catch(() => {})
      return { ok: true, alreadyStopped: true }
    }
    const identity = await identifyCaddy(pid)
    if (!identity.ours) {
      log.info(`[lan-manager] leaving foreign/unverified caddy alone (pid ${pid})`)
      if (identity.foreign || identity.stale) await fs.unlink(pidFile).catch(() => {})
      return { ok: false, message: identity.foreign ? 'foreign caddy' : 'unverified caddy' }
    }
    return stopCaddyPid(pid)
  }

  function stopOwnedCaddySync() {
    // Children spawned by this plugin are ours by construction.
    for (const pid of [...spawnedCaddyPids]) {
      if (!alive(pid)) continue
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        /* best effort */
      }
    }
    const pid = readPidSync()
    if (!alive(pid)) return
    const identity = identifyCaddySync(pid)
    if (!identity.ours) {
      log.info(`[lan-manager] leaving foreign/unverified caddy alone (pid ${pid})`)
      return
    }
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* best effort */
    }
  }

  const runTailscaleSync = (args) => {
    try {
      const r = spawnSync('tailscale', args, { encoding: 'utf8', timeout: 3000 })
      if (r.error) {
        log.warn(`[lan-manager] tailscale ${args[0]} failed: ${r.error.message}`)
        return false
      }
      if (r.status !== 0) {
        log.warn(`[lan-manager] tailscale ${args.join(' ')} exited ${r.status}: ${(r.stderr || '').trim()}`)
        return false
      }
      return true
    } catch (e) {
      log.warn(`[lan-manager] tailscale ${args[0]} failed: ${e.message}`)
      return false
    }
  }

  async function stopOwnedTailscale() {
    if (!config.tailscale) return
    // Funnel and Serve share one Tailscale proxy config. Disable Funnel first
    // by recreating a tailnet-only Serve route; only then turn Serve off (if
    // this plugin also owns Serve) so we never clear a pre-existing Serve.
    if (weEnabledFunnel.v) {
      const r = await exec('tailscale', ['serve', '--bg', '--https=443', String(config.tailscalePort)])
      if (r.ok) weEnabledFunnel.v = false
      else log.warn(`[lan-manager] funnel off (restore serve-only) failed: ${r.message}`)
    }
    if (weEnabledServe.v) {
      const r = await exec('tailscale', ['serve', 'off'])
      if (r.ok) weEnabledServe.v = false
      else log.warn(`[lan-manager] serve off failed: ${r.message}`)
    }
    if (weStartedTailscale.v) {
      const r = await exec('tailscale', ['down'])
      if (r.ok) weStartedTailscale.v = false
      else log.warn(`[lan-manager] tailscale down failed: ${r.message}`)
    }
  }

  function stopOwnedTailscaleSync() {
    if (!config.tailscale) return
    if (weEnabledFunnel.v && runTailscaleSync(['serve', '--bg', '--https=443', String(config.tailscalePort)])) weEnabledFunnel.v = false
    if (weEnabledServe.v && runTailscaleSync(['serve', 'off'])) weEnabledServe.v = false
    if (weStartedTailscale.v && runTailscaleSync(['down'])) weStartedTailscale.v = false
  }

  let servicesShutdownStarted = false
  async function shutdownOwnedServices() {
    if (servicesShutdownStarted) return
    servicesShutdownStarted = true
    await stopOwnedCaddy()
    await stopOwnedTailscale()
  }

  function shutdownOwnedServicesSync() {
    if (servicesShutdownStarted) return
    servicesShutdownStarted = true
    stopOwnedCaddySync()
    stopOwnedTailscaleSync()
  }

  function spawnCaddy() {
    return new Promise((resolve, reject) => {
      const errFd = openSync(runLog, 'w')
      const child = spawn(config.caddyBin, ['run', '--config', caddyConf, '--adapter', 'caddyfile'], {
        env: {
          ...process.env,
          DSH_DEPLOY_DIR: deployDir,
          DSH_CADDY_DIR: caddyDir,
          DSH_PORT: String(config.port),
          DSH_LOCAL_PORT: String(config.localPort),
          DSH_TAILSCALE_PORT: String(config.tailscalePort),
          XDG_DATA_HOME: path.join(caddyDir, 'data'),
          XDG_CONFIG_HOME: path.join(caddyDir, 'config'),
        },
        stdio: ['ignore', 'ignore', errFd],
        detached: false,
      })
      closeSync(errFd)
      child.once('error', reject)
      child.once('spawn', () => {
        spawnedCaddyPids.add(child.pid)
        resolve(child)
      })
      child.once('exit', () => {
        spawnedCaddyPids.delete(child.pid)
        if (readPidSync() === child.pid) fs.unlink(pidFile).catch(() => {})
      })
    })
  }

  async function start() {
    const cur = await caddyRunning()
    if (cur.running) {
      if (await healthy()) return { ok: true, alreadyRunning: true, pid: cur.pid }
      // The pidfile process is ours but not healthy (for example stuck in a
      // graceful shutdown with a held connection). Stop it before spawning a
      // replacement so two Caddy instances never fight over the ports.
      const identity = await identifyCaddy(cur.pid)
      if (!identity.ours) {
        if (await healthy()) {
          return { ok: false, code: 'caddy.foreign', message: `port ${config.port} is served by another caddy (pid ${cur.pid}); not touching it` }
        }
        await fs.unlink(pidFile).catch(() => {})
      } else {
        const stopped = await stopCaddyPid(cur.pid)
        if (!stopped.ok) return { ok: false, message: `cannot stop unhealthy caddy: ${stopped.message}` }
      }
    } else if (cur.pid && alive(cur.pid)) {
      // A stale pidfile points to a live foreign process. Never fight it for
      // the port; only drop the stale pointer when it is not serving our port.
      const identity = await identifyCaddy(cur.pid)
      if (!identity.ours && (await healthy())) {
        return { ok: false, code: 'caddy.foreign', message: `port ${config.port} is served by another caddy (pid ${cur.pid}); not touching it` }
      }
      if (!identity.ours) await fs.unlink(pidFile).catch(() => {})
    }
    const probe = await exec(config.caddyBin, ['version'])
    if (!probe.ok) {
      return { ok: false, code: 'caddy.missing', message: `caddy binary not found: ${config.caddyBin}` }
    }
    let child
    try {
      child = await spawnCaddy()
    } catch (e) {
      return { ok: false, message: `cannot spawn caddy: ${e.message}` }
    }
    await fs.writeFile(pidFile, String(child.pid))
    for (let i = 0; i < 40; i++) {
      if (await healthy()) return { ok: true, pid: child.pid }
      if (child.exitCode !== null) break
      await sleep(250)
    }
    const msg = `caddy did not become healthy within 10s; see ${runLog}`
    log.warn(`[lan-manager] ${msg}`)
    return { ok: false, message: msg, exitCode: child.exitCode }
  }

  const execGenCert = () => exec('bash', [genCert], { DSH_LAN_IP: config.lanIp || detectIp(), DSH_CERT_DIR: path.join(caddyDir, 'certs') })

  async function regenCert() {
    const r = await execGenCert()
    // gen-cert.sh exits 10 after regenerating (caller should restart caddy),
    // so a non-zero exit here can still mean success.
    if (r.code === 10 || (r.ok && r.output.includes('cert regenerated'))) {
      await stop()
      const st2 = await start()
      return { ok: st2.ok, regenerated: true, message: `cert regenerated; caddy restart ${st2.ok ? 'ok' : 'failed'}` }
    }
    return { ok: r.ok, regenerated: false, message: r.output || r.message }
  }

  const tailscaleServeOn = (ts) => Array.isArray(ts.serve) && ts.serve.length > 0

  async function action(body) {
    switch (body && body.action) {
      case 'start': {
        const r = await start()
        return { ...r, message: r.ok ? 'proxy started' : r.message }
      }
      case 'stop': {
        const r = await stop()
        return { ...r, message: r.ok ? 'proxy stopped' : r.message }
      }
      case 'restart': {
        const stopped = await stop()
        if (!stopped.ok) return { ok: false, message: stopped.message || 'proxy stop failed' }
        const started = await start()
        return { ...started, message: started.ok ? 'proxy restarted' : started.message }
      }
      case 'regenCert':
        return regenCert()
      case 'tailscaleUp': {
        const before = await tailscaleStatus()
        if (before.installed === false) return { ok: false, code: 'tailscale.missing', message: 'tailscale binary not found' }
        if (before.running === true) return { ok: true, alreadyRunning: true, message: 'tailscale already connected' }
        const r = await exec('tailscale', ['up', '--operator=' + os.userInfo().username])
        // Claim ownership only when we positively know it was off before.
        if (r.ok && before.running === false) weStartedTailscale.v = true
        return r.ok ? { ok: true, message: 'tailscale up requested' } : { ok: false, message: r.message }
      }
      case 'tailscaleDown': {
        const before = await tailscaleStatus()
        if (before.installed === false) return { ok: false, code: 'tailscale.missing', message: 'tailscale binary not found' }
        const r = await exec('tailscale', ['down'])
        if (r.ok) weStartedTailscale.v = false
        return r.ok ? { ok: true, message: 'tailscale down' } : { ok: false, message: r.message }
      }
      case 'tailscaleFunnel': {
        const on = body.funnelOn !== false
        const before = await tailscaleStatus()
        if (before.installed === false) return { ok: false, code: 'tailscale.missing', message: 'tailscale binary not found' }
        if (on && funnelRequiresAuth && !basicAuthHash) {
          return { ok: false, code: 'auth.missing', message: 'generate Basic Auth credentials before enabling Funnel' }
        }
        if (on && before.funnelOn === true) return { ok: true, alreadyOn: true, message: 'funnel already on' }
        // Enabling Funnel rewrites the shared Serve config. Allow it when Serve
        // is already managed by this plugin, when there is no Serve yet, or
        // when the existing Serve is exactly the standard dsh-lan route into
        // Caddy (http://127.0.0.1:<tailscalePort>). Any other pre-existing
        // Serve configuration is left untouched.
        const expectedServeTarget = `http://127.0.0.1:${config.tailscalePort}`
        if (on && before.serve !== 'off' && !weEnabledServe.v && before.serveTarget !== expectedServeTarget) {
          return { ok: false, code: 'serve.foreign', message: `existing Serve target ${before.serveTarget || 'unknown'} is not managed by dsh-lan; not modifying it` }
        }
        // If Funnel is already off there is nothing to do; never touch a
        // Funnel that was enabled outside this plugin.
        if (!on && before.funnelOn !== true) return { ok: true, alreadyOff: true, message: 'funnel already off' }
        if (!on && !weEnabledFunnel.v) {
          return { ok: false, code: 'funnel.foreign', message: 'funnel was not enabled by dsh-lan; not changing it' }
        }
        // Funnel is a mode of the shared Serve config. Turning it OFF must
        // recreate a tailnet-only Serve route rather than `funnel off/reset`,
        // which would clear Serve as well.
        const r = on
          ? await exec('tailscale', ['funnel', '--bg', String(config.tailscalePort)])
          : await exec('tailscale', ['serve', '--bg', '--https=443', String(config.tailscalePort)])
        if (!r.ok) return { ok: false, message: r.message }
        if (on) {
          weEnabledFunnel.v = true
          if (before.serve === 'off') weEnabledServe.v = true
        } else {
          weEnabledFunnel.v = false
        }
        return { ok: true, message: on ? `funnel on via tailscale port ${config.tailscalePort}` : 'funnel off; serve kept for tailnet' }
      }
      case 'tailscaleServe': {
        const on = body.serveOn !== false
        const before = await tailscaleStatus()
        if (before.installed === false) return { ok: false, code: 'tailscale.missing', message: 'tailscale binary not found' }
        const beforeOn = tailscaleServeOn(before)
        if (on && beforeOn === true) return { ok: true, alreadyOn: true, message: 'tailscale serve already on' }
        const r = on
          ? await exec('tailscale', ['serve', '--bg', '--https=443', String(config.tailscalePort)])
          : await exec('tailscale', ['serve', 'off'])
        if (!r.ok) return { ok: false, message: r.message }
        // Only claim cleanup when serve was positively off before; an
        // unknown pre-existing serve state is deliberately left alone.
        weEnabledServe.v = on ? before.serve === 'off' : false
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
      case 'setAutoStart': {
        autoStart = body.on === true
        await persistRuntimeSettings()
        return { ok: true, message: `反代自启动已${autoStart ? '开启' : '关闭'}(下次启动 dsh 生效)` }
      }
      case 'setTailscaleAutoStart': {
        tailscaleAutoStart = body.on === true
        await persistRuntimeSettings()
        return { ok: true, message: `Tailscale 自启动已${tailscaleAutoStart ? '开启' : '关闭'}(下次启动 dsh 生效)` }
      }
      case 'setLanAuth': {
        lanAuth = body.on === true
        await persistRuntimeSettings()
        const applied = await applyCaddyfile()
        return { ok: applied.ok, message: applied.message }
      }
      case 'setServeAuth': {
        serveAuth = body.on === true
        await persistRuntimeSettings()
        const applied = await applyCaddyfile()
        return { ok: applied.ok, message: applied.message }
      }
      case 'resetBasicAuth': {
        const password = randomBytes(12).toString('base64url')
        const hashed = await exec(config.caddyBin, ['hash-password', '--plaintext', password])
        if (!hashed.ok) {
          return { ok: false, code: hashed.code === 'ENOENT' ? 'caddy.missing' : undefined, message: hashed.message }
        }
        basicAuthHash = hashed.output.trim()
        await persistAuthState()
        const applied = await applyCaddyfile()
        return {
          ok: applied.ok,
          message: applied.message,
          basicAuthUser,
          basicAuthPassword: password,
        }
      }
      case 'autoConfig': {
        // One-click bring-up: verify binary, cert, Caddyfile template, then
        // start the proxy.
        const steps = []
        const caddyProbe = await exec(config.caddyBin, ['version'])
        if (!caddyProbe.ok) {
          return { ok: false, code: 'caddy.missing', message: `caddy binary not found: ${config.caddyBin}`, steps }
        }
        const info = await certInfo()
        const nearExpiry = info.present && Number.isFinite(Date.parse(info.validTo)) && Date.parse(info.validTo) - Date.now() < 30 * 24 * 3600 * 1000
        if (!info.present || info.coversLanIp !== true || nearExpiry) {
          const g = await execGenCert()
          // gen-cert.sh exits 10 after regenerating; that is still success.
          if (g.ok || g.code === 10) steps.push(g.ok ? 'cert up to date' : 'cert generated')
          else steps.push(`cert generation failed: ${g.message}`)
        }
        const confOk = await fs
          .access(caddyConf)
          .then(() => true)
          .catch(() => false)
        const runningBefore = await caddyRunning()
        await writeCaddyfile()
        steps.push(confOk ? 'Caddyfile updated from current access settings' : `Caddyfile written (https://:${config.port})`)
        const st = runningBefore.running ? await applyCaddyfile() : await start()
        steps.push(st.ok ? `proxy ${st.alreadyRunning ? 'already running' : 'started'}` : `proxy start failed: ${st.message}`)
        return { ok: st.ok, steps, message: st.ok ? 'one-click setup complete' : st.message }
      }
      default:
        return { ok: false, message: `unknown action ${body && body.action}` }
    }
  }

  // ── CA banner (certNotice) ───────────────────────────────────────────────
  // Probe logic: the page at https://<LAN_IP>:<port> probes
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
  var T = {
    zh: {
      text: "<b>安全连接未验证</b>：安装本机局域网证书后，此提示不再出现，浏览器也不会再报警“不安全”。",
      download: "下载证书",
      guide: "安装说明",
      dismiss: "稍后再说"
    },
    en: {
      text: "<b>Secure connection not verified</b>: install this machine's LAN certificate and this notice disappears; the browser will no longer warn about the connection.",
      download: "Download certificate",
      guide: "Install guide",
      dismiss: "Later"
    }
  };
  function lang() {
    return (document.documentElement.lang || navigator.language || "").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
  }
  function render(b) {
    var m = T[lang()] || T.en;
    b.innerHTML =
      "<span>" + m.text + "</span>" +
      '<a href="/ca.crt" style="background:#e6a700;color:#fff;text-decoration:none;padding:4px 10px;border-radius:4px;font-weight:600">' + m.download + '</a>' +
      '<a href="/ca-install.html" style="color:#7a5b00">' + m.guide + '</a>' +
      '<button type="button" style="background:none;border:none;color:#7a5b00;cursor:pointer;font-size:12px" data-act="dismiss">' + m.dismiss + '</button>';
  }
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
    render(b);
    document.body.appendChild(b);
    var btn = b.querySelector('[data-act="dismiss"]');
    if (btn) btn.onclick = function () {
      try { localStorage.setItem("dsh-ca-dismiss", Date.now()); } catch (e) {}
      b.remove();
    };
  }
  try {
    new MutationObserver(function () {
      var b = document.getElementById(BANNER_ID);
      if (b) render(b);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  } catch (e) {}
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
      // Reject oversized bodies before they can exhaust memory.
      const declared = Number(req.headers['content-length'])
      if (Number.isFinite(declared) && declared > 64 * 1024) {
        resolve(null)
        return
      }
      const chunks = []
      let size = 0
      req.on('data', (c) => {
        size += c.length
        if (size > 64 * 1024) {
          size = Infinity
          return
        }
        chunks.push(c)
      })
      req.on('end', () => {
        if (size === Infinity) {
          resolve(null)
          return
        }
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
        const presented = Buffer.from(String(req.headers['x-lan-token'] || ''))
        const expected = Buffer.from(actionToken)
        const authorized = presented.length === expected.length && timingSafeEqual(presented, expected)
        if (!authorized) {
          sendJson(res, 401, { ok: false, message: 'unauthorized: missing or stale X-Lan-Token (refresh the dsh page)' })
          return
        }
        const body = await readBody(req)
        if (body === null) {
          sendJson(res, 400, { ok: false, message: 'invalid JSON body' })
          return
        }
        let out
        try {
          out = await action(body)
        } catch (e) {
          out = { ok: false, message: `action error: ${e.message}` }
        }
        // Do not embed a full status snapshot here: status probes (caddy
        // health + several tailscale CLI calls) make the action response feel
        // slow. The client refreshes /lan.status.json itself right after.
        sendJson(res, out.ok ? 200 : 400, out)
      },
    }),
  )

  // ── auto-start (both OFF unless the user opted in) ──────────────────────
  let autoStartTimer = null
  autoStartTimer = setTimeout(() => {
    void (async () => {
      await settingsLoaded
      const jobs = []
      if (autoStart) {
        jobs.push(
          start().then((r) =>
            log.info(`[lan-manager] auto-start(caddy) => ${r.ok ? 'ok' : 'failed'} pid=${r.pid || 0} msg=${r.message || ''}`),
          ),
        )
      }
      if (config.tailscale && tailscaleAutoStart) {
        jobs.push(
          (async () => {
            const ts = await tailscaleStatus()
            if (ts.running === true) return
            const r = await exec('tailscale', ['up', '--operator=' + os.userInfo().username])
            if (r.ok && ts.running === false) weStartedTailscale.v = true
            log.info(`[lan-manager] auto-start(tailscale) => ${r.ok ? 'ok' : 'failed'} ${r.message || ''}`)
          })(),
        )
      }
      for (const p of jobs) p.catch((e) => log.warn(`[lan-manager] auto-start error: ${e.message}`))
    })()
  }, 750)
  log.info(`[lan-manager] active deployDir=${deployDir} port=${config.port}`)

  // Cordis disposal is normally invoked by dsh, but if an earlier disposer
  // hangs/throws (or the process is force-exited) the plugin disposer may
  // never run. Register process-level hooks as a guarantee: on SIGINT/SIGTERM
  // (and process exit) stop owned services synchronously, before dsh's own
  // shutdown handler can force-exit the process.
  const onProcessShutdown = () => {
    if (autoStartTimer) clearTimeout(autoStartTimer)
    shutdownOwnedServicesSync()
  }
  process.prependOnceListener('SIGINT', onProcessShutdown)
  process.prependOnceListener('SIGTERM', onProcessShutdown)
  process.prependOnceListener('exit', onProcessShutdown)
  const removeProcessShutdownHooks = () => {
    process.removeListener('SIGINT', onProcessShutdown)
    process.removeListener('SIGTERM', onProcessShutdown)
    process.removeListener('exit', onProcessShutdown)
  }

  // Shutdown: unwire the HTTP surface, then stop only what belongs to dsh.
  return async () => {
    removeProcessShutdownHooks()
    if (autoStartTimer) clearTimeout(autoStartTimer)
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
    await shutdownOwnedServices()
  }
}
