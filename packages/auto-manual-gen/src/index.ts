/**
 * 給程式用的進入點。大部分人只需要 CLI；這裡主要是給自訂 driver（`app.mode: custom`）用的型別與小工具：
 *
 * ```ts
 * import type { AppDriver, DriverContext } from 'auto-manual-gen'
 * import { storageInitScript } from 'auto-manual-gen'
 *
 * export default function createDriver(ctx: DriverContext): AppDriver { ... }
 * ```
 */
export type { AppDriver, DriverContext } from './drivers/types.js'
export { storageInitScript } from './drivers/types.js'
export { createDriver, ElectronDriver, WebDriver } from './drivers/index.js'
export { loadProject, type AppSettings, type AppMode, type Manual, type Project, type Viewport } from './project.js'
export type { Chapter, Step, Annotation, Localized } from './manifest.js'
export { ManualError, type ErrorKind } from './errors.js'
