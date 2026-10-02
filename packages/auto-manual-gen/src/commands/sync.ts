/**
 * 翻譯同步：主語言的正文改了哪幾段，譯文就只需要重翻那幾段。
 *
 *   auto-manual-gen sync --locale en                        # 列出每一章的同步狀態
 *   auto-manual-gen sync --locale en --accept camera-add    # 譯文翻好 / 審完之後，記下這一版的段落對照
 *
 * 做法：把正文切成段落（空行分隔的區塊），每段算一個 hash。
 * `docs/{locale}/{order}-{id}.sync.json` 記下「主語言這段的 hash ↔ 譯文那段的 hash」。
 *
 * - 主語言段落的 hash 在紀錄裡找得到 → 翻過了，沿用
 * - 找不到 → 新增或改過的段落，需要翻譯
 * - 紀錄裡的譯文 hash，在現在的譯文裡找不到 → 譯文被直接改過，需要人工確認
 *
 * 對照是用 hash 比對，不是用位置：主語言中間插一段，後面的段落不會跟著變成「需要翻譯」。
 * 唯一依賴位置的是 --accept：它假設這一刻兩邊的段落是一對一、順序相同的。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { docFileName, docsDir } from '../docs.js'
import { contentError, usageError } from '../errors.js'
import { loadChapters, loadManual, selectChapters, type Chapter } from '../manifest.js'
import { rel } from '../project.js'
import { list, ui } from '../ui.js'

export type SyncOptions = { locale?: string; accept?: string }

type Block = { text: string; hash: string; kind: 'text' | 'screenshot' | 'protected'; line: number }
type SyncRecord = { source: string; blocks: { source: string; target: string }[] }
type ChapterStatus = { chapter: string; synced: boolean; todo: string[]; edited: string[]; stale: string[]; note?: string }

/** 切段落：空行分隔的一整塊算一段。行尾空白與換行符號先正規化，免得只改了排版就被當成改內容。 */
function splitBlocks(file: string): Block[] {
  const lines = fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd())
  const blocks: Block[] = []
  let buf: string[] = []
  let start = 0

  const flush = () => {
    if (buf.length === 0) return
    const text = buf.join('\n')
    const kind = /^\{\{screenshot:[\w-]+\}\}$/.test(text) ? 'screenshot' : text.includes('<!-- protected:start -->') ? 'protected' : 'text'
    blocks.push({ text, kind, line: start + 1, hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 8) })
    buf = []
  }

  for (const [i, line] of lines.entries()) {
    if (line === '') flush()
    else {
      if (buf.length === 0) start = i
      buf.push(line)
    }
  }
  flush()
  return blocks
}

const recordFile = (chapter: Chapter, locale: string) =>
  path.join(docsDir(locale), docFileName(chapter).replace(/\.md$/, '.sync.json'))

