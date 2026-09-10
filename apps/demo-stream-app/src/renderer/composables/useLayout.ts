import { computed, ref, watch } from 'vue'

export type LayoutMode = '1x1' | '2x2' | '3x3' | '4x4'

export const LAYOUT_MODES: LayoutMode[] = ['1x1', '2x2', '3x3', '4x4']

/** 每種版面顯示幾格 */
export const CELL_COUNT: Record<LayoutMode, number> = {
  '1x1': 1,
  '2x2': 4,
  '3x3': 9,
  '4x4': 16,
}

/** cells 固定長度 16，切到較小的版面只是少顯示幾格，配置本身不會被丟掉 */
export const MAX_CELLS = 16

export interface LayoutPreset {
  id: string
  name: string
  mode: LayoutMode
  cells: (string | null)[]
}

/**
 * 版面狀態存 localStorage，跟 locale / role 同一套機制。
 *
 * 這讓產線可以用 `addInitScript` 預先注入一組「已經配置好的 3×3 版面」，
 * 直接跳到該畫面截圖，不必每一章都從空版面開始重新填 9 格。
 */
const STORAGE_LAYOUT = 'layout'
const STORAGE_PRESETS = 'presets'

function emptyCells(): (string | null)[] {
  return Array.from({ length: MAX_CELLS }, () => null)
}

function readLayout(): { mode: LayoutMode; cells: (string | null)[] } {
  try {
    const raw = localStorage.getItem(STORAGE_LAYOUT)
    if (!raw) return { mode: '2x2', cells: emptyCells() }
    const parsed = JSON.parse(raw)
    const mode: LayoutMode = LAYOUT_MODES.includes(parsed?.mode) ? parsed.mode : '2x2'
    const cells = emptyCells()
    if (Array.isArray(parsed?.cells)) {
      parsed.cells.slice(0, MAX_CELLS).forEach((id: unknown, i: number) => {
        cells[i] = typeof id === 'string' ? id : null
      })
    }
    return { mode, cells }
  } catch {
    return { mode: '2x2', cells: emptyCells() }
  }
}

function readPresets(): LayoutPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_PRESETS)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const initial = readLayout()
const mode = ref<LayoutMode>(initial.mode)
const cells = ref<(string | null)[]>(initial.cells)
const presets = ref<LayoutPreset[]>(readPresets())
const appliedPresetId = ref<string | null>(null)

watch(
  [mode, cells],
  () => {
    localStorage.setItem(
      STORAGE_LAYOUT,
      JSON.stringify({ mode: mode.value, cells: cells.value }),
    )
  },
  { deep: true },
)

watch(
  presets,
  () => localStorage.setItem(STORAGE_PRESETS, JSON.stringify(presets.value)),
  { deep: true },
)

export function useLayout() {
  /** 目前版面實際顯示的格子（未顯示的格子仍保留配置） */
  const visibleCells = computed(() => cells.value.slice(0, CELL_COUNT[mode.value]))

  const assignedCount = computed(() => visibleCells.value.filter(Boolean).length)

  function setMode(next: LayoutMode) {
    mode.value = next
  }

  /**
   * 雙擊清單項目時呼叫：依序填入第一個空格。
   * 回傳 1-based 的格號；沒有空格回傳 `null`，重複則回傳 `'duplicate'`。
   */
  function assignToNextEmpty(cameraId: string): number | null | 'duplicate' {
    if (visibleCells.value.includes(cameraId)) return 'duplicate'
    const index = visibleCells.value.findIndex((c) => c === null)
    if (index === -1) return null
    cells.value[index] = cameraId
    return index + 1
  }

  /** 清掉單一格子，不動其他格 */
  function clearCell(index: number) {
    cells.value[index] = null
  }

  function clearAll() {
    cells.value = emptyCells()
    appliedPresetId.value = null
  }

  /** 攝影機被刪除時，把它從版面與所有已存版面設定裡一併移除 */
  function detachCamera(cameraId: string) {
    cells.value = cells.value.map((c) => (c === cameraId ? null : c))
    presets.value = presets.value.map((p) => ({
      ...p,
      cells: p.cells.map((c) => (c === cameraId ? null : c)),
    }))
  }

  function savePreset(name: string): LayoutPreset {
    const preset: LayoutPreset = {
      id: `preset-${Date.now()}`,
      name,
      mode: mode.value,
      cells: [...cells.value],
    }
    presets.value.push(preset)
    appliedPresetId.value = preset.id
    return preset
  }

  function applyPreset(id: string): LayoutPreset | undefined {
    const preset = presets.value.find((p) => p.id === id)
    if (!preset) return undefined
    mode.value = preset.mode
    const next = emptyCells()
    preset.cells.slice(0, MAX_CELLS).forEach((c, i) => (next[i] = c))
    cells.value = next
    appliedPresetId.value = preset.id
    return preset
  }

  return {
    mode,
    cells,
    presets,
    appliedPresetId,
    visibleCells,
    assignedCount,
    setMode,
    assignToNextEmpty,
    clearCell,
    clearAll,
    detachCamera,
    savePreset,
    applyPreset,
  }
}
