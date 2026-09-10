<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Camera } from '../data/cameras'
import { translate, type Locale } from '../locales'

const props = defineProps<{
  cameras: Camera[]
  loading: boolean
  locale: Locale
  /** 已經在版面上的攝影機 id，用來標示「使用中」 */
  assignedIds: string[]
}>()

const emit = defineEmits<{
  add: []
  edit: [Camera]
  assign: [Camera]
}>()

function t(key: string, params?: Record<string, string | number>) {
  return translate(props.locale, key, params)
}

const keyword = ref('')

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return props.cameras
  return props.cameras.filter(
    (c) => c.name.toLowerCase().includes(q) || t(`zone.${c.zone}`).toLowerCase().includes(q),
  )
})
</script>

<template>
  <aside class="camera-panel" data-testid="camera-panel">
    <div class="camera-panel-head">
      <h2 class="panel-title" data-testid="camera-panel-title">{{ t('camera.panelTitle') }}</h2>
      <button class="btn primary sm" data-testid="camera-add" @click="emit('add')">
        {{ t('camera.add') }}
      </button>
    </div>

    <input
      v-model="keyword"
      class="camera-search"
      type="search"
      data-testid="camera-search"
      :placeholder="t('camera.searchPlaceholder')"
    />

    <p class="camera-hint" data-testid="camera-hint">{{ t('camera.hint') }}</p>

    <!--
      非同步載入的骨架屏。整塊是條件渲染 —— 載入完成後 camera-list-skeleton
      會從 DOM 消失，產線等的就是這個語意訊號，而不是固定延遲。
    -->
    <div v-if="loading" class="camera-skeleton" data-testid="camera-list-skeleton">
      <div v-for="i in 6" :key="i" class="skeleton-row">
        <span class="skeleton-bar w-60"></span>
        <span class="skeleton-bar w-40"></span>
      </div>
    </div>

    <p v-else-if="filtered.length === 0" class="camera-empty" data-testid="camera-list-empty">
      {{ t('camera.empty') }}
    </p>

    <!-- 清單刻意超過一個畫面高度，需要捲動才看得完；捲動後 boundingBox 會失效，必須重取 -->
    <ul v-else class="camera-list" data-testid="camera-list">
      <li
        v-for="c in filtered"
        :key="c.id"
        class="camera-row"
        :class="{ used: assignedIds.includes(c.id) }"
        :data-testid="`camera-row_${c.id}`"
        @dblclick="emit('assign', c)"
      >
        <span class="camera-state" :class="c.state" :data-testid="`camera-state_${c.id}`">
          {{ t(`camera.state.${c.state}`) }}
        </span>

        <span class="camera-text">
          <span class="camera-name" :data-testid="`camera-name_${c.id}`">{{ c.name }}</span>
          <span class="camera-zone" :data-testid="`camera-zone_${c.id}`">{{ t(`zone.${c.zone}`) }}</span>
        </span>

        <button
          type="button"
          class="camera-edit"
          :title="t('camera.edit')"
          :aria-label="t('camera.edit')"
          :data-testid="`camera-edit_${c.id}`"
          @click.stop="emit('edit', c)"
        >
          ⚙
        </button>
      </li>
    </ul>

    <p class="camera-count" data-testid="camera-count">
      {{ t('camera.count', { n: filtered.length }) }}
    </p>
  </aside>
</template>
