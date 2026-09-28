/**
 * 錄影：同一份 manifest 的 steps，把「按快門」換成「從頭錄到尾」。
 *
 *   npm run video                              # 錄 manifest 裡標了 video: true 的章節，全部語言
 *   npm run video -- --chapter camera-add      # 只錄一章
 *   npm run video -- --locale zh-Hant --gif    # 只錄一個語言，並多轉一份 GIF
 *
 * 產物：output/video/{locale}/{id}.webm（原檔）、.mp4，加上 --gif 時的 .gif。
 *
 * 跟 run.ts 的差別只在「每個 step 怎麼演」：
 * - click / fill 之前，先把假游標滑過去、點一下有漣漪；fill 改成一個字一個字打。
 * - screenshot 不拍照，改成畫上同一套標註、把 clip 以外調暗，停留幾秒讓觀眾看清楚。
 * - 每個 step 之後停一下，給觀眾時間跟上畫面的變化。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright'
import { boot } from '../boot.js'
import { loadConfig, repoRoot } from '../config.js'
import { loadChapters, loadManual, pick, rel, selectLocales, tid, validateActions, validateLocales, type Step } from '../manifest.js'
import { annotate, clearAnnotations, locate } from '../overlay/annotate.js'
import { clickRipple, installCursor, moveCursor } from '../overlay/cursor.js'
import { sizeOf, toGif, toMp4 } from './encode.js'

/** 節奏。數字是看了幾次成品之後調出來的，沒有標準答案。 */
const PACE = {
  leadIn: 1000, // 開始操作之前先停一下，讓觀眾看清楚起始畫面
  afterAction: 700, // 每個會改變畫面的動作之後
  typeDelay: 110, // fill 每個字的間隔
  hold: 2500, // screenshot 的位置：標註停留的時間
  tail: 2000, // 最後一步之後
}

const SPOTLIGHT_ID = '__manual-spotlight'

const config = loadConfig()
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const only = arg('chapter')
const mode = (arg('mode') as 'electron' | 'web' | undefined) ?? config.app.mode
const gif = process.argv.includes('--gif')

const videoDir = (locale: string) => path.join(repoRoot, config.paths.output, 'video', locale)

/* ---------- 每個 step 怎麼演 ---------- */

/** 游標滑到元素中央。回傳 locator 讓呼叫端接著做真正的操作。 */
async function pointAt(page: Page, testid: string) {
  const locator = await locate(page, testid)
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) throw new Error(`testid「${testid}」存在但不可見`)
  await moveCursor(page, box.x + box.width / 2, box.y + box.height / 2)
  return locator
}

/** 截圖用 clip 裁切；影片裁不了，改成把 clip 以外的區域調暗，效果一樣是「看這裡」。 */
async function spotlight(page: Page, clip: NonNullable<Step['clip']>) {
  const box = (await (await locate(page, clip.testid, 'clip.testid')).boundingBox())!
  const p = clip.padding ?? 0
  await page.evaluate(
    ({ id, x, y, w, h }) => {
      const el = document.createElement('div')
      el.id = id
      el.style.cssText = `
        position:fixed; left:${x}px; top:${y}px; width:${w}px; height:${h}px;
        border-radius:8px; box-shadow:0 0 0 100vmax rgba(0,0,0,0.35);
        pointer-events:none; z-index:999998;
      `
      document.body.appendChild(el)
    },
    { id: SPOTLIGHT_ID, x: box.x - p, y: box.y - p, w: box.width + p * 2, h: box.height + p * 2 },
  )
}

