import zhHant from './zh-Hant.json'
import en from './en.json'

export type Locale = 'zh-Hant' | 'en'

export const messages: Record<Locale, Record<string, string>> = {
  'zh-Hant': zhHant,
  en,
}

export const SUPPORTED: Locale[] = ['zh-Hant', 'en']

/**
 * 語言來源刻意設計成 localStorage，而不是瀏覽器語言。
 * 這讓產線可以在啟動前用 addInitScript 注入 locale，重跑同一份 manifest
 * 就能產出不同語言的手冊（見系列 Day 07 狀態注入、Day 24 多語言）。
 */
export function resolveLocale(): Locale {
  const stored = localStorage.getItem('locale')
  return SUPPORTED.includes(stored as Locale) ? (stored as Locale) : 'zh-Hant'
}

/**
 * 極簡的翻譯查表，支援 {name} 佔位符。
 *
 * 這些 JSON 檔同時是手冊的**術語表來源** —— 手冊裡的按鈕名稱直接取自這裡，
 * 才能保證永遠等於畫面上真正顯示的字（見系列 Day 25）。
 */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const raw = messages[locale][key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
}
