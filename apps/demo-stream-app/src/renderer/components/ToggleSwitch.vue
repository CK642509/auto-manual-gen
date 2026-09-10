<script setup lang="ts">
/**
 * 開關元件。
 *
 * `testid` 用**明確的 prop** 接進來，再手動綁到真正的 `<button>` 上，
 * 而不是依賴 Vue 的 attribute fallthrough —— 這是「明明加了 data-testid
 * 卻抓不到」這個頭號坑的正確解法：包裝元件必須保證
 * 屬性真的落在使用者會點到的那個 DOM 節點上。
 */
defineProps<{
  modelValue: boolean
  testid: string
  label?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
</script>

<template>
  <button
    type="button"
    class="switch"
    :class="{ on: modelValue }"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :data-testid="testid"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="switch-knob"></span>
  </button>
</template>
