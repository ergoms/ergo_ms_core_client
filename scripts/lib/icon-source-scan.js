/**
 * Обход исходников ядра и модулей в поисках имён иконок Lucide.
 *
 * Обход читает тысячи файлов, и при старте вместе с API (антивирус проверяет
 * каждое открытие) растягивался на минуты. Поэтому имена из каждого файла
 * кэшируются по mtime и размеру: файл читается заново, только если изменился.
 * Кэш — virtual_env/cache/client (cache_client_dir в project_layout.py).
 */
import fs from 'fs'
import path from 'path'

const CACHE_VERSION = 1
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '__pycache__', 'virtual_env', 'coverage'])
const SOURCE_RE = /\.(vue|js|mjs|ts|py|yml|yaml)$/
const MAX_FILE_BYTES = 1_500_000

const ICON_PROP_RE = /(?:icon|iconName|icon_name)\s*[:=]\s*['"]([A-Za-z][A-Za-z0-9_-]*)['"]/g
const LUCIDE_IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*['"]@lucide\/vue['"]/g

/** Сырые имена иконок из текста файла (без сопоставления с картой Lucide). */
function extractIconNames(source) {
  const names = new Set()
  for (const match of source.matchAll(ICON_PROP_RE)) {
    names.add(match[1])
  }
  for (const match of source.matchAll(LUCIDE_IMPORT_RE)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0]
      if (name) {
        names.add(name)
      }
    }
  }
  return [...names]
}

function readCache(cachePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    if (parsed?.version === CACHE_VERSION && parsed.files && typeof parsed.files === 'object') {
      return parsed.files
    }
  } catch {
    /* нет кэша или он битый — обход прочитает всё заново */
  }
  return {}
}

function writeCache(cachePath, files) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  const tmp = `${cachePath}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ version: CACHE_VERSION, files }), 'utf8')
  fs.renameSync(tmp, cachePath)
}

/**
 * Собирает сырые имена иконок со всех исходников под roots.
 * @returns {{ names: Set<string>, stats: { files: number, read: number, ms: number } }}
 */
export function scanIconNames(roots, { cachePath, projectRoot }) {
  const started = Date.now()
  const previous = readCache(cachePath)
  const next = {}
  const names = new Set()
  let files = 0
  let read = 0

  function visit(abs, entryName) {
    if (!SOURCE_RE.test(entryName) || entryName.includes('.generated.')) {
      return
    }
    let stat
    try {
      stat = fs.statSync(abs)
    } catch {
      return
    }
    if (stat.size > MAX_FILE_BYTES) {
      return
    }
    files += 1
    const key = path.relative(projectRoot, abs).replaceAll('\\', '/')
    const cached = previous[key]
    let fileNames
    if (cached && cached[0] === stat.mtimeMs && cached[1] === stat.size) {
      fileNames = cached[2]
    } else {
      read += 1
      fileNames = extractIconNames(fs.readFileSync(abs, 'utf8'))
    }
    next[key] = [stat.mtimeMs, stat.size, fileNames]
    for (const name of fileNames) {
      names.add(name)
    }
  }

  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) {
        continue
      }
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(abs)
      } else {
        visit(abs, entry.name)
      }
    }
  }

  for (const root of roots) {
    walk(root)
  }

  const changed = read > 0 || Object.keys(previous).length !== files
  if (changed) {
    try {
      writeCache(cachePath, next)
    } catch {
      /* кэш — только ускорение; без него следующий обход прочитает всё */
    }
  }
  return { names, stats: { files, read, ms: Date.now() - started } }
}
