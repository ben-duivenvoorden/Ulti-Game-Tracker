#!/usr/bin/env node
// Build the landing page and the app, then assemble them into a single static
// tree for ONE Azure Static Web App:
//
//   dist-site/            -> landing page (served at  /  )
//   dist-site/app/        -> the app SPA  (served at /app/)
//
// The two source trees (landing/, client/) stay independent — the app is built
// with `--base=/app/` only here, so nothing in client/ hard-codes the subpath
// (keeps it deployable standalone / as a future native app).
//
// Usage:  node scripts/build-site.mjs
// Assumes deps are installed in landing/ and client/ (npm install in each).
// VITE_API_BASE_URL, if set in the environment, is picked up by the app build.
import { execSync } from 'node:child_process'
import { cpSync, rmSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'dist-site')
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit', shell: true })

console.log('› Building landing (root-relative)…')
run('npm run build', join(root, 'landing'))

console.log('› Building app under /app/ …')
run('npx tsc -b', join(root, 'client'))
run('npx vite build --base=/app/', join(root, 'client'))

console.log('› Assembling combined tree…')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
cpSync(join(root, 'landing', 'dist'), out, { recursive: true })
cpSync(join(root, 'client', 'dist'), join(out, 'app'), { recursive: true })

console.log(`\n✓ Combined site → ${out}\n  /      = landing\n  /app/  = app`)