async function playStep(page: Page, step: Step, locale: string, next?: Step) {
  switch (step.action) {
    case 'waitFor':
      await page.locator(tid(step.testid!)).waitFor({ state: step.state ?? 'visible' })
      return
    case 'click': {
      const target = await pointAt(page, step.testid!)
      await clickRipple(page)
      await target.click()
      break
    }
    case 'dblclick': {
      const target = await pointAt(page, step.testid!)
      await clickRipple(page)
      await target.dblclick()
      break
    }
    case 'fill': {
      // 先點進欄位，再一個字一個字打 —— fill() 是一瞬間整串出現，觀眾會以為剪接漏了一段
      const target = await pointAt(page, step.testid!)
      await clickRipple(page)
      await target.click()
      await target.fill('')
      await target.pressSequentially(pick(step.text!, locale), { delay: PACE.typeDelay })
      break
    }
    case 'hover':
      await (await pointAt(page, step.testid!)).hover()
      break
    case 'scroll':
      await (await locate(page, step.testid!)).scrollIntoViewIfNeeded()
      break
    case 'dismiss': {
      const locator = page.locator(tid(step.testid!))
      if ((await locator.count()) > 0) await locator.click()
      return
    }
    case 'screenshot':
      // 手冊在這裡放一張圖，影片就在這裡停下來，畫上同一套標註
      if (step.clip) await spotlight(page, step.clip)
      if (step.annotate) await annotate(page, step.annotate)
      await page.waitForTimeout(PACE.hold)
      await clearAnnotations(page)
      await page.evaluate((id) => document.getElementById(id)?.remove(), SPOTLIGHT_ID)
      return
    case 'wait':
      await page.waitForTimeout(500)
      return
  }
  // 下一步是 waitFor 就不停：等待本身加上 screenshot 的停留，已經夠觀眾看了。
  // 多停這一下，3 秒就消失的 toast 會在標註還掛著的時候先不見（截圖是一出現就拍，所以沒這個問題）
  if (next?.action !== 'waitFor') await page.waitForTimeout(PACE.afterAction)
}

/* ---------- 主流程 ---------- */

const manual = loadManual()
let locales: string[]
try {
  locales = selectLocales(manual, arg('locale'))
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}

const all = loadChapters()
const chapters = only ? all.filter((c) => c.id === only) : all.filter((c) => c.video)

if (only && chapters.length === 0) {
  console.error(`找不到章節「${only}」，可用的有：${all.map((c) => c.id).join(' / ')}`)
  process.exit(1)
}
if (chapters.length === 0) {
  console.error('沒有任何章節標了 video: true。錄影很貴，要錄哪幾章請在 manifest 裡明確標出來。')
  process.exit(1)
}

const problems = chapters.flatMap((c) => [...validateActions(c), ...validateLocales(c, manual.locales)])
if (problems.length > 0) {
  console.error(`manifest 驗證失敗（${problems.length} 個問題）：\n${problems.map((e) => `  - ${e}`).join('\n')}`)
  process.exit(1)
}

console.log(`錄影：${chapters.map((c) => c.id).join(' / ')} × ${locales.length} 種語言（${locales.join(' / ')}）  [${mode}]\n`)

let booted = 0
for (const locale of locales) {
  const dir = videoDir(locale)
  fs.mkdirSync(dir, { recursive: true })

  for (const chapter of chapters) {
    console.log(`● [${locale}] ${chapter.id}  ${pick(chapter.title, locale)}`)
    const { driver, page } = await boot(mode, booted++ === 0, locale)
    const webm = path.join(dir, `${chapter.id}.webm`)
    const { width, height } = manual.bootstrap.viewport

    try {
      await installCursor(page)
      // 開機（含注入狀態後的 reload）都做完了才開始錄，影片開頭不會有白畫面或閃一下
      await page.screencast.start({ path: webm, size: { width, height } })
      const t0 = Date.now()
      await page.waitForTimeout(PACE.leadIn)
      for (const [i, step] of chapter.steps.entries()) {
        try {
          await playStep(page, step, locale, chapter.steps[i + 1])
        } catch (cause) {
          throw new Error(`step ${i}（${step.action} ${step.testid ?? step.name ?? ''}）失敗：${(cause as Error).message}`)
        }
      }
      await page.waitForTimeout(PACE.tail)
      await page.screencast.stop()
      console.log(`  錄完 ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${rel(webm)}`)
    } catch (e) {
      console.error(`✖ [${locale}] ${chapter.id}  ${(e as Error).message}`)
      await driver.close()
      process.exit(1)
    }
    await driver.close()

    const mp4 = webm.replace(/\.webm$/, '.mp4')
    toMp4(webm, mp4)
    console.log(`  ffmpeg -> ${rel(mp4)}（${sizeOf(mp4)}）`)
    if (gif) {
      const out = webm.replace(/\.webm$/, '.gif')
      toGif(webm, out)
      console.log(`  ffmpeg -> ${rel(out)}（${sizeOf(out)}）`)
    }
  }
}
