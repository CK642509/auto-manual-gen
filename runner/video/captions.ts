/**
 * 字幕：從正文與 manifest 產生，不另外寫一份。
 *
 * 字幕的「內容」早就在正文裡了 —— 操作步驟的編號清單、legend、「完成後」那一段。
 * 真正要解決的是「時間」：每一句該在影片的第幾秒出現。
 *
 * 做法分成兩半：
 * 1. `planCues()`：錄影之前，把每句字幕掛到某個 step 上（錨點），跟時間無關。
 * 2. 錄影時 runner 記下每個錨點實際發生的時間（timeline），`cueTimes()` 再把兩者對起來。
 *
 * 分開的好處是：正文改了字，只要重新對一次時間軸，不用重錄（`npm run video -- --captions-only`）。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { docFileName, docsDir } from '../docs.js'
import { pick, rel, type Chapter, type Step } from '../manifest.js'

/** 錨點：`{step}:start`（開始做這一步）、`{step}:hold`（screenshot 停留的開始）、`tail`（最後一步之後）。 */
export type Cue = { anchor: string; text: string }
export type Timeline = { steps: string; narrated: boolean; marks: Record<string, number>; end: number }

/** 會「動」的 step —— 正文的一個編號步驟，對應的就是其中一個。waitFor / wait 是 runner 的事，讀者看不到。 */
const VISIBLE: Step['action'][] = ['click', 'dblclick', 'fill', 'hover', 'scroll']

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩'

/** manifest 的 steps 指紋。steps 一變，錄好的時間軸就作廢，只能重錄。 */
export const stepsHash = (chapter: Chapter) =>
  crypto.createHash('sha256').update(JSON.stringify(chapter.steps)).digest('hex').slice(0, 8)

/** 正文裡的 markdown 標記，字幕上不需要。 */
const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').trim()

