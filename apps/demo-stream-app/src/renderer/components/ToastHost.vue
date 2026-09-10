<script setup lang="ts">
import type { Toast } from '../composables/useToast'

defineProps<{ toasts: Toast[] }>()
</script>

<template>
  <div class="toast-host" data-testid="toast-host">
    <div v-for="toast in toasts" :key="toast.id" class="toast" data-testid="toast">
      <span data-testid="toast-message">{{ toast.message }}</span>
    </div>
  </div>
</template>
