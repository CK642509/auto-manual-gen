/**
 * 開機邏輯：讀 manual.yaml 的 bootstrap、挑 driver、注入狀態（含語言）、凍結時間。
 * run（一章一次開機）、probe（單次探勘）、video 共用同一套開機流程，
 * 這樣 probe 看到的畫面狀態才會跟 run 實際執行時一致。
 */
import type { Page } from 'playwright'
import { createDriver, type AppDriver } from './drivers/index.js'
import { envError } from './errors.js'
import { tid } from './manifest.js'
import { project, type AppMode } from './project.js'

/** 停用所有動畫與轉場。注入 CSS 而不是要求 App 配合，別人的 App 不需要為了手冊改任何一行。 */
const NO_MOTION_CSS = '*, *::before, *::after { animation: none !important; transition: none !important; }'

/**
 * 開一次機、跑完 bootstrap，回傳可操作的 driver 與 page。
 *
 * `locale` 寫進 `bootstrap.localeKey` 指定的 localStorage key —— 換語言就只是換這一個值（Day 22），
 * 沒給就用主語言（manual.yaml 的 locales 第一個）。
 */
export async function boot(mode: AppMode | undefined, first = true, locale?: string): Promise<{ driver: AppDriver; page: Page }> {
  const { root, manual } = project()
  const { viewport, storage = {}, localeKey, ready, clock, disableAnimations } = manual.bootstrap

  const driver = await createDriver({ root, app: manual.app, viewport, build: first }, mode ?? manual.app.mode)

  // launch 之前注入 —— App 讀 localStorage 時值已經在了，不會先閃一次預設狀態。
  await driver.setStorage(localeKey ? { ...storage, [localeKey]: locale ?? manual.locales[0] } : storage)
  const page = await driver.launch()
  await driver.resize(viewport.width, viewport.height)

  if (clock) {
    // driver 拿到手時已經 navigate 過了，裝好時鐘後要 reload 一次才會生效。
    await page.clock.setFixedTime(new Date(clock))
    await page.reload({ waitUntil: 'domcontentloaded' })
  }

  try {
    if (ready) await page.locator(tid(ready)).waitFor({ state: 'visible' })
    else await page.waitForLoadState('load')
  } catch (cause) {
    await driver.close()
    throw envError(
      'APP_NOT_READY',
      `App 啟動了，但${ready ? `等不到 bootstrap.ready 指定的 testid「${ready}」` : '頁面一直沒有載入完成'}。` +
        `App 有正常顯示嗎？（Electron 的話，打包產物在嗎？）`,
      { ready },
      { cause },
    )
  }
  if (disableAnimations) await page.addStyleTag({ content: NO_MOTION_CSS })

  return { driver, page }
}