/** 把正文拆成「操作步驟」裡的編號項目與截圖佔位，加上「完成後」的第一段。 */
function parseDoc(chapter: Chapter, locale: string) {
  const file = path.join(docsDir(locale), docFileName(chapter))
  const legends = new Map(chapter.steps.flatMap((s) => s.annotate ?? []).map((a) => [a.key, pick(a.legend, locale)]))
  const text = fs
    .readFileSync(file, 'utf-8')
    .replace(/\r\n/g, '\n')
    .replace(/\{\{legend\.([\w-]+)\}\}/g, (_, key: string) => legends.get(key) ?? key)

  // 以 H2 切段：第一個 H2 是操作步驟，第二個是完成後（標題文字跟著語言變，所以只看順序）
  const sections = text.split(/^## .+$/m).slice(1)
  if (sections.length < 1) throw new Error(`${rel(file)}: 找不到「操作步驟」這個 H2`)

  const tokens: ({ kind: 'item'; text: string } | { kind: 'shot'; name: string })[] = []
  for (const line of sections[0].split('\n')) {
    const item = line.match(/^\d+\.\s+(.+)$/)
    const shot = line.match(/^\{\{screenshot:([\w-]+)\}\}$/)
    if (item) tokens.push({ kind: 'item', text: plain(item[1]) })
    else if (shot) tokens.push({ kind: 'shot', name: shot[1] })
  }

  const result = sections[1]
    ?.split(/\n\s*\n/)
    .map((p) => p.trim())
    // 引言（> 注意）跟「以下三點：」這種引出清單的段落，單獨拿出來都不成一句
    .find((p) => p && !p.startsWith('>') && !p.startsWith('-') && !/[:：]$/.test(p))

  return { file, tokens, result: result && plain(result.replace(/\n/g, ' ')) }
}

/**
 * 把每句字幕掛到 step 上。
 *
 * 截圖是正文跟 manifest 共同的錨點 —— 兩邊都有 camera-add-01、-02，名字一樣、順序一樣。
 * 所以先用截圖把兩邊切成一段一段，再在每一段裡配對「編號步驟 ↔ 會動的 step」：
 *
 * - 數量一樣：一對一。
 * - 正文比較多：從後面對齊，前面多出來的（通常是「等待清單載入」這種）掛在這一段的開頭。
 * - 正文比較少：從前面對齊，並提醒 —— 多半是正文漏寫了一步。
 *
 * screenshot 停留的時候，有標註就顯示 legend（① 顯示名稱 ② 安裝位置…）；
 * 最後一張圖如果沒有標註，通常就是結果畫面，換成「完成後」的第一段。
 */
export function planCues(chapter: Chapter, locale: string): { cues: Cue[]; warnings: string[] } {
  const { file, tokens, result } = parseDoc(chapter, locale)
  const warnings: string[] = []
  const cues: Cue[] = []
  const at = `${rel(file)}`

  // 兩邊都用截圖切段：segments[k] 是第 k 張圖之前（上一張圖之後）的內容
  const docSegs: string[][] = [[]]
  const docShots: string[] = []
  for (const t of tokens) {
    if (t.kind === 'item') docSegs.at(-1)!.push(t.text)
    else {
      docShots.push(t.name)
      docSegs.push([])
    }
  }

  const stepSegs: number[][] = [[]]
  const shotSteps: number[] = []
  for (const [i, s] of chapter.steps.entries()) {
    if (s.action === 'screenshot') {
      shotSteps.push(i)
      stepSegs.push([])
    } else stepSegs.at(-1)!.push(i)
  }

  const manifestShots = shotSteps.map((i) => chapter.steps[i].name!)
  if (docShots.join() !== manifestShots.join()) {
    throw new Error(`${at}: 正文的截圖順序（${docShots.join(' / ')}）跟 manifest（${manifestShots.join(' / ')}）對不上，字幕沒辦法對齊`)
  }

  let resultPlaced = false
  for (const [k, items] of docSegs.entries()) {
    const segment = stepSegs[k]
    const actions = segment.filter((i) => VISIBLE.includes(chapter.steps[i].action))
    const put = (anchor: string, text: string) => {
      const same = cues.find((c) => c.anchor === anchor)
      if (same) same.text += ` ${text}`
      else cues.push({ anchor, text })
    }

    if (items.length > 0 && segment.length === 0) {
      warnings.push(`${at}: 第 ${k + 1} 段有 ${items.length} 個步驟，但 manifest 這一段沒有任何 step，字幕併到上一段`)
    }
    if (items.length >= actions.length) {
      const extra = items.length - actions.length
      if (extra > 0 && segment.length > 0) put(`${segment[0]}:start`, items.slice(0, extra).join(' '))
      actions.forEach((i, j) => put(`${i}:start`, items[extra + j]))
    } else {
      warnings.push(`${at}: 第 ${k + 1} 段正文有 ${items.length} 個步驟，manifest 有 ${actions.length} 個動作，後面幾個動作沒有字幕`)
      items.forEach((text, j) => put(`${actions[j]}:start`, text))
    }

    // 這一段結尾的截圖
    const shot = shotSteps[k]
    if (shot === undefined) continue
    const step = chapter.steps[shot]
    if (step.annotate?.length) {
      put(`${shot}:hold`, step.annotate.map((a, j) => `${CIRCLED[j] ?? j + 1} ${pick(a.legend, locale)}`).join('　'))
    } else if (result && k === shotSteps.length - 1 && docSegs[k + 1].length === 0) {
      put(`${shot}:hold`, result)
      resultPlaced = true
    }
  }
  if (result && !resultPlaced) cues.push({ anchor: 'tail', text: result })

  return { cues, warnings }
}

/**
 * 一句字幕至少要停多久才讀得完。畫面的節奏是動作決定的（清單早就載入好了，「等待清單載入」
 * 那一句只會閃 0.02 秒），所以沒有旁白的時候，改由閱讀時間決定下一句什麼時候能出來。
 *
 * 每秒字數參考常見的字幕規範：中文約 9 字、英文約 17 個字元，最少 1.2 秒。
 */
const READING_CPS: Record<string, number> = { 'zh-Hant': 9, en: 17 }
export const readingMs = (text: string, locale: string) =>
  Math.max(1200, Math.round((text.replace(/\s/g, '').length / (READING_CPS[locale] ?? 12)) * 1000))

/** 字幕的起訖時間：從自己的錨點開始，到下一句開始（最後一句到影片結束）。 */
export function cueTimes(cues: Cue[], timeline: Timeline): { start: number; end: number; text: string }[] {
  const missing = cues.filter((c) => timeline.marks[c.anchor] === undefined).map((c) => c.anchor)
  if (missing.length > 0) throw new Error(`時間軸裡找不到錨點 ${missing.join(' / ')} —— manifest 的 steps 變了，要重錄`)

  const timed = cues.map((c) => ({ start: timeline.marks[c.anchor], text: c.text })).sort((a, b) => a.start - b.start)
  return timed.map((c, i) => ({ ...c, end: timed[i + 1]?.start ?? timeline.end }))
}

const stamp = (ms: number, sep: string) => {
  const t = Math.max(0, Math.round(ms))
  const [h, m, s] = [Math.floor(t / 3600000), Math.floor(t / 60000) % 60, Math.floor(t / 1000) % 60]
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(t % 1000).padStart(3, '0')}`
}

/** WebVTT：網頁版手冊的 `<video><track>` 直接吃這個。 */
export const toVtt = (timed: ReturnType<typeof cueTimes>) =>
  `WEBVTT\n\n${timed.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n')}`

/** SRT：影音平台、ffmpeg、大部分播放器都認得。 */
export const toSrt = (timed: ReturnType<typeof cueTimes>) =>
  timed.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n')
