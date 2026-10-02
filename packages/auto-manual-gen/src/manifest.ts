/**
 * manifest 的載入與驗證。每個指令都要認得同一份章節資料結構與同一套動詞集。
 */
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { contentError, usageError } from './errors.js'
import { project, type Manual } from './project.js'
import { checkChapter } from './schema.js'

export type { Manual } from './project.js'

/** 刻意保持最小的動詞集。完整的定義（必填欄位）在 schema/v1/manifest.json。 */
export const ACTIONS = ['click', 'dblclick', 'fill', 'waitFor', 'wait', 'scroll', 'hover', 'dismiss', 'screenshot'] as const
export type Action = (typeof ACTIONS)[number]

/**
 * 會跟著語言變的欄位（Day 22）：只寫字串代表每個語言都一樣（例如搜尋關鍵字 lobby），
 * 寫成 `{ zh-Hant: ..., en: ... }` 就是逐語言指定。一律用 `pick()` 取值，不要自己讀。
 */
export type Localized = string | Record<string, string>

export type Rect = { x: number; y: number; width: number; height: number }
export type Annotation = { key: string; testid: string; legend: Localized; badge?: 'corner' | 'left' }
export type Step = {
  action: Action
  testid?: string
  text?: Localized
  state?: 'visible' | 'detached'
  name?: string
  clip?: { testid: string; padding?: number }
  annotate?: Annotation[]
}
export type Chapter = {
  id: string
  title: Localized
  order: number
  steps: Step[]
  file: string
  /** 這一章也要出教學影片（Day 24）。錄影很貴，預設不錄，要錄的章節明確標出來。 */
  video?: boolean
  /** 這一章也做成 App 內導覽（Day 26）。依賴示範資料或目前狀態的章節不適合，要做的章節明確標出來。 */
  tour?: boolean
}

export const tid = (v: string) => `[data-testid="${v}"]`

export const loadManual = (): Manual => project().manual

/** 取某個語言的值。缺翻譯時直接失敗 —— 默默退回主語言，會讓英文手冊裡混進一個中文標籤。 */
export function pick(value: Localized, locale: string): string {
  if (typeof value === 'string') return value
  const found = value[locale]
  if (found === undefined) throw new Error(`缺少 ${locale} 的翻譯（目前有：${Object.keys(value).join(' / ')}）`)
  return found
}

/**
 * `--locale` 參數：沒給就是 manual.yaml 列的全部語言，給了就只跑那一個。
 * 錯誤訊息照例列出可用的值。
 */
export function selectLocales(manual: Manual, requested: string | undefined): string[] {
  if (!requested) return manual.locales
  if (!manual.locales.includes(requested)) {
    throw usageError('LOCALE_NOT_FOUND', `manual.yaml 沒有列出語言「${requested}」，可用的有：${manual.locales.join(' / ')}`, {
      locale: requested,
      available: manual.locales,
    })
  }
  return [requested]
}

/** 載入：一章一個檔案，順序由 order 決定。 */
export function loadChapters(): Chapter[] {
  const dir = project().paths.manifest
  if (!fs.existsSync(dir)) {
    throw usageError('CONFIG_INVALID', `找不到 manifest 目錄 ${dir}（manual.yaml 的 paths.manifest）`)
  }
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+-.+\.ya?ml$/.test(f))
    .map((f) => {
      try {
        return { ...parse(fs.readFileSync(path.join(dir, f), 'utf-8')), file: f } as Chapter
      } catch (cause) {
        throw contentError('MANIFEST_INVALID', `${f} 不是合法的 YAML：${(cause as Error).message}`, { file: f }, { cause })
      }
    })
    .sort((a, b) => a.order - b.order)
}

/** `--chapter` 參數：沒給就是全部；給了但不存在，照例列出可用的值。 */
export function selectChapters(all: Chapter[], id: string | undefined): Chapter[] {
  if (!id) return all
  const found = all.filter((c) => c.id === id)
  if (found.length === 0) {
    throw usageError('CHAPTER_NOT_FOUND', `找不到章節「${id}」，可用的有：${all.map((c) => c.id).join(' / ')}`, {
      chapter: id,
      available: all.map((c) => c.id),
    })
  }
  return found
}

/**
 * 結構檢查：動詞集、必填欄位、不認得的欄位 —— 不用開瀏覽器就能擋下來的那一層。
 * 規則全部來自 schema/v1/manifest.json，跟編輯器裡看到的是同一份。
 *
 * 錯誤訊息是給 agent 看的：不能只說「不合法」，要說可用的有哪些。
 */
export function validateActions(chapter: Chapter): string[] {
  const { file, ...data } = chapter
  return checkChapter(data, chapter.id ?? file)
}

/** 每個逐語言指定的欄位，都要涵蓋 manual.yaml 列的所有語言 —— 不用開瀏覽器就能擋下來。 */
export function validateLocales(chapter: Chapter, locales: string[]): string[] {
  const errors: string[] = []
  const check = (value: Localized | undefined, at: string) => {
    if (value === undefined || typeof value === 'string') return
    const missing = locales.filter((l) => value[l] === undefined)
    if (missing.length > 0) errors.push(`${at}: 缺少 ${missing.join(' / ')} 的翻譯`)
  }

  check(chapter.title, `${chapter.id}.title`)
  for (const [i, step] of chapter.steps.entries()) {
    check(step.text, `${chapter.id}.steps[${i}].text`)
    for (const [j, a] of (step.annotate ?? []).entries()) check(a.legend, `${chapter.id}.steps[${i}].annotate[${j}].legend`)
  }
  return errors
}
