/**
 * Генерация CSS для кастомных тем (--color-*, --bs-*, module_tokens).
 * Используется глобальным theme-manager и module-theme-manager.
 */

import { valuesToCss } from './bootstrap-variables.js'

export const COLOR_VAR_MAP = {
  headerBackground: '--color-header-background',
  authBackground: '--color-auth-background',
  background: '--color-background',
  border: '--color-border',
  primaryText: '--color-primary-text',
  secondaryText: '--color-secondary-text',
  primaryBackground: '--color-primary-background',
  secondaryBackground: '--color-secondary-background',
  hoverBackground: '--color-hover-background',
  accent: '--color-accent',
  accentText: '--color-accent-text',
}

export const BOOTSTRAP_BRIDGE_FROM_COLORS = {
  background: ['--bs-body-bg'],
  primaryText: ['--bs-body-color', '--bs-emphasis-color', '--bs-heading-color', '--bs-card-color'],
  secondaryText: ['--bs-secondary-color', '--bs-tertiary-color'],
  border: ['--bs-border-color'],
  primaryBackground: ['--bs-card-bg'],
  secondaryBackground: ['--bs-secondary-bg', '--bs-tertiary-bg'],
  accent: ['--bs-primary', '--bs-link-color', '--bs-link-hover-color'],
}

export function hasCustomColors(colors) {
  return colors && Object.keys(colors).some((key) => colors[key])
}

export function parseAccentRgb(accent) {
  if (!accent || typeof accent !== 'string') {
    return null
  }

  const hex = accent.trim()
  if (hex.startsWith('#') && hex.length >= 7) {
    const raw = hex.replace('#', '')
    return {
      r: parseInt(raw.substring(0, 2), 16),
      g: parseInt(raw.substring(2, 4), 16),
      b: parseInt(raw.substring(4, 6), 16),
    }
  }

  const rgbMatch = hex.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    }
  }

  return null
}

/**
 * @param {string} moduleKey — для module_tokens: префикс CSS --{moduleKey-kebab}-*
 */
function moduleTokenVarName(moduleKey, tokenKey) {
  const slug = String(tokenKey)
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
  const prefix = String(moduleKey || '').replace(/_/g, '-')
  return `--${prefix}-${slug}`
}

function buildModuleTokensCss(moduleKey, moduleTokens) {
  if (!moduleKey || !moduleTokens || typeof moduleTokens !== 'object') {
    return ''
  }
  let css = ''
  for (const [key, value] of Object.entries(moduleTokens)) {
    if (value != null && value !== '') {
      css += `  ${moduleTokenVarName(moduleKey, key)}: ${value} !important;\n`
    }
  }
  return css
}

/**
 * @param {object} options
 * @param {string} options.baseTheme — light | dark
 * @param {object} options.colors
 * @param {object} [options.bootstrapColors]
 * @param {string} [options.scopeSelector] — например [data-ergo-module-theme="my_module"]
 * @param {string} [options.moduleKey] — для module_tokens
 * @param {object} [options.moduleTokens]
 * @param {boolean} [options.includeAccentComponentRules=true]
 */
