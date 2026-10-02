/**
 * 產線的執行者：讀 manifest → 一章一次開機 → 產出截圖。
 *
 *   auto-manual-gen run                            # 整本重跑
 *   auto-manual-gen run --chapter layout-preset    # 只重跑一章
 *   auto-manual-gen run --mode web                 # 蓋過 manual.yaml 的 app.mode（web 要先把 App 跑起來）
 *   auto-manual-gen run --locale en                # 只跑一個語言；沒給就跑 manual.yaml 列的全部語言
 *
 * 純執行者，不做任何判斷：manifest 說什麼就做什麼，做不到就帶著線索失敗。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright'
import { boot } from '../boot.js'
import { contentError, ManualError } from '../errors.js'
import {
  loadChapters,
  loadManual,
  pick,
  selectChapters,
  selectLocales,
  tid,
  validateActions,
  validateLocales,
  type Rect,
  type Step,
} from '../manifest.js'
import { annotate, clearAnnotations, locate } from '../overlay/annotate.js'
import { project, rel, type AppMode } from '../project.js'
import { list, ui } from '../ui.js'

export type RunOptions = { chapter?: string; locale?: string; mode?: AppMode }

/** 手冊要用的圖，一個語言一個資料夾，裡面扁平放置 —— 章節 id 就是檔名前綴（`screenshots/{locale}/{id}-NN.png`）。 */
const shotsDir = (locale: string) => path.join(project().paths.screenshots, locale)

/* ---------- 執行 ---------- */

async function runStep(page: Page, step: Step, locale: string) {
  switch (step.action) {
    case 'waitFor':
      await page.locator(tid(step.testid!)).waitFor({ state: step.state ?? 'visible' })
      return
    case 'click':
      await (await locate(page, step.testid!)).click()
      return
    case 'dblclick':
      await (await locate(page, step.testid!)).dblclick()
      return
    case 'fill':
      await (await locate(page, step.testid!)).fill(pick(step.text!, locale))
      return
    case 'hover':
      await (await locate(page, step.testid!)).hover()
      return
    case 'scroll':
      await (await locate(page, step.testid!)).scrollIntoViewIfNeeded()
      return
    case 'dismiss': {
      // 前置清場：對話框本來就不一定存在，找不到就跳過（跟 redact 相反）
      const locator = page.locator(tid(step.testid!))
      if ((await locator.count()) > 0) await locator.click()
      return
    }
    case 'screenshot': {
      let clip: Rect | undefined
      if (step.clip) {
        const b = (await (await locate(page, step.clip.testid, 'clip.testid')).boundingBox())!
        const p = step.clip.padding ?? 0
        clip = { x: Math.max(0, b.x - p), y: Math.max(0, b.y - p), width: b.width + p * 2, height: b.height + p * 2 }
      }
      if (step.annotate) await annotate(page, step.annotate)
      await page.screenshot({ path: path.join(shotsDir(locale), `${step.name}.png`), clip })
      await clearAnnotations(page)
      return
    }
    case 'wait':
      await page.waitForTimeout(500)
      return
  }
}

/* ---------- 主流程 ---------- */

