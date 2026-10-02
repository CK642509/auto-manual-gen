/**
 * driver 的煙霧測試：啟動 → 注入狀態 → 統一尺寸 → 截圖 → 收尾。
 *
 *   npm run driver:smoke              # 走 manual.yaml 的 app.mode
 *   npm run driver:smoke -- --mode web
 *
 * 這不是產線的一部分，只是確認兩條啟動路徑真的活著。用的是 auto-manual-gen 公開的 API，
 * 也順便示範自己寫 driver 時拿得到哪些東西。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createDriver, loadProject, type AppMode } from 'auto-manual-gen'

const { root, manual } = loadProject()

const modeArg = process.argv.indexOf('--mode')
const mode = modeArg === -1 ? manual.app.mode : (process.argv[modeArg + 1] as AppMode)

const { viewport } = manual.bootstrap
const driver = await createDriver({ root, app: manual.app, viewport, build: true }, mode)

// launch 之前注入 —— 這是首選路徑，App 讀 localStorage 時值已經在了。
await driver.setStorage({ locale: 'en', role: 'admin' })

const page = await driver.launch()
await driver.resize(viewport.width, viewport.height)

// 骨架屏消失、清單出現才按快門，不要插入固定延遲。
await page.waitForSelector('[data-testid="camera-list"]', { state: 'visible' })

const outDir = path.join(root, 'output')
fs.mkdirSync(outDir, { recursive: true })
const shot = path.join(outDir, `smoke-${mode}.png`)
await page.screenshot({ path: shot })

await driver.close()

console.log(`[${mode}] ok → ${path.relative(root, shot)}`)
