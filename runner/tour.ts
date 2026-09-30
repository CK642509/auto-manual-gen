/**
 * App 內導覽：把 manifest + 正文轉成 App 自己讀得懂的導覽資料（Day 26）。
 *
 *   npm run tour              # 產生 apps/demo-stream-app/src/renderer/help/tours.json
 *   npm run tour -- --check   # 只比對，不寫檔；跟 manifest / 正文對不上就以非 0 結束
 *
 * 截圖是 runner 替使用者操作、再按快門；導覽則是指著畫面上的元件，請使用者自己操作。
 * 兩者要的資訊其實一樣 —— 要點哪個元件、那個元件叫什麼、這一步怎麼寫 —— 所以不另外寫一份：
 *
 * - 要指的元件：manifest 的 step.testid。
 * - 元件的名稱：annotate 的 legend。
 * - 每一步的說明：正文的編號步驟，跟字幕用同一套配對（`planCues()`，Day 25）。
 *
 * 產物是一份跟導覽函式庫無關的 JSON，App 端再轉成 driver.js 的步驟。
 * 它要跟著 App 一起打包、跟著 App 的版本走，所以跟 i18n 檔一樣進 App 的版控，而不是放在 output/。
 */
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from './config.js'
import { docFileName, docsDir } from './docs.js'
import { loadChapters, loadManual, pick, rel, validateActions, validateLocales, type Chapter, type Step } from './manifest.js'
import { planCues } from './video/captions.js'

const OUT = path.join(repoRoot, 'apps/demo-stream-app/src/renderer/help/tours.json')
const CAMERA_DATA_FILE = path.join(repoRoot, 'apps/demo-stream-app/src/renderer/data/cameras.ts')

/**
 * 導覽的一步。`kind` 決定 App 怎麼往下走：
 * - click / dblclick：等使用者自己點了這個元件才往下。
 * - fill：使用者輸入完按「下一步」。`example` 是 manifest 的示範輸入值，只當作範例。
 * - info：單純介紹一個元件（來自 annotate）。
 * - done：最後一步，不指向任何元件（來自正文「完成後」的第一段）。
 */
export type TourStep = {
  kind: 'click' | 'dblclick' | 'fill' | 'info' | 'done'
  testid?: string
  title?: string
  text?: string
  example?: string
}
export type Tour = { id: string; title: string; steps: TourStep[] }
export type TourFile = { version: string; tours: Record<string, Tour[]> }

/** 使用者會親手做的動作。waitFor / wait 是 runner 的事；scroll 使用者自己會捲。 */
const ACTIONS: Step['action'][] = ['click', 'dblclick', 'fill']

/** 正文的冒號清單：`- 「{{legend.stats}}」：顯示…`，拿來當 info 步驟的說明。 */
const LEGEND_ITEM = /^- (?:「|\*\*)\{\{legend\.([\w-]+)\}\}(?:」|\*\*)[:：]\s*(.+)$/gm

/**
 * 示範資料（`camera-row_lobby-01` 這種）在使用者的畫面上不一定存在 ——
 * 手冊是在固定的 fixture 上拍的，導覽卻是在使用者真實的資料上走。
 */
