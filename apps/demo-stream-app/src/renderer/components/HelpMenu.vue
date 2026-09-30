<script setup lang="ts">
import { computed, ref } from 'vue'
import { toursFor, type Tour } from '../help/useTour'
import { translate, type Locale } from '../locales'

const props = defineProps<{ locale: Locale }>()
const emit = defineEmits<{ start: [Tour] }>()

const open = ref(false)
const tours = computed(() => toursFor(props.locale))

function t(key: string) {
  return translate(props.locale, key)
}

function pick(tour: Tour) {
  open.value = false
  emit('start', tour)
}
</script>

<template>
  <div class="help">
    <button
      class="btn ghost sm help-button"
      data-testid="topbar-help"
      :aria-label="t('help.title')"
      :title="t('help.title')"
      :aria-expanded="open"
      @click="open = !open"
    >
      ?
    </button>

    <div v-if="open" class="help-menu" data-testid="help-menu">
      <div class="help-menu-title">{{ t('help.title') }}</div>
      <button
        v-for="tour in tours"
        :key="tour.id"
        class="help-menu-item"
        :data-testid="`help-menu-item_${tour.id}`"
        @click="pick(tour)"
      >
        {{ tour.title }}
      </button>
    </div>
  </div>
</template>
