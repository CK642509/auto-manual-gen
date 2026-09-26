/**
 * 正文（`docs/{order}-{id}.md`）的驗證，被 `validate.ts` 呼叫。
 *
 * 跟 manifest 的驗證一樣，這裡只做「有明確判定標準」的檢查，分兩級：
 *
 * - 錯誤（擋下來）：引用了不存在的 legend / 截圖、截圖漏放或重複、保護區標記壞掉、
 *   保護區內容跟上一版不同。這些都是對或錯，沒有灰色地帶。
 * - 提醒（需要人工確認）：正文用「」引用的名稱，在 App 文案、manifest、章節標題與示範資料裡都找不到。
 *   找不到不一定是錯，但這正是「正文描述了不存在的功能」最常見的樣子，交給人看。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, repoRoot } from './config.js'
import { rel, type Chapter } from './manifest.js'

export type DocReport = { errors: string[]; warnings: string[] }

const PROTECTED_START = '<!-- protected:start -->'
const PROTECTED_END = '<!-- protected:end -->'

const LOCALE_FILE = 'apps/demo-stream-app/src/renderer/locales/zh-Hant.json'
const CAMERA_DATA_FILE = 'apps/demo-stream-app/src/renderer/data/cameras.ts'

export function docsDir(): string {
  return path.join(repoRoot, loadConfig().paths.docs)
}

export const docFileName = (chapter: Chapter) => `${chapter.order}-${chapter.id}.md`

const readText = (file: string) => fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')

/** 檔名要能對回某一章 manifest —— 命名約定就是索引，對不上的正文等於孤兒。 */
export function validateDocNames(chapters: Chapter[]): string[] {
  const dir = docsDir()
  if (!fs.existsSync(dir)) return []

  const expected = new Map(chapters.map((c) => [docFileName(c), c]))
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !expected.has(f))
    .map((f) => {
      const byId = chapters.find((c) => f.replace(/^\d+-/, '').replace(/\.md$/, '') === c.id)
      return byId
        ? `docs/${f}: 檔名應該是 ${docFileName(byId)}（order 跟 manifest 不一致）`
        : `docs/${f}: 找不到對應的 manifest 章節，可用的有：${chapters.map(docFileName).join(' / ')}`
    })
}

/**
 * 保護區：`<!-- protected:start -->` 與 `<!-- protected:end -->` 之間是人工維護的內容。
 * 標記必須成對、不能巢狀 —— 解析不出邊界時直接失敗，不要猜。
 */
export function extractProtectedBlocks(text: string, at: string): { blocks: string[]; errors: string[] } {
  const blocks: string[] = []
  const errors: string[] = []
  let openedAt: number | null = null

  for (const [i, line] of text.split('\n').entries()) {
    const trimmed = line.trim()
    if (trimmed === PROTECTED_START) {
      if (openedAt !== null) errors.push(`${at}:${i + 1}: 保護區不能巢狀，第 ${openedAt + 1} 行開始的保護區還沒結束`)
      else openedAt = i
    } else if (trimmed === PROTECTED_END) {
      if (openedAt === null) errors.push(`${at}:${i + 1}: 多出一個 protected:end，前面沒有對應的 protected:start`)
      else {
        blocks.push(text.split('\n').slice(openedAt + 1, i).join('\n'))
        openedAt = null
      }
    }
  }
  if (openedAt !== null) errors.push(`${at}:${openedAt + 1}: protected:start 沒有對應的 protected:end`)

  return { blocks, errors }
}

