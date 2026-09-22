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

export type Rect = { x: number; y: number; width: number; height: number }
export type Annotation = { key: string; testid: string; legend: string }
export type Step = {
  action: Action
  testid?: string
  text?: string
  state?: 'visible' | 'detached'
  name?: string
  clip?: { testid: string; padding?: number }
  annotate?: Annotation[]
}
export type Chapter = { id: string; title: string; order: number; steps: Step[]; file: string }

export const tid = (v: string) => `[data-testid="${v}"]`
export const rel = (p: string) => path.relative(repoRoot, p).split(path.sep).join('/')

export function manifestDir(): string {
  return path.join(repoRoot, loadConfig().paths.manifest)
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
