#!/usr/bin/env node
// Cross-platform local-CA certificate generator for dsh-remote-access.
//
// OpenSSL is invoked with argument arrays, never through a shell.
import { promises as fs } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { isIP } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const certDir = path.resolve(process.env.DSH_CERT_DIR || path.join(here, 'caddy', 'certs'))
const caDir = path.join(certDir, 'ca')
const workDir = path.join(certDir, `.work-${process.pid}-${Math.random().toString(16).slice(2)}`)
const certFile = path.join(certDir, 'dsh.crt')
const keyFile = path.join(certDir, 'dsh.key')
const caCertFile = path.join(caDir, 'ca.crt')
const caKeyFile = path.join(caDir, 'ca.key')
const openssl = process.env.OPENSSL_BIN || 'openssl'
const RENEW_BEFORE_MS = 30 * 24 * 3600 * 1000

function validIp(value) {
  const result = String(value || '').trim()
  return isIP(result) ? result : ''
}

function validHostname(value) {
  const result = String(value || '').trim()
  return result.length <= 253 && /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(result) ? result : 'localhost'
}

function detectIp() {
  const addresses = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) addresses.push(item.address)
    }
  }
  const privateIp = addresses.find((ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(ip))
  return privateIp || addresses[0] || '127.0.0.1'
}

function detectTailscaleIp() {
  const result = spawnSync(process.env.TAILSCALE_BIN || 'tailscale', ['ip', '-4'], {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  })
  if (result.status !== 0 || result.error) return ''
  return validIp(String(result.stdout || '').trim().split(/\s+/)[0])
}

function runOpenSsl(args) {
  const result = spawnSync(openssl, args, {
    encoding: 'utf8',
    timeout: 120000,
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim()
    throw new Error(`${openssl} ${args[0]} failed${detail ? `: ${detail}` : ''}`)
  }
}

async function exists(file) {
  return fs.access(file).then(() => true).catch(() => false)
}

async function replaceFile(source, target, mode) {
  await fs.rm(target, { force: true })
  await fs.rename(source, target)
  await fs.chmod(target, mode).catch(() => {})
}

async function currentCertificate(lanIp) {
  if (!(await exists(certFile)) || !(await exists(keyFile)) || !(await exists(caCertFile)) || !(await exists(caKeyFile))) return false
  try {
    const leaf = new X509Certificate(await fs.readFile(certFile))
    const san = leaf.subjectAltName || ''
    return Date.parse(leaf.validTo) - Date.now() > RENEW_BEFORE_MS && san.includes(`IP Address:${lanIp}`)
  } catch {
    return false
  }
}

async function main() {
  const lanIp = validIp(process.env.DSH_LAN_IP) || validIp(detectIp())
  if (!lanIp) throw new Error(`invalid LAN IP: ${process.env.DSH_LAN_IP || ''}`)
  const hostname = validHostname(process.env.DSH_HOSTNAME || os.hostname())
  const tailscaleIp = detectTailscaleIp()

  await fs.mkdir(caDir, { recursive: true, mode: 0o700 })
  await fs.chmod(certDir, 0o700).catch(() => {})
  await fs.chmod(caDir, 0o700).catch(() => {})

  if (await currentCertificate(lanIp)) {
    console.log(`[gen-cert] cert up to date for ${lanIp}`)
    return 0
  }

  await fs.mkdir(workDir, { recursive: true, mode: 0o700 })
  try {
    const caKeyTemp = path.join(workDir, 'ca.key')
    const caCertTemp = path.join(workDir, 'ca.crt')
    if (!(await exists(caKeyFile)) || !(await exists(caCertFile))) {
      console.log('[gen-cert] creating local CA')
      runOpenSsl([
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650',
        '-keyout', caKeyTemp,
        '-out', caCertTemp,
        '-subj', '/CN=dsh-remote-access-ca (install this CA on your devices)',
      ])
      await replaceFile(caKeyTemp, caKeyFile, 0o600)
      await replaceFile(caCertTemp, caCertFile, 0o644)
    } else {
      await fs.chmod(caKeyFile, 0o600).catch(() => {})
      await fs.chmod(caCertFile, 0o644).catch(() => {})
    }

    const leafKeyTemp = path.join(workDir, 'dsh.key')
    const csr = path.join(workDir, 'dsh.csr')
    const leaf = path.join(workDir, 'leaf.crt')
    const fullchain = path.join(workDir, 'dsh.crt')
    const serial = path.join(workDir, 'ca.srl')
    const extension = path.join(workDir, 'dsh.ext')
    const san = [
      `IP:${lanIp}`,
      'IP:127.0.0.1',
      'DNS:localhost',
      `DNS:${hostname}.local`,
      ...(tailscaleIp ? [`IP:${tailscaleIp}`] : []),
    ].join(',')
    await fs.writeFile(extension, `subjectAltName=${san}\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`, { mode: 0o600 })

    console.log(`[gen-cert] generating server cert for ${lanIp}`)
    runOpenSsl([
      'req', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', leafKeyTemp,
      '-out', csr,
      '-subj', `/CN=${lanIp}`,
    ])
    runOpenSsl([
      'x509', '-req', '-in', csr,
      '-CA', caCertFile,
      '-CAkey', caKeyFile,
      '-CAserial', serial,
      '-CAcreateserial',
      '-days', '825',
      '-out', leaf,
      '-extfile', extension,
    ])

    const leafPem = await fs.readFile(leaf, 'utf8')
    const caPem = await fs.readFile(caCertFile, 'utf8')
    await fs.writeFile(fullchain, `${leafPem.trimEnd()}\n${caPem.trimStart()}`, { mode: 0o644 })
    await replaceFile(leafKeyTemp, keyFile, 0o600)
    await replaceFile(fullchain, certFile, 0o644)
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
  console.log(`[gen-cert] cert regenerated for ${lanIp} (restart caddy to pick it up)`)
  return 10
}

main().then((code) => {
  process.exitCode = code
}).catch((error) => {
  console.error(`[gen-cert] ${error.message}`)
  process.exitCode = 1
})
