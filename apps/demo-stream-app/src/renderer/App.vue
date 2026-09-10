<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import MonitorPage from './components/MonitorPage.vue'
import SettingsPage from './components/SettingsPage.vue'
import ToastHost from './components/ToastHost.vue'
import { useCameras } from './composables/useCameras'
import { useSettings } from './composables/useSettings'
import { useToast } from './composables/useToast'
import { resolveLocale, translate, type Locale } from './locales'

type Tab = 'monitor' | 'settings'

const locale = ref<Locale>(resolveLocale())
function t(key: string, params?: Record<string, string | number>) {
  return translate(locale.value, key, params)
}

function setLocale(next: Locale) {
  locale.value = next
  localStorage.setItem('locale', next)
}

function toggleLocale() {
  setLocale(locale.value === 'zh-Hant' ? 'en' : 'zh-Hant')
}

// 執行環境由 preload 注入；Web 模式下 window.demoStreamApp 不存在。
const runtime = computed(() => (window.demoStreamApp ? t('runtime.electron') : t('runtime.web')))

// 權限層級同樣讀 localStorage —— 手冊要拍的是一般使用者看到的畫面，
// 不是工程師模式。產線靠注入 role 來控制這件事。
const role = ref(localStorage.getItem('role') ?? 'operator')

/*
 * 分頁切換用 v-if 而不是 v-show：沒被選中的分頁，內容**根本不在 DOM 裡**。
 * 這是刻意的 —— 產線如果沒先切到對的分頁就去找元件，會直接找不到，
 * 而不是找到一個隱藏的元件。
 */
const tab = ref<Tab>('monitor')
const TABS: Tab[] = ['monitor', 'settings']

const { load } = useCameras()
const { settings, save, reset } = useSettings()
const { toasts, push } = useToast()

onMounted(load)

function onSaveSettings() {
  save()
  push(t('toast.settingsSaved'))
}

function onResetSettings() {
  reset()
  push(t('toast.settingsReset'))
}
</script>

<template>
  <div class="app" data-testid="app-root">
    <header class="topbar" data-testid="topbar">
      <h1 class="brand" data-testid="topbar-title">{{ t('app.title') }}</h1>

      <nav class="tabs" data-testid="nav-tabs">
        <button
          v-for="name in TABS"
          :key="name"
          type="button"
          class="tab"
          :class="{ active: tab === name }"
          :aria-selected="tab === name"
          :data-testid="`nav-tab_${name}`"
          @click="tab = name"
        >
          {{ t(`nav.${name}`) }}
        </button>
      </nav>

      <div class="topbar-right">
        <span class="tag" data-testid="topbar-role">{{ t(`role.${role}`) }}</span>
        <span class="tag muted" data-testid="topbar-runtime">{{ runtime }}</span>
        <button class="btn ghost sm" data-testid="topbar-locale" @click="toggleLocale">
          {{ locale === 'zh-Hant' ? 'EN' : '中文' }}
        </button>
      </div>
    </header>

    <MonitorPage v-if="tab === 'monitor'" :locale="locale" />

    <SettingsPage
      v-else
      :settings="settings"
      :locale="locale"
      :role="role"
      @save="onSaveSettings"
      @reset="onResetSettings"
      @update:locale="setLocale"
    />

    <ToastHost :toasts="toasts" />
  </div>
</template>
