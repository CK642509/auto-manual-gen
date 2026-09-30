/**
 * App 內導覽（Day 26）。
 *
 * 導覽的內容**不是在這裡寫的**：`tours.json` 由手冊產線的 `npm run tour` 從 manifest 與正文產生，
 * 跟 i18n 檔一樣進版控、跟著 App 一起打包。這裡只負責把它轉成 driver.js 的步驟。
 *
 * 跟截圖最大的不同：截圖是 runner 替使用者操作，導覽是請使用者自己操作。
 * 所以 click 要等使用者真的點了才往下，fill 要等使用者輸入完按「下一步」。
 */
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { translate, type Locale } from '../locales'
import tourFile from './tours.json'

type TourStep = {
  kind: 'click' | 'dblclick' | 'fill' | 'info' | 'done'
  testid?: string
  title?: string
  text?: string
  example?: string
}
export type Tour = { id: string; title: string; steps: TourStep[] }

const tours = tourFile.tours as Record<Locale, Tour[]>

export const toursFor = (locale: Locale): Tour[] => tours[locale] ?? []

/** click 之後要等下一個畫面出現（例如對話框），最多等這麼久。 */
const WAIT_FOR_ELEMENT = 3000

function toDriveStep(step: TourStep, locale: Locale): DriveStep {
  const t = (key: string, params?: Record<string, string | number>) => translate(locale, key, params)
  const element = step.testid ? `[data-testid="${step.testid}"]` : undefined
  const description = step.kind === 'fill' ? t('tour.example', { value: step.example ?? '' }) : step.text

  const base: DriveStep = { element, waitForElement: WAIT_FOR_ELEMENT, popover: { title: step.title, description } }

  switch (step.kind) {
    case 'click':
      // 不給「下一步」：使用者要自己點這個元件，點了才往下
      return { ...base, advanceOnClick: true, popover: { ...base.popover, showButtons: ['close'] } }

    case 'dblclick': {
      // driver.js 只認得 click（雙擊的第一下就會往下），雙擊自己聽
      let off = () => {}
      return {
        ...base,
        popover: { ...base.popover, showButtons: ['close'] },
        onHighlighted: (el, _step, { driver: d }) => {
          const next = () => d.moveNext()
          el?.addEventListener('dblclick', next, { once: true })
          off = () => el?.removeEventListener('dblclick', next)
        },
        onDeselected: () => off(),
      }
    }

    case 'fill':
      // 游標直接放進欄位，使用者不用再點一次
      return { ...base, onHighlighted: (el) => (el as HTMLElement | undefined)?.focus() }

    default:
      return base
  }
}

export function startTour(tour: Tour, locale: Locale) {
  const t = (key: string) => translate(locale, key)
  const d = driver({
    steps: tour.steps.map((s) => toDriveStep(s, locale)),
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: t('tour.next'),
    doneBtnText: t('tour.done'),
    // 操作有副作用（點了「新增攝影機」對話框就開了），倒帶回去畫面也回不去，所以只能往前
    showButtons: ['next', 'close'],
    // 預設的方向鍵會換步驟 —— 使用者在欄位裡按 ← → 移動游標，導覽就跳走了
    allowKeyboardControl: false,
    // 點到遮罩外面不要直接結束，使用者常常只是想點畫面
    overlayClickBehavior: () => {},
  })
  d.drive()
  return d
}
