import http from 'node:http'
import net from 'node:net'

export const ACCESS_MODES = Object.freeze(['lan', 'serve', 'funnel'])

// These are the browser-facing DSH capabilities needed for ordinary session
// work. Host filesystem operations, settings, credentials, preset authoring,
// and model discovery are intentionally excluded. The list is explicit so a
// newly added DSH endpoint is denied remotely until it is reviewed.
export const DEFAULT_BASIC_API_ALLOWLIST = Object.freeze([
  'respond',
  'agentPreset.list',
  'agentPreset.select',
  'goal.clear',
  'goal.complete',
  'goal.create',
  'goal.edit',
  'goal.pause',
  'goal.resume',
  'host.describe',
  'llm.models',
  'llm.providers',
  'session.attachment',
  'session.cancel',
  'session.create',
  'session.export',
  'session.fork',
  'session.history',
  'session.list',
  'session.models',
  'session.prompt',
  'session.rename',
  'session.search',
  'session.selectModel',
  'session.updateQueue',
  'skill.list',
  'subagent.history',
  'subagent.interrupt',
  'subagent.list',
  'subagent.prompt',
  'workspace.archiveSession',
  'workspace.create',
  'workspace.delete',
  'workspace.insertBefore',
  'workspace.insertSessionBefore',
  'workspace.list',
  'workspace.rename',
])

// The settings UI exposes the complete API surface known by the installed
// DSH client. Keeping this catalog explicit is intentional for the reviewed
// per-method mode; the separate allowAllApis switch is the explicit opt-in
// that grants future plugin RPC methods too.
const PRIVILEGED_API_METHODS = Object.freeze([
  'agentPreset.read',
  'agentPreset.copy',
  'agentPreset.openDocument',
  'agentPreset.remove',
  'host.pickDirectory',
  'host.listDirectory',
  'host.createDirectory',
  'host.openPath',
  'settings.describe',
  'settings.openDocument',
  'settings.update',
  'settings.replace',
  'settings.mutate',
  'credentials.describe',
  'credentials.set',
  'credentials.unset',
  'llm.discoverModels',
])

// A trusted remote settings page needs the same configuration-plane calls as
// the built-in Models/settings surfaces. This is deliberately narrower than
// the complete privileged set: host filesystem actions and preset authoring
// remain opt-in through the explicit API list or allowAllApis.
export const REMOTE_SETTINGS_API_METHODS = Object.freeze([
  'settings.describe',
  'settings.openDocument',
  'settings.update',
  'settings.replace',
  'settings.mutate',
  'credentials.describe',
  'credentials.set',
  'credentials.unset',
  'llm.discoverModels',
])

export const REMOTE_SETTINGS_WRITE_API_METHODS = Object.freeze([
  'settings.openDocument',
  'settings.update',
  'settings.replace',
  'settings.mutate',
  'credentials.set',
  'credentials.unset',
])

export const API_METHOD_CATALOG = Object.freeze([
  ...DEFAULT_BASIC_API_ALLOWLIST.map((method) => Object.freeze({ method, privileged: false })),
  ...PRIVILEGED_API_METHODS.map((method) => Object.freeze({ method, privileged: true })),
])

export const API_METHODS = Object.freeze(API_METHOD_CATALOG.map(({ method }) => method))
const API_METHOD_SET = new Set(API_METHODS)
const PRIVILEGED_API_METHOD_SET = new Set(PRIVILEGED_API_METHODS)
const REMOTE_SETTINGS_API_METHOD_SET = new Set(REMOTE_SETTINGS_API_METHODS)

const API_ENDPOINT_RE = /^\/api\/([A-Za-z0-9_$.-]+)$/
const EVENT_PATHS = new Set(['/api/events.mux', '/api/events.host'])
const DOWNLOAD_METHODS = new Set(['session.export'])
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

function logMessage(logger, level, message, error) {
  try {
    const fn = logger && typeof logger[level] === 'function' ? logger[level].bind(logger) : null
    if (fn) fn(error ? `${message}: ${error.message || error}` : message)
  } catch {
    // Logging must never take down the request gateway.
  }
}

function normalizeList(value, fallback) {
  if (value === '*') return ['*']
  if (!Array.isArray(value)) return [...fallback]
  return [...new Set(value.filter((item) => typeof item === 'string' && item.length > 0))]
}

