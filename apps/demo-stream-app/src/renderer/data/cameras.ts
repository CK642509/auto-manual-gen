/**
 * 攝影機資料。
 *
 * 這份陣列是 `fetch('./api/cameras')` 失敗時的**內建 fallback**，
 * 不是唯一的資料來源 —— 產線可以用 Playwright 的 `page.route()` 把那支請求
 * 換成 fixture JSON，讓手冊每次拍到的清單內容完全一致。
 *
 * 兩件刻意的設計：
 *   1. `id` 是**語意 key**（`gate-a`）而不是索引，testid 直接沿用它，
 *      清單重新排序或篩選都不會讓 selector 錯位。
 *   2. `source` 內嵌了帳號密碼、`username` / `password` 是獨立欄位 ——
 *      這三個都是截圖前必須遮蔽的目標。
 */

export type CameraState = 'running' | 'stopped' | 'offline'

export interface Camera {
  /** 語意 key，同時是 `camera-row_{id}` 的變體後綴 */
  id: string
  /** 顯示名稱。刻意用不需要翻譯的代號形式，符合監控系統的實務慣例 */
  name: string
  /** 安裝位置，值是 i18n key 的後綴（`zone.gate`），切語言時會跟著變 */
  zone: string
  /** RTSP 位址，**含帳密，機敏** */
  source: string
  /** 登入帳號，**機敏** */
  username: string
  /** 登入密碼，**機敏** */
  password: string
  state: CameraState
}

export const FALLBACK_CAMERAS: Camera[] = [
  { id: 'gate-a', name: 'Gate-A', zone: 'gate', source: 'rtsp://10.0.4.21/live', username: 'admin', password: 'Pa55w0rd!21', state: 'running' },
  { id: 'gate-b', name: 'Gate-B', zone: 'gate', source: 'rtsp://10.0.4.22/live', username: 'admin', password: 'Pa55w0rd!22', state: 'running' },
  { id: 'lobby-01', name: 'Lobby-01', zone: 'lobby', source: 'rtsp://10.0.4.23/live', username: 'admin', password: 'Pa55w0rd!23', state: 'running' },
  { id: 'lobby-02', name: 'Lobby-02', zone: 'lobby', source: 'rtsp://10.0.4.24/live', username: 'admin', password: 'Pa55w0rd!24', state: 'running' },
  { id: 'dock-03', name: 'Dock-03', zone: 'dock', source: 'rtsp://10.0.4.25/live', username: 'ops', password: 'Dock#2024', state: 'stopped' },
  { id: 'parking-b1', name: 'Parking-B1', zone: 'parking', source: 'rtsp://10.0.4.26/live', username: 'admin', password: 'Pa55w0rd!26', state: 'running' },
  { id: 'parking-b2', name: 'Parking-B2', zone: 'parking', source: 'rtsp://10.0.4.27/live', username: 'admin', password: 'Pa55w0rd!27', state: 'running' },
  { id: 'corridor-2f', name: 'Corridor-2F', zone: 'corridor', source: 'rtsp://10.0.4.28/live', username: 'admin', password: 'Pa55w0rd!28', state: 'running' },
  { id: 'corridor-3f', name: 'Corridor-3F', zone: 'corridor', source: 'rtsp://10.0.4.29/live', username: 'admin', password: 'Pa55w0rd!29', state: 'offline' },
  { id: 'office-201', name: 'Office-201', zone: 'office', source: 'rtsp://10.0.4.30/live', username: 'admin', password: 'Pa55w0rd!30', state: 'running' },
  { id: 'office-202', name: 'Office-202', zone: 'office', source: 'rtsp://10.0.4.31/live', username: 'admin', password: 'Pa55w0rd!31', state: 'stopped' },
  { id: 'server-room', name: 'Server-Room', zone: 'server', source: 'rtsp://10.0.4.32/live', username: 'admin', password: 'Pa55w0rd!32', state: 'running' },
  { id: 'rooftop', name: 'Rooftop', zone: 'rooftop', source: 'rtsp://10.0.4.33/live', username: 'admin', password: 'Pa55w0rd!33', state: 'running' },
  { id: 'fence-east', name: 'Fence-East', zone: 'fence', source: 'rtsp://10.0.4.34/live', username: 'guard', password: 'Fence@East', state: 'running' },
  { id: 'fence-west', name: 'Fence-West', zone: 'fence', source: 'rtsp://10.0.4.35/live', username: 'guard', password: 'Fence@West', state: 'offline' },
]

/** 安裝位置選項，值是 i18n key 的後綴 */
export const ZONES = [
  'gate',
  'lobby',
  'dock',
  'parking',
  'corridor',
  'office',
  'server',
  'rooftop',
  'fence',
] as const
