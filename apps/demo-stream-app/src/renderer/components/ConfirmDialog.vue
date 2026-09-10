<script setup lang="ts">
/**
 * 確認對話框。
 *
 * 它是**疊在攝影機設定對話框之上的第二層** —— 這種巢狀結構是產線的經典難題：
 * 截圖時要決定拍哪一層、關閉時要按順序關掉兩層，
 * 而且上一章沒關乾淨的話會直接毀掉下一章的截圖。
 */
defineProps<{
  title: string
  message: string
  cancelText: string
  confirmText: string
}>()

const emit = defineEmits<{ cancel: []; confirm: [] }>()
</script>

<template>
  <div class="backdrop backdrop-nested" data-testid="confirm-backdrop">
    <div class="dialog dialog-sm" role="alertdialog" aria-modal="true" data-testid="confirm-dialog">
      <h3 class="dialog-title" data-testid="confirm-dialog-title">{{ title }}</h3>
      <p class="dialog-message" data-testid="confirm-dialog-message">{{ message }}</p>

      <div class="dialog-actions">
        <button class="btn ghost" data-testid="confirm-dialog-cancel" @click="emit('cancel')">
          {{ cancelText }}
        </button>
        <button class="btn danger" data-testid="confirm-dialog-confirm" @click="emit('confirm')">
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>
