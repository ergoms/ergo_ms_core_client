import { createRequire } from 'node:module'

// One package instance even when Docker exposes the same volume at two paths.
const requireFromNpm = createRequire(new URL('../../../virtual_env/npm/package.json', import.meta.url))
const { defineConfig, expect, test } = requireFromNpm('@playwright/test')

export { defineConfig, expect, test }
