/**
 * 假游標（錄影專用）。
 *
 * Playwright 的操作是直接對元素派發事件，畫面上不會有真的滑鼠游標；錄出來的影片只看得到
 * 按鈕自己亮了一下，觀眾不知道「剛剛點了哪裡」。所以跟標註一樣，用一層 DOM 疊層畫一個游標上去。
 *
 * 動畫用 Web Animations API（`element.animate`）而不是 CSS transition：
 * bootstrap 的 disableAnimations 會注入 `* { animation: none; transition: none }`（!important）關掉所有轉場，
 * 游標也是 body 底下的元素，走 CSS 的話會被一起關掉，WAAPI 則不受影響。
 */
import type { Page } from 'playwright'

const CURSOR_ID = '__manual-cursor'

/** 放一個游標到畫面上（先停在畫面中央偏下，不擋住任何東西）。重複呼叫只會有一個。 */
export async function installCursor(page: Page) {
  await page.evaluate((id) => {
    if (document.getElementById(id)) return
    const cursor = document.createElement('div')
    cursor.id = id
    // 熱點在箭頭尖端，也就是這個 div 的左上角 —— 移動時直接把左上角對到目標座標
    cursor.style.cssText = `
      position:fixed; left:0; top:0; width:28px; height:28px;
      pointer-events:none; z-index:1000000;
      transform:translate(${innerWidth / 2}px, ${innerHeight * 0.6}px);
      filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35));
    `
    cursor.innerHTML = `
      <svg viewBox="0 0 28 28" width="28" height="28">
        <path d="M3 2 L3 22 L8.5 17 L12.5 26 L16 24.5 L12 15.5 L19.5 15.5 Z"
              fill="#111" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>
      </svg>`
    document.body.appendChild(cursor)
  }, CURSOR_ID)
}

/**
 * 把游標滑到 (x, y)。距離越遠滑越久，但有上下限：
 * 太快觀眾跟不上，太慢又拖戲。等動畫播完才 resolve，所以接下來的點擊不會搶在游標到位之前。
 */
export async function moveCursor(page: Page, x: number, y: number) {
  await page.evaluate(
    async ({ id, x, y }) => {
      const cursor = document.getElementById(id)
      if (!cursor) return
      const from = new DOMMatrix(getComputedStyle(cursor).transform)
      const distance = Math.hypot(x - from.m41, y - from.m42)
      const duration = Math.min(1000, Math.max(350, 300 + distance * 0.6))
      const to = `translate(${x}px, ${y}px)`
      await cursor.animate([{ transform: from.toString() }, { transform: to }], { duration, easing: 'ease-in-out' }).finished
      cursor.style.transform = to
    },
    { id: CURSOR_ID, x, y },
  )
}

/** 在游標目前的位置放一圈漣漪，當作「按下去了」的視覺回饋。不等它播完，讓漣漪跟真正的點擊同時發生。 */
export async function clickRipple(page: Page) {
  await page.evaluate((id) => {
    const cursor = document.getElementById(id)
    if (!cursor) return
    const { m41: x, m42: y } = new DOMMatrix(getComputedStyle(cursor).transform)
    const ripple = document.createElement('div')
    ripple.style.cssText = `
      position:fixed; left:${x - 18}px; top:${y - 18}px; width:36px; height:36px;
      border-radius:50%; border:3px solid #ff3b30; background:rgba(255,59,48,0.18);
      pointer-events:none; z-index:999999;
    `
    document.body.appendChild(ripple)
    ripple
      .animate(
        [
          { transform: 'scale(0.3)', opacity: 1 },
          { transform: 'scale(1.4)', opacity: 0 },
        ],
        { duration: 500, easing: 'ease-out' },
      )
      .finished.then(() => ripple.remove())
  }, CURSOR_ID)
}
