/**
 * 產線的執行者：讀 manifest → 一章一次開機 → 產出截圖。
 *
 *   npm run manual                            # 整本重跑
 *   npm run manual -- --chapter layout-preset # 只重跑一章
 *   npm run manual -- --mode web              # 指定形態（web 要先 npm run demo）
 *
 * 純執行者，不做任何判斷：manifest 說什麼就做什麼，做不到就帶著線索失敗。
 * 動詞的實作目前都還在這一支，之後會拆進 actions/ 與 capture/ 與 overlay/。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright'
import { loadConfig, repoRoot } from './config.js'
import { boot, loadManual } from './boot.js'
import { loadChapters, validateActions, tid, rel, type Annotation, type Rect, type Step } from './manifest.js'

const config = loadConfig()

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const only = arg('chapter')
const mode = (arg('mode') as 'electron' | 'web' | undefined) ?? config.app.mode

/** 手冊要用的圖，扁平放置 —— 章節 id 就是檔名前綴（`screenshots/{id}-NN.png`）。 */
const SHOTS = path.join(repoRoot, config.paths.screenshots)

/** 失敗現場：只給除錯用，不會被合進手冊，所以跟成品分開放。 */
const FAILURES = path.join(repoRoot, config.paths.output, 'failures')

const OVERLAY_ID = '__manual-overlay'
const PAD = 4
const R = 14

/* ---------- 執行 ---------- */

/** 找不到 testid 時，順手把畫面上有的列出來當候選 —— agent 才修得動。 */
async function locate(page: Page, testid: string, where = 'testid') {
  const locator = page.locator(tid(testid))
  if ((await locator.count()) > 0) return locator

  const available: string[] = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid]')].map((el) => (el as HTMLElement).dataset.testid!),
  )

  // 候選清單要從最長的共同前綴開始找：grid-cell-fps_1 找不到時，
  // 該列出的是 grid-cell-* 這一群，而不是整個 grid-* 的前八個。
  const segments = testid.split(/(?=[-_])/)
  let prefix = ''
  let near: string[] = []
  for (let i = segments.length; i > 0 && near.length === 0; i--) {
    prefix = segments.slice(0, i).join('')
    near = available.filter((t) => t.startsWith(prefix))
  }

  throw new Error(
    `找不到 ${where}「${testid}」\n` +
      `  目前畫面上有 ${available.length} 個 testid，其中 ${prefix}* 開頭的有：\n` +
      `    ${(near.length > 0 ? near : available).slice(0, 8).join(' / ')}`,
  )
}

async function annotate(page: Page, items: Annotation[]) {
  const boxes: (Rect & { label: string; badge?: Annotation['badge'] })[] = []
  for (const [i, item] of items.entries()) {
    const box = await (await locate(page, item.testid, `annotate[${i}].testid`)).boundingBox()
    if (!box) throw new Error(`annotate[${i}].testid「${item.testid}」存在但不可見`)
    boxes.push({ ...box, label: String(i + 1), badge: item.badge })
  }

  await page.evaluate(
    ({ boxes, id, PAD, R }) => {
      const overlay = document.createElement('div')
      overlay.id = id
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999999;'
      for (const t of boxes) {
        const box = document.createElement('div')
        box.style.cssText = `
          position:absolute;
          left:${t.x - PAD}px; top:${t.y - PAD}px;
          width:${t.width + PAD * 2}px; height:${t.height + PAD * 2}px;
          border:3px solid #ff3b30; border-radius:6px;
          box-shadow:0 0 0 2px rgba(255,255,255,0.9);
        `
        // 預設掛在左上角；badge: left 改掛左邊框的垂直中點，給上方有標籤文字的欄位用。
        // left 模式下目標太小（例如 ✕ 按鈕）時整顆移到框外，不然圓標會把目標本身蓋掉
        const small = t.width < R * 4
        const [left, top] =
          t.badge === 'left'
            ? [small ? t.x - PAD - R * 2 - 4 : t.x - PAD - R, t.y + t.height / 2 - R]
            : [t.x - PAD - R, t.y - PAD - R]
        const badge = document.createElement('div')
        badge.textContent = t.label
        badge.style.cssText = `
          position:absolute;
          left:${left}px; top:${top}px;
          width:${R * 2}px; height:${R * 2}px; border-radius:50%;
          background:#ff3b30; color:#fff;
          display:flex; align-items:center; justify-content:center;
          font:bold 14px/1 system-ui, sans-serif;
          box-shadow:0 0 0 2px rgba(255,255,255,0.9);
        `
        overlay.appendChild(box)
        overlay.appendChild(badge)
      }
      document.body.appendChild(overlay)
    },
    { boxes, id: OVERLAY_ID, PAD, R },
  )
}

