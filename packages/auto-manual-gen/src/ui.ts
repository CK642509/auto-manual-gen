/**
 * 給人看的進度輸出。`--json` 時全部安靜下來，stdout 只留最後那一份 JSON ——
 * agent 與 CI 不必從一堆進度訊息裡挖結果。
 */
let quiet = false

export function setJsonMode(on: boolean) {
  quiet = on
}

export const ui = {
  info: (...args: unknown[]) => {
    if (!quiet) console.log(...args)
  },
  warn: (...args: unknown[]) => {
    if (!quiet) console.warn(...args)
  },
  error: (...args: unknown[]) => {
    if (!quiet) console.error(...args)
  },
}

export const list = (items: string[]) => items.map((e) => `  - ${e}`).join('\n')