/** 取上一版（預設 HEAD）的正文；新檔案在 base 裡不存在就回傳 null。 */
function readAtRef(ref: string, file: string): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${rel(file)}`], { cwd: repoRoot, encoding: 'utf-8', stdio: 'pipe' })
      .replace(/\r\n/g, '\n')
  } catch {
    return null
  }
}

/**
 * 上一版有的保護區，這一版必須原封不動地還在（順序也一樣）。
 * 新增保護區是允許的 —— 那是人加的；改寫、刪除、搬動都不行。
 */
function validateProtectedUnchanged(before: string[], after: string[], at: string, ref: string): string[] {
  const errors: string[] = []
  let cursor = 0

  for (const [i, block] of before.entries()) {
    const found = after.indexOf(block, cursor)
    if (found === -1) {
      const preview = block.split('\n').find((l) => l.trim())?.trim().slice(0, 30) ?? ''
      errors.push(
        `${at}: 第 ${i + 1} 個保護區跟 ${ref} 不一致（開頭：「${preview}…」）。` +
          `保護區只能由人修改，請用 git diff ${ref} -- ${at} 確認差異，把原文還原回去`,
      )
    } else {
      cursor = found + 1
    }
  }

  return errors
}

/** 正文可以用「」引用的名稱：App 文案、manifest 裡的 legend 與輸入值、其他章節的標題、示範資料的攝影機名稱。 */
function knownTerms(chapter: Chapter, all: Chapter[]): { exact: Set<string>; patterns: RegExp[] } {
  const exact = new Set<string>()
  const patterns: RegExp[] = []

  const locale = JSON.parse(readText(path.join(repoRoot, LOCALE_FILE))) as Record<string, string>
  for (const value of Object.values(locale)) {
    if (value.includes('{')) {
      const escaped = value.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[^}]+\}/g, '.+')
      patterns.push(new RegExp(`^${escaped}$`))
    } else {
      exact.add(value)
    }
  }

  for (const step of chapter.steps) {
    if (step.action === 'fill' && step.text) exact.add(step.text)
    for (const a of step.annotate ?? []) exact.add(a.legend)
  }
  for (const c of all) exact.add(c.title)

  for (const m of readText(path.join(repoRoot, CAMERA_DATA_FILE)).matchAll(/name: '([^']+)'/g)) exact.add(m[1])

  return { exact, patterns }
}

export function validateDoc(chapter: Chapter, all: Chapter[], baseRef: string): DocReport | null {
  const file = path.join(docsDir(), docFileName(chapter))
  if (!fs.existsSync(file)) return null

  const at = rel(file)
  const text = readText(file)
  const errors: string[] = []
  const warnings: string[] = []

  // legend：只能引用本章 annotate 定義過的 key
  const legendKeys = new Set(chapter.steps.flatMap((s) => s.annotate ?? []).map((a) => a.key))
  for (const m of text.matchAll(/\{\{legend\.([\w-]+)\}\}/g)) {
    if (!legendKeys.has(m[1])) {
      errors.push(`${at}: 引用了不存在的 {{legend.${m[1]}}}，本章可用的有：${[...legendKeys].join(' / ') || '（本章沒有標註）'}`)
    }
  }

  // 截圖：manifest 裡的每一張都要出現剛好一次
  const shots = chapter.steps.filter((s) => s.action === 'screenshot' && s.name).map((s) => s.name!)
  const used = [...text.matchAll(/\{\{screenshot:([\w-]+)\}\}/g)].map((m) => m[1])
  for (const name of new Set(used)) {
    if (!shots.includes(name)) errors.push(`${at}: 引用了不存在的截圖 {{screenshot:${name}}}，本章有：${shots.join(' / ')}`)
    else if (used.filter((u) => u === name).length > 1) errors.push(`${at}: 截圖 {{screenshot:${name}}} 出現了不只一次`)
  }
  for (const name of shots) {
    if (!used.includes(name)) errors.push(`${at}: 漏放截圖 {{screenshot:${name}}}，manifest 裡的每一張都要出現一次`)
  }

  // 保護區：先確認標記本身是好的，再跟上一版比內容
  const current = extractProtectedBlocks(text, at)
  errors.push(...current.errors)
  const previousText = readAtRef(baseRef, file)
  if (current.errors.length === 0 && previousText !== null) {
    const previous = extractProtectedBlocks(previousText, `${baseRef}:${at}`)
    if (previous.errors.length === 0) errors.push(...validateProtectedUnchanged(previous.blocks, current.blocks, at, baseRef))
  }

  // 名稱交叉檢查：保護區裡是人寫的，不檢查
  const outsideProtected = text.replace(/<!-- protected:start -->[\s\S]*?<!-- protected:end -->/g, '')
  const { exact, patterns } = knownTerms(chapter, all)
  for (const m of outsideProtected.matchAll(/「([^「」]+)」/g)) {
    const term = m[1].replace(/『/g, '「').replace(/』/g, '」')
    if (term.includes('{{')) continue
    if (exact.has(term) || patterns.some((p) => p.test(term))) continue
    warnings.push(`${at}: 「${m[1]}」在 App 文案、manifest、章節標題與示範資料裡都找不到，請人工確認畫面上真的有這個名稱`)
  }

  return { errors, warnings }
}
