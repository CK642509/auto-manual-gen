<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { resolveLocale, translate, type Locale } from './locales'

const locale = ref<Locale>(resolveLocale())
function t(key: string, params?: Record<string, string | number>) {
  return translate(locale.value, key, params)
}

function switchLocale() {
  locale.value = locale.value === 'zh-Hant' ? 'en' : 'zh-Hant'
  localStorage.setItem('locale', locale.value)
}

// 執行環境由 preload 注入；Web 模式下 window.demoStreamApp 不存在。
const runtime = computed(() =>
  window.demoStreamApp ? t('runtime.electron') : t('runtime.web'),
)

// 權限層級同樣讀 localStorage —— 手冊要拍的是一般使用者看到的畫面，
// 不是工程師模式。產線靠注入 role 來控制這件事。
const role = ref(localStorage.getItem('role') ?? 'operator')
const showLicense = computed(() => role.value === 'admin')

const streams = ref([
  { id: 's-01', name: 'Gate-A', source: 'rtsp://10.0.4.21/live', running: true },
  { id: 's-02', name: 'Lobby-01', source: 'rtsp://10.0.4.22/live', running: true },
  { id: 's-03', name: 'Dock-03', source: 'rtsp://10.0.4.23/live', running: false },
])

/* ------------------------------------------------------------------
 * 即時畫面區塊：這裡刻意塞進截圖產線的三大不確定性來源。
 *   1. 時間      —— 每秒跳動的時間戳
 *   2. 變動資料  —— 每 1.2 秒重算的偵測數與 FPS
 *   3. 動畫      —— 持續飄移的偵測框（CSS animation）
 * 產線必須用狀態注入 + 網路攔截 + 停用動畫把這三件事全部壓平，
 * 否則同一章連拍兩次會得到兩張不同的圖（見系列 Day 07、Day 08）。
 * ------------------------------------------------------------------ */
const now = ref(new Date())
const detections = ref(4)
const fps = ref(28.6)
let clockTimer: number
let dataTimer: number

const timestamp = computed(() =>
  now.value.toLocaleString('sv-SE').replace('T', ' ').slice(0, 19),
)

onMounted(() => {
  clockTimer = window.setInterval(() => (now.value = new Date()), 1000)
  dataTimer = window.setInterval(() => {
    detections.value = 3 + Math.floor(Math.random() * 4)
    fps.value = Number((27 + Math.random() * 3).toFixed(1))
  }, 1200)
})

onBeforeUnmount(() => {
  clearInterval(clockTimer)
  clearInterval(dataTimer)
})

/* ---------------- 對話框 ---------------- */
const dialogOpen = ref(false)
const draftName = ref('')
const draftSource = ref('')

function openDialog() {
  draftName.value = ''
  draftSource.value = ''
  dialogOpen.value = true
}

function confirmDialog() {
  if (!draftName.value.trim()) return
  streams.value.push({
    id: `s-${String(streams.value.length + 1).padStart(2, '0')}`,
    name: draftName.value.trim(),
    source: draftSource.value.trim() || 'rtsp://—',
    running: true,
  })
  dialogOpen.value = false
}
</script>

<template>
  <div class="app" data-testid="app-root">
    <header class="topbar" data-testid="topbar">
      <h1 class="brand" data-testid="topbar-title">{{ t('app.title') }}</h1>
      <div class="topbar-right">
        <span class="runtime" data-testid="topbar-runtime">{{ runtime }}</span>
        <button class="btn ghost" data-testid="topbar-locale" @click="switchLocale">
          {{ locale === 'zh-Hant' ? 'EN' : '中文' }}
        </button>
      </div>
    </header>

    <main class="content" data-testid="overview-page">
      <section class="cards" data-testid="overview-stats">
        <div class="card" data-testid="stat-streams">
          <span class="card-label">{{ t('status.streams') }}</span>
          <strong class="card-value">2</strong>
        </div>
        <div class="card" data-testid="stat-alert">
          <span class="card-label">{{ t('status.alert') }}</span>
          <strong class="card-value warn">1</strong>
        </div>
        <div class="card" data-testid="stat-fps">
          <span class="card-label">{{ t('status.fps') }}</span>
          <strong class="card-value" data-testid="stat-fps-value">{{ fps }}</strong>
        </div>
      </section>

      <!-- 即時畫面：整個產線最難拍的東西 -->
      <section class="panel" data-testid="live-panel">
        <div class="panel-head">
          <h2 class="panel-title" data-testid="live-title">{{ t('live.title') }}</h2>
          <span class="meta" data-testid="live-model">{{ t('live.model') }}: yolo-v8n</span>
        </div>

        <div class="viewport" data-testid="live-view">
          <div class="scanlines"></div>
          <div class="det det-a" data-testid="live-det_a"><span>person 0.94</span></div>
          <div class="det det-b" data-testid="live-det_b"><span>car 0.87</span></div>

          <div class="viewport-bar">
            <span class="live-dot"></span>
            <span data-testid="live-timestamp">{{ timestamp }}</span>
            <span data-testid="live-detections">{{ t('live.detections', { n: detections }) }}</span>
          </div>
        </div>
      </section>

      <!--
        機敏欄位：只有 admin 看得到，而且值本身就是產線要遮蔽的目標。
        用來示範 Day 07（權限注入）與 Day 12（redact / replace）。
      -->
      <section v-if="showLicense" class="license" data-testid="license-block">
        <label class="license-label" for="license">{{ t('license.label') }}</label>
        <input
          id="license"
          class="license-input"
          data-testid="license-input"
          readonly
          value="7F3A-91C2-B45E-D008"
        />
        <span class="license-hint">{{ t('license.hint') }}</span>
      </section>

      <section class="panel" data-testid="stream-panel">
        <div class="panel-head">
          <h2 class="panel-title" data-testid="stream-panel-title">{{ t('table.title') }}</h2>
          <button class="btn primary" data-testid="stream-add" @click="openDialog">
            {{ t('action.addStream') }}
          </button>
        </div>

        <table class="table" data-testid="stream-table">
          <thead>
            <tr>
              <th>{{ t('table.name') }}</th>
              <th>{{ t('table.source') }}</th>
              <th>{{ t('table.state') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in streams" :key="s.id" :data-testid="`stream-row_${s.id}`">
              <td>{{ s.name }}</td>
              <td class="mono">{{ s.source }}</td>
              <td>
                <span class="pill" :class="{ off: !s.running }">
                  {{ s.running ? t('table.state.running') : t('table.state.stopped') }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>

    <!-- 對話框：產線的常見難題（開啟動畫、殘留、截圖範圍），見 Day 08 / Day 09 -->
    <div v-if="dialogOpen" class="backdrop" data-testid="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" data-testid="add-stream-dialog">
        <h3 class="dialog-title" data-testid="add-stream-dialog-title">{{ t('dialog.title') }}</h3>

        <label class="field">
          <span>{{ t('dialog.name') }}</span>
          <input v-model="draftName" data-testid="add-stream-name" />
        </label>
        <label class="field">
          <span>{{ t('dialog.source') }}</span>
          <input v-model="draftSource" data-testid="add-stream-source" />
        </label>

        <div class="dialog-actions">
          <button class="btn ghost" data-testid="add-stream-cancel" @click="dialogOpen = false">
            {{ t('dialog.cancel') }}
          </button>
          <button class="btn primary" data-testid="add-stream-confirm" @click="confirmDialog">
            {{ t('dialog.confirm') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
