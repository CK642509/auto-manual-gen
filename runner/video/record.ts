/**
 * 錄影：同一份 manifest 的 steps，把「按快門」換成「從頭錄到尾」。
 *
 *   npm run video                              # 錄 manifest 裡標了 video: true 的章節，全部語言
 *   npm run video -- --chapter camera-add      # 只錄一章
 *   npm run video -- --locale zh-Hant --gif    # 只錄一個語言，並多轉一份 GIF
 *   npm run video -- --narrate                 # 加上 TTS 旁白（Windows）
 *   npm run video -- --burn                    # 字幕燒進畫面（預設是可開關的字幕軌）
 *   npm run video -- --captions-only           # 不重錄，只用上次的時間軸重產字幕（正文改字時用）
 *
 * 產物：output/video/{locale}/{id}.webm（原檔）、.mp4、.srt、.vtt、.timeline.json，加上 --gif 時的 .gif。
 *
 * 跟 run.ts 的差別只在「每個 step 怎麼演」：
 * - click / fill 之前，先把假游標滑過去、點一下有漣漪；fill 改成一個字一個字打。
 * - screenshot 不拍照，改成畫上同一套標註、把 clip 以外調暗，停留幾秒讓觀眾看清楚。
 * - 每個 step 之後停一下，給觀眾時間跟上畫面的變化。
 *
 * 字幕（Day 25）：每個 step 開始、每個 screenshot 停留開始的時間都記進時間軸，
 * 字幕掛在這些錨點上（captions.ts）。下一句開始之前會先等上一句念完（沒有旁白就是讀完）—— 節奏由字幕決定。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright'
import { boot } from '../boot.js'
import { loadConfig, repoRoot } from '../config.js'
import {
  loadChapters,
  loadManual,
  pick,
  rel,
  selectLocales,
  tid,
  validateActions,
  validateLocales,
  type Chapter,
  type Step,
} from '../manifest.js'
import { annotate, clearAnnotations, locate } from '../overlay/annotate.js'
import { clickRipple, installCursor, moveCursor } from '../overlay/cursor.js'
import { cueTimes, planCues, readingMs, stepsHash, toSrt, toVtt, type Cue, type Timeline } from './captions.js'
import { sizeOf, toGif, toMp4 } from './encode.js'
import { synthesize } from './tts.js'

/** 節奏。數字是看了幾次成品之後調出來的，沒有標準答案。 */
const PACE = {
  leadIn: 1000, // 開始操作之前先停一下，讓觀眾看清楚起始畫面
  afterAction: 700, // 每個會改變畫面的動作之後
  typeDelay: 110, // fill 每個字的間隔
  hold: 2500, // screenshot 的位置：標註停留的時間
  tail: 2000, // 最後一步之後
  breath: 400, // 旁白一句念完到下一句開始之間的空檔
}

/** 字幕軌的語言標籤（ISO 639-2）。 */
const SUBTITLE_LANG: Record<string, string> = { 'zh-Hant': 'chi', en: 'eng' }

const SPOTLIGHT_ID = '__manual-spotlight'

const config = loadConfig()
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const flag = (name: string) => process.argv.includes(`--${name}`)
const only = arg('chapter')
const mode = (arg('mode') as 'electron' | 'web' | undefined) ?? config.app.mode
const gif = flag('gif')
const narrate = flag('narrate')
const burn = flag('burn')
const captionsOnly = flag('captions-only')

const videoDir = (locale: string) => path.join(repoRoot, config.paths.output, 'video', locale)

/** 到達某個錨點：記下時間；如果這裡有一句字幕，回傳它至少要停多久（旁白的長度，沒有旁白就是閱讀時間）。 */
type Reach = (anchor: string) => Promise<number>

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

async function playStep(page: Page, step: Step, i: number, locale: string, reach: Reach, next?: Step) {
  await reach(`${i}:start`)
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
    case 'screenshot': {
      // 停留期間把頁面的計時器暫停：字幕要 6 秒才讀得完，但 toast 3 秒就自己消失了。
      // 截圖是 toast 一出現就按快門，沒有這個問題；影片要停下來講解，就得讓 App 的時間也跟著停。
      // （bootstrap.clock 已經裝好 Playwright 的假時鐘，暫停只影響頁面裡的 setTimeout / setInterval）
      await page.clock.pauseAt(await page.evaluate(() => Date.now()))
      // 手冊在這裡放一張圖，影片就在這裡停下來，畫上同一套標註。
      // 這一句比預設的停留時間長，就停到念完（讀完）為止
      const speech = await reach(`${i}:hold`)
      if (step.clip) await spotlight(page, step.clip)
      if (step.annotate) await annotate(page, step.annotate)
      await page.waitForTimeout(Math.max(PACE.hold, speech + PACE.breath))
      await clearAnnotations(page)
      await page.evaluate((id) => document.getElementById(id)?.remove(), SPOTLIGHT_ID)
      await page.clock.resume()
      return
    }
    case 'wait':
      await page.waitForTimeout(500)
      return
  }
  // 下一步是 waitFor 就不停：等待本身加上 screenshot 的停留，已經夠觀眾看了。
  // 多停這一下，3 秒就消失的 toast 會在標註還掛著的時候先不見（截圖是一出現就拍，所以沒這個問題）
  if (next?.action !== 'waitFor') await page.waitForTimeout(PACE.afterAction)
}

/* ---------- 錄一章 ---------- */