/** 終端機裡只放得下一行預覽。截斷時一定要補「…」，不然切在「{{legend.source}」這種地方，看起來像內容本身壞了。 */
const PREVIEW_LENGTH = 40
const preview = (text: string) => {
  const line = text.replace(/\s+/g, ' ')
  return line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH)}…` : line
}

/** --accept 的前提：兩邊段落一對一。數量、截圖位置、保護區位置、標題層級對不上，就代表譯文的結構跟原文不同，不能配對。 */
function checkAligned(src: Block[], tgt: Block[]): string[] {
  const problems: string[] = []
  if (src.length !== tgt.length) problems.push(`段落數不同：原文 ${src.length} 段、譯文 ${tgt.length} 段`)
  for (let i = 0; i < Math.min(src.length, tgt.length); i++) {
    const [s, t] = [src[i], tgt[i]]
    const heading = (b: Block) => b.text.match(/^#+ /)?.[0].length ?? 0
    if (s.kind !== t.kind) problems.push(`第 ${i + 1} 段種類不同：原文是 ${s.kind}（第 ${s.line} 行）、譯文是 ${t.kind}（第 ${t.line} 行）`)
    else if (s.kind === 'screenshot' && s.text !== t.text) problems.push(`第 ${i + 1} 段截圖不同：${s.text} / ${t.text}`)
    else if (heading(s) !== heading(t)) problems.push(`第 ${i + 1} 段標題層級不同（第 ${s.line} 行 / 第 ${t.line} 行）`)
    if (problems.length >= 3) break
  }
  return problems
}

function accept(chapter: Chapter, locale: string, src: Block[], tgt: Block[]) {
  const problems = checkAligned(src, tgt)
  if (problems.length > 0) {
    throw contentError('SYNC_NOT_ALIGNED', `${chapter.id}: 無法記錄對照，原文與譯文的段落沒有一對一：\n${list(problems)}`, {
      chapter: chapter.id,
      problems,
    })
  }
  const record: SyncRecord = {
    source: rel(path.join(docsDir(), docFileName(chapter))),
    blocks: src.map((s, i) => ({ source: s.hash, target: tgt[i].hash })),
  }
  fs.writeFileSync(recordFile(chapter, locale), JSON.stringify(record, null, 2) + '\n')
  ui.info(`${chapter.id}: 已記錄 ${src.length} 段的對照 -> ${rel(recordFile(chapter, locale))}`)
}

function status(chapter: Chapter, locale: string, src: Block[], tgt: Block[]): ChapterStatus {
  const file = recordFile(chapter, locale)
  if (!fs.existsSync(file)) {
    ui.info(`? ${chapter.id}  還沒有對照紀錄。確認目前的譯文正確後，執行 --accept ${chapter.id}`)
    return { chapter: chapter.id, synced: false, todo: [], edited: [], stale: [], note: 'no-record' }
  }

  const record: SyncRecord = JSON.parse(fs.readFileSync(file, 'utf-8'))
  const bySource = new Map(record.blocks.map((b) => [b.source, b.target]))
  const tgtByHash = new Map(tgt.map((b) => [b.hash, b]))
  const usedTargets = new Set<string>()

  const todo: string[] = []
  const edited: string[] = []

  for (const s of src) {
    const target = bySource.get(s.hash)
    if (target === undefined) {
      if (s.kind !== 'screenshot') todo.push(`第 ${s.line} 行${s.kind === 'protected' ? '（保護區，要交給人翻）' : ''}：${preview(s.text)}`)
      continue
    }
    if (tgtByHash.has(target)) usedTargets.add(target)
    else edited.push(`原文第 ${s.line} 行對應的譯文被改過：${preview(s.text)}`)
  }

  // 譯文裡沒有被任何「現存原文段落」認領的段落：原文已經改掉或刪掉，這段是舊譯文
  const stale = tgt
    .filter((t) => !usedTargets.has(t.hash) && t.kind !== 'screenshot')
    .map((t) => `${rel(path.join(docsDir(locale), docFileName(chapter)))}:${t.line}：${preview(t.text)}`)

  if (todo.length === 0 && edited.length === 0 && stale.length === 0) {
    ui.info(`✔ ${chapter.id}  ${src.length} 段都已同步`)
    return { chapter: chapter.id, synced: true, todo, edited, stale }
  }

  ui.info(`✖ ${chapter.id}`)
  for (const t of todo) ui.info(`    需要翻譯  ${t}`)
  for (const e of edited) ui.info(`    需要確認  ${e}`)
  for (const t of stale) ui.info(`    舊譯文    ${t}`)
  return { chapter: chapter.id, synced: false, todo, edited, stale }
}

/* ---------- 主流程 ---------- */

export async function sync(opts: SyncOptions) {
  const manual = loadManual()
  const { locale } = opts
  const primary = manual.locales[0]
  if (!locale || locale === primary || !manual.locales.includes(locale)) {
    throw usageError('INVALID_ARGUMENT', `請用 --locale 指定要同步的譯文語言，可用的有：${manual.locales.slice(1).join(' / ') || '（manual.yaml 只有一個語言）'}`)
  }

  const chapters = selectChapters(loadChapters(), opts.accept)
  const results: ChapterStatus[] = []

  for (const chapter of chapters) {
    const srcFile = path.join(docsDir(primary), docFileName(chapter))
    const tgtFile = path.join(docsDir(locale), docFileName(chapter))
    if (!fs.existsSync(tgtFile)) {
      ui.info(`? ${chapter.id}  還沒有 ${locale} 譯文`)
      results.push({ chapter: chapter.id, synced: false, todo: [], edited: [], stale: [], note: 'no-translation' })
      continue
    }
    const [src, tgt] = [splitBlocks(srcFile), splitBlocks(tgtFile)]
    if (opts.accept) accept(chapter, locale, src, tgt)
    else results.push(status(chapter, locale, src, tgt))
  }

  if (opts.accept) return { locale, accepted: opts.accept }

  const pending = results.filter((r) => !r.synced)
  if (pending.length > 0) {
    throw contentError('NOT_SYNCED', `${locale} 有 ${pending.length} 章還沒同步：${pending.map((r) => r.chapter).join(' / ')}`, { locale, chapters: results })
  }
  return { locale, chapters: results }
}
