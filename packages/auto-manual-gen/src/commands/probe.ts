/**
 * 探勘：印出當前畫面所有可見且具 data-testid 的元件，連同文字內容與 boundingBox。
 * 餵給 agent 的關鍵素材 —— 寫章節之前先問畫面上真的有什麼，而不是憑記憶猜 selector。
 *
 *   auto-manual-gen probe --mode web
 *   auto-manual-gen probe --mode web --after click:camera-add
 *   auto-manual-gen probe --mode web --after dblclick:camera-row_lobby-01,click:nav-tab_settings
 *   auto-manual-gen probe --mode web --locale en    # 看英文版畫面上的文字（寫英文正文前先探勘）
 *
 * `--after` 是一串用逗號分隔的 `action:testid`，依序執行再探勘 ——
 * 條件渲染的對話框、設定子項在首頁探勘不到，必須先做幾個操作才看得見。
 */
import type { Page } from 'playwright'
import { boot } from '../boot.js'
import { contentError, usageError } from '../errors.js'
import { loadManual, selectLocales, tid } from '../manifest.js'
import type { AppMode } from '../project.js'
import { ui } from '../ui.js'

export type ProbeOptions = { mode?: AppMode; after?: string; locale?: string }

type Probed = { testid: string; text: string; box: { x: number; y: number; width: number; height: number } }

/** probe 只用得到 click / dblclick，其餘動作探勘畫面時用不太到，先不支援。 */
async function runAfter(page: Page, spec: string) {
  for (const step of spec.split(',')) {
    const [action, testid] = step.split(':')
    if (!testid) throw usageError('INVALID_ARGUMENT', `--after 格式錯誤：「${step}」，應該是 action:testid，例如 click:camera-add`)
    if (action !== 'click' && action !== 'dblclick') throw usageError('INVALID_ARGUMENT', `--after 不支援 action「${action}」，可用的有：click / dblclick`)
    const locator = page.locator(tid(testid))
    if ((await locator.count()) === 0) throw contentError('SELECTOR_NOT_FOUND', `--after 找不到 testid「${testid}」`, { testid })

    if (action === 'click') await locator.click()
    else await locator.dblclick()
  }
}

async function inventory(page: Page): Promise<{ visible: Probed[]; total: number }> {
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

export async function probe(opts: ProbeOptions) {
  // 語言寫錯就在開機前擋下來
  if (opts.locale) selectLocales(loadManual(), opts.locale)
  const { driver, page } = await boot(opts.mode, true, opts.locale)

  try {
    if (opts.after) await runAfter(page, opts.after)

    const { visible, total } = await inventory(page)
    const viewport = page.viewportSize()

    ui.info(`畫面：${opts.after ?? '首頁'}   ${viewport?.width}×${viewport?.height}`)
    ui.info(`可見且具 testid：${visible.length} 個（整份 DOM 共 ${total} 個）\n`)

    const nameWidth = Math.min(28, Math.max(...visible.map((v) => v.testid.length), 8))
    for (const v of visible) {
      const label = v.text ? `「${v.text}」` : '（空白）'
      const rect = `x=${v.box.x} y=${v.box.y} w=${v.box.width} h=${v.box.height}`
      ui.info(`${v.testid.padEnd(nameWidth)}  ${label.padEnd(20)}  ${rect}`)
    }

    return { after: opts.after ?? null, viewport, total, visible }
  } finally {
    await driver.close()
  }
}
