<script setup>
import { computed } from 'vue'

const props = defineProps(['item', 'isStealth', 'badge'])
const emit = defineEmits(['remove', 'extend'])

const formatPrice = (val) => {
  const num = parseFloat(val); return isNaN(num) ? '-' : num.toFixed(1)
}
const formatNumber = (val) => val ? parseInt(val).toLocaleString() : '-'

const details = computed(() => {
  const stock = props.item
  if (!stock.market) return { diff: 0, percent: '0.00', isUp: false, colorClass: 'text-gray-500' }
  const c = parseFloat(stock.market.currentPrice), y = parseFloat(stock.market.yesterdayClose)
  const diff = c - y, percent = ((diff/y)*100).toFixed(2), isUp = diff > 0
  let colorClass = 'text-gray-500'
  if (!props.isStealth) colorClass = isUp ? 'text-red-400' : (diff < 0 ? 'text-green-400' : 'text-white')
  return { diff: Math.abs(diff).toFixed(1), percent: Math.abs(percent), isUp, colorClass }
})

const getDaysLeft = (dateStr) => {
  const d = new Date(dateStr); d.setDate(d.getDate()+30); 
  return Math.ceil((d - new Date())/86400000)
}
</script>

<template>
  <div class="group relative rounded-xl p-5 border transition-all duration-300"
    :class="[
      isStealth ? 'bg-white border-gray-200 shadow-sm' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/80 hover:-translate-y-1 hover:shadow-xl',
      getDaysLeft(item.createdAt) <= 5 && !isStealth ? '!border-orange-500/50' : ''
    ]">
    
    <div v-if="badge" class="absolute -top-2 -right-2 px-2 py-0.5 bg-purple-600 text-white text-[10px] font-bold rounded shadow-lg z-10">
      {{ badge }}
    </div>

    <div class="flex justify-between items-start mb-3">
      <div>
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-bold tracking-tight" :class="isStealth ? 'text-slate-700' : 'text-white'">
            {{ item.symbol }}
          </span>
          <span class="text-xs opacity-50" v-if="item.market">{{ isStealth ? 'Node' : item.market.name }}</span>
        </div>
      </div>
      <button @click="$emit('remove', item.id)" class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400">✕</button>
    </div>

    <div v-if="item.market" class="space-y-3">
      <div class="flex items-end gap-3">
        <div class="text-4xl font-extrabold leading-none tabular-nums tracking-tight" :class="details.colorClass">
          {{ formatPrice(item.market.currentPrice) }}
        </div>
        <div class="flex flex-col text-xs font-medium mb-1" :class="details.colorClass">
          <span class="flex items-center">
            {{ isStealth ? (details.isUp ? '+' : '-') : (details.isUp ? '▲' : '▼') }} {{ details.diff }}
          </span>
          <span class="opacity-80">{{ details.percent }}%</span>
        </div>
      </div>
      <div class="flex justify-between items-center text-xs pt-3 border-t"
        :class="isStealth ? 'border-gray-100 text-gray-500' : 'border-zinc-700/50 text-gray-400'">
        <div class="flex flex-col"><span class="opacity-50 scale-90 origin-left uppercase">Prev</span><span class="font-mono">{{ formatPrice(item.market.yesterdayClose) }}</span></div>
        <div class="flex flex-col items-end"><span class="opacity-50 scale-90 origin-right uppercase">Vol</span><span class="font-mono">{{ formatNumber(item.market.volume) }}</span></div>
      </div>
    </div>
    <div v-else class="h-24 flex items-center justify-center text-sm opacity-30 animate-pulse">Syncing...</div>

    <div class="mt-4 pt-2">
      <div class="h-1 w-full rounded-full overflow-hidden mb-2" :class="isStealth ? 'bg-gray-100' : 'bg-zinc-800'">
        <div class="h-full transition-all duration-500"
          :class="[isStealth ? 'bg-slate-400' : 'bg-blue-600', getDaysLeft(item.createdAt)<=5 && !isStealth ? '!bg-orange-500' : '']"
          :style="{ width: (getDaysLeft(item.createdAt)/30)*100 + '%' }"></div>
      </div>
      <div class="flex justify-between items-center text-[10px] uppercase tracking-wider opacity-60">
        <span>Exp: {{ getDaysLeft(item.createdAt) }} Days</span>
        <button @click="$emit('extend', item.id)" class="hover:text-blue-400 hover:opacity-100 transition-colors">Renew ↻</button>
      </div>
    </div>
  </div>
</template>