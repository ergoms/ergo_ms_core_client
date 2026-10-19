/**
 * Полная карта глифов Lucide. Грузится отдельным чанком при первом имени,
 * которого нет в lucideCoreIcons.generated.js, чтобы не попадать в modulepreload.
 */

const iconModules = import.meta.glob([
  '../../../../virtual_env/npm/node_modules/@lucide/vue/dist/esm/icons/*.mjs',
  '!../../../../virtual_env/npm/node_modules/@lucide/vue/dist/esm/icons/index.mjs',
])

const iconLoaderByFile = new Map()
for (const [key, loader] of Object.entries(iconModules)) {
  const normalized = key.replace(/\\/g, '/')
  const match = normalized.match(/\/icons\/([^/]+)\.m?js$/)
  if (match && match[1] !== 'index') {
    iconLoaderByFile.set(match[1], loader)
  }
}

export function loadIconModule(file) {
  const loader = iconLoaderByFile.get(file)
  if (!loader) {
    return null
  }
  return loader()
}
