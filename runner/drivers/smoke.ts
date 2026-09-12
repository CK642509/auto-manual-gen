/**
 * driver 的煙霧測試：啟動 → 注入狀態 → 統一尺寸 → 截圖 → 收尾。
 *
 *   npm run driver:smoke              # 走 config 的 app.mode
 *   npm run driver:smoke -- --mode web
 *
 * 這不是產線的一部分，只是確認兩條啟動路徑真的活著。
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, repoRoot } from '../config.js'
import { createDriver } from './index.js'

const config = loadConfig()

const modeArg = process.argv.indexOf('--mode')
const mode = modeArg === -1 ? config.app.mode : (process.argv[modeArg + 1] as 'electron' | 'web')

const driver = createDriver(config, mode)

// launch 之前注入 —— 這是首選路徑，App 讀 localStorage 時值已經在了。
await driver.setStorage({ locale: 'en', role: 'admin' })

const page = await driver.launch()
await driver.resize(config.viewport.width, config.viewport.height)

// 骨架屏消失、清單出現才按快門，不要插入固定延遲。
await page.waitForSelector('[data-testid="camera-list"]', { state: 'visible' })

const outDir = path.join(repoRoot, 'output')
fs.mkdirSync(outDir, { recursive: true })
const shot = path.join(outDir, `smoke-${mode}.png`)
await page.screenshot({ path: shot })

await driver.close()

console.log(`[${mode}] ok → ${path.relative(repoRoot, shot)}`)
