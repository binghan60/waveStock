<script setup>
import { useConfirm } from '@/composables/useConfirm'

const { isVisible, modalTitle, modalMessage, handleConfirm, handleCancel } = useConfirm()
defineProps(['isStealth'])
</script>

<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-100 transition-opacity"
    @click.self="handleCancel"
  >
    <div
      class="rounded-xl border p-6 w-full max-w-sm m-4 transform transition-all shadow-2xl scale-100"
      :class="
        isStealth
          ? 'bg-white border-gray-200'
          : 'bg-zinc-900 border-zinc-700'
      "
    >
      <h3 class="text-lg font-bold mb-2" :class="isStealth ? 'text-slate-800' : 'text-white'">
        {{ modalTitle }}
      </h3>
      <p class="text-sm mb-6 leading-relaxed" :class="isStealth ? 'text-slate-600' : 'text-zinc-400'">
        {{ modalMessage }}
      </p>

      <div class="flex justify-end gap-3">
        <button
          @click="handleCancel"
          class="px-4 py-2 rounded-lg font-bold text-xs transition-colors"
          :class="
            isStealth
              ? 'text-slate-500 bg-slate-100 hover:bg-slate-200'
              : 'text-zinc-400 bg-transparent hover:bg-zinc-800'
          "
        >
          取消
        </button>
        <button
          @click="handleConfirm"
          class="px-4 py-2 rounded-lg font-bold text-xs text-white transition-colors bg-red-600 hover:bg-red-700"
        >
          確認
        </button>
      </div>
    </div>
  </div>
</template>