export function normalizeApiAccessPolicy(raw) {
  const policy = {}
  for (const mode of ACCESS_MODES) {
    const entry = raw && typeof raw === 'object' ? raw[mode] : undefined
    if (entry === '*') {
      policy[mode] = mode === 'funnel'
        ? { allow: [...DEFAULT_BASIC_API_ALLOWLIST], events: true, allApis: false, trustedRemoteSettings: false }
        : { allow: ['*'], events: true, allApis: true, trustedRemoteSettings: false }
      continue
    }
    if (Array.isArray(entry)) {
      const requestedAll = entry.includes('*')
      policy[mode] = mode === 'funnel'
        ? { allow: normalizeFunnelAllow(entry), events: true, allApis: false, trustedRemoteSettings: false }
        : {
            allow: requestedAll ? ['*'] : normalizeList(entry, DEFAULT_BASIC_API_ALLOWLIST),
            events: true,
            allApis: requestedAll,
            trustedRemoteSettings: false,
          }
      continue
    }
    const allow = entry && typeof entry === 'object' ? entry.allow : undefined
    const requestedAll = entry && typeof entry === 'object' && entry.allApis === true
      || allow === '*'
      || (Array.isArray(allow) && allow.includes('*'))
    const trustedRemoteSettings = entry && typeof entry === 'object' && entry.trustedRemoteSettings === true
    policy[mode] = {
      allow: mode === 'funnel'
        ? normalizeFunnelAllow(allow)
        : requestedAll ? ['*'] : normalizeList(allow, DEFAULT_BASIC_API_ALLOWLIST),
      events: entry && typeof entry === 'object' && typeof entry.events === 'boolean' ? entry.events : true,
      allApis: mode === 'funnel' ? false : requestedAll,
      trustedRemoteSettings: mode === 'funnel' ? false : trustedRemoteSettings,
    }
  }
  return Object.freeze(policy)
}

function normalizeFunnelAllow(value) {
  if (value === '*' || (Array.isArray(value) && value.includes('*'))) return [...DEFAULT_BASIC_API_ALLOWLIST]
  const allow = normalizeList(value, DEFAULT_BASIC_API_ALLOWLIST)
  return allow.filter((method) => API_METHOD_SET.has(method) && !PRIVILEGED_API_METHOD_SET.has(method))
}

function headerString(value) {
  if (Array.isArray(value)) return value.join(', ')
  return typeof value === 'string' ? value : ''
}

function accessMode(req) {
  const mode = headerString(req.headers['x-dsh-access-mode'])
  return ACCESS_MODES.includes(mode) ? mode : ''
}

function requestPath(reqUrl) {
  try {
    return new URL(reqUrl || '/', 'http://dsh-remote-gateway').pathname
  } catch {
    return null
  }
}

function apiMethod(reqUrl) {
  const pathname = requestPath(reqUrl)
  return pathname ? API_ENDPOINT_RE.exec(pathname)?.[1] || '' : ''
}

function isAllowed(policy, mode, method) {
  const entry = policy[mode]
  if (!entry) return false
  return entry.allApis === true
    || entry.allow.includes('*')
    || entry.allow.includes(method)
    || (entry.trustedRemoteSettings === true && REMOTE_SETTINGS_API_METHOD_SET.has(method))
}

function isTrustedSettingsWrite(policy, mode, method) {
  return policy[mode]?.trustedRemoteSettings === true && REMOTE_SETTINGS_WRITE_API_METHODS.includes(method)
}

function sameOriginAsHost(req) {
  const origin = headerString(req.headers.origin).trim()
  const host = headerString(req.headers.host).trim()
  if (!origin || !host) return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}

function writeForbidden(res, message = 'forbidden') {
  if (res.headersSent) {
    res.destroy()
    return
  }
  res.writeHead(403, {
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
  })
  res.end(message)
}

function writeTooLarge(res) {
  if (res.headersSent) {
    res.destroy()
    return
  }
  res.writeHead(413, {
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
  })
  res.end('request body too large')
}

function upstreamHeaders(req, localPort, { upgrade = false } = {}) {
  const headers = {}
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase()
    if (lower === 'x-dsh-access-mode' || HOP_BY_HOP_HEADERS.has(lower)) continue
    headers[key] = value
  }
  headers.host = `127.0.0.1:${localPort}`
  // The gateway is the policy boundary. Once a request is allowed, DSH must
  // see the loopback authority it intentionally trusts. This is safe here
  // because remote traffic cannot reach the DSH port without passing through
  // this gateway, and every API endpoint is checked before forwarding.
  headers.origin = `http://127.0.0.1:${localPort}`
  delete headers['sec-fetch-site']
  if (upgrade) {
    headers.connection = 'Upgrade'
    headers.upgrade = 'websocket'
  }
  return headers
}

function safeClose(socket) {
  try {
    socket.destroy()
  } catch {
    // Best effort during shutdown.
  }
}

