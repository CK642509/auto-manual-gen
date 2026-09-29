/**
 * manifest 的載入與最小驗證。被 run.ts / probe.ts / validate.ts 共用，
 * 三個入口都要認得同一份章節資料結構與同一套動詞集。
 */
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { loadConfig, repoRoot } from './config.js'

/** 刻意保持最小的動詞集：表達不了的操作走 action: custom 逃生門（尚未實作）。 */
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
export type Chapter = { id: string; title: Localized; order: number; steps: Step[]; file: string }

export type Manual = {
  profile: string
  /** 封面上的手冊名稱（Day 20） */
  title: Localized
  version: string
  /** 這本手冊要出哪些語言，第一個是主語言：正文放 `docs/`，其他語言放 `docs/{locale}/`（Day 22） */
  locales: string[]
  bootstrap: {
    viewport: { width: number; height: number; deviceScaleFactor?: number }
    storage: Record<string, string>
    clock?: string
    disableAnimations?: boolean
  }
}

export const tid = (v: string) => `[data-testid="${v}"]`
export const rel = (p: string) => path.relative(repoRoot, p).split(path.sep).join('/')

export function manifestDir(): string {
  return path.join(repoRoot, loadConfig().paths.manifest)
}

export function loadManual(): Manual {
  return parse(fs.readFileSync(path.join(manifestDir(), 'manual.yaml'), 'utf-8'))
}

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
    throw new Error(`manual.yaml 沒有列出語言「${requested}」，可用的有：${manual.locales.join(' / ')}`)
  }
  return [requested]
}

/** 載入：一章一個檔案，順序由 order 決定。 */
export function loadChapters(): Chapter[] {
  const dir = manifestDir()
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+-.+\.ya?ml$/.test(f))
    .map((f) => ({ ...parse(fs.readFileSync(path.join(dir, f), 'utf-8')), file: f }) as Chapter)
    .sort((a, b) => a.order - b.order)
}

/**
 * 動詞集與必填欄位 —— 不用開瀏覽器就能擋下來的那一層。
 * 完整的 schema / 命名一致性驗證在 `validate.ts`。
 *
 * 錯誤訊息是給 agent 看的：不能只說「不合法」，要說可用的有哪些。
 */
export function validateActions(chapter: Chapter): string[] {
  const errors: string[] = []

  for (const [i, step] of chapter.steps.entries()) {
    const at = `${chapter.id}.steps[${i}]`

    if (!ACTIONS.includes(step.action)) {
      errors.push(`${at}: 不存在的 action「${step.action}」，可用的有：${ACTIONS.join(' / ')}`)
      continue
    }
    if (step.action === 'fill' && step.text === undefined) errors.push(`${at}: action: fill 缺少必填欄位 text`)
    if (step.action === 'screenshot' && !step.name) errors.push(`${at}: action: screenshot 缺少必填欄位 name`)
    if (step.action !== 'wait' && step.action !== 'screenshot' && !step.testid) {
      errors.push(`${at}: action: ${step.action} 缺少必填欄位 testid`)
    }
  }

  return errors
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
