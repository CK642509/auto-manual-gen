<script setup lang="ts">
import { computed } from 'vue'
import LiveCell from './LiveCell.vue'
import type { Camera } from '../data/cameras'
import { CELL_COUNT, LAYOUT_MODES, type LayoutMode, type LayoutPreset } from '../composables/useLayout'
import { translate, type Locale } from '../locales'

const props = defineProps<{
  mode: LayoutMode
  cells: (string | null)[]
  presets: LayoutPreset[]
  appliedPresetId: string | null
  cameras: Camera[]
  locale: Locale
}>()

const emit = defineEmits<{
  'update:mode': [LayoutMode]
  removeCell: [number]
  clearAll: []
  savePreset: []
  applyPreset: [string]
}>()

function t(key: string, params?: Record<string, string | number>) {
  return translate(props.locale, key, params)
}

const columns = computed(() => Number(props.mode.charAt(0)))

/** 3×3 起每格已經不夠寬，格內資訊要精簡，否則底部資訊列會擠成一團 */
const compact = computed(() => columns.value >= 3)

const visible = computed(() =>
  props.cells.slice(0, CELL_COUNT[props.mode]).map((id) => ({
    id,
    camera: id ? (props.cameras.find((c) => c.id === id) ?? null) : null,
  })),
)

const presetValue = computed({
  get: () => props.appliedPresetId ?? '',
  set: (v: string) => v && emit('applyPreset', v),
})
</script>

<template>
  <section class="grid-panel" data-testid="grid-panel">
    <div class="grid-toolbar" data-testid="grid-toolbar">
      <div class="toolbar-group">
        <span class="toolbar-label">{{ t('grid.layoutLabel') }}</span>
        <div class="segmented" data-testid="grid-layout-group">
          <button
            v-for="m in LAYOUT_MODES"
            :key="m"
            type="button"
            class="segmented-item"
            :class="{ active: m === mode }"
            :aria-pressed="m === mode"
            :data-testid="`grid-layout_${m}`"
            @click="emit('update:mode', m)"
          >
            {{ t(`grid.layout_${m}`) }}
          </button>
        </div>
      </div>

      <div class="toolbar-group">
        <span class="toolbar-label">{{ t('grid.presetLabel') }}</span>
        <select v-model="presetValue" class="select" data-testid="grid-preset-select">
          <option value="" disabled>{{ t('grid.presetNone') }}</option>
          <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button class="btn sm" data-testid="grid-preset-save" @click="emit('savePreset')">
          {{ t('grid.savePreset') }}
        </button>
        <button class="btn ghost sm" data-testid="grid-clear-all" @click="emit('clearAll')">
          {{ t('grid.clearAll') }}
        </button>
      </div>
    </div>

    <div
      class="grid-view"
      :class="`cols-${columns}`"
      :data-layout="mode"
      data-testid="grid-view"
    >
      <LiveCell
        v-for="(cell, i) in visible"
        :key="i"
        :index="i"
        :camera="cell.camera"
        :locale="locale"
        :compact="compact"
        @remove="emit('removeCell', $event)"
      />
    </div>
  </section>
</template>
