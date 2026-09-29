/**
 * DOM 疊層：框線與編號圓標（Day 11–12）。
 *
 * 截圖（`run.ts`）與錄影（`video/record.ts`）共用同一套渲染 ——
 * 標註畫在頁面上而不是事後畫在圖上，所以兩種產出看到的標號長得一模一樣。
 */
import type { Page } from 'playwright'
import { tid, type Annotation, type Rect } from '../manifest.js'

const OVERLAY_ID = '__manual-overlay'
const PAD = 4
const R = 14

/** 找不到 testid 時，順手把畫面上有的列出來當候選 —— agent 才修得動。 */
export async function locate(page: Page, testid: string, where = 'testid') {
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

export async function annotate(page: Page, items: Annotation[]) {
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

/** 拍完（或錄完）就拿掉，不然會跟到下一張。 */
export async function clearAnnotations(page: Page) {
  await page.evaluate((id) => document.getElementById(id)?.remove(), OVERLAY_ID)
}