const demoIds = () => new Set([...fs.readFileSync(CAMERA_DATA_FILE, 'utf-8').matchAll(/id: '([^']+)'/g)].map((m) => m[1]))

/** 導覽章節不能做的事。跟 validate 一樣，錯誤訊息要說怎麼修。 */
export function validateTour(chapter: Chapter): string[] {
  const ids = demoIds()
  const errors: string[] = []
  for (const [i, step] of chapter.steps.entries()) {
    if (!step.testid || !ACTIONS.includes(step.action)) continue
    const key = step.testid.split('_')[1]
    if (key && ids.has(key)) {
      errors.push(
        `${chapter.id}.steps[${i}]: ${step.action} ${step.testid} 指向示範資料「${key}」，使用者的畫面上不一定有這台攝影機。` +
          `這一章不適合做成導覽，拿掉 tour: true`,
      )
    }
  }
  return errors
}

export function buildTour(chapter: Chapter, locale: string): Tour {
  const legendOf = new Map<string, string>()
  for (const a of chapter.steps.flatMap((s) => s.annotate ?? [])) legendOf.set(a.testid, pick(a.legend, locale))

  // 正文的編號步驟 ↔ step，直接沿用字幕的配對；最後的「完成後」也在裡面
  const { cues } = planCues(chapter, locale)
  const sentence = new Map<number, string>()
  let result: string | undefined
  for (const c of cues) {
    const [index, at] = c.anchor.split(':')
    if (at === 'start') sentence.set(Number(index), c.text)
    else if (c.anchor === 'tail' || !chapter.steps[Number(index)].annotate?.length) result = c.text
  }

  // 正文是照著示範值寫的（「已新增攝影機『大門西側』」），但使用者輸入的不會是大門西側。
  // 導覽裡的示範值一律換成「…」，只在 fill 那一步當作範例出現。
  const demo = chapter.steps.filter((s) => s.action === 'fill').map((s) => pick(s.text!, locale))
  const generic = (text?: string) => text && demo.reduce((t, v) => t.replaceAll(v, '…'), text)
  for (const [i, text] of sentence) sentence.set(i, generic(text)!)
  result = generic(result)

  // info 的說明：正文裡 `- 「{{legend.key}}」：…` 這種清單
  const docText = fs.readFileSync(path.join(docsDir(locale), docFileName(chapter)), 'utf-8').replace(/\r\n/g, '\n')
  const keyText = new Map([...docText.matchAll(LEGEND_ITEM)].map((m) => [m[1], m[2].trim()]))

  const toStep = (step: Step, i: number): TourStep => {
    const title = legendOf.get(step.testid!)
    if (step.action === 'fill') return { kind: 'fill', testid: step.testid, title: title ?? sentence.get(i), example: pick(step.text!, locale) }
    return { kind: step.action as 'click' | 'dblclick', testid: step.testid, title, text: sentence.get(i) }
  }

  const steps: TourStep[] = []
  const used = new Set<number>()
  for (const [i, step] of chapter.steps.entries()) {
    if (ACTIONS.includes(step.action) && !used.has(i)) {
      steps.push(toStep(step, i))
      used.add(i)
      continue
    }
    if (step.action !== 'screenshot' || !step.annotate) continue

    // 截圖的位置：標註變成介紹。下一張截圖之前要輸入的欄位，直接在介紹到它的時候請使用者輸入，
    // 順序就會跟畫面上由上到下一致；下一個動作如果就是點這個元件，也併成一步，不要介紹完又點一次。
    const next = chapter.steps.findIndex((s, j) => j > i && s.action === 'screenshot')
    const segment = [...chapter.steps.entries()].filter(([j, s]) => j > i && (next === -1 || j < next) && ACTIONS.includes(s.action))
    for (const a of step.annotate) {
      const fill = segment.find(([j, s]) => !used.has(j) && s.action === 'fill' && s.testid === a.testid)
      const first = segment.find(([j]) => !used.has(j))?.[1]
      if (fill) {
        steps.push(toStep(fill[1], fill[0]))
        used.add(fill[0])
      } else if (first?.testid !== a.testid) {
        steps.push({ kind: 'info', testid: a.testid, title: pick(a.legend, locale), text: keyText.get(a.key) })
      }
    }
  }
  if (result) steps.push({ kind: 'done', title: pick(chapter.title, locale), text: result })

  return { id: chapter.id, title: pick(chapter.title, locale), steps }
}

/* ---------- 主流程 ---------- */

const check = process.argv.includes('--check')
const manual = loadManual()
const chapters = loadChapters().filter((c) => c.tour)

if (chapters.length === 0) {
  console.error('沒有任何章節標了 tour: true。要做成導覽的章節請在 manifest 裡明確標出來。')
  process.exit(1)
}

const problems = chapters.flatMap((c) => [...validateActions(c), ...validateLocales(c, manual.locales), ...validateTour(c)])
if (problems.length > 0) {
  console.error(`導覽驗證失敗（${problems.length} 個問題）：\n${problems.map((e) => `  - ${e}`).join('\n')}`)
  process.exit(1)
}

const file: TourFile = { version: manual.version, tours: {} }
for (const locale of manual.locales) {
  file.tours[locale] = chapters.map((c) => buildTour(c, locale))
}
const json = `${JSON.stringify(file, null, 2)}\n`

if (check) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf-8').replace(/\r\n/g, '\n') : ''
  if (current !== json) {
    console.error(`${rel(OUT)} 跟 manifest / 正文對不上，請重新執行 npm run tour 並一起 commit`)
    process.exit(1)
  }
  console.log(`${rel(OUT)} 是最新的（${chapters.length} 章 × ${manual.locales.length} 種語言）`)
  process.exit(0)
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, json)
for (const locale of manual.locales) {
  for (const t of file.tours[locale]) console.log(`[${locale}] ${t.id}  ${t.title}  ${t.steps.length} 步`)
}
console.log(`-> ${rel(OUT)}`)
