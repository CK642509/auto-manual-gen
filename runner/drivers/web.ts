import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import type { AppConfig } from '../config.js'
import { storageInitScript, type AppDriver } from './types.js'

/**
 * Web 形態：標準的 Playwright 啟動流程。
 *
 * 不負責把 dev server 叫起來 —— 設定檔只給了一個 URL，起服務是外面的事。
 * 連不上就在這裡丟出看得懂的錯誤，而不是讓後面的步驟對著白畫面 timeout。
 */
export class WebDriver implements AppDriver {
  #browser?: Browser
  #context?: BrowserContext
  #page?: Page
  #pendingStorage: Record<string, string> = {}

  constructor(private readonly config: AppConfig) {}

  async launch(): Promise<Page> {
    const { width, height, deviceScaleFactor = 2 } = this.config.viewport
    const { url } = this.config.app.web

    this.#browser = await chromium.launch()
    this.#context = await this.#browser.newContext({
      viewport: { width, height },
      // 決定截圖的解析度倍率 —— 印刷需求怎麼推算出這個數字見 Day 10。
      deviceScaleFactor,
    })

    // 關鍵順序：init script 必須在第一次 navigation 之前註冊，
    // 這樣 App 的程式碼讀 localStorage 時值已經在了，不會先閃一次預設狀態。
    if (Object.keys(this.#pendingStorage).length > 0) {
      await this.#context.addInitScript(storageInitScript(this.#pendingStorage))
    }

    this.#page = await this.#context.newPage()

    try {
      await this.#page.goto(url, { waitUntil: 'domcontentloaded' })
    } catch (cause) {
      throw new Error(
        `連不上 ${url}。請先執行 npm run demo（vite dev server，strictPort 5173）。`,
        { cause },
      )
    }

    return this.#page
  }

  async setStorage(kv: Record<string, string>): Promise<void> {
    Object.assign(this.#pendingStorage, kv)

    // 還沒 launch：排隊就好，launch 時會一併注入。
    if (!this.#context || !this.#page) return

    await this.#context.addInitScript(storageInitScript(kv))
    await this.#page.reload({ waitUntil: 'domcontentloaded' })
  }

  async resize(width: number, height: number): Promise<void> {
    if (!this.#page) throw new Error('resize 必須在 launch 之後呼叫。')
    await this.#page.setViewportSize({ width, height })
  }

  async close(): Promise<void> {
    await this.#context?.close()
    await this.#browser?.close()
    this.#context = undefined
    this.#browser = undefined
    this.#page = undefined
  }
}
