<script setup lang="ts">
import ToggleSwitch from './ToggleSwitch.vue'
import type { Settings } from '../composables/useSettings'
import { SUPPORTED, translate, type Locale } from '../locales'

const props = defineProps<{
  settings: Settings
  locale: Locale
  role: string
}>()

const emit = defineEmits<{
  save: []
  reset: []
  'update:locale': [Locale]
}>()

function t(key: string, params?: Record<string, string | number>) {
  return translate(props.locale, key, params)
}

const LOCALE_LABEL: Record<Locale, string> = {
  'zh-Hant': '繁體中文',
  en: 'English',
}

function onLocaleChange(event: Event) {
  emit('update:locale', (event.target as HTMLSelectElement).value as Locale)
}
</script>

<template>
  <main class="settings-page" data-testid="settings-page">
    <!-- ---------- 告警 ---------- -->
    <section class="settings-section" data-testid="settings-section_alert">
      <h2 class="section-title" data-testid="settings-alert-title">
        {{ t('settings.alert.title') }}
      </h2>

      <div class="setting-row">
        <div class="setting-text">
          <span class="setting-label">{{ t('settings.alert.enabled') }}</span>
          <span class="setting-desc">{{ t('settings.alert.description') }}</span>
        </div>
        <ToggleSwitch
          v-model="settings.alert.enabled"
          testid="settings-alert-enabled"
          :label="t('settings.alert.enabled')"
        />
      </div>

      <!--
        子設定是「條件渲染」，總開關關掉時整塊從 DOM 消失（不是只被隱藏）。
        產線如果沒有先把開關打開就去找 settings-alert-sound，會直接找不到 ——
        這正是那個經典的坑：先確認前置狀態，而不是回頭去改 selector。
      -->
      <div v-if="settings.alert.enabled" class="setting-sub" data-testid="settings-alert-sub">
        <div class="setting-row">
          <span class="setting-label">{{ t('settings.alert.sound') }}</span>
          <ToggleSwitch
            v-model="settings.alert.sound"
            testid="settings-alert-sound"
            :label="t('settings.alert.sound')"
          />
        </div>
        <div class="setting-row">
          <span class="setting-label">{{ t('settings.alert.retention') }}</span>
          <span class="setting-control">
            <input
              v-model.number="settings.alert.retention"
              type="number"
              min="1"
              max="365"
              class="input-num"
              data-testid="settings-alert-retention"
            />
            <span class="setting-unit">{{ t('settings.alert.retentionUnit') }}</span>
          </span>
        </div>
      </div>
    </section>

    <!-- ---------- 影像分析 ---------- -->
    <section class="settings-section" data-testid="settings-section_analysis">
      <h2 class="section-title" data-testid="settings-analysis-title">
        {{ t('settings.analysis.title') }}
      </h2>

      <div class="setting-row">
        <div class="setting-text">
          <span class="setting-label">{{ t('settings.analysis.motion') }}</span>
          <span class="setting-desc">{{ t('settings.analysis.motionDescription') }}</span>
        </div>
        <ToggleSwitch
          v-model="settings.motion.enabled"
          testid="settings-motion-enabled"
          :label="t('settings.analysis.motion')"
        />
      </div>

      <div v-if="settings.motion.enabled" class="setting-sub" data-testid="settings-motion-sub">
        <div class="setting-row">
          <span class="setting-label">{{ t('settings.analysis.motionSensitivity') }}</span>
          <select
            v-model="settings.motion.sensitivity"
            class="select"
            data-testid="settings-motion-sensitivity"
          >
            <option value="low">{{ t('settings.analysis.low') }}</option>
            <option value="medium">{{ t('settings.analysis.medium') }}</option>
            <option value="high">{{ t('settings.analysis.high') }}</option>
          </select>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-text">
          <span class="setting-label">{{ t('settings.analysis.face') }}</span>
          <span class="setting-desc">{{ t('settings.analysis.faceDescription') }}</span>
        </div>
        <ToggleSwitch
          v-model="settings.face.enabled"
          testid="settings-face-enabled"
          :label="t('settings.analysis.face')"
        />
      </div>

      <div v-if="settings.face.enabled" class="setting-sub" data-testid="settings-face-sub">
        <div class="setting-row">
          <span class="setting-label">{{ t('settings.analysis.faceThreshold') }}</span>
          <span class="setting-control">
            <input
              v-model.number="settings.face.threshold"
              type="range"
              min="50"
              max="99"
              data-testid="settings-face-threshold"
            />
            <span class="setting-unit mono" data-testid="settings-face-threshold-value">
              {{ settings.face.threshold }}%
            </span>
          </span>
        </div>
      </div>
    </section>

    <!-- ---------- 系統 ---------- -->
    <section class="settings-section" data-testid="settings-section_system">
      <h2 class="section-title" data-testid="settings-system-title">
        {{ t('settings.system.title') }}
      </h2>

      <div class="setting-row">
        <span class="setting-label">{{ t('settings.system.locale') }}</span>
        <select class="select" data-testid="settings-locale" :value="locale" @change="onLocaleChange">
          <option v-for="l in SUPPORTED" :key="l" :value="l">{{ LOCALE_LABEL[l] }}</option>
        </select>
      </div>

      <div class="setting-row">
        <div class="setting-text">
          <span class="setting-label">{{ t('settings.system.role') }}</span>
          <span class="setting-desc">{{ t('settings.system.roleHint') }}</span>
        </div>
        <span class="tag" data-testid="settings-role">{{ t(`role.${role}`) }}</span>
      </div>
    </section>

    <!-- ---------- 授權與裝置：僅 admin 可見 ---------- -->
    <!--
      整塊是條件渲染，需要注入 role=admin 才會出現；
      裡面三個欄位剛好對應三種遮蔽模式：
        license-input     → 色塊（預設，最安全）
        license-server-ip → blur
        license-serial    → replace 成格式正確的假資料
    -->
    <section v-if="role === 'admin'" class="settings-section" data-testid="settings-section_license">
      <h2 class="section-title" data-testid="settings-license-title">
        {{ t('settings.license.title') }}
        <span class="tag warn" data-testid="settings-license-badge">
          {{ t('settings.license.adminOnly') }}
        </span>
      </h2>

      <div class="license-block" data-testid="license-block">
        <div class="setting-row">
          <div class="setting-text">
            <span class="setting-label">{{ t('settings.license.key') }}</span>
            <span class="setting-desc">{{ t('settings.license.keyHint') }}</span>
          </div>
          <input class="input-text mono" data-testid="license-input" readonly value="7F3A-91C2-B45E-D008" />
        </div>

        <div class="setting-row">
          <span class="setting-label">{{ t('settings.license.serverIp') }}</span>
          <input class="input-text mono" data-testid="license-server-ip" readonly value="10.0.128.44:8443" />
        </div>

        <div class="setting-row">
          <span class="setting-label">{{ t('settings.license.serial') }}</span>
          <input class="input-text mono" data-testid="license-serial" readonly value="DSA-2419-77H0-KQ31" />
        </div>
      </div>
    </section>

    <div class="settings-actions" data-testid="settings-actions">
      <button class="btn ghost" data-testid="settings-reset" @click="emit('reset')">
        {{ t('settings.reset') }}
      </button>
      <button class="btn primary" data-testid="settings-save" @click="emit('save')">
        {{ t('settings.save') }}
      </button>
    </div>
  </main>
</template>
