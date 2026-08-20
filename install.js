#!/usr/bin/env node
// Cross-platform installer for dsh-remote-access.
//
// It links this package into <profile>/plugins/dsh-remote-access, records the
// file dependency in <profile>/package.json, and runs pnpm install.
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)))
const packageName = 'dsh-remote-access'
const dshHome = process.env.DSH_HOME && process.env.DSH_HOME.trim() ? path.resolve(process.env.DSH_HOME) : path.join(os.homedir(), '.dsh')
const profile = path.resolve(process.env.DSH_PROFILE_DIR || path.join(dshHome, 'profiles', 'web'))
const log = (msg) => console.log(`[install] ${msg}`)
const warn = (msg) => console.warn(`[install] WARNING: ${msg}`)

if (!existsSync(profile)) {
  console.error(`[install] ERROR: profile not found: ${profile} (set DSH_PROFILE_DIR)`)
  process.exit(1)
}

const pluginsDir = path.join(profile, 'plugins')
const link = path.join(pluginsDir, packageName)
mkdirSync(pluginsDir, { recursive: true })
try {
  symlinkSync(repo, link, process.platform === 'win32' ? 'junction' : 'dir')
  log(`linked ${link}`)
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  try {
    const existing = realpathSync(link)
    if (existing !== repo) warn(`plugin link already points to ${existing}; expected ${repo}, leaving it unchanged`)
    else log(`link already points to ${repo}`)
  } catch {
    warn(`plugin path already exists but could not be resolved: ${link}`)
  }
}

const profileManifest = path.join(profile, 'package.json')
const manifest = JSON.parse(readFileSync(profileManifest, 'utf8'))
manifest.dependencies ??= {}
// Keep the development install live: a `file:` dependency is materialized
// into node_modules by pnpm and can leave DSH loading an older client bundle.
manifest.dependencies[packageName] = `link:./plugins/${packageName}`
const bundles = manifest.dsh?.profile?.bundles
if (Array.isArray(bundles) && !bundles.includes(packageName)) bundles.push(packageName)
writeFileSync(profileManifest, `${JSON.stringify(manifest, null, 2)}\n`)
log('updated profile package.json')

// The package manifest owns the bundle patch. Appending a second profile row
// here creates two loader entries with the same id (`remote-access`) when DSH
// merges the package and profile patches. Leave an existing user row alone so
// the installer never silently rewrites their profile; report it for manual
// cleanup instead.
const patchFile = path.join(profile, 'cordis.patch.yml')
const patchText = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : ''
if (patchText.includes('name: dsh-remote-access') || patchText.includes('id: remote-access')) {
  log('warning: profile cordis.patch.yml already contains dsh-remote-access; remove that row because the package bundle patch owns it')
} else {
  log('profile cordis.patch.yml unchanged; package bundle patch owns remote-access')
}

const pnpmName = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const run = spawnSync(pnpmName, ['--version'], { encoding: 'utf8', timeout: 10000 })
if (run.status !== 0) {
  warn(`pnpm not found; run 'pnpm install' manually in ${profile}`)
} else {
  log('refreshing the local plugin copy in the profile ...')
  // pnpm materializes a `file:` dependency under node_modules. Force the
  // refresh so edits made through the development symlink are visible to DSH
  // immediately instead of leaving a stale client bundle behind.
  const installed = spawnSync(pnpmName, ['install', '--force', '--no-frozen-lockfile'], { cwd: profile, stdio: 'inherit', env: { ...process.env, CI: 'true' } })
  if (installed.status !== 0) process.exit(installed.status || 1)
}

log('done. Restart dsh web, then open Settings → Remote access.')
