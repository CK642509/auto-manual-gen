import { reactive } from 'vue'

export type Sensitivity = 'low' | 'medium' | 'high'

export interface Settings {
  alert: { enabled: boolean; sound: boolean; retention: number }
  motion: { enabled: boolean; sensitivity: Sensitivity }
  face: { enabled: boolean; threshold: number }
}

const STORAGE_KEY = 'settings'

export function defaultSettings(): Settings {
  return {
    alert: { enabled: true, sound: true, retention: 30 },
    motion: { enabled: true, sensitivity: 'medium' },
    face: { enabled: false, threshold: 75 },
  }
}

function read(): Settings {
  const base = defaultSettings()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw)
    return {
      alert: { ...base.alert, ...parsed?.alert },
      motion: { ...base.motion, ...parsed?.motion },
      face: { ...base.face, ...parsed?.face },
    }
  } catch {
    return base
  }
}

const settings = reactive<Settings>(read())

/**
 * 設定同樣讀寫 localStorage，產線可以直接注入一組固定設定。
 *
 * 注意子項是**條件渲染**（總開關關掉時，子設定整塊從 DOM 消失，
 * 而不是只被隱藏）—— 這是刻意的，用來示範那個坑：
 * selector 找不到元件時，第一個要懷疑的是前置狀態沒有準備好。
 */
export function useSettings() {
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }

  function reset() {
    Object.assign(settings, defaultSettings())
    save()
  }

  return { settings, save, reset }
}
