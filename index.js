// dsh-remote-access — remote-access orchestration for the dsh web profile.
//
// Host-side plugin that manages:
//   - a native Caddy https reverse proxy in front of dsh (spawn/kill/restart,
//     pidfile + health-checked, idempotent),
//   - the local-CA TLS certificate (status via crypto.X509Certificate,
//     regeneration via the cross-platform gen-cert.js next to the deploy root),
//   - the "install the CA" banner on the dsh page (OFF by default; toggled
//     through the settings page or the setCertNotice action; state persists
//     in <stateDir>/caddy/cert-notice.json),
//   - optional Tailscale control (up/down/funnel/serve) via the system binary,
//   - an mDNS/avahi readiness probe for the banner detection.
//
// The deploy root is this package's own directory. Runtime state lives under
// <dsh-home>/dsh-remote-access (see README), so the package directory stays
// portable and contains no machine-specific paths, IPs, or hostnames.
//
// HTTP surface (registered on the webserver, outside /api):
//   GET  /remote-access.status.json → status + checks
//   POST /remote-access.action      → { action: 'start'|'stop'|'restart'|'regenCert'
//                              |'autoConfig'|'setCertNotice'|'tailscaleUp'
//                              |'tailscaleDown'|'tailscaleFunnel'|'tailscaleServe'
//                              |'setApiAccess' }
//
// On disposal, SIGINT/SIGTERM, or process exit the plugin stops only the
// services it owns (or that are demonstrably dsh-remote-access — same Caddyfile path).
// A caddy or Tailscale session started by the user is left untouched.
import { spawn, execFile, spawnSync } from 'node:child_process'
import { promises as fs, openSync, closeSync, chmodSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import { fileURLToPath } from 'node:url'
import { X509Certificate, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  ACCESS_MODES,
  API_METHOD_CATALOG,
  createApiGateway,
  DEFAULT_BASIC_API_ALLOWLIST,
  isKnownApiMethod,
  isPrivilegedApiMethod,
  normalizeApiAccessPolicy,
} from './api-gateway.js'

export const name = 'dsh-remote-access'
export const inject = ['webServer']

// No Config schema on purpose: the plugin imports nothing outside node's
// built-ins, so it runs from any location without a node_modules of its own
// (a schema would drag in schemastery, whose bare import resolves from the
// plugin's real path — broken once the plugin lives outside the profile).
// All defaults are applied in apply(); cordis passes the raw row config
// through unchanged when a plugin exports no Config.
const DEFAULTS = {
  deployDir: '', // derived from this file's location
  stateDir: '', // runtime config/state; defaults to $DSH_HOME/dsh-remote-access (~/.dsh/dsh-remote-access)
  port: 3081,
  localPort: 3080,
  tailscalePort: 3082,
  apiGatewayPort: 3083,
  lanIp: '',
  lanBind: '',
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
  // Remote API access is enforced by the local gateway. The default is an
  // explicit allowlist; LAN/Serve may opt into a deliberately broad wildcard
  // policy from the settings page, while Funnel is always normalized back to
  // the basic policy.
  apiAccess: {
    lan: { allow: DEFAULT_BASIC_API_ALLOWLIST, events: true, allApis: false, trustedRemoteSettings: false },
    serve: { allow: DEFAULT_BASIC_API_ALLOWLIST, events: true, allApis: false, trustedRemoteSettings: false },
    funnel: { allow: DEFAULT_BASIC_API_ALLOWLIST, events: true, allApis: false, trustedRemoteSettings: false },
  },
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ensurePrivateDir(dir) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  await fs.chmod(dir, 0o700).catch(() => {})
}

async function atomicWrite(file, data, mode = 0o600) {
  await ensurePrivateDir(path.dirname(file))
  const temp = `${file}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`
  try {
    await fs.writeFile(temp, data, { mode })
    await fs.chmod(temp, mode).catch(() => {})
    await fs.rename(temp, file)
    await fs.chmod(file, mode).catch(() => {})
  } finally {
    await fs.unlink(temp).catch(() => {})
  }
}

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

function validProbeHost(value) {
  const host = String(value || '').trim()
  return host.length > 0 && host.length <= 253 && /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host) ? host : ''
}

function validBasicAuthUser(value) {
  const user = String(value || '').trim()
  return user.length > 0 && user.length <= 64 && /^[A-Za-z0-9._-]+$/.test(user) ? user : ''
}

function validBasicAuthHash(value) {
  const hash = String(value || '').trim()
  return hash.length <= 256 && /^[A-Za-z0-9$./_+-]+$/.test(hash) ? hash : ''
}

