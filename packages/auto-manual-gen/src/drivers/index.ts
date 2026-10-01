import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { usageError } from '../errors.js'
import type { AppMode } from '../project.js'
import { ElectronDriver } from './electron.js'
import type { AppDriver, DriverContext } from './types.js'
import { WebDriver } from './web.js'

export type { AppDriver, DriverContext } from './types.js'
export { ElectronDriver } from './electron.js'
export { WebDriver } from './web.js'

/**
 * 依設定挑 driver。上層（manifest、runner）只認得 `AppDriver`，
 * 底下實際是哪一個實作完全不需要關心。
 *
 * 內建 Electron 與 Web 兩種；其他情況（要先登入 SSO、要先把後端跑起來……）
 * 用 `app.mode: custom` 指向自己寫的模組，default export 一個 `(ctx) => AppDriver` 的函式。
 */
export async function createDriver(ctx: DriverContext, mode: AppMode = ctx.app.mode): Promise<AppDriver> {
  switch (mode) {
    case 'electron':
      if (!ctx.app.electron) throw usageError('CONFIG_INVALID', 'app.mode 是 electron，但 manual.yaml 沒有設定 app.electron.projectDir')
      return new ElectronDriver(ctx)
    case 'web':
      if (!ctx.app.web) throw usageError('CONFIG_INVALID', 'app.mode 是 web，但 manual.yaml 沒有設定 app.web.url')
      return new WebDriver(ctx)
    case 'custom': {
      if (!ctx.app.custom) throw usageError('CONFIG_INVALID', 'app.mode 是 custom，但 manual.yaml 沒有設定 app.custom.driver')
      const file = path.resolve(ctx.root, ctx.app.custom.driver)
      let mod: { default?: unknown }
      try {
        mod = await import(pathToFileURL(file).href)
      } catch (cause) {
        throw usageError('CONFIG_INVALID', `載入自訂 driver ${ctx.app.custom.driver} 失敗：${(cause as Error).message}`, { file }, { cause })
      }
      if (typeof mod.default !== 'function') {
        throw usageError('CONFIG_INVALID', `${ctx.app.custom.driver} 要 default export 一個回傳 AppDriver 的函式`, { file })
      }
      return (mod.default as (ctx: DriverContext) => AppDriver | Promise<AppDriver>)(ctx)
    }
    default:
      throw usageError('INVALID_ARGUMENT', `未知的 app.mode：${mode}。可用的有 electron / web / custom。`)
  }
}
