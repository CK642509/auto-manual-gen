import { ref } from 'vue'

export interface Toast {
  id: number
  message: string
}

/**
 * Toast 通知：**刻意設計成 3 秒後自動消失**。
 *
 * 這是這個 App 埋的坑之一 —— 對截圖產線來說，toast 是典型的
 * 「等太久就拍到空氣」情境，逼產線必須用語意訊號（等 toast 出現）
 * 而不是固定延遲來決定快門時機。
 *
 * 產線要穩定拍到 toast 有兩條路：把 `TOAST_DURATION` 用注入的方式加長，
 * 或是在 toast 出現的當下立刻截圖，不要在中間插入其他等待。
 */
export const TOAST_DURATION = 3000

/** 同時最多疊三則，超過就把最舊的擠掉，避免整片蓋住右下角的畫面 */
export const TOAST_MAX = 3

const toasts = ref<Toast[]>([])
let seq = 0

export function useToast() {
  function push(message: string) {
    const id = ++seq
    toasts.value = [...toasts.value, { id, message }].slice(-TOAST_MAX)
    window.setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, TOAST_DURATION)
  }

  return { toasts, push }
}
