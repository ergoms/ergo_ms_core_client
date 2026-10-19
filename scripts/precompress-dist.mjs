/**
 * Рядом с файлами dist пишет .gz и .br. nginx отдаёт их через gzip_static,
 * если модуль собран. Иначе файлы просто лежат рядом.
 */
import { readdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { brotliCompressSync, constants, gzipSync } from 'zlib'

const root = process.argv[2]
const extensions = new Set(['.js', '.css', '.html', '.svg', '.json', '.mjs', '.wasm'])
const minBytes = 1024

if (!root) {
  console.error('usage: node precompress-dist.mjs <dist>')
  process.exit(1)
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full)
      continue
    }
    if (entry.name.endsWith('.gz') || entry.name.endsWith('.br')) {
      continue
    }
    if (!extensions.has(path.extname(entry.name))) {
      continue
    }
    const data = await readFile(full)
    if (data.length < minBytes) {
      continue
    }
    await writeFile(full + '.gz', gzipSync(data, { level: 9 }))
    await writeFile(
      full + '.br',
      brotliCompressSync(data, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 6 },
      }),
    )
  }
}

await walk(root)
