/**
 * ESLint без --fix: ядро + clients модулей (кроме DISABLED_MODULES).
 * Запуск: node scripts/run-eslint-check.js [--a11y] [--report=json]
 * cwd для eslint — корень репозитория (basePath в eslint.config.js).
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  clientProjectRoot,
  listEnabledModuleNames,
  loadDisabledModules,
} from './lib/parse-disabled-modules.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientRoot = path.resolve(__dirname, '..')
const projectRoot = clientProjectRoot
const modulesRoot = path.join(projectRoot, 'modules')
const a11y = process.argv.includes('--a11y')
const reportJson = process.argv.includes('--report=json')
const LINTABLE_EXT = new Set(['.js', '.mjs', '.jsx', '.vue'])

function hasLintableFiles(dir) {
  if (!fs.existsSync(dir)) {
    return false
  }
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue
      }
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (LINTABLE_EXT.has(path.extname(entry.name))) {
        return true
      }
    }
  }
  return false
}

const disabled = loadDisabledModules()
const moduleClients = listEnabledModuleNames(modulesRoot, disabled)
  .map((name) => ({
    rel: path.join('modules', name, 'client'),
    abs: path.join(modulesRoot, name, 'client'),
  }))
  .filter((item) => hasLintableFiles(item.abs))
  .map((item) => item.rel)

const targets = [path.join('core', 'client'), ...moduleClients]
const requireFromNpm = createRequire(path.join(projectRoot, 'virtual_env/npm/package.json'))
const eslintPkgDir = path.dirname(requireFromNpm.resolve('eslint/package.json'))
const eslintBin = path.join(eslintPkgDir, 'bin/eslint.js')

const configFile = a11y
  ? path.join(clientRoot, 'eslint.a11y.config.js')
  : path.join(clientRoot, 'eslint.config.js')

const args = [eslintBin, '-c', configFile, '--no-error-on-unmatched-pattern']
if (a11y) {
  // Baseline после очистки a11y-errors; ratchet вниз при правках UI, не поднимать «на всякий случай».
  args.push('--no-fix', '--max-warnings', '2000')
} else {
  args.push('--no-fix')
}
if (reportJson) {
  args.push('-f', 'json')
}
args.push(...targets)

const result = spawnSync(process.execPath, args, {
  cwd: projectRoot,
  stdio: reportJson ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  env: process.env,
  maxBuffer: 64 * 1024 * 1024,
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

if (reportJson) {
  if (result.stdout?.length) {
    process.stdout.write(result.stdout)
  }
  if (result.stderr?.length) {
    process.stderr.write(result.stderr)
  }
}

process.exit(result.status ?? 1)
