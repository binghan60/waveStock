<script setup>
import { computed, toRef } from 'vue'
import { useStockFormatter } from '@/composables/useStockFormatter'
import { useStockDetails } from '@/composables/useStockDetails'

const { formatPrice, formatNumber } = useStockFormatter()

const props = defineProps(['item', 'isStealth', 'badge'])
const emit = defineEmits(['remove', 'togglePin'])

// 使用 Composable 計算股票詳情 (價差、漲跌幅、顏色)
const { details } = useStockDetails(toRef(props, 'item'), toRef(props, 'isStealth'))

const isLimitHit = computed(() => {
  return details.value.rawAbsPercent >= 9.5
})

</script>

<template>
  <div
    class="group relative rounded-xl p-5 border transition-all duration-300"
    :class="[
      isStealth
        ? 'bg-white border-gray-200 shadow-sm'
        : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/80 hover:-translate-y-1 hover:shadow-xl',
      { 'limit-up-animation': isLimitHit && details.isUp && !isStealth },
      { 'limit-down-animation': isLimitHit && details.isDown && !isStealth }
    ]"
  >
    <div
      v-if="badge"
      class="absolute -top-2 -right-2 px-2 py-0.5 text-[10px] font-bold rounded shadow-lg z-10"
      :class="
        isStealth ? 'bg-gray-100 text-slate-600 border border-gray-200' : 'bg-purple-600 text-white'
      "
    >
      {{ badge }}
    </div>

    <div class="flex justify-between items-start mb-3">
      <div>
        <div class="flex items-baseline gap-2">
          <span
            class="text-2xl font-bold tracking-tight"
            :class="isStealth ? 'text-slate-700' : 'text-white'"
          >
            {{ item.symbol }}
          </span>
          <span class="text-xs opacity-50" v-if="item.market">{{
            isStealth ? 'Node' : item.market.name
          }}</span>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <!-- 置頂按鈕 -->
        <button
          @click="$emit('togglePin', item.symbol)"
          class="transition-all p-1 text-lg"
          :class="item.isPinned 
            ? (isStealth ? 'text-yellow-600 hover:text-yellow-700' : 'text-yellow-400 hover:text-yellow-300')
            : 'opacity-0 group-hover:opacity-50 hover:opacity-100 ' + (isStealth ? 'text-gray-400 hover:text-yellow-600' : 'text-gray-600 hover:text-yellow-400')
          "
          :title="item.isPinned ? '取消置頂' : '置頂'"
        >
          {{ item.isPinned ? '📌' : '📍' }}
        </button>
        <!-- 刪除按鈕 -->
        <button
          @click="$emit('remove', item.id)"
          class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400"
        >
          ✕
        </button>
      </div>
    </div>

    <div v-if="item.market" class="space-y-3">
      <div class="flex items-end gap-3">
        <div class="text-4xl leading-none tabular-nums tracking-tight" :class="details.colorClass">
          {{ formatPrice(item.market.currentPrice) }}
        </div>
        <div class="flex flex-col text-xs font-medium mb-1" :class="details.colorClass">
          <span class="flex items-center">
            {{ details.isUp ? '▲' : details.isDown ? '▼' : '' }}
            {{ details.diff }}
          </span>
          <span class="opacity-80">{{ details.percent }}%</span>
        </div>
      </div>
      <div
        class="flex justify-between items-center text-xs pt-3 border-t"
        :class="isStealth ? 'border-gray-100 text-gray-500' : 'border-zinc-700/50 text-gray-400'"
      >
        <div class="flex flex-col">
          <span class="opacity-50 scale-90 origin-left uppercase">前收</span
          ><span class="font-mono">{{ formatPrice(item.market.yesterdayClose) }}</span>
        </div>
        <div class="flex flex-col items-end">
          <span class="opacity-50 scale-90 origin-right uppercase">量</span
          ><span class="font-mono">{{ formatNumber(item.market.volume) }}</span>
        </div>
      </div>
    </div>
    <div v-else class="h-24 flex items-center justify-center text-sm opacity-30 animate-pulse">
      Syncing...
    </div>
  </div>
</template>

<style scoped>
@keyframes limit-glow-red {
  0%, 100% {
    background-color: rgba(239, 68, 68, 0.05);
    border-color: rgba(239, 68, 68, 0.7);
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
  }
  50% {
    background-color: rgba(239, 68, 68, 0.15);
    border-color: rgba(255, 100, 100, 1);
    box-shadow: 0 0 25px rgba(255, 100, 100, 0.6);
  }
}

@keyframes limit-glow-green {
  0%, 100% {
    background-color: rgba(34, 197, 94, 0.05);
    border-color: rgba(34, 197, 94, 0.7);
    box-shadow: 0 0 15px rgba(34, 197, 94, 0.4);
  }
  50% {
    background-color: rgba(34, 197, 94, 0.15);
    border-color: rgba(74, 222, 128, 1);
    box-shadow: 0 0 25px rgba(74, 222, 128, 0.6);
  }
}

.limit-up-animation {
  animation: limit-glow-red 2s ease-in-out infinite;
}

.limit-down-animation {
  animation: limit-glow-green 2s ease-in-out infinite;
}
</style>
