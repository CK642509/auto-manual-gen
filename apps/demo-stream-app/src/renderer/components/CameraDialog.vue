<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'
import ToggleSwitch from './ToggleSwitch.vue'
import { ZONES, type Camera, type CameraState } from '../data/cameras'
import { translate, type Locale } from '../locales'

const props = defineProps<{
  /** null 代表新增模式 */
  camera: Camera | null
  locale: Locale
}>()

const emit = defineEmits<{
  cancel: []
  submit: [Omit<Camera, 'id'>]
  remove: [Camera]
}>()

function t(key: string, params?: Record<string, string | number>) {
  return translate(props.locale, key, params)
}

const isEdit = computed(() => props.camera !== null)

const name = ref('')
const zone = ref<string>('gate')
const source = ref('')
const username = ref('')
const password = ref('')
const enabled = ref(true)

watch(
  () => props.camera,
  (c) => {
    name.value = c?.name ?? ''
    zone.value = c?.zone ?? 'gate'
    source.value = c?.source ?? ''
    username.value = c?.username ?? ''
    password.value = c?.password ?? ''
    enabled.value = c ? c.state === 'running' : true
  },
  { immediate: true },
)

const confirmingDelete = ref(false)

const canSubmit = computed(() => name.value.trim().length > 0)

function submit() {
  if (!canSubmit.value) return
  // 停用時保留 offline 狀態，避免把「離線」誤改成「已停用」
  const state: CameraState = enabled.value
    ? 'running'
    : props.camera?.state === 'offline'
      ? 'offline'
      : 'stopped'

  emit('submit', {
    name: name.value.trim(),
    zone: zone.value,
    source: source.value.trim() || 'rtsp://—',
    username: username.value.trim(),
    password: password.value,
    state,
  })
}
</script>

<template>
  <div class="backdrop" data-testid="dialog-backdrop">
    <div class="dialog" role="dialog" aria-modal="true" data-testid="camera-dialog">
      <h3 class="dialog-title" data-testid="camera-dialog-title">
        {{ isEdit ? t('dialog.camera.editTitle') : t('dialog.camera.addTitle') }}
      </h3>

      <label class="field">
        <span>{{ t('dialog.camera.name') }}</span>
        <input
          v-model="name"
          data-testid="camera-dialog-name"
          :placeholder="t('dialog.camera.namePlaceholder')"
        />
      </label>

      <label class="field">
        <span>{{ t('dialog.camera.zone') }}</span>
        <select v-model="zone" data-testid="camera-dialog-zone">
          <option v-for="z in ZONES" :key="z" :value="z">{{ t(`zone.${z}`) }}</option>
        </select>
      </label>

      <!-- RTSP 位址會洩漏內網結構，是截圖前要遮蔽的目標之一 -->
      <label class="field">
        <span>{{ t('dialog.camera.source') }}</span>
        <input
          v-model="source"
          class="mono"
          data-testid="camera-dialog-source"
          :placeholder="t('dialog.camera.sourcePlaceholder')"
        />
      </label>

      <div class="field-row">
        <label class="field">
          <span>{{ t('dialog.camera.username') }}</span>
          <input v-model="username" data-testid="camera-dialog-username" />
        </label>
        <label class="field">
          <span>{{ t('dialog.camera.password') }}</span>
          <input v-model="password" type="password" data-testid="camera-dialog-password" />
        </label>
      </div>

      <div class="field-inline">
        <span>{{ t('dialog.camera.enabled') }}</span>
        <ToggleSwitch
          v-model="enabled"
          testid="camera-dialog-enabled"
          :label="t('dialog.camera.enabled')"
        />
      </div>

      <div class="dialog-actions spread">
        <!-- 只有編輯模式才有刪除按鈕：條件渲染，新增模式下這顆按鈕不存在於 DOM -->
        <button
          v-if="isEdit"
          class="btn danger ghost"
          data-testid="camera-dialog-delete"
          @click="confirmingDelete = true"
        >
          {{ t('dialog.camera.delete') }}
        </button>
        <span v-else></span>

        <span class="dialog-actions-right">
          <button class="btn ghost" data-testid="camera-dialog-cancel" @click="emit('cancel')">
            {{ t('dialog.camera.cancel') }}
          </button>
          <button
            class="btn primary"
            :disabled="!canSubmit"
            data-testid="camera-dialog-confirm"
            @click="submit"
          >
            {{ isEdit ? t('dialog.camera.save') : t('dialog.camera.create') }}
          </button>
        </span>
      </div>
    </div>

    <!-- 第二層對話框，疊在設定對話框之上 -->
    <ConfirmDialog
      v-if="confirmingDelete && camera"
      :title="t('dialog.confirm.deleteTitle')"
      :message="t('dialog.confirm.deleteMessage', { name: camera.name })"
      :cancel-text="t('dialog.confirm.cancel')"
      :confirm-text="t('dialog.confirm.confirm')"
      @cancel="confirmingDelete = false"
      @confirm="confirmingDelete = false; emit('remove', camera)"
    />
  </div>
</template>
