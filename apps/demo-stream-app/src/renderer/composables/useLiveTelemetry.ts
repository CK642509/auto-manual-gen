import { onBeforeUnmount, ref } from 'vue'

/**
 * 即時畫面的兩個時脈，整個 App 共用一份。
 *
 * 這裡是產線最難拍的東西的來源，刻意保留：
 *   - `now`   每秒跳動 → 時間戳每張截圖都不同
 *   - `frame` 每 1.2 秒 tick → 偵測數與 FPS 重算
 *
 * 加上 `style.css` 裡持續飄移的偵測框動畫，同一章連拍兩次一定得到兩張不同的圖。
 * 產線必須用「凍結時間 + 攔截資料 + 停用動畫」三招一起把它壓平。
 */
const CLOCK_MS = 1000
const FRAME_MS = 1200

const now = ref(new Date())
const frame = ref(0)
let subscribers = 0
let clockTimer: number | undefined
let frameTimer: number | undefined

function start() {
  if (subscribers > 0) return
  clockTimer = window.setInterval(() => (now.value = new Date()), CLOCK_MS)
  frameTimer = window.setInterval(() => (frame.value += 1), FRAME_MS)
}

function stop() {
  if (subscribers > 0) return
  window.clearInterval(clockTimer)
  window.clearInterval(frameTimer)
  clockTimer = undefined
  frameTimer = undefined
}

export function useLiveTelemetry() {
  subscribers += 1
  start()

  onBeforeUnmount(() => {
    subscribers -= 1
    stop()
  })

  return { now, frame }
}

/** 時間戳格式固定為 `YYYY-MM-DD HH:mm:ss`，不受系統地區設定影響 */
export function formatTimestamp(date: Date) {
  return date.toLocaleString('sv-SE').replace('T', ' ').slice(0, 19)
}