async function record(chapter: Chapter, locale: string, cues: Cue[], webm: string, first: boolean): Promise<Timeline> {
  const dir = path.dirname(webm)
  const audio = narrate ? synthesize(cues, locale, path.join(dir, 'narration', chapter.id)) : undefined
  if (audio) {
    const total = [...audio.values()].reduce((sum, a) => sum + a.ms, 0)
    console.log(`  TTS ${audio.size} 句，共 ${(total / 1000).toFixed(1)}s`)
  }
  const needs = new Map(cues.map((c) => [c.anchor, audio?.get(c.anchor)?.ms ?? readingMs(c.text, locale)]))

  const { driver, page } = await boot(mode, first, locale)
  const { width, height } = loadManual().bootstrap.viewport
  const marks: Record<string, number> = {}
  let t0 = 0
  let speaking = { until: 0 }

  // 節奏的關鍵：下一句字幕要出來了，但上一句還沒念完（或還沒讀完）—— 那就等。
  const reach: Reach = async (anchor) => {
    const need = needs.get(anchor)
    if (need !== undefined) {
      const wait = speaking.until - Date.now()
      if (wait > 0) await page.waitForTimeout(wait)
      speaking = { until: Date.now() + need + PACE.breath }
    }
    marks[anchor] = Date.now() - t0
    return need ?? 0
  }

  try {
    await installCursor(page)
    // 開機（含注入狀態後的 reload）都做完了才開始錄，影片開頭不會有白畫面或閃一下
    await page.screencast.start({ path: webm, size: { width, height } })
    t0 = Date.now()
    await page.waitForTimeout(PACE.leadIn)
    for (const [i, step] of chapter.steps.entries()) {
      try {
        await playStep(page, step, i, locale, reach, chapter.steps[i + 1])
      } catch (cause) {
        throw new Error(`step ${i}（${step.action} ${step.testid ?? step.name ?? ''}）失敗：${(cause as Error).message}`)
      }
    }
    const speech = await reach('tail')
    // 最後一句也要念完才收尾
    await page.waitForTimeout(Math.max(PACE.tail, speech + PACE.breath, speaking.until - Date.now()))
    const end = Date.now() - t0
    await page.screencast.stop()
    console.log(`  錄完 ${(end / 1000).toFixed(1)}s -> ${rel(webm)}`)
    return { steps: stepsHash(chapter), narrated: narrate, marks, end }
  } finally {
    await driver.close()
  }
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

const what = captionsOnly ? '重產字幕（不重錄）' : narrate ? '錄影 + 旁白' : '錄影'
console.log(`${what}：${chapters.map((c) => c.id).join(' / ')} × ${locales.length} 種語言（${locales.join(' / ')}）  [${mode}]\n`)

let booted = 0
for (const locale of locales) {
  const dir = videoDir(locale)
  fs.mkdirSync(dir, { recursive: true })

  for (const chapter of chapters) {
    console.log(`● [${locale}] ${chapter.id}  ${pick(chapter.title, locale)}`)
    const base = path.join(dir, chapter.id)
    const webm = `${base}.webm`
    const timelineFile = `${base}.timeline.json`

    try {
      const { cues, warnings } = planCues(chapter, locale)
      for (const w of warnings) console.log(`  ⚠ ${w}`)

      let timeline: Timeline
      if (captionsOnly) {
        if (!fs.existsSync(timelineFile) || !fs.existsSync(webm)) throw new Error(`找不到上次錄的 ${rel(webm)} 或時間軸，要先錄一次`)
        timeline = JSON.parse(fs.readFileSync(timelineFile, 'utf-8'))
        if (timeline.steps !== stepsHash(chapter)) {
          throw new Error('manifest 的 steps 跟錄影時不一樣了，畫面已經對不上，只能重錄（拿掉 --captions-only）')
        }
        if (timeline.narrated) console.log('  ⚠ 這支影片有旁白。旁白是錄影當下念的，只換字幕不會換旁白 —— 字幕跟旁白可能對不上')
      } else {
        timeline = await record(chapter, locale, cues, webm, booted++ === 0)
        fs.writeFileSync(timelineFile, JSON.stringify(timeline, null, 2))
      }

      // 字幕：錨點 × 時間軸
      const timed = cueTimes(cues, timeline)
      const srt = `${base}.srt`
      fs.writeFileSync(srt, toSrt(timed))
      fs.writeFileSync(`${base}.vtt`, toVtt(timed))
      console.log(`  字幕 ${timed.length} 句 -> ${rel(srt)}、.vtt`)

      // 旁白：每句 wav 放在它的錨點時間
      const narrationDir = path.join(dir, 'narration', chapter.id)
      const narration = timeline.narrated
        ? cues
            .map((c) => ({ file: path.join(narrationDir, `${c.anchor.replace(':', '-')}.wav`), at: timeline.marks[c.anchor] }))
            .filter((n) => fs.existsSync(n.file))
        : []

      const mp4 = `${base}.mp4`
      toMp4(webm, mp4, { srt, lang: SUBTITLE_LANG[locale], burn, narration })
      const extras = [narration.length > 0 && '旁白', burn ? '字幕已燒入' : '字幕軌'].filter(Boolean).join('、')
      console.log(`  ffmpeg -> ${rel(mp4)}（${sizeOf(mp4)}，${extras}）`)
      if (gif) {
        const out = `${base}.gif`
        toGif(webm, out, { srt, burn })
        console.log(`  ffmpeg -> ${rel(out)}（${sizeOf(out)}）`)
      }
    } catch (e) {
      console.error(`✖ [${locale}] ${chapter.id}  ${(e as Error).message}`)
      process.exit(1)
    }
  }
}
