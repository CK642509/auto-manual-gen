<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Camera } from '../data/cameras'
import { formatTimestamp, useLiveTelemetry } from '../composables/useLiveTelemetry'
import { translate, type Locale } from '../locales'

const props = defineProps<{
  /** 0-based 格子索引 */
  index: number
  camera: Camera | null
  locale: Locale
  /** 版面越大，格內字級與偵測框標籤要跟著縮小 */
  compact: boolean
}>()

const emit = defineEmits<{ remove: [number] }>()

function t(key: string, params?: Record<string, string | number>) {
  return translate(props.locale, key, params)
}

/** testid 用的格號一律 1-based，跟畫面上顯示的「格 N」對得起來 */
const n = computed(() => props.index + 1)

const { now, frame } = useLiveTelemetry()

// 每 1.2 秒重算的浮動數值 —— 產線要嘛攔截、要嘛把這一區遮掉
const detections = ref(3)
const fps = ref(28.6)

watch(
  frame,
  () => {
    if (props.camera?.state !== 'running') return
    detections.value = 2 + Math.floor(Math.random() * 5)
    fps.value = Number((27 + Math.random() * 3).toFixed(1))
  },
  { immediate: true },
)

const timestamp = computed(() => formatTimestamp(now.value))
const isLive = computed(() => props.camera?.state === 'running')
</script>

<template>
  <div class="cell" :class="{ empty: !camera, compact }" :data-testid="`grid-cell_${n}`">
    <!-- 空格：整塊是條件渲染，沒有攝影機時 view 根本不存在於 DOM 裡 -->
    <div v-if="!camera" class="cell-empty" :data-testid="`grid-cell-empty_${n}`">
      <span class="cell-empty-index">{{ t('grid.cellIndex', { n }) }}</span>
      <span class="cell-empty-text">{{ t('grid.cellEmpty') }}</span>
    </div>

    <template v-else>
      <div class="cell-view" :data-testid="`grid-cell-view_${n}`">
        <div class="scanlines"></div>

        <template v-if="isLive">
          <div class="det det-a" :data-testid="`grid-cell-det_${n}a`">
            <span v-if="!compact">person 0.94</span>
          </div>
          <div class="det det-b" :data-testid="`grid-cell-det_${n}b`">
            <span v-if="!compact">car 0.87</span>
          </div>
        </template>

        <div v-else class="cell-offline" :data-testid="`grid-cell-offline_${n}`">
          {{ camera.state === 'offline' ? t('live.offline') : t('live.stopped') }}
        </div>

        <div class="cell-bar">
          <span v-if="isLive" class="live-dot"></span>
          <span class="cell-bar-name" :data-testid="`grid-cell-name_${n}`">{{ camera.name }}</span>
          <span v-if="isLive" :data-testid="`grid-cell-timestamp_${n}`">{{ timestamp }}</span>
          <span
            v-if="isLive && !compact"
            :data-testid="`grid-cell-detections_${n}`"
          >{{ t('live.detections', { n: detections }) }}</span>
          <span v-if="isLive && !compact" class="cell-bar-fps" :data-testid="`grid-cell-fps_${n}`">
            {{ fps }} fps
          </span>
        </div>
      </div>

      <button
        type="button"
        class="cell-remove"
        :title="t('grid.remove')"
        :aria-label="t('grid.remove')"
        :data-testid="`grid-cell-remove_${n}`"
        @click="emit('remove', index)"
      >
        ✕
      </button>
    </template>
  </div>
</template>
