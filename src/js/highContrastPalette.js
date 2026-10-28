/**
 * Палитра «Высокий контраст» — синхрон с theme_seed_catalog.py (имя темы).
 * Используется как временный override при prefers-contrast / forced-colors.
 */

export const HIGH_CONTRAST_PALETTE = Object.freeze({
  light: {
    headerBackground: 'rgba(255, 255, 255, 0.9)',
    authBackground: 'rgba(255, 255, 255, 0.78)',
    background: '#FFFFFF',
    border: '#000000',
    primaryText: '#000000',
    secondaryText: '#1F1F1F',
    primaryBackground: '#FFFFFF',
    secondaryBackground: '#F0F0F0',
    hoverBackground: '#E6E6E6',
    accent: '#4B0A9E',
    accentText: '#FFFFFF',
  },
  dark: {
    headerBackground: 'rgba(0, 0, 0, 0.92)',
    authBackground: 'rgba(0, 0, 0, 0.88)',
    background: '#000000',
    border: '#FFFFFF',
    primaryText: '#FFFFFF',
    secondaryText: '#E8E8E8',
    primaryBackground: '#000000',
    secondaryBackground: '#1A1A1A',
    hoverBackground: '#2A2A2A',
    accent: '#FFEB3B',
    accentText: '#000000',
  },
})

export function getHighContrastColors(baseTheme = 'light') {
  return HIGH_CONTRAST_PALETTE[baseTheme === 'dark' ? 'dark' : 'light']
}
