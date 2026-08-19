#!/usr/bin/env node
// Cross-platform installer for dsh-lan-manager.
//
// It links this package into <profile>/plugins/dsh-lan-manager, records the
// file dependency in <profile>/package.json, appends the cordis.patch.yml row
// when missing, and runs pnpm install. No shell required.
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)))
const dshHome = process.env.DSH_HOME && process.env.DSH_HOME.trim() ? path.resolve(process.env.DSH_HOME) : path.join(os.homedir(), '.dsh')
const profile = path.resolve(process.env.DSH_PROFILE_DIR || path.join(dshHome, 'profiles', 'web'))
const port = process.env.DSH_LAN_PORT || '3081'
const localPort = process.env.DSH_LOCAL_PORT || '3080'
const tailscalePort = process.env.DSH_TAILSCALE_PORT || '3082'

const log = (msg) => console.log(`[install] ${msg}`)
const warn = (msg) => console.warn(`[install] WARNING: ${msg}`)

if (!existsSync(profile)) {
  console.error(`[install] ERROR: profile not found: ${profile} (set DSH_PROFILE_DIR)`)
  process.exit(1)
}

const pluginsDir = path.join(profile, 'plugins')
const link = path.join(pluginsDir, 'dsh-lan-manager')
mkdirSync(pluginsDir, { recursive: true })
try {
  symlinkSync(repo, link, process.platform === 'win32' ? 'junction' : 'dir')
  log(`linked ${link}`)
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  log(`link already exists: ${link}`)
}

const profileManifest = path.join(profile, 'package.json')
const manifest = JSON.parse(readFileSync(profileManifest, 'utf8'))
manifest.dependencies ??= {}
manifest.dependencies['dsh-lan-manager'] = 'file:./plugins/dsh-lan-manager'
writeFileSync(profileManifest, `${JSON.stringify(manifest, null, 2)}\n`)
log('updated profile package.json')

const patchFile = path.join(profile, 'cordis.patch.yml')
const patchText = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : ''
if (!patchText.includes('name: dsh-lan-manager')) {
  const row = `- insert:\n    - id: lan-manager\n      name: dsh-lan-manager\n      config:\n        port: ${port}\n        localPort: ${localPort}\n        tailscalePort: ${tailscalePort}\n        tailscale: true\n        certNotice: false\n`
  writeFileSync(patchFile, `${patchText}${patchText.endsWith('\n') ? '' : '\n'}${row}`)
  log('appended lan-manager row to cordis.patch.yml')
} else {
  log('lan-manager row already present, skipped')
}

const pnpmName = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const run = spawnSync(pnpmName, ['--version'], { encoding: 'utf8', timeout: 10000 })
if (run.status !== 0) {
  warn(`pnpm not found; run 'pnpm install' manually in ${profile}`)
} else {
  log('running pnpm install in profile ...')
  const installed = spawnSync(pnpmName, ['install', '--no-frozen-lockfile'], { cwd: profile, stdio: 'inherit', env: { ...process.env, CI: 'true' } })
  if (installed.status !== 0) process.exit(installed.status || 1)
}

log('done. Restart dsh web, then open Settings → Remote access.')
