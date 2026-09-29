/**
 * 開機邏輯：讀 manual.yaml 的 bootstrap、挑 driver、注入狀態（含語言）、凍結時間。
 * `run.ts`（一章一次開機）與 `probe.ts`（單次探勘）共用同一套開機流程，
 * 這樣 probe 看到的畫面狀態才會跟 run 實際執行時一致。
 */
import type { Page } from 'playwright'
import { loadConfig, type AppConfig } from './config.js'
import { createDriver, type AppDriver } from './drivers/index.js'
import { loadManual, tid } from './manifest.js'

/** 給 driver 的設定：manifest 的 bootstrap 蓋過 config 的預設值。 */
export function driverConfig(config: AppConfig, viewport: Partial<AppConfig['viewport']> | undefined, first: boolean): AppConfig {
  return {
    ...config,
    viewport: { ...config.viewport, ...viewport },
    app: {
      ...config.app,
      electron: {
        ...config.app.electron,
        buildBeforeLaunch: first && config.app.electron.buildBeforeLaunch,
      },
    },
  }
}

/**
 * 開一次機、跑完 bootstrap，回傳可操作的 driver 與 page。
 *
 * `locale` 蓋過 bootstrap.storage 裡的同名值 —— 換語言就只是換這一個 localStorage 值（Day 22），
 * 沒給就用主語言（manual.yaml 的 locales 第一個）。
 */
export async function boot(
  mode: 'electron' | 'web' | undefined,
  first = true,
  locale?: string,
): Promise<{ driver: AppDriver; page: Page }> {
  const config = loadConfig()
  const manual = loadManual()
  const { viewport, storage, clock, disableAnimations } = manual.bootstrap

  const driver = createDriver(driverConfig(config, viewport, first), mode ?? config.app.mode)

  // launch 之前注入 —— App 讀 localStorage 時值已經在了，不會先閃一次預設狀態。
  await driver.setStorage({ ...storage, locale: locale ?? manual.locales[0] })
  const page = await driver.launch()
  await driver.resize(viewport.width, viewport.height)

  if (clock) {
    // driver 拿到手時已經 navigate 過了，裝好時鐘後要 reload 一次才會生效。
    await page.clock.setFixedTime(new Date(clock))
    await page.reload({ waitUntil: 'domcontentloaded' })
  }

  await page.locator(tid('app-root')).waitFor({ state: 'visible' })
  if (disableAnimations) await page.evaluate(() => document.documentElement.classList.add('no-motion'))

  return { driver, page }
}
