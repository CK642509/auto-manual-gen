<script setup lang="ts">
import { computed, ref } from 'vue'
import { translate, type Locale } from '../locales'

const props = defineProps<{
  locale: Locale
  mode: string
  assignedCount: number
}>()

const emit = defineEmits<{ cancel: []; submit: [string] }>()

function t(key: string, params?: Record<string, string | number>) {
  return translate(props.locale, key, params)
}

const name = ref('')
const canSubmit = computed(() => name.value.trim().length > 0)
</script>

<template>
  <div class="backdrop" data-testid="dialog-backdrop">
    <div class="dialog dialog-sm" role="dialog" aria-modal="true" data-testid="preset-dialog">
      <h3 class="dialog-title" data-testid="preset-dialog-title">{{ t('dialog.preset.title') }}</h3>

      <p class="dialog-message" data-testid="preset-dialog-summary">
        {{ t('dialog.preset.summary', { mode: t(`grid.layout_${mode}`), n: assignedCount }) }}
      </p>

      <label class="field">
        <span>{{ t('dialog.preset.name') }}</span>
        <input
          v-model="name"
          data-testid="preset-dialog-name"
          :placeholder="t('dialog.preset.namePlaceholder')"
        />
      </label>

      <div class="dialog-actions">
        <button class="btn ghost" data-testid="preset-dialog-cancel" @click="emit('cancel')">
          {{ t('dialog.preset.cancel') }}
        </button>
        <button
          class="btn primary"
          :disabled="!canSubmit"
          data-testid="preset-dialog-confirm"
          @click="emit('submit', name.trim())"
        >
          {{ t('dialog.preset.save') }}
        </button>
      </div>
    </div>
  </div>
</template>
