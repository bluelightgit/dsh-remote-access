import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseFunnelStatus } from '../index.js'

test('Funnel status requires an explicit public marker', () => {
  assert.equal(parseFunnelStatus('https://host.ts.net (public)\n|-- / proxy http://127.0.0.1:3082').state, 'on')
  assert.equal(parseFunnelStatus('https://host.ts.net (tailnet only)\n|-- / proxy http://127.0.0.1:3082').state, 'off')
  assert.equal(parseFunnelStatus('No serve config').state, 'off')
  assert.equal(parseFunnelStatus('{"Web":{"host.ts.net:443":{"Handlers":{}}}}').state, 'unknown')
})