export function createApiGateway({
  port,
  localPort,
  policy,
  maxRequestBodyBytes = 160 * 1024 * 1024,
  logger,
}) {
  let normalizedPolicy = normalizeApiAccessPolicy(policy)
  const sockets = new Set()
  const server = http.createServer()
  let listening = false

  const rejectHttp = (req, res, message) => {
    req.resume()
    writeForbidden(res, message)
  }

  const handleHttp = (req, res) => {
    const mode = accessMode(req)
    const pathname = requestPath(req.url)
    const method = apiMethod(req.url)
    const isEventStream = req.method === 'GET' && pathname !== null && EVENT_PATHS.has(pathname)
    const isDownload = (req.method === 'GET' || req.method === 'HEAD') && DOWNLOAD_METHODS.has(method)
    const allowed = mode && (
      (req.method === 'POST' && Boolean(method) && isAllowed(normalizedPolicy, mode, method)) ||
      (isEventStream && normalizedPolicy[mode]?.events === true) ||
      (isDownload && isAllowed(normalizedPolicy, mode, method))
    )
    if (!allowed) {
      rejectHttp(req, res, 'API method is not allowed for this access mode')
      return
    }

    // The upstream DSH API sees a loopback Origin after forwarding. Preserve
    // the browser-side boundary here: trusted remote settings writes must be
    // same-origin with the public Host that Caddy received. This protects the
    // high-value configuration/credential plane from cross-site form or fetch
    // requests even when Basic Auth credentials are cached by the browser.
    if (req.method === 'POST' && method && isTrustedSettingsWrite(normalizedPolicy, mode, method) && !sameOriginAsHost(req)) {
      rejectHttp(req, res, 'trusted remote settings require a same-origin request')
      return
    }

    const declaredLength = Number.parseInt(String(req.headers['content-length'] || ''), 10)
    if (Number.isFinite(declaredLength) && declaredLength > maxRequestBodyBytes) {
      req.resume()
      writeTooLarge(res)
      return
    }

    const headers = upstreamHeaders(req, localPort)
    const upstream = http.request({
      host: '127.0.0.1',
      port: localPort,
      method: req.method,
      path: req.url,
      headers,
    }, (upstreamResponse) => {
      if (overLimit) {
        upstreamResponse.resume()
        return
      }
      res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers)
      upstreamResponse.pipe(res)
    })
    let bodyBytes = 0
    let overLimit = false
    req.on('data', (chunk) => {
      if (overLimit) return
      bodyBytes += chunk.length
      if (bodyBytes > maxRequestBodyBytes) {
        overLimit = true
        upstream.destroy()
        writeTooLarge(res)
        // Drain the request so the 413 response can finish cleanly. Destroying
        // the incoming socket here often discards the response just written.
        req.resume()
      }
    })
    req.on('aborted', () => upstream.destroy())
    upstream.on('error', (error) => {
      if (overLimit || req.aborted) return
      if (res.headersSent) {
        res.destroy()
        return
      }
      logMessage(logger, 'warn', 'API gateway upstream request failed', error)
      res.writeHead(502, { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' })
      res.end('dsh upstream unavailable')
    })
    req.pipe(upstream)
  }

  const handleUpgrade = (req, clientSocket, head) => {
    const mode = accessMode(req)
    let pathname = ''
    try {
      pathname = new URL(req.url || '/', 'http://dsh-remote-gateway').pathname
    } catch {
      safeClose(clientSocket)
      return
    }
    if (!mode || !EVENT_PATHS.has(pathname) || normalizedPolicy[mode]?.events !== true) {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }

    const upstream = net.connect(localPort, '127.0.0.1')
    sockets.add(upstream)
    const closeBoth = () => {
      sockets.delete(upstream)
      safeClose(clientSocket)
      safeClose(upstream)
    }
    clientSocket.once('error', closeBoth)
    upstream.once('error', (error) => {
      logMessage(logger, 'warn', 'API gateway WebSocket upstream failed', error)
      closeBoth()
    })
    upstream.once('connect', () => {
      const headers = upstreamHeaders(req, localPort, { upgrade: true })
      const headerLines = Object.entries(headers).map(([key, value]) => `${key}: ${headerString(value)}\r\n`).join('')
      upstream.write(`${req.method} ${req.url || '/'} HTTP/${req.httpVersion}\r\n${headerLines}\r\n`)
      if (head && head.length > 0) upstream.write(head)
      clientSocket.pipe(upstream)
      upstream.pipe(clientSocket)
    })
    clientSocket.once('close', () => safeClose(upstream))
    upstream.once('close', () => safeClose(clientSocket))
  }

  server.on('request', handleHttp)
  server.on('upgrade', handleUpgrade)
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })

  const ready = new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      listening = true
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })

  const close = async () => {
    for (const socket of sockets) safeClose(socket)
    if (!listening) return
    await new Promise((resolve) => server.close(() => resolve()))
    listening = false
  }

  const closeSync = () => {
    for (const socket of sockets) safeClose(socket)
    try {
      server.close()
    } catch {
      // The server may never have reached the listening state.
    }
    listening = false
  }

  return {
    server,
    ready,
    close,
    closeSync,
    setPolicy(nextPolicy) {
      normalizedPolicy = normalizeApiAccessPolicy(nextPolicy)
      return normalizedPolicy
    },
    get port() {
      return server.address()?.port || port
    },
    get listening() {
      return listening
    },
    get policy() {
      return normalizedPolicy
    },
  }
}

export function isKnownApiMethod(method) {
  return API_METHOD_SET.has(method)
}

export function isPrivilegedApiMethod(method) {
  return PRIVILEGED_API_METHOD_SET.has(method)
}
