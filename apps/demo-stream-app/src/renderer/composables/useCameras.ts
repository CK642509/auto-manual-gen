import { ref } from 'vue'
import { FALLBACK_CAMERAS, type Camera } from '../data/cameras'

/**
 * 清單刻意做成非同步載入，載入期間顯示骨架屏。
 *
 * 為什麼要打一支注定失敗的 API：這支請求的存在，就是為了讓產線有東西可以
 * 攔截 —— `page.route('**\/api/cameras', ...)` 換成 fixture JSON 之後，
 * 手冊每次拍到的清單內容就完全固定。
 * 沒有攔截時（一般開發、Electron 的 file:// 協定）一律退回內建假資料，
 * 所以離線也跑得起來。
 */
const MIN_SKELETON_MS = 450

const cameras = ref<Camera[]>([])
const loading = ref(true)

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function fetchCameras(): Promise<Camera[]> {
  try {
    const res = await fetch('./api/cameras')
    if (!res.ok) return FALLBACK_CAMERAS
    const data = await res.json()
    return Array.isArray(data) ? (data as Camera[]) : FALLBACK_CAMERAS
  } catch {
    // file:// 協定、404、非 JSON 回應都走這裡。
    return FALLBACK_CAMERAS
  }
}

export function useCameras() {
  async function load() {
    loading.value = true
    // 骨架屏至少顯示這麼久，否則 fixture 回得太快，
    // 讀者根本看不到「載入中」這個狀態長什麼樣子。
    const [data] = await Promise.all([fetchCameras(), delay(MIN_SKELETON_MS)])
    cameras.value = data.map((c) => ({ ...c }))
    loading.value = false
  }

  function find(id: string) {
    return cameras.value.find((c) => c.id === id)
  }

  /** 由顯示名稱推導語意 key，維持 `camera-row_{id}` 的可讀性 */
  function toId(name: string) {
    const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const seed = base || 'camera'
    if (!find(seed)) return seed
    let n = 2
    while (find(`${seed}-${n}`)) n += 1
    return `${seed}-${n}`
  }

  function create(draft: Omit<Camera, 'id'>) {
    const camera: Camera = { ...draft, id: toId(draft.name) }
    cameras.value.push(camera)
    return camera
  }

  function update(id: string, draft: Omit<Camera, 'id'>) {
    const index = cameras.value.findIndex((c) => c.id === id)
    if (index === -1) return
    cameras.value[index] = { ...draft, id }
  }

  function remove(id: string) {
    cameras.value = cameras.value.filter((c) => c.id !== id)
  }

  return { cameras, loading, load, find, create, update, remove }
}
