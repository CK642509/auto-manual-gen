import type { Page } from 'playwright'

/**
 * 啟動待測物的統一介面。
 *
 * Electron 與 Web 在底層完全不同，但 manifest 與 runner 只認得這四個方法 ——
 * 一份設定檔寫完，換一個 profile 就能同時對兩種形態產出手冊。
 */
export interface AppDriver {
  /** 把應用程式啟動起來，回傳可操作的 `Page`（Electron 回傳的是渲染行程的那一個）。 */
  launch(): Promise<Page>

  /**
   * 注入 localStorage 狀態（語言 / 權限 / 版面）。
   *
   * **launch 之前呼叫**：排隊，啟動時用 `addInitScript` 在第一次 navigation 之前注入 —— 這是首選路徑。
   * **launch 之後呼叫**：註冊 init script 後 reload，讓當前畫面反映新狀態。
   */
  setStorage(kv: Record<string, string>): Promise<void>

  /** 統一視窗尺寸，確保截圖尺寸一致。 */
  resize(width: number, height: number): Promise<void>

  /** 收尾。可重複呼叫。 */
  close(): Promise<void>
}

/**
 * 產生一段在頁面腳本執行之前寫入 localStorage 的 init script。
 *
 * 用字串而不是 function 傳入，是因為 `addInitScript` 的 function 形式需要序列化參數，
 * 而這裡的內容單純到直接組字串更好讀、也更容易在失敗時 dump 出來看。
 */
export function storageInitScript(kv: Record<string, string>): string {
  const entries = JSON.stringify(Object.entries(kv))
  return `for (const [k, v] of ${entries}) { try { localStorage.setItem(k, v) } catch {} }`
}
