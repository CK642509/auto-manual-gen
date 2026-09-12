import type { AppConfig } from '../config.js'
import { ElectronDriver } from './electron.js'
import type { AppDriver } from './types.js'
import { WebDriver } from './web.js'

export type { AppDriver } from './types.js'
export { ElectronDriver } from './electron.js'
export { WebDriver } from './web.js'

/**
 * 依設定挑 driver。上層（manifest、runner）只認得 `AppDriver`，
 * 底下實際是哪一個實作完全不需要關心。
 */
export function createDriver(config: AppConfig, mode = config.app.mode): AppDriver {
  switch (mode) {
    case 'electron':
      return new ElectronDriver(config)
    case 'web':
      return new WebDriver(config)
    default:
      throw new Error(`未知的 app.mode：${mode}。可用的有 electron / web。`)
  }
}
