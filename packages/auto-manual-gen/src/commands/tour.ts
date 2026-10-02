/**
 * App 內導覽：把 manifest + 正文轉成 App 自己讀得懂的導覽資料（Day 26）。
 *
 *   auto-manual-gen tour            # 產生 manual.yaml 的 tour.output 指定的導覽資料
 *   auto-manual-gen tour --check    # 只比對，不寫檔；跟 manifest / 正文對不上就以非 0 結束
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
import { docFileName, docsDir } from '../docs.js'
import { contentError, usageError } from '../errors.js'
import { loadChapters, pick, validateActions, validateLocales, type Chapter, type Step } from '../manifest.js'
import { project, rel } from '../project.js'
import { list, ui } from '../ui.js'
import { planCues } from '../video/captions.js'

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

export type TourOptions = { check?: boolean }

export async function tour(opts: TourOptions) {
  const { root, manual } = project()
  if (!manual.tour?.output) {
    throw usageError('CONFIG_INVALID', 'manual.yaml 沒有設定 tour.output —— 導覽資料要寫進 App 的原始碼裡，請指定路徑')
  }
  const OUT = path.resolve(root, manual.tour.output)
  const chapters = loadChapters().filter((c) => c.tour)

  if (chapters.length === 0) {
    throw contentError('NO_TOUR_CHAPTERS', '沒有任何章節標了 tour: true。要做成導覽的章節請在 manifest 裡明確標出來。')
  }

  const problems = chapters.flatMap((c) => {
    const structural = validateActions(c)
    return structural.length > 0 ? structural : validateLocales(c, manual.locales)
  })
  if (problems.length > 0) {
    throw contentError('MANIFEST_INVALID', `導覽驗證失敗（${problems.length} 個問題）：\n${list(problems)}`, { problems })
  }

  const file: TourFile = { version: manual.version, tours: {} }
  for (const locale of manual.locales) {
    file.tours[locale] = chapters.map((c) => buildTour(c, locale))
  }
  const json = `${JSON.stringify(file, null, 2)}\n`
  const summary = { output: rel(OUT), chapters: chapters.map((c) => c.id), locales: manual.locales }

  if (opts.check) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf-8').replace(/\r\n/g, '\n') : ''
    if (current !== json) {
      throw contentError('TOUR_OUTDATED', `${rel(OUT)} 跟 manifest / 正文對不上，請重新執行 auto-manual-gen tour 並一起 commit`, { output: rel(OUT) })
    }
    ui.info(`${rel(OUT)} 是最新的（${chapters.length} 章 × ${manual.locales.length} 種語言）`)
    return { ...summary, upToDate: true }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, json)
  for (const locale of manual.locales) {
    for (const t of file.tours[locale]) ui.info(`[${locale}] ${t.id}  ${t.title}  ${t.steps.length} 步`)
  }
  ui.info(`-> ${rel(OUT)}`)
  return summary
}
