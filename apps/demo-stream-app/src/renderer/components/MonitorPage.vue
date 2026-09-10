<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CameraList from './CameraList.vue'
import LiveGrid from './LiveGrid.vue'
import CameraDialog from './CameraDialog.vue'
import PresetDialog from './PresetDialog.vue'
import type { Camera } from '../data/cameras'
import { useCameras } from '../composables/useCameras'
import { useLayout } from '../composables/useLayout'
import { useToast } from '../composables/useToast'
import { useLiveTelemetry } from '../composables/useLiveTelemetry'
import { translate, type Locale } from '../locales'

const props = defineProps<{ locale: Locale }>()

function t(key: string, params?: Record<string, string | number>) {
  return translate(props.locale, key, params)
}

const { cameras, loading, create, update, remove } = useCameras()
const {
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
} = useLayout()
const { push } = useToast()

/* ---------------- 統計卡 ---------------- */
const { frame } = useLiveTelemetry()
const fps = ref(28.6)
watch(frame, () => (fps.value = Number((27 + Math.random() * 3).toFixed(1))))

const onlineCount = computed(() => cameras.value.filter((c) => c.state === 'running').length)
const assignedIds = computed(() => visibleCells.value.filter((id): id is string => Boolean(id)))

/* ---------------- 雙擊填入 ---------------- */
// 依序找第一個空格填入。使用者按格子上的 ✕ 清掉某一格之後，
// 那一格就會變成「下一個空格」，再雙擊別台就填回去，不會動到其他格。
function onAssign(camera: Camera) {
  const result = assignToNextEmpty(camera.id)
  if (result === 'duplicate') {
    push(t('toast.duplicate', { name: camera.name }))
    return
  }
  if (result === null) {
    push(t('toast.full'))
    return
  }
  push(t('toast.added', { name: camera.name, n: result }))
}

function onRemoveCell(index: number) {
  clearCell(index)
  push(t('toast.removed', { n: index + 1 }))
}

function onClearAll() {
  clearAll()
  push(t('toast.cleared'))
}

/* ---------------- 版面設定 ---------------- */
const presetDialogOpen = ref(false)

function onSavePreset(name: string) {
  const preset = savePreset(name)
  presetDialogOpen.value = false
  push(t('toast.presetSaved', { name: preset.name }))
}

function onApplyPreset(id: string) {
  const preset = applyPreset(id)
  if (preset) push(t('toast.presetApplied', { name: preset.name }))
}

/* ---------------- 攝影機對話框 ---------------- */
const cameraDialogOpen = ref(false)
const editing = ref<Camera | null>(null)

function openAdd() {
  editing.value = null
  cameraDialogOpen.value = true
}

function openEdit(camera: Camera) {
  editing.value = camera
  cameraDialogOpen.value = true
}

function onSubmit(draft: Omit<Camera, 'id'>) {
  if (editing.value) {
    update(editing.value.id, draft)
    push(t('toast.cameraSaved', { name: draft.name }))
  } else {
    const created = create(draft)
    push(t('toast.cameraCreated', { name: created.name }))
  }
  cameraDialogOpen.value = false
}

function onRemoveCamera(camera: Camera) {
  detachCamera(camera.id)
  remove(camera.id)
  cameraDialogOpen.value = false
  push(t('toast.cameraDeleted', { name: camera.name }))
}
</script>

<template>
  <main class="monitor-page" data-testid="monitor-page">
    <div class="monitor-left">
      <section class="stats" data-testid="overview-stats">
        <div class="stat" data-testid="stat-cameras">
          <span class="stat-label">{{ t('stat.cameras') }}</span>
          <strong class="stat-value" data-testid="stat-cameras-value">{{ onlineCount }}</strong>
        </div>
        <div class="stat" data-testid="stat-alert">
          <span class="stat-label">{{ t('stat.alert') }}</span>
          <strong class="stat-value warn" data-testid="stat-alert-value">1</strong>
        </div>
        <div class="stat" data-testid="stat-fps">
          <span class="stat-label">{{ t('stat.fps') }}</span>
          <strong class="stat-value" data-testid="stat-fps-value">{{ fps }}</strong>
        </div>
      </section>

      <CameraList
        :cameras="cameras"
        :loading="loading"
        :locale="locale"
        :assigned-ids="assignedIds"
        @add="openAdd"
        @edit="openEdit"
        @assign="onAssign"
      />
    </div>

    <LiveGrid
      :mode="mode"
      :cells="cells"
      :presets="presets"
      :applied-preset-id="appliedPresetId"
      :cameras="cameras"
      :locale="locale"
      @update:mode="setMode"
      @remove-cell="onRemoveCell"
      @clear-all="onClearAll"
      @save-preset="presetDialogOpen = true"
      @apply-preset="onApplyPreset"
    />

    <CameraDialog
      v-if="cameraDialogOpen"
      :camera="editing"
      :locale="locale"
      @cancel="cameraDialogOpen = false"
      @submit="onSubmit"
      @remove="onRemoveCamera"
    />

    <PresetDialog
      v-if="presetDialogOpen"
      :locale="locale"
      :mode="mode"
      :assigned-count="assignedCount"
      @cancel="presetDialogOpen = false"
      @submit="onSavePreset"
    />
  </main>
</template>
