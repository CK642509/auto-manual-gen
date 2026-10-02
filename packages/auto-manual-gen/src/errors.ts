/**
 * 失敗分三種，exit code 讓呼叫的人（CI、agent）不必讀訊息就知道「是誰的問題」：
 *
 * | kind      | exit | 意思                 | 誰該處理               |
 * |-----------|------|----------------------|------------------------|
 * | `content` | 1    | 手冊內容有問題       | 改 manifest / 正文     |
 * | `usage`   | 2    | 使用方式或設定錯誤   | 改指令參數 / manual.yaml |
 * | `env`     | 3    | 環境缺東西           | 裝工具，不要動任何檔案 |
 *
 * 程式本身的 bug（不是 ManualError 的例外）也歸 1 —— 但 `code` 會是 `UNEXPECTED`，跟內容問題分得開。
 */
export type ErrorKind = 'content' | 'usage' | 'env'

export const EXIT_CODE: Record<ErrorKind, number> = { content: 1, usage: 2, env: 3 }

export class ManualError extends Error {
  constructor(
    readonly kind: ErrorKind,
    /** 機器讀的代碼，例如 SELECTOR_NOT_FOUND。`--json` 輸出裡的 error.code。 */
    readonly code: string,
    message: string,
    /** 結構化的線索：候選 testid、失敗現場的路徑……`--json` 會原樣攤在 error 底下。 */
    readonly details: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

export const contentError = (code: string, message: string, details?: Record<string, unknown>, options?: ErrorOptions) =>
  new ManualError('content', code, message, details, options)
export const usageError = (code: string, message: string, details?: Record<string, unknown>, options?: ErrorOptions) =>
  new ManualError('usage', code, message, details, options)
export const envError = (code: string, message: string, details?: Record<string, unknown>, options?: ErrorOptions) =>
  new ManualError('env', code, message, details, options)
