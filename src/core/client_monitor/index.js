import { loadCollector } from './loadCollector.js'

export { isMonitoringEnabled, resetMonitorSession } from './session.js'
export { loadCollector }

export function initClientMonitor(options) {
  return loadCollector().then(({ initClientMonitor: init }) => init(options))
}
