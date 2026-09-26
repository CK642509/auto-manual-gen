/**
 * 探勘：印出當前畫面所有可見且具 data-testid 的元件，連同文字內容與 boundingBox。
 * 餵給 agent 的關鍵素材 —— 寫章節之前先問畫面上真的有什麼，而不是憑記憶猜 selector。
 *
 *   npm run probe -- --mode web
 *   npm run probe -- --mode web --after click:camera-add
 *   npm run probe -- --mode web --after dblclick:camera-row_lobby-01,click:nav-tab_settings
 *
 * `--after` 是一串用逗號分隔的 `action:testid`，依序執行再探勘 ——
 * 條件渲染的對話框、設定子項在首頁探勘不到，必須先做幾個操作才看得見。
 */
import type { Page } from 'playwright'
import { boot } from './boot.js'
import { tid } from './manifest.js'

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const mode = arg('mode') as 'electron' | 'web' | undefined
const after = arg('after')

type Probed = { testid: string; text: string; box: { x: number; y: number; width: number; height: number } }

/** probe 只用得到 click / dblclick，其餘動作探勘畫面時用不太到，先不支援。 */
async function runAfter(page: Page, spec: string) {
  for (const step of spec.split(',')) {
    const [action, testid] = step.split(':')
    if (!testid) throw new Error(`--after 格式錯誤：「${step}」，應該是 action:testid，例如 click:camera-add`)
    const locator = page.locator(tid(testid))
    if ((await locator.count()) === 0) throw new Error(`--after 找不到 testid「${testid}」`)

    if (action === 'click') await locator.click()
    else if (action === 'dblclick') await locator.dblclick()
    else throw new Error(`--after 不支援 action「${action}」，可用的有：click / dblclick`)
  }
}

async function probe(page: Page): Promise<{ visible: Probed[]; total: number }> {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll<HTMLElement>('[data-testid]')]
    const visible = all
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
      })
      .map((el) => {
        const r = el.getBoundingClientRect()
        const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
        return {
          testid: el.dataset.testid!,
          text,
          box: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
        }
      })
    return { visible, total: all.length }
  })
}

const { driver, page } = await boot(mode)

try {
  if (after) await runAfter(page, after)

  const { visible, total } = await probe(page)
  const viewport = page.viewportSize()

  console.log(`畫面：monitor（${after ?? '首頁'}）   ${viewport?.width}×${viewport?.height}`)
  console.log(`可見且具 testid：${visible.length} 個（整份 DOM 共 ${total} 個）\n`)

  const nameWidth = Math.min(28, Math.max(...visible.map((v) => v.testid.length), 8))
  for (const v of visible) {
    const label = v.text ? `「${v.text}」` : '（空白）'
    const rect = `x=${v.box.x} y=${v.box.y} w=${v.box.width} h=${v.box.height}`
    console.log(`${v.testid.padEnd(nameWidth)}  ${label.padEnd(20)}  ${rect}`)
  }
} finally {
  await driver.close()
}