async function runStep(page: Page, step: Step) {
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
      await (await locate(page, step.testid!)).fill(step.text!)
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
      await page.screenshot({ path: path.join(SHOTS, `${step.name}.png`), clip })
      await page.evaluate((id) => document.getElementById(id)?.remove(), OVERLAY_ID)
      return
    }
    case 'wait':
      await page.waitForTimeout(500)
      return
  }
}

/* ---------- 主流程 ---------- */

const manual = loadManual()

const all = loadChapters()
const chapters = only ? all.filter((c) => c.id === only) : all

if (only && chapters.length === 0) {
  console.error(`找不到章節「${only}」，可用的有：${all.map((c) => c.id).join(' / ')}`)
  process.exit(1)
}

const problems = chapters.flatMap(validateActions)
if (problems.length > 0) {
  console.error(`manifest 驗證失敗（${problems.length} 個問題）：\n${problems.map((e) => `  - ${e}`).join('\n')}`)
  process.exit(1)
}

console.log(
  only
    ? `manifest: ${manual.profile} ${manual.version}  只跑 1 章（--chapter ${only}）  [${mode}]\n`
    : `manifest: ${manual.profile} ${manual.version}  共 ${chapters.length} 章  [${mode}]\n`,
)

const startedAt = Date.now()

for (const [n, chapter] of chapters.entries()) {
  // 清空的單位是「一章」：靠檔名前綴就認得出哪些圖是這一章的，不需要另外維護索引。
  for (const f of fs.existsSync(SHOTS) ? fs.readdirSync(SHOTS) : []) {
    if (f.startsWith(`${chapter.id}-`)) fs.rmSync(path.join(SHOTS, f))
  }
  const failureDir = path.join(FAILURES, chapter.id)
  fs.rmSync(failureDir, { recursive: true, force: true })
  fs.mkdirSync(SHOTS, { recursive: true })

  const label = `[${n + 1}/${chapters.length}] ${chapter.id}`
  console.log(`▶ ${label}  ${chapter.title}`)

  const { driver, page } = await boot(mode, n === 0)
  const t0 = Date.now()
  let shots = 0

  for (const [i, step] of chapter.steps.entries()) {
    try {
      await runStep(page, step)
      if (step.action === 'screenshot') shots++
    } catch (cause) {
      // 失敗要留下線索：整頁截圖 + DOM dump + step index + 當下可用的 testid
      fs.mkdirSync(failureDir, { recursive: true })
      const shot = path.join(failureDir, 'failure.png')
      const dom = path.join(failureDir, 'failure.html')
      await page.screenshot({ path: shot, fullPage: true })
      fs.writeFileSync(dom, await page.content())

      const brief = JSON.stringify({ action: step.action, name: step.name, testid: step.testid })
      console.error(
        `✖ ${label}  step ${i} 失敗：${brief}\n` +
          `${(cause as Error).message}\n` +
          `  失敗當下的畫面：${rel(shot)}\n` +
          `  失敗當下的 DOM：${rel(dom)}\n` +
          `  修好之後只要重跑這一章：npm run manual -- --chapter ${chapter.id}`,
      )

      const rest = chapters.slice(n + 1).map((c) => c.id)
      if (rest.length > 0) console.error(`  尚未執行的章節：${rest.join(' / ')}`)

      await driver.close()
      process.exit(1)
    }
  }

  await driver.close()
  const unit = shots > 1 ? 'shots' : 'shot'
  console.log(`✔ ${label}  ${chapter.steps.length} steps / ${shots} ${unit}  ${((Date.now() - t0) / 1000).toFixed(1)}s\n`)
}

console.log(`完成 ${chapters.length} 章，總共 ${((Date.now() - startedAt) / 1000).toFixed(1)}s -> ${rel(SHOTS)}/`)