export async function run(opts: RunOptions) {
  const manual = loadManual()
  const locales = selectLocales(manual, opts.locale)
  const mode = opts.mode ?? manual.app.mode
  const all = loadChapters()
  const chapters = selectChapters(all, opts.chapter)

  const problems = chapters.flatMap((c) => {
    const structural = validateActions(c)
    return structural.length > 0 ? structural : validateLocales(c, manual.locales)
  })
  if (problems.length > 0) {
    throw contentError('MANIFEST_INVALID', `manifest 驗證失敗（${problems.length} 個問題）：\n${list(problems)}`, { problems })
  }

  /** 失敗現場：只給除錯用，不會被合進手冊，所以跟成品分開放。 */
  const FAILURES = path.join(project().paths.output, 'failures')

  const scope = opts.chapter ? `只跑 1 章（--chapter ${opts.chapter}）` : `共 ${chapters.length} 章`
  ui.info(`manifest: ${manual.profile} ${manual.version}  ${scope} × ${locales.length} 種語言（${locales.join(' / ')}）  [${mode}]\n`)

  const startedAt = Date.now()
  const screenshots: Record<string, string[]> = {}
  let booted = 0

  // 語言是最外層的迴圈：同一份 manifest，換一個 locale 值重跑一遍（Day 22）
  for (const locale of locales) {
    const SHOTS = shotsDir(locale)
    const localeStartedAt = Date.now()
    screenshots[locale] = []
    ui.info(`── ${locale} ──`)

    for (const [n, chapter] of chapters.entries()) {
      // 清空的單位是「一個語言的一章」：靠檔名前綴就認得出哪些圖是這一章的，不需要另外維護索引。
      for (const f of fs.existsSync(SHOTS) ? fs.readdirSync(SHOTS) : []) {
        if (f.startsWith(`${chapter.id}-`)) fs.rmSync(path.join(SHOTS, f))
      }
      const failureDir = path.join(FAILURES, locale, chapter.id)
      fs.rmSync(failureDir, { recursive: true, force: true })
      fs.mkdirSync(SHOTS, { recursive: true })

      const label = `[${n + 1}/${chapters.length}] ${chapter.id}`
      ui.info(`▶ ${label}  ${pick(chapter.title, locale)}`)

      const { driver, page } = await boot(mode, booted++ === 0, locale)
      const t0 = Date.now()
      let shots = 0

      for (const [i, step] of chapter.steps.entries()) {
        try {
          await runStep(page, step, locale)
          if (step.action === 'screenshot') {
            shots++
            screenshots[locale].push(rel(path.join(SHOTS, `${step.name}.png`)))
          }
        } catch (cause) {
          // 失敗要留下線索：整頁截圖 + DOM dump + step index + 當下可用的 testid
          fs.mkdirSync(failureDir, { recursive: true })
          const shot = path.join(failureDir, 'failure.png')
          const dom = path.join(failureDir, 'failure.html')
          await page.screenshot({ path: shot, fullPage: true })
          fs.writeFileSync(dom, await page.content())
          await driver.close()

          const brief = JSON.stringify({ action: step.action, name: step.name, testid: step.testid })
          const rest = chapters.slice(n + 1).map((c) => c.id)
          const message =
            `✖ ${label}  [${locale}] step ${i} 失敗：${brief}\n` +
            `${(cause as Error).message}\n` +
            `  失敗當下的畫面：${rel(shot)}\n` +
            `  失敗當下的 DOM：${rel(dom)}\n` +
            `  修好之後只要重跑這一章：auto-manual-gen run --chapter ${chapter.id} --locale ${locale}` +
            (rest.length > 0 ? `\n  尚未執行的章節：${rest.join(' / ')}` : '')

          // 找不到 testid 這類錯誤本身就帶著結構化的線索（候選清單），原樣往上傳；其他的（逾時……）統一歸成 STEP_FAILED
          const known = cause instanceof ManualError ? cause : undefined
          throw new ManualError(
            known?.kind ?? 'content',
            known?.code ?? 'STEP_FAILED',
            message,
            {
              chapter: chapter.id,
              locale,
              step: i,
              action: step.action,
              ...(known ? known.details : { reason: (cause as Error).message }),
              failure: { screenshot: rel(shot), dom: rel(dom) },
              remaining: rest,
            },
            { cause },
          )
        }
      }

      await driver.close()
      const unit = shots > 1 ? 'shots' : 'shot'
      ui.info(`✔ ${label}  ${chapter.steps.length} steps / ${shots} ${unit}  ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    }

    ui.info(`${locale} 完成，${((Date.now() - localeStartedAt) / 1000).toFixed(1)}s -> ${rel(SHOTS)}/\n`)
  }

  ui.info(`完成 ${chapters.length} 章 × ${locales.length} 種語言，總共 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
  return { chapters: chapters.map((c) => c.id), locales, screenshots, seconds: Math.round((Date.now() - startedAt) / 100) / 10 }
}