export function buildThemeCss({
  baseTheme,
  colors = {},
  bootstrapColors = {},
  scopeSelector = null,
  moduleKey = null,
  moduleTokens = {},
  includeAccentComponentRules = true,
}) {
  const hasColors = hasCustomColors(colors)
  const hasBootstrap = bootstrapColors && Object.keys(bootstrapColors).some((key) => bootstrapColors[key])
  const hasModuleTokens = moduleKey && moduleTokens && Object.keys(moduleTokens).some((k) => moduleTokens[k])

  if (!hasColors && !hasBootstrap && !hasModuleTokens) {
    return ''
  }

  const themeSelectors = scopeSelector
    ? `${scopeSelector}[data-bs-theme='${baseTheme}']`
    : `html[data-bs-theme='${baseTheme}'],\n    [data-bs-theme='${baseTheme}']`

  let cssRules = `${themeSelectors} {\n`

  for (const [key, varName] of Object.entries(COLOR_VAR_MAP)) {
    if (colors[key]) {
      cssRules += `  ${varName}: ${colors[key]} !important;\n`
      const bridgeVars = BOOTSTRAP_BRIDGE_FROM_COLORS[key]
      if (bridgeVars) {
        for (const bsVar of bridgeVars) {
          cssRules += `  ${bsVar}: ${colors[key]} !important;\n`
        }
      }
    }
  }

  if (hasBootstrap) {
    cssRules += valuesToCss(bootstrapColors)
  }

  cssRules += buildModuleTokensCss(moduleKey, moduleTokens)

  if (!colors.accentText) {
    const accentText = baseTheme === 'dark'
      ? (colors.primaryText || '#c9cccf')
      : '#ffffff'
    cssRules += `  --color-accent-text: ${accentText} !important;\n`
  }

  if (colors.accent) {
    const rgb = parseAccentRgb(colors.accent)
    if (rgb) {
      const { r, g, b } = rgb
      // subtle-токены Bootstrap иначе остаются от дефолтного accent сборки (красное «свечение» меню)
      const bgAlpha = baseTheme === 'dark' ? 0.18 : 0.12
      const borderAlpha = baseTheme === 'dark' ? 0.35 : 0.25
      cssRules += `  --bs-primary: ${colors.accent} !important;\n`
      cssRules += `  --bs-primary-rgb: ${r}, ${g}, ${b} !important;\n`
      cssRules += `  --bs-primary-bg-subtle: rgba(${r}, ${g}, ${b}, ${bgAlpha}) !important;\n`
      cssRules += `  --bs-primary-border-subtle: rgba(${r}, ${g}, ${b}, ${borderAlpha}) !important;\n`
      cssRules += `  --bs-primary-text-emphasis: ${colors.accent} !important;\n`
      cssRules += `  --bs-link-color: ${colors.accent} !important;\n`
      cssRules += `  --bs-link-color-rgb: ${r}, ${g}, ${b} !important;\n`
      cssRules += `  --bs-link-hover-color: ${colors.accent} !important;\n`
    }
  }

  cssRules += '}\n'

  if (includeAccentComponentRules && colors.accent) {
    const accentScope = scopeSelector || ''
    const prefix = accentScope ? `${accentScope} ` : ''
    const rgb = parseAccentRgb(colors.accent)
    const focusShadowRgb = rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : 'var(--bs-primary-rgb)'

    cssRules += `
${prefix}.btn-primary {
  --bs-btn-bg: ${colors.accent} !important;
  --bs-btn-border-color: ${colors.accent} !important;
  --bs-btn-hover-bg: ${colors.accent} !important;
  --bs-btn-hover-border-color: ${colors.accent} !important;
  --bs-btn-active-bg: ${colors.accent} !important;
  --bs-btn-active-border-color: ${colors.accent} !important;
  --bs-btn-disabled-bg: ${colors.accent} !important;
  --bs-btn-disabled-border-color: ${colors.accent} !important;
  --bs-btn-focus-shadow-rgb: ${focusShadowRgb} !important;
}
${prefix}.btn-outline-primary {
  --bs-btn-color: ${colors.accent} !important;
  --bs-btn-border-color: ${colors.accent} !important;
  --bs-btn-hover-bg: ${colors.accent} !important;
  --bs-btn-hover-border-color: ${colors.accent} !important;
  --bs-btn-active-bg: ${colors.accent} !important;
  --bs-btn-active-border-color: ${colors.accent} !important;
  --bs-btn-focus-shadow-rgb: ${focusShadowRgb} !important;
}
${prefix}.text-primary {
  color: ${colors.accent} !important;
}
${prefix}a {
  color: ${colors.accent};
}
${prefix}a:hover {
  color: ${colors.accent};
  filter: brightness(0.85);
}
`
    if (colors.accentText) {
      cssRules += `
${prefix}.btn-primary,
${prefix}.btn-primary:hover,
${prefix}.btn-primary:focus,
${prefix}.btn-primary:focus-visible,
${prefix}.btn-primary:active,
${prefix}.btn-primary.active,
${prefix}.btn-primary:disabled,
${prefix}.btn-outline-primary:hover,
${prefix}.btn-outline-primary:active,
${prefix}.btn-outline-primary.active {
  --bs-btn-color: ${colors.accentText} !important;
  --bs-btn-hover-color: ${colors.accentText} !important;
  --bs-btn-active-color: ${colors.accentText} !important;
  --bs-btn-disabled-color: ${colors.accentText} !important;
  color: ${colors.accentText} !important;
}
`
    }
  }

  return cssRules
}

export function moduleScopeSelector(moduleKey) {
  return `[data-ergo-module-theme="${moduleKey}"]`
}