// `tailscale funnel status --json` currently exposes the shared Serve route
// but not whether that route is public. Only an explicit public/tailnet-only
// marker from the human-readable status is authoritative; unknown output is
// deliberately reported as unknown instead of guessing that Funnel is on.
export function parseFunnelStatus(output) {
  const text = String(output || '').trim()
  if (!text) return { state: 'unknown', detail: 'empty Funnel status' }
  const header = text.split(/\r?\n/).map((line) => line.trim()).find((line) => /^https?:\/\//i.test(line)) || text.split(/\r?\n/)[0].trim()
  if (/\(\s*public\s*\)/i.test(header)) return { state: 'on', detail: header }
  if (/\(\s*tailnet\s+only\s*\)/i.test(header)) return { state: 'off', detail: header }
  if (/^(?:no|not\s+running|funnel\s+(?:is\s+)?(?:off|disabled))\b/i.test(text)) return { state: 'off', detail: text.split(/\r?\n/)[0].trim() }
  return { state: 'unknown', detail: header || text.split(/\r?\n/)[0].trim() }
}

function scriptString(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' })[char])
}

export function apply(ctx, rawConfig) {
  // Merge raw row config over portable defaults (no schema: cordis passes
  // the raw config through unchanged).
  const config = { ...DEFAULTS, ...(rawConfig || {}) }
  if (ctx.webServer.host !== '127.0.0.1') {
    throw new Error('dsh-remote-access requires DSH webServer host 127.0.0.1; remote access must terminate at Caddy')
  }
  const log = ctx.logger
  // Certificate generation and mDNS detection are optional features; their
  // availability never blocks the core remote-access path.
  const certSupported = true
  const mdnsSupported = process.platform === 'linux' || process.platform === 'darwin'
  // Deploy root derived from this file's real location (symlinks resolved).
  const here = path.dirname(fileURLToPath(import.meta.url))
  // The plugin package root is also the deploy root for gen-cert.js.
  const deployDir = config.deployDir || here
  // dsh keeps all user data under one home root: explicit config first,
  // then $DSH_HOME, then ~/.dsh. Runtime state for this plugin lives in
  // <dsh-home>/dsh-remote-access, so the deploy directory stays read-only and
  // portable across machines.
  const dshHome = config.stateDir || (process.env.DSH_HOME && process.env.DSH_HOME.trim()) || path.join(os.homedir(), '.dsh')
  const stateDir = path.resolve(dshHome, 'dsh-remote-access')
  const caddyDir = path.join(stateDir, 'caddy')
  const pidFile = path.join(caddyDir, 'caddy.pid')
  const runLog = path.join(caddyDir, 'caddy-run.log')
  const caddyConf = path.join(caddyDir, 'Caddyfile')
  const certFile = path.join(caddyDir, 'certs', 'dsh.crt')
  const caFile = path.join(caddyDir, 'certs', 'ca', 'ca.crt')
  const genCert = path.join(deployDir, 'gen-cert.js')
  const noticeStateFile = path.join(caddyDir, 'cert-notice.json')
  const stateFile = path.join(caddyDir, 'remote-access-state.json')
  const authStateFile = path.join(caddyDir, 'auth-state.json')
  const secureRuntimeFiles = async () => {
    for (const file of [pidFile, runLog, caddyConf, noticeStateFile, stateFile, authStateFile]) {
      await fs.chmod(file, 0o600).catch(() => {})
    }
  }
  void ensurePrivateDir(stateDir).then(() => ensurePrivateDir(caddyDir)).then(secureRuntimeFiles).catch((error) => {
    log.warn(`[remote-access] cannot secure runtime directory: ${error.message}`)
  })
  // Bootstrap the gateway with the least-privileged built-in policy. The
  // persisted profile policy is loaded below before the settings surface is
  // usable, then applied atomically through setPolicy(). This avoids a boot
  // race where a previously saved restrictive policy would briefly be wider.
  const configuredApiAccess = normalizeApiAccessPolicy(config.apiAccess)
  let apiAccess = normalizeApiAccessPolicy({})
  const apiGateway = createApiGateway({
    port: config.apiGatewayPort,
    localPort: config.localPort,
    policy: apiAccess,
    logger: log,
  })
  void apiGateway.ready.catch((error) => {
    log.warn(`[remote-access] API gateway failed to listen on 127.0.0.1:${config.apiGatewayPort}: ${error.message}`)
  })

  // Runtime-toggled settings: persisted so the settings page can change them
  // without editing cordis.patch.yml. Effective value = state file first,
  // then row config, then defaults.
  let autoStart = config.autoStart
  let tailscaleAutoStart = config.tailscaleAutoStart
  let lanAuth = config.lanAuth === true
  let serveAuth = config.serveAuth === true
  const funnelRequiresAuth = config.funnelRequiresAuth !== false
  let basicAuthUser = validBasicAuthUser(config.basicAuthUser) || 'dsh'
  let basicAuthHash = validBasicAuthHash(config.basicAuthHash)
  let resolveSettingsLoaded
  const settingsLoaded = new Promise((resolve) => {
    resolveSettingsLoaded = resolve
  })
  void (async () => {
    let saved = null
    try {
      saved = JSON.parse(await fs.readFile(stateFile, 'utf8'))
      if (typeof saved.autoStart === 'boolean') autoStart = saved.autoStart
      if (typeof saved.tailscaleAutoStart === 'boolean') tailscaleAutoStart = saved.tailscaleAutoStart
      if (typeof saved.lanAuth === 'boolean') lanAuth = saved.lanAuth
      if (typeof saved.serveAuth === 'boolean') serveAuth = saved.serveAuth
    } catch {
      /* first run */
    }
    try {
      const auth = JSON.parse(await fs.readFile(authStateFile, 'utf8'))
      if (typeof auth.user === 'string' && validBasicAuthUser(auth.user)) basicAuthUser = validBasicAuthUser(auth.user)
      if (typeof auth.hash === 'string' && validBasicAuthHash(auth.hash)) basicAuthHash = validBasicAuthHash(auth.hash)
    } catch {
      /* credentials are generated on demand */
    }
    apiAccess = normalizeApiAccessPolicy(saved && saved.apiAccess !== undefined ? saved.apiAccess : configuredApiAccess)
    apiGateway.setPolicy(apiAccess)
    resolveSettingsLoaded()
  })()

  const persistRuntimeSettings = async () => {
    await atomicWrite(stateFile, JSON.stringify({ autoStart, tailscaleAutoStart, lanAuth, serveAuth, apiAccess }, null, 2) + '\n')
  }

  const persistAuthState = async () => {
    await atomicWrite(authStateFile, JSON.stringify({ user: basicAuthUser, hash: basicAuthHash }, null, 2) + '\n')
  }

  const proxyToDsh = (mode = '') => [
    `\t\treverse_proxy 127.0.0.1:{$DSH_LOCAL_PORT} {`,
    '\t\t\ttransport http {',
    '\t\t\t\tdial_timeout 10s',
    '\t\t\t\tkeepalive off',
    '\t\t\t}',
    ...(mode ? [`\t\t\theader_up X-DSH-Remote-Access-Mode ${mode}`] : []),
    '\t\t}',
  ]

  const proxyToApiGateway = (mode) => [
    `\t\treverse_proxy 127.0.0.1:{$DSH_API_GATEWAY_PORT} {`,
    '\t\t\ttransport http {',
    '\t\t\t\tdial_timeout 10s',
    '\t\t\t\tkeepalive off',
    '\t\t\t}',
    `\t\t\theader_up X-DSH-Access-Mode ${mode}`,
    '\t\t}',
  ]

  // The browser-side settings bridge needs to distinguish Serve from Funnel,
  // whose public URLs can otherwise be identical. This cookie is only a mode
  // hint; the gateway remains the authority for every privileged request.
  const accessModeCookie = (mode) => [
    `\t\theader Set-Cookie "dsh-remote-access-mode=${mode}; Path=/; Secure; SameSite=Strict"`,
  ]

  const basicAuthLines = () => [
    '\t\tbasic_auth {',
    `\t\t\t${basicAuthUser} ${basicAuthHash}`,
    '\t\t}',
  ]

  const buildCaddyfile = () => {
    const missingAuthLines = (scope) => [`\t\trespond "${scope} access is disabled because no Basic Auth credential is configured" 503`]
    const lanAuthLines = lanAuth ? (basicAuthHash ? basicAuthLines() : missingAuthLines('LAN')) : []
    const serveAuthLines = serveAuth ? (basicAuthHash ? basicAuthLines() : missingAuthLines('Serve')) : []
    const lines = [
      '# dsh remote-access https proxy — native Caddy. Generated by dsh-remote-access.',
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
      '\tbind {$DSH_LAN_BIND}',
      '\ttls {$DSH_CADDY_DIR}/certs/dsh.crt {$DSH_CADDY_DIR}/certs/dsh.key',
      '',
      '\thandle /ca.crt {',
      '\t\troot * {$DSH_CADDY_DIR}/certs/ca',
      '\t\theader Content-Type "application/x-x509-ca-cert"',
      '\t\tfile_server',
      '\t}',
      '',
      '\t@lan_api path /api /api/*',
      '\thandle @lan_api {',
      ...accessModeCookie('lan'),
      ...lanAuthLines,
      ...proxyToApiGateway('lan'),
      '\t}',
      '',
      '\thandle {',
      ...accessModeCookie('lan'),
      ...lanAuthLines,
      ...proxyToDsh('lan'),
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
      '\t@tailnet_api {',
      '\t\theader Tailscale-User-Login *',
      '\t\tpath /api /api/*',
      '\t}',
      '\t@tailnet header Tailscale-User-Login *',
      '',
      '\thandle @tailnet_api {',
      ...accessModeCookie('serve'),
      ...serveAuthLines,
      ...proxyToApiGateway('serve'),
      '\t}',
      '',
      '\thandle @tailnet {',
      ...accessModeCookie('serve'),
      ...serveAuthLines,
      ...proxyToDsh('serve'),
      '\t}',
      '',
      ...(basicAuthHash
        ? [
            '\t@funnel_api path /api /api/*',
            '\thandle @funnel_api {',
            ...accessModeCookie('funnel'),
            ...basicAuthLines(),
            ...proxyToApiGateway('funnel'),
            '\t}',
            '',
            '\thandle {',
            ...accessModeCookie('funnel'),
            ...basicAuthLines(),
            ...proxyToDsh('funnel'),
            '\t}',
          ]
        : [
            '\thandle {',
            '\t\trespond "Funnel access is disabled because no Basic Auth credential is configured" 403',
            '\t}',
          ]),
      '',
      '\tencode gzip',
      '}',
      '',
    ]
    return lines.join('\n')
  }

  const writeCaddyfile = async () => {
    await atomicWrite(caddyConf, buildCaddyfile())
  }

  const applyCaddyfile = async () => {
    await settingsLoaded
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

  const isWindows = process.platform === 'win32'

  const commandMatchesOurConfig = (command) => {
    return isWindows ? command.toLowerCase().includes(caddyConf.toLowerCase()) : command.includes(caddyConf)
  }

  async function readProcessCommand(pid) {
    if (isWindows) {
      const r = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`])
      return r.ok && r.output ? { command: r.output } : null
    }
    if (process.platform === 'linux') {
      try {
        const comm = (await fs.readFile(`/proc/${pid}/comm`, 'utf8')).trim()
        const args = (await fs.readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean)
        return { comm, args }
      } catch {
        return null
      }
    }
    // macOS and other POSIX systems without /proc: ask ps.
    const r = await exec('ps', ['-p', String(pid), '-o', 'command='])
    return r.ok && r.output ? { command: r.output } : null
  }

  function readProcessCommandSync(pid) {
    if (isWindows) {
      const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`], { encoding: 'utf8', timeout: 3000 })
      return r.status === 0 && r.stdout ? { command: r.stdout.trim() } : null
    }
    if (process.platform === 'linux') {
      try {
        const comm = readFileSync(`/proc/${pid}/comm`, 'utf8').trim()
        const args = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean)
        return { comm, args }
      } catch {
        return null
      }
    }
    const r = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', timeout: 3000 })
    return r.status === 0 && r.stdout ? { command: r.stdout.trim() } : null
  }

  /**
   * Process-identity check for the pidfile. Returns `ours: true` only when
   * the pid belongs to a caddy running OUR Caddyfile; user/system caddies
   * (e.g. /etc/caddy/Caddyfile) are reported as foreign.
   */
  async function identifyCaddy(pid) {
    if (!alive(pid)) return { ours: false, stale: true }
    const info = await readProcessCommand(pid)
    if (!info) return { ours: false, unknown: true }
    if (info.args) {
      if (info.comm !== 'caddy') return { ours: false, foreign: true }
      return usesOurCaddyConfig(info.args) ? { ours: true } : { ours: false, foreign: true }
    }
    if (!info.command.toLowerCase().includes('caddy')) return { ours: false, foreign: true }
    return commandMatchesOurConfig(info.command) ? { ours: true } : { ours: false, foreign: true }
  }

  function identifyCaddySync(pid) {
    if (!alive(pid)) return { ours: false, stale: true }
    const info = readProcessCommandSync(pid)
    if (!info) return { ours: false, unknown: true }
    if (info.args) {
      if (info.comm !== 'caddy') return { ours: false, foreign: true }
      return usesOurCaddyConfig(info.args) ? { ours: true } : { ours: false, foreign: true }
    }
    if (!info.command.toLowerCase().includes('caddy')) return { ours: false, foreign: true }
    return commandMatchesOurConfig(info.command) ? { ours: true } : { ours: false, foreign: true }
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

  const exec = (cmd, args, env, input) =>
    new Promise((resolve) => {
      const child = execFile(cmd, args, { timeout: 15000, env: { ...process.env, ...(env || {}) } }, (err, stdout, stderr) => {
        if (err) resolve({ ok: false, code: err.code, message: (stderr || err.message || '').toString().trim() })
        else resolve({ ok: true, output: stdout.toString().trim() })
      })
      if (input !== undefined) child.stdin.end(input)
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

    // Run status commands concurrently; sequential execFile calls were the
    // main reason /remote-access.status.json felt slow while Tailscale was up.
    // Serve is read from structured JSON, but Funnel's public/tailnet-only
    // distinction comes from the explicit marker in its human-readable
    // status. Current Tailscale versions return Serve-shaped JSON for Funnel
    // without an AllowFunnel field.
    const [st, funnelJson, funnelPlain, serveJson] = await Promise.all([
      exec('tailscale', ['status', '--json']),
      exec('tailscale', ['funnel', 'status', '--json']),
      exec('tailscale', ['funnel', 'status']),
      exec('tailscale', ['serve', 'status', '--json']),
    ])
    if (!st.ok) return { enabled: true, installed: true, accessDenied: true, funnelState: 'unknown', detail: st.message }
    let parsed
    try {
      parsed = JSON.parse(st.output)
    } catch {
      return { enabled: true, installed: true, funnelState: 'unknown', detail: 'unparsable status' }
    }
    const self = parsed.Self || {}

    // Prefer structured JSON for the shared Serve route. Funnel public mode
    // is parsed separately from its explicit human-readable status marker.
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

    const funnelConfig = parseJson(funnelJson.output)
    const funnelText = funnelPlain.ok ? funnelPlain.output.trim() : ''
    const plainFunnel = funnelPlain.ok ? parseFunnelStatus(funnelText) : { state: 'unknown', detail: funnelPlain.message || 'Funnel status unavailable' }
    let funnelState = plainFunnel.state
    // Some older/newer CLIs expose AllowFunnel in JSON. Use it only when the
    // field is actually present; a shared Serve route alone is not evidence
    // that public Funnel is enabled.
    if (funnelState === 'unknown' && funnelConfig && funnelConfig.AllowFunnel && typeof funnelConfig.AllowFunnel === 'object') {
      const allowed = Object.values(funnelConfig.AllowFunnel)
      funnelState = allowed.some((value) => value === true) ? 'on' : 'off'
    }
    const funnelOn = funnelState === 'on'

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
      funnelState,
      funnelStatusDetail: plainFunnel.detail,
      serve: routes.length ? routes : serveConfig ? 'off' : serveJson.ok ? 'off' : 'unknown',
      serveDetail: serveConfig ? JSON.stringify(serveConfig) : serveText || serveJson.message,
      serveUrl: routes[0] || '',
      serveTarget,
    }
  }


  async function mdnsStatus() {
    // macOS runs mDNSResponder as part of the OS. Linux needs an active
    // Avahi service for the `.local` probe; Windows support is deliberately
    // reported as unavailable because Bonjour/WSL service ownership cannot be
    // inferred safely from this process.
    if (process.platform === 'darwin') return true
    if (process.platform !== 'linux') return false
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
      apiGateway: {
        host: '127.0.0.1',
        port: apiGateway.port,
        listening: apiGateway.listening,
        access: apiAccess,
      },
      tailscale: ts,
    }
  }

  async function status() {
    await settingsLoaded
    const ip = config.lanIp || detectIp()
    const checked = await checks()
    const caddy = checked.caddy
    return {
      lanIp: ip,
      url: `https://${ip}:${config.port}/`,
      platform: process.platform,
      certSupported,
      mdnsSupported,
      port: config.port,
      dshLocalPort: config.localPort,
      tailscalePort: config.tailscalePort,
      apiGatewayPort: apiGateway.port,
      lanBind: config.lanBind || config.lanIp || detectIp(),
      autoStart,
      tailscaleAutoStart,
      access: {
        lanAuth,
        serveAuth,
        funnelRequiresAuth,
        basicAuthUser,
        basicAuthConfigured: basicAuthHash.length > 0,
        apiAccess,
        apiMethods: API_METHOD_CATALOG,
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
  // demonstrably the dsh-remote-access caddy — same Caddyfile path). A caddy the user
  // started for something else, or a Tailscale session the user connected
  // themselves, is left alone.
  const weStartedTailscale = { v: false }
  const weEnabledServe = { v: false }
  const weEnabledFunnel = { v: false }
  const spawnedCaddyPids = new Set()

  const terminateProcess = (pid, force) => {
    if (isWindows) {
      const args = ['/PID', String(pid), '/T']
      if (force) args.push('/F')
      const r = spawnSync('taskkill', args, { encoding: 'utf8', timeout: 5000 })
      return r.status === 0
    }
    try {
      process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
      return true
    } catch {
      return false
    }
  }

  async function stopCaddyPid(pid) {
    if (!terminateProcess(pid, false)) {
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
    if (!terminateProcess(pid, true)) {
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
      log.info(`[remote-access] leaving foreign/unverified caddy alone (pid ${pid})`)
      await fs.unlink(pidFile).catch(() => {})
      return { ok: false, message: identity.foreign ? 'pidfile points to a caddy that is not dsh-remote-access; not stopping it' : 'cannot verify caddy identity; not stopping it' }
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
      log.info(`[remote-access] leaving foreign/unverified caddy alone (pid ${pid})`)
      if (identity.foreign || identity.stale) await fs.unlink(pidFile).catch(() => {})
      return { ok: false, message: identity.foreign ? 'foreign caddy' : 'unverified caddy' }
    }
    return stopCaddyPid(pid)
  }

  function stopOwnedCaddySync() {
    // Children spawned by this plugin are ours by construction.
    for (const pid of [...spawnedCaddyPids]) {
      if (!alive(pid)) continue
      terminateProcess(pid, false)
    }
    const pid = readPidSync()
    if (!alive(pid)) return
    const identity = identifyCaddySync(pid)
    if (!identity.ours) {
      log.info(`[remote-access] leaving foreign/unverified caddy alone (pid ${pid})`)
      return
    }
    terminateProcess(pid, false)
  }

  const runTailscaleSync = (args) => {
    try {
      const r = spawnSync('tailscale', args, { encoding: 'utf8', timeout: 3000 })
      if (r.error) {
        log.warn(`[remote-access] tailscale ${args[0]} failed: ${r.error.message}`)
        return false
      }
      if (r.status !== 0) {
        log.warn(`[remote-access] tailscale ${args.join(' ')} exited ${r.status}: ${(r.stderr || '').trim()}`)
        return false
      }
      return true
    } catch (e) {
      log.warn(`[remote-access] tailscale ${args[0]} failed: ${e.message}`)
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
      else log.warn(`[remote-access] funnel off (restore serve-only) failed: ${r.message}`)
    }
    if (weEnabledServe.v) {
      const r = await exec('tailscale', ['serve', 'off'])
      if (r.ok) weEnabledServe.v = false
      else log.warn(`[remote-access] serve off failed: ${r.message}`)
    }
    if (weStartedTailscale.v) {
      const r = await exec('tailscale', ['down'])
      if (r.ok) weStartedTailscale.v = false
      else log.warn(`[remote-access] tailscale down failed: ${r.message}`)
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
    await apiGateway.close()
  }

  function shutdownOwnedServicesSync() {
    if (servicesShutdownStarted) return
    servicesShutdownStarted = true
    stopOwnedCaddySync()
    stopOwnedTailscaleSync()
    apiGateway.closeSync()
  }

  const caddyEnvironment = () => ({
    DSH_CADDY_DIR: caddyDir,
    DSH_PORT: String(config.port),
    DSH_LOCAL_PORT: String(config.localPort),
    DSH_TAILSCALE_PORT: String(config.tailscalePort),
    DSH_API_GATEWAY_PORT: String(apiGateway.port),
    DSH_LAN_BIND: String(config.lanBind || config.lanIp || detectIp()),
    XDG_DATA_HOME: path.join(caddyDir, 'data'),
    XDG_CONFIG_HOME: path.join(caddyDir, 'config'),
  })

  function spawnCaddy() {
    return new Promise((resolve, reject) => {
      const errFd = openSync(runLog, 'w', 0o600)
      chmodSync(runLog, 0o600)
      const child = spawn(config.caddyBin, ['run', '--config', caddyConf, '--adapter', 'caddyfile'], {
        env: {
          ...process.env,
          ...caddyEnvironment(),
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

  async function ensureApiGateway() {
    try {
      await apiGateway.ready
      return { ok: true }
    } catch (error) {
      return { ok: false, code: 'api-gateway.unavailable', message: `API gateway unavailable: ${error.message}` }
    }
  }

  const execGenCert = () => exec(process.execPath, [genCert], { DSH_LAN_IP: config.lanIp || detectIp(), DSH_CERT_DIR: path.join(caddyDir, 'certs') })

  async function ensureCertificate() {
    const info = await certInfo()
    const nearExpiry = info.present && Number.isFinite(Date.parse(info.validTo)) && Date.parse(info.validTo) - Date.now() < 30 * 24 * 3600 * 1000
    if (info.present && info.coversLanIp === true && !nearExpiry) return { ok: true, generated: false }

    const generated = await execGenCert()
    // gen-cert.js exits 10 after a successful regeneration so its caller can
    // restart Caddy. Treat that exit code as success, then verify the files
    // before allowing Caddy to validate the generated config.
    if (!generated.ok && generated.code !== 10) {
      return { ok: false, code: 'cert.generation-failed', message: generated.message || generated.output || 'failed to generate the local TLS certificate' }
    }
    const next = await certInfo()
    if (!next.present || next.coversLanIp !== true) {
      return { ok: false, code: 'cert.generation-failed', message: 'local TLS certificate was not generated for the configured LAN address' }
    }
    return { ok: true, generated: true }
  }

  async function start() {
    await settingsLoaded
    const gateway = await ensureApiGateway()
    if (!gateway.ok) return gateway
    const expectedCaddyfile = buildCaddyfile()
    const configMatches = await fs.readFile(caddyConf, 'utf8').then((text) => text === expectedCaddyfile).catch(() => false)
    const cur = await caddyRunning()
    if (cur.running) {
      if (configMatches && await healthy()) return { ok: true, alreadyRunning: true, pid: cur.pid }
      // The pidfile process is ours but not healthy (for example stuck in a
      // graceful shutdown with a held connection), or it is still using an
      // older generated configuration. Stop it before spawning a replacement
      // so two Caddy instances never fight over the ports.
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
    await writeCaddyfile()
    const probe = await exec(config.caddyBin, ['version'])
    if (!probe.ok) {
      return { ok: false, code: 'caddy.missing', message: `caddy binary not found: ${config.caddyBin}` }
    }
    const certificate = await ensureCertificate()
    if (!certificate.ok) return certificate
    const validation = await exec(config.caddyBin, ['validate', '--config', caddyConf, '--adapter', 'caddyfile'], caddyEnvironment())
    if (!validation.ok) {
      return { ok: false, code: 'caddy.invalid-config', message: validation.message || 'generated Caddyfile failed validation' }
    }
    let child
    try {
      child = await spawnCaddy()
    } catch (e) {
      return { ok: false, message: `cannot spawn caddy: ${e.message}` }
    }
    await atomicWrite(pidFile, String(child.pid))
    for (let i = 0; i < 40; i++) {
      if (await healthy()) return { ok: true, pid: child.pid }
      if (child.exitCode !== null) break
      await sleep(250)
    }
    const msg = `caddy did not become healthy within 10s; see ${runLog}`
    log.warn(`[remote-access] ${msg}`)
    return { ok: false, message: msg, exitCode: child.exitCode }
  }

  async function regenCert() {
    if (!certSupported) return { ok: false, code: 'cert.unsupported', message: 'certificate generation is not supported on this platform' }
    const r = await execGenCert()
    // gen-cert.js exits 10 after regenerating (caller should restart caddy),
    // so a non-zero exit here can still mean success.
    if (r.code === 10 || (r.ok && r.output.includes('cert regenerated'))) {
      await stop()
      const st2 = await start()
      return { ok: st2.ok, regenerated: true, message: `cert regenerated; caddy restart ${st2.ok ? 'ok' : 'failed'}` }
    }
    return { ok: r.ok, regenerated: false, message: r.output || r.message }
  }

  const tailscaleServeOn = (ts) => Array.isArray(ts.serve) && ts.serve.length > 0
  let actionTail = Promise.resolve()
  const runExclusive = (task) => {
    const current = actionTail.then(task, task)
    actionTail = current.catch(() => {})
    return current
  }

  async function action(body) {
    await settingsLoaded
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
        if (before.running !== true) return { ok: true, alreadyOff: true, message: 'tailscale already disconnected' }
        if (!weStartedTailscale.v) {
          return { ok: false, code: 'tailscale.foreign', message: 'Tailscale was not started by dsh-remote-access; not disconnecting it' }
        }
        const r = await exec('tailscale', ['down'])
        if (r.ok) weStartedTailscale.v = false
        return r.ok ? { ok: true, message: 'tailscale down' } : { ok: false, message: r.message }
      }
      case 'tailscaleFunnel': {
        const on = body.funnelOn !== false
        const before = await tailscaleStatus()
        if (before.installed === false) return { ok: false, code: 'tailscale.missing', message: 'tailscale binary not found' }
        if (before.funnelState === 'unknown') {
          return { ok: false, code: 'funnel.status-unknown', message: 'cannot verify the current Funnel state; not modifying Tailscale configuration' }
        }
        if (on && funnelRequiresAuth && !basicAuthHash) {
          return { ok: false, code: 'auth.missing', message: 'generate Basic Auth credentials before enabling Funnel' }
        }
        const expectedServeTarget = `http://127.0.0.1:${config.tailscalePort}`
        if (on && before.funnelOn === true) {
          if (!weEnabledFunnel.v && before.serveTarget !== expectedServeTarget) {
            return { ok: false, code: 'funnel.foreign', message: `existing Funnel target ${before.serveTarget || 'unknown'} is not managed by dsh-remote-access; not modifying it` }
          }
          return { ok: true, alreadyOn: true, message: 'funnel already on' }
        }
        // Enabling Funnel rewrites the shared Serve config. Allow it when Serve
        // is already managed by this plugin, when there is no Serve yet, or
        // when the existing Serve is exactly the standard dsh-remote-access route into
        // Caddy (http://127.0.0.1:<tailscalePort>). Any other pre-existing
        // Serve configuration is left untouched.
        if (on && before.serve !== 'off' && !weEnabledServe.v && before.serveTarget !== expectedServeTarget) {
          return { ok: false, code: 'serve.foreign', message: `existing Serve target ${before.serveTarget || 'unknown'} is not managed by dsh-remote-access; not modifying it` }
        }
        // If Funnel is already off there is nothing to do; never touch a
        // Funnel that was enabled outside this plugin.
        if (!on && before.funnelOn !== true) return { ok: true, alreadyOff: true, message: 'funnel already off' }
        if (!on && !weEnabledFunnel.v && before.serveTarget !== expectedServeTarget) {
          return { ok: false, code: 'funnel.foreign', message: 'funnel was not enabled by dsh-remote-access; not changing it' }
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
        const expectedServeTarget = `http://127.0.0.1:${config.tailscalePort}`
        if (on && before.serve === 'unknown') {
          return { ok: false, code: 'serve.foreign', message: 'existing Serve state could not be verified; not modifying it' }
        }
        if (on && beforeOn === true) {
          if (before.serveTarget !== expectedServeTarget) {
            return { ok: false, code: 'serve.foreign', message: `existing Serve target ${before.serveTarget || 'unknown'} is not managed by dsh-remote-access; not modifying it` }
          }
          return { ok: true, alreadyOn: true, message: 'tailscale serve already on' }
        }
        if (!on && beforeOn === false) return { ok: true, alreadyOff: true, message: 'tailscale serve already off' }
        if (!on && !weEnabledServe.v && before.serveTarget !== expectedServeTarget) {
          return { ok: false, code: 'serve.foreign', message: `existing Serve target ${before.serveTarget || 'unknown'} is not managed by dsh-remote-access; not modifying it` }
        }
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
        if (body.on === true && !mdnsSupported) {
          return { ok: false, code: 'mdns.unsupported', message: 'mDNS detection is not supported on this platform' }
        }
        noticeState.enabled = body.on === true
        if (body.probeHost) {
          const probeHost = validProbeHost(body.probeHost)
          if (!probeHost) return { ok: false, code: 'probe.invalid-host', message: 'probeHost must be a hostname or IPv4 address' }
          noticeState.probeHost = probeHost
        }
        await atomicWrite(noticeStateFile, JSON.stringify(noticeState, null, 2) + '\n')
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
        if (body.on === true && !basicAuthHash) return { ok: false, code: 'auth.missing', message: 'generate Basic Auth credentials before enabling LAN Auth' }
        lanAuth = body.on === true
        await persistRuntimeSettings()
        const applied = await applyCaddyfile()
        return { ok: applied.ok, message: applied.message }
      }
      case 'setServeAuth': {
        if (body.on === true && !basicAuthHash) return { ok: false, code: 'auth.missing', message: 'generate Basic Auth credentials before enabling Serve Auth' }
        serveAuth = body.on === true
        await persistRuntimeSettings()
        const applied = await applyCaddyfile()
        return { ok: applied.ok, message: applied.message }
      }
      case 'setApiAccess': {
        const mode = typeof body.mode === 'string' ? body.mode : ''
        if (!ACCESS_MODES.includes(mode)) {
          return { ok: false, code: 'api-access.invalid-mode', message: `unknown API access mode: ${mode || '(missing)'}` }
        }
        if (!Array.isArray(body.allow)) {
          return { ok: false, code: 'api-access.invalid-list', message: 'allow must be an array of known API methods' }
        }
        const allow = [...new Set(body.allow.filter((method) => typeof method === 'string' && method.length > 0))]
        const unknown = allow.filter((method) => method !== '*' && !isKnownApiMethod(method))
        if (unknown.length > 0) {
          return { ok: false, code: 'api-access.unknown-method', message: `unknown API method: ${unknown.join(', ')}` }
        }
        const current = apiAccess[mode] || { allow: [], events: true }
        const events = typeof body.events === 'boolean' ? body.events : current.events === true
        const allApis = typeof body.allApis === 'boolean' ? body.allApis : current.allApis === true
        const trustedRemoteSettings = typeof body.trustedRemoteSettings === 'boolean'
          ? body.trustedRemoteSettings
          : current.trustedRemoteSettings === true
        if (mode === 'funnel' && (allApis || trustedRemoteSettings)) {
          return { ok: false, code: 'api-access.funnel-restricted', message: 'Funnel does not support all APIs or trusted remote settings' }
        }
        if (mode === 'funnel') {
          const privileged = allow.filter((method) => isPrivilegedApiMethod(method))
          if (privileged.length > 0) {
            return { ok: false, code: 'api-access.funnel-restricted', message: `Funnel cannot expose privileged API methods: ${privileged.join(', ')}` }
          }
        }
        const next = {
          ...apiAccess,
          [mode]: { allow, events, allApis, trustedRemoteSettings },
        }
        apiAccess = normalizeApiAccessPolicy(next)
        await persistRuntimeSettings()
        apiGateway.setPolicy(apiAccess)
        return { ok: true, mode, policy: apiAccess[mode], message: `${mode} API access policy updated` }
      }
      case 'resetBasicAuth': {
        const password = randomBytes(12).toString('base64url')
        // Let Caddy read the secret from stdin so it never appears in argv or
        // the process list of another local user.
        const hashed = await exec(config.caddyBin, ['hash-password'], undefined, `${password}\n`)
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
        // One-click bring-up: verify the binary and certificate, write the
        // current Caddy configuration, then start the proxy.
        const steps = []
        const caddyProbe = await exec(config.caddyBin, ['version'])
        if (!caddyProbe.ok) {
          return { ok: false, code: 'caddy.missing', message: `caddy binary not found: ${config.caddyBin}`, steps }
        }
        const certificate = await ensureCertificate()
        if (!certificate.ok) {
          steps.push(`cert generation failed: ${certificate.message}`)
          return { ok: false, code: certificate.code, steps, message: certificate.message }
        }
        steps.push(certificate.generated ? 'cert generated' : 'cert up to date')
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
      dismiss: "稍后再说"
    },
    en: {
      text: "<b>Secure connection not verified</b>: install this machine's LAN certificate and this notice disappears; the browser will no longer warn about the connection.",
      download: "Download certificate",
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
    probeHost: validProbeHost(config.probeHost) || validProbeHost(`${os.hostname()}.local`) || 'localhost',
    probePort: config.probePort,
  }
  let tapDispose = null

  const applyNoticeTap = () => {
    if (tapDispose) {
      tapDispose()
      tapDispose = null
    }
    if (!noticeState.enabled) return
    const script = BANNER.replace('%PROBE_HOST%', scriptString(noticeState.probeHost)).replace(
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
      if (typeof saved.probeHost === 'string' && validProbeHost(saved.probeHost)) noticeState.probeHost = validProbeHost(saved.probeHost)
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
    if (html.includes('name="dsh-remote-access-token"')) return html
    return html.replace('</head>', `<meta name="dsh-remote-access-token" content="${actionToken}">\n</head>`)
  })
  const capabilityTap = ctx.webServer.tapIndex((html) => {
    if (html.includes('name="dsh-remote-access-capabilities"')) return html
    // Base64 keeps the meta attribute independent of JSON quoting and does
    // not carry a secret. The server-side API gateway still decides whether a
    // request is actually allowed.
    let capabilityAccess = apiAccess
    try {
      const saved = JSON.parse(readFileSync(stateFile, 'utf8'))
      if (saved && saved.apiAccess !== undefined) capabilityAccess = normalizeApiAccessPolicy(saved.apiAccess)
    } catch {
      /* The in-memory policy is the source of truth until the first state write. */
    }
    const capabilities = Buffer.from(JSON.stringify({
      lan: { trustedRemoteSettings: capabilityAccess.lan?.trustedRemoteSettings === true },
      serve: { trustedRemoteSettings: capabilityAccess.serve?.trustedRemoteSettings === true },
      funnel: { trustedRemoteSettings: false },
    })).toString('base64')
    return html.replace('</head>', `<meta name="dsh-remote-access-capabilities" content="${capabilities}">\n</head>`)
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
      path: '/remote-access.status.json',
      handler: async (req, res) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { ok: false, message: 'GET only' })
          return
        }
        const snapshot = await status()
        snapshot.remoteAccessMode = typeof req.headers['x-dsh-remote-access-mode'] === 'string'
          ? req.headers['x-dsh-remote-access-mode']
          : ''
        snapshot.managementLocal = !snapshot.remoteAccessMode
        sendJson(res, 200, snapshot)
      },
    }),
  )
  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/remote-access.action',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, message: 'POST only' })
          return
        }
        // Caddy marks every remote non-/api request. This management surface
        // can stop Caddy, change Tailscale state, or mint credentials, so it
        // stays local-only by default even though ordinary DSH UI requests
        // are available remotely through the basic API policy.
        if (req.headers['x-dsh-remote-access-mode']) {
          sendJson(res, 403, { ok: false, code: 'remote-access.local-only', message: 'remote-access actions are available only on the local DSH URL' })
          return
        }
        // Mutating surface is gated by the per-boot token injected into the
        // served index.html — the local settings page carries it automatically;
        // local requests without it get 401.
        const presented = Buffer.from(String(req.headers['x-remote-access-token'] || ''))
        const expected = Buffer.from(actionToken)
        const authorized = presented.length === expected.length && timingSafeEqual(presented, expected)
        if (!authorized) {
          sendJson(res, 401, { ok: false, message: 'unauthorized: missing or stale X-Remote-Access-Token (refresh the dsh page)' })
          return
        }
        const body = await readBody(req)
        if (body === null) {
          sendJson(res, 400, { ok: false, message: 'invalid JSON body' })
          return
        }
        let out
        try {
          out = await runExclusive(() => action(body))
        } catch (e) {
          out = { ok: false, message: `action error: ${e.message}` }
        }
        // Do not embed a full status snapshot here: status probes (caddy
        // health + several tailscale CLI calls) make the action response feel
        // slow. The client refreshes /remote-access.status.json itself right after.
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
          runExclusive(() => start()).then((r) =>
            log.info(`[remote-access] auto-start(caddy) => ${r.ok ? 'ok' : 'failed'} pid=${r.pid || 0} msg=${r.message || ''}`),
          ),
        )
      }
      if (config.tailscale && tailscaleAutoStart) {
        jobs.push(
          runExclusive(async () => {
            const ts = await tailscaleStatus()
            if (ts.running === true) return
            const r = await exec('tailscale', ['up', '--operator=' + os.userInfo().username])
            if (r.ok && ts.running === false) weStartedTailscale.v = true
            log.info(`[remote-access] auto-start(tailscale) => ${r.ok ? 'ok' : 'failed'} ${r.message || ''}`)
          }),
        )
      }
      for (const p of jobs) p.catch((e) => log.warn(`[remote-access] auto-start error: ${e.message}`))
    })()
  }, 750)
  log.info(`[remote-access] active deployDir=${deployDir} port=${config.port}`)

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
    if (capabilityTap) {
      try {
        capabilityTap()
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
    await actionTail.catch(() => {})
    await shutdownOwnedServices()
  }
}
