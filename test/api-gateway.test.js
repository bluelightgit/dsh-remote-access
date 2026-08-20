import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import { createApiGateway, DEFAULT_BASIC_API_ALLOWLIST, normalizeApiAccessPolicy } from '../api-gateway.js'

let upstream
let gateway
let upstreamRequests

function request(path, { mode, method = 'POST', body = '{}', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: gateway.port,
      path,
      method,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        ...(mode ? { 'x-dsh-access-mode': mode } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

before(async () => {
  upstreamRequests = []
  upstream = http.createServer((req, res) => {
    upstreamRequests.push({ path: req.url, host: req.headers.host, origin: req.headers.origin, mode: req.headers['x-dsh-access-mode'] })
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  gateway = createApiGateway({
    port: 0,
    localPort: upstream.address().port,
  })
  await gateway.ready
})

after(async () => {
  await gateway.close()
  upstream.close()
  await once(upstream, 'close')
})

test('default remote policy keeps ordinary DSH methods and rejects sensitive methods', async () => {
  assert.ok(DEFAULT_BASIC_API_ALLOWLIST.includes('session.prompt'))
  assert.ok(!DEFAULT_BASIC_API_ALLOWLIST.includes('settings.update'))

  const allowed = await request('/api/session.prompt', { mode: 'lan' })
  assert.equal(allowed.status, 200)
  assert.equal(upstreamRequests.at(-1).path, '/api/session.prompt')
  assert.equal(upstreamRequests.at(-1).host, `127.0.0.1:${upstream.address().port}`)
  assert.equal(upstreamRequests.at(-1).origin, `http://127.0.0.1:${upstream.address().port}`)
  assert.equal(upstreamRequests.at(-1).mode, undefined)

  const exported = await request('/api/session.export?sessionId=test', { mode: 'lan', method: 'GET', body: '' })
  assert.equal(exported.status, 200)
  assert.equal(upstreamRequests.at(-1).path, '/api/session.export?sessionId=test')

  const eventStream = await request('/api/events.mux', { mode: 'lan', method: 'GET', body: '' })
  assert.equal(eventStream.status, 200)

  const denied = await request('/api/settings.update', { mode: 'lan' })
  assert.equal(denied.status, 403)
  assert.equal(upstreamRequests.some((item) => item.path === '/api/settings.update'), false)

  const hostDenied = await request('/api/host.listDirectory', { mode: 'lan' })
  assert.equal(hostDenied.status, 403)
})

test('unknown access modes are denied', async () => {
  const denied = await request('/api/session.list', { mode: 'unknown' })
  assert.equal(denied.status, 403)
  const missing = await request('/api/session.list')
  assert.equal(missing.status, 403)
})

test('explicit per-mode policy can grant a reviewed method', async () => {
  const custom = createApiGateway({
    port: 0,
    localPort: upstream.address().port,
    policy: { serve: { allow: ['settings.update'], events: false } },
  })
  await custom.ready
  const original = gateway
  gateway = custom
  try {
    const allowed = await request('/api/settings.update', { mode: 'serve' })
    assert.equal(allowed.status, 200)
    const denied = await request('/api/session.prompt', { mode: 'serve' })
    assert.equal(denied.status, 403)
  } finally {
    gateway = original
    await custom.close()
  }
})

test('running gateway accepts a policy update without changing its listener', async () => {
  const originalPort = gateway.port
  gateway.setPolicy({ lan: { allow: ['settings.update'], events: false } })
  try {
    const allowed = await request('/api/settings.update', { mode: 'lan' })
    assert.equal(allowed.status, 200)
    const denied = await request('/api/session.prompt', { mode: 'lan' })
    assert.equal(denied.status, 403)
    assert.equal(gateway.port, originalPort)
  } finally {
    gateway.setPolicy(undefined)
  }
})

test('allowAllApis forwards an API method that is unknown to the static catalog', async () => {
  const originalPort = gateway.port
  gateway.setPolicy({ lan: { allow: ['*'], allApis: true, events: false } })
  try {
    const allowed = await request('/api/active-plugin.futureMethod', { mode: 'lan' })
    assert.equal(allowed.status, 200)
    assert.equal(upstreamRequests.at(-1).path, '/api/active-plugin.futureMethod')
    assert.equal(gateway.port, originalPort)
  } finally {
    gateway.setPolicy(undefined)
  }
})

test('trusted remote settings grants the settings plane and requires same-origin writes', async () => {
  const custom = createApiGateway({
    port: 0,
    localPort: upstream.address().port,
    policy: { serve: { allow: [], events: false, trustedRemoteSettings: true } },
  })
  await custom.ready
  const original = gateway
  gateway = custom
  try {
    const described = await request('/api/settings.describe', {
      mode: 'serve',
      headers: { host: 'dsh.example.test', origin: 'https://dsh.example.test' },
    })
    assert.equal(described.status, 200)

    const deniedWrite = await request('/api/settings.update', {
      mode: 'serve',
      headers: { host: 'dsh.example.test' },
    })
    assert.equal(deniedWrite.status, 403)

    const allowedWrite = await request('/api/settings.update', {
      mode: 'serve',
      headers: { host: 'dsh.example.test', origin: 'https://dsh.example.test' },
    })
    assert.equal(allowedWrite.status, 200)
  } finally {
    gateway = original
    await custom.close()
  }
})

test('Funnel normalizes wildcard and privileged settings access back to the basic policy', async () => {
  const policy = normalizeApiAccessPolicy({
    funnel: { allow: ['*', 'settings.update'], allApis: true, trustedRemoteSettings: true },
  })
  assert.equal(policy.funnel.allApis, false)
  assert.equal(policy.funnel.trustedRemoteSettings, false)
  assert.ok(policy.funnel.allow.includes('session.prompt'))
  assert.ok(!policy.funnel.allow.includes('settings.update'))
})

test('event WebSocket upgrades use the same access mode and remain streamable', async () => {
  const wsUpstream = http.createServer()
  let wsSocket
  wsUpstream.on('upgrade', (_req, socket) => {
    wsSocket = socket
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
    socket.write('event-frame')
  })
  wsUpstream.listen(0, '127.0.0.1')
  await once(wsUpstream, 'listening')
  const wsGateway = createApiGateway({ port: 0, localPort: wsUpstream.address().port })
  await wsGateway.ready
  const client = net.connect(wsGateway.port, '127.0.0.1')
  const chunks = []
  client.on('data', (chunk) => chunks.push(chunk))
  client.write('GET /api/events.mux HTTP/1.1\r\nHost: gateway\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nX-DSH-Access-Mode: lan\r\n\r\n')
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket upgrade timed out')), 2000)
      client.on('data', () => {
        if (Buffer.concat(chunks).includes('event-frame')) {
          clearTimeout(timer)
          resolve()
        }
      })
    })
    assert.match(Buffer.concat(chunks).toString('utf8'), /101 Switching Protocols/)
  } finally {
    client.destroy()
    wsSocket?.destroy()
    await wsGateway.close()
    wsUpstream.closeAllConnections()
    await new Promise((resolve) => wsUpstream.close(() => resolve()))
  }
})
