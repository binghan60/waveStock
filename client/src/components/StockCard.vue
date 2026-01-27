<script setup>
import { computed, toRef, ref } from 'vue'
import { useStockFormatter } from '@/composables/useStockFormatter'
import { useStockDetails } from '@/composables/useStockDetails'
import { useStockColors } from '@/composables/useStockColors'

const { formatPrice, formatNumber } = useStockFormatter()
const { INDICATOR_COLORS } = useStockColors()

const props = defineProps({
  item: Object,
  isStealth: Boolean,
  badge: String,
  allowDelete: {
    type: Boolean,
    default: true
  }
})

// 使用 Composable 計算股票詳情 (價差、漲跌幅、顏色)
const { details } = useStockDetails(toRef(props, 'item'), toRef(props, 'isStealth'))

// --- 通用計算屬性 ---
const displaySymbol = computed(() => props.item.symbol || props.item.code)
// hasAnalysis removed to unify layout

// --- 來自 RecognizedStockCard 的分析邏輯 ---

const sourceLabel = computed(() => {
  return props.item.source === 'system' ? '筆記推薦' : '使用者自選'
})

const sourceBadgeClass = computed(() => {
  if (props.isStealth) {
    return props.item.source === 'system'
      ? 'bg-purple-100 text-purple-600'
      : 'bg-blue-100 text-blue-600'
  }
  return props.item.source === 'system'
    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
})

const isLimitHit = computed(() => {
  return details.value.rawAbsPercent >= 9.5
})

const priceInRange = computed(() => {
  if (!props.item.market) return { inRange: false, matchedIndicators: [] }

  const currentPrice = parseFloat(props.item.market.currentPrice)
  if (isNaN(currentPrice)) return { inRange: false, matchedIndicators: [] }

  const matchedIndicators = []

  const swapRef = parseFloat(props.item.swapRef)
  const shortTermProfit = parseFloat(props.item.shortTermProfit)
  const waveProfit = parseFloat(props.item.waveProfit)

  if (!isNaN(swapRef) && currentPrice <= swapRef) matchedIndicators.push('換股')

  if (props.item.support) {
    const supportStr = props.item.support.toString()
    if (supportStr.includes('-')) {
      const [low, high] = supportStr.split('-').map((v) => parseFloat(v.trim()))
      if (!isNaN(low) && !isNaN(high) && currentPrice >= low && currentPrice <= high) {
        matchedIndicators.push('支撐')
      }
    } else {
      const val = parseFloat(supportStr)
      if (!isNaN(val)) {
        if (Math.abs(currentPrice - val) <= 0.5) matchedIndicators.push('支撐')
      }
    }
  }

  if (!isNaN(shortTermProfit) && currentPrice >= shortTermProfit) matchedIndicators.push('短線')
  if (!isNaN(waveProfit) && currentPrice >= waveProfit) matchedIndicators.push('波段')

  return { inRange: matchedIndicators.length > 0, matchedIndicators }
})

const priceChart = computed(() => {
  if (!props.item.market) return null

  const currentPrice = parseFloat(props.item.market.currentPrice)
  const yesterdayClose = parseFloat(props.item.market.yesterdayClose)
  if (isNaN(currentPrice)) return null

  const isUp = !isNaN(yesterdayClose) && currentPrice > yesterdayClose
  const isDown = !isNaN(yesterdayClose) && currentPrice < yesterdayClose

  const targets = []

  if (props.item.support) {
    const supportStr = props.item.support.toString()
    if (supportStr.includes('-')) {
      const parts = supportStr.split('-').map((p) => parseFloat(p.trim()))
      if (!isNaN(parts[0]) && !isNaN(parts[1])) {
        targets.push({
          label: '支撐',
          value: parts[0],
          color: 'cyan',
          isRange: true,
          rangeEnd: parts[1],
          rangeLabel: `${parts[0]}-${parts[1]}`,
        })
      }
    } else {
      const val = parseFloat(supportStr)
      if (!isNaN(val)) targets.push({ label: '支撐', value: val, color: 'cyan' })
    }
  }

  const otherKeys = [
    { key: 'shortTermProfit', label: '短線', color: 'amber' },
    { key: 'waveProfit', label: '波段', color: 'rose' },
    { key: 'swapRef', label: '換股', color: 'emerald' },
  ]

  otherKeys.forEach((item) => {
    const val = parseFloat(props.item[item.key])
    if (!isNaN(val)) targets.push({ label: item.label, value: val, color: item.color })
  })

  if (targets.length === 0) return null

  const allValues = [currentPrice]
  targets.forEach((t) => {
    allValues.push(t.value)
    if (t.rangeEnd) allValues.push(t.rangeEnd)
  })

  const minPrice = Math.min(...allValues)
  const maxPrice = Math.max(...allValues)
  const priceRange = maxPrice - minPrice || 1

  const finalPoints = [
    ...targets,
    {
      label: '現價',
      value: currentPrice,
      color: 'current',
      isCurrent: true,
      isUp,
      isDown,
    },
  ]
  finalPoints.sort((a, b) => a.value - b.value)

  return finalPoints.map((target) => {
    const position = ((target.value - minPrice) / priceRange) * 100
    const positionEnd = target.rangeEnd ? ((target.rangeEnd - minPrice) / priceRange) * 100 : null

    let diff, diffPercent
    if (target.rangeEnd) {
      if (currentPrice >= target.value && currentPrice <= target.rangeEnd) {
        diff = 0
        diffPercent = '0.00'
      } else {
        const closest = currentPrice < target.value ? target.value : target.rangeEnd
        diff = currentPrice - closest
        diffPercent = ((diff / currentPrice) * 100).toFixed(2)
      }
    } else {
      diff = currentPrice - target.value
      diffPercent = ((diff / currentPrice) * 100).toFixed(2)
    }

    return { ...target, position, positionEnd, diff, diffPercent }
  })
})

const formatAnalysisPrice = (val) => {
  return val || '無資料'
}

const isToday = (dateStr) => {
  const d = new Date(dateStr)
  const today = new Date()
  return d.getDate() === today.getDate() &&
         d.getMonth() === today.getMonth() &&
         d.getFullYear() === today.getFullYear()
}

// Get hits for a specific indicator type
const getIndicatorHits = (indicatorLabel) => {
  if (!props.item.hitHistory || props.item.hitHistory.length === 0) return []
  
  // Map indicator labels to hit types
  const typeMap = {
    '換股': 'swap',
    '支撐': 'support', 
    '短線': 'shortTerm',
    '波段': 'wave'
  }
  
  const hitType = typeMap[indicatorLabel]
  if (!hitType) return []
  
  return props.item.hitHistory.filter(hit => hit.type === hitType)
}

const getLatestHit = (indicatorLabel) => {
  const hits = getIndicatorHits(indicatorLabel)
  return hits.length > 0 ? hits[0] : null
}

const hasMoreHits = (indicatorLabel) => {
  const hits = getIndicatorHits(indicatorLabel)
  return hits.length > 1
}

const showHistoryForIndicator = ref({})
const hoverHistoryForIndicator = ref({})
</script>

<template>
  <div
    class="group relative rounded-xl p-4 border transition-all duration-300"
    :class="[
      isStealth
        ? 'bg-white border-gray-200 shadow-sm is-stealth'
        : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/80 hover:-translate-y-1 hover:shadow-xl',
      { 'limit-up-animation': isLimitHit && details.isUp && !isStealth },
      { 'limit-down-animation': isLimitHit && details.isDown && !isStealth },
    ]"
  >
    <!-- Badge for simple cards (e.g. 'NEW') or Analysis Source for Recognized cards -->
    <div
      class="absolute -top-2 -right-2 px-2 py-0.5 text-[10px] font-bold rounded shadow-lg z-10"
      :class="sourceBadgeClass"
    >
      {{ isStealth ? 'AI' : sourceLabel }}
    </div>

    <!-- Header -->
    <div class="flex justify-between items-start mb-2">
      <div class="flex items-center gap-2">
        <span
          class="text-2xl font-bold tracking-tight"
          :class="isStealth ? 'text-slate-700' : 'text-white'"
        >
          {{ displaySymbol }}
        </span>
        <!-- 置頂按鈕 -->
        <button
          @click="$emit('togglePin', displaySymbol)"
          class="text-lg transition-all"
          :class="
            item.isPinned
              ? isStealth
                ? 'text-yellow-600 hover:text-yellow-700 scale-125'
                : 'text-yellow-400 hover:text-yellow-300 scale-125'
              : 'opacity-30 hover:opacity-100 ' +
                (isStealth
                  ? 'text-gray-400 hover:text-yellow-600'
                  : 'text-gray-600 hover:text-yellow-400')
          "
          :title="item.isPinned ? '取消置頂' : '置頂'"
        >
          {{ item.isPinned ? '📌' : '📍' }}
        </button>
        <span v-if="item.market" class="text-xs opacity-50">
           {{ item.market.name }}
        </span>
      </div>

      <!-- 刪除按鈕 (For simple cards, it was separate. For recognized, it was optional. Keeping it here) -->
       <button
          v-if="allowDelete"
          @click="$emit('remove', item.id || item._id)"
          class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400"
        >
          ✕
        </button>
    </div>

    <!-- Market Data -->
    <div v-if="item.market" class="space-y-2 mb-3 pb-3 border-b" :class="isStealth ? 'border-gray-200' : 'border-zinc-700'">
      <div class="flex items-end gap-3">
        <div
          class="text-4xl leading-none tabular-nums tracking-tight transition-all duration-500"
          :class="[
            details.colorClass,
            isLimitHit && !isStealth
              ? details.isUp
                ? 'bg-red-500 text-white px-3 py-1 rounded-lg'
                : 'bg-green-500 text-white px-3 py-1 rounded-lg'
              : '',
          ]"
        >
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
        class="flex justify-between items-center text-xs"
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
    <div v-else class="h-20 flex items-center justify-center text-sm opacity-30 animate-pulse mb-3 pb-3 border-b">
      Syncing...
    </div>

    <!-- Analysis Section (Only for Recognized/System Items) -->
    
      <div v-if="priceChart" class="mb-3">
        <div class="text-[10px] opacity-60 mb-2 uppercase tracking-wider">價格區間分析</div>
        <div
          class="relative h-16 bg-linear-to-r from-transparent via-white/5 to-transparent rounded-lg my-8"
        >
        
          <div v-for="point in priceChart" :key="point.label + point.value">
            <div
              v-if="point.isRange && point.positionEnd"
              class="absolute h-16 bg-cyan-500/20 border-l-2 border-r-2 border-cyan-500"
              :style="{ left: point.position + '%', width: point.positionEnd - point.position + '%' }"
            >
              <div
                class="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold whitespace-nowrap"
                :class="isStealth ? 'text-slate-600' : 'text-cyan-400'"
              >
                {{ point.label }}
              </div>
            </div>

            <div
              v-else
              class="absolute transform -translate-x-1/2 flex flex-col items-center"
              :style="{ left: point.position + '%' }"
            >
              <div
                class="w-px h-16 opacity-30"
                :class="{
                  'bg-cyan-500': point.color === 'cyan' && !isStealth,
                  'bg-emerald-500': point.color === 'emerald' && !isStealth,
                  'bg-rose-500': point.color === 'rose' && !isStealth,
                  'bg-amber-500': point.color === 'amber' && !isStealth,
                  'bg-white': point.isCurrent && !isStealth,
                  'bg-slate-800': point.isCurrent && point.isUp && isStealth,
                  'bg-slate-400': point.isCurrent && !point.isUp && isStealth,
                  'bg-slate-300': !point.isCurrent && isStealth,
                  'bg-gray-700': point.isCurrent && isStealth && !point.isUp && !point.isDown,
                }"
              ></div>

              <div
                class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 shadow-lg"
                :class="{
                  'bg-cyan-500 border-cyan-400': point.color === 'cyan' && !isStealth,
                  'bg-emerald-500 border-emerald-400': point.color === 'emerald' && !isStealth,
                  'bg-rose-500 border-rose-400': point.color === 'rose' && !isStealth,
                  'bg-amber-500 border-amber-400': point.color === 'amber' && !isStealth,
                  'bg-white border-zinc-200 scale-125': point.isCurrent && !isStealth,
                  'bg-slate-800 border-slate-900 scale-125': point.isCurrent && point.isUp && isStealth,
                  'bg-slate-300 border-slate-400 scale-110': point.isCurrent && point.isDown && isStealth,
                  'bg-slate-200 border-slate-300': !point.isCurrent && isStealth,
                }"
              ></div>
              <div
                class="absolute -top-6 text-[10px] font-bold whitespace-nowrap"
                :class="[
                  isStealth ? 'text-slate-600' : 'text-white',
                  point.isCurrent ? 'scale-110' : 'opacity-70',
                  isStealth && point.isCurrent && point.isUp ? 'font-black text-slate-900' : '',
                ]"
              >
                {{ point.label }}
              </div>
              <div class="absolute -bottom-6 text-[9px] font-mono opacity-70 whitespace-nowrap">
                {{ point.value.toFixed(1) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 mt-3">
        <!-- Regular Indicators with Hit History -->
        <div
          v-for="conf in [
            INDICATOR_COLORS.swap,
            INDICATOR_COLORS.support,
            INDICATOR_COLORS.shortTerm,
            INDICATOR_COLORS.wave,
          ].filter(c => item[c.key])"
          :key="conf.key"
          @click="() => { if (hasMoreHits(conf.label)) showHistoryForIndicator[conf.label] = !showHistoryForIndicator[conf.label] }"
          @mouseenter="() => { if (hasMoreHits(conf.label)) hoverHistoryForIndicator[conf.label] = true }"
          @mouseleave="() => { if (hasMoreHits(conf.label)) hoverHistoryForIndicator[conf.label] = false }"
          class="relative flex flex-col p-2 rounded-xl border transition-all duration-500 min-h-22 max-h-56"
          :class="[
            isStealth ? 'bg-gray-50 border-gray-100' : 'bg-white/5 border-transparent',
            priceInRange.matchedIndicators.includes(conf.label)
              ? [
                  !isStealth ? `indicator-active-hit-${conf.indicatorClass}` : 'border-slate-400 shadow-md',
                  'border-2',
                  isStealth ? 'bg-gray-200 text-slate-900 font-bold' : conf.textClass,
                ]
              : '',
            hasMoreHits(conf.label) ? 'cursor-pointer group' : ''
          ]"
        >
          <div class="flex justify-between items-start mb-1">
            <span class="text-[10px] uppercase font-bold tracking-wider opacity-50 flex items-center gap-1">
              {{ conf.label }}
              <span v-if="getIndicatorHits(conf.label).length > 0" class="text-[8px] opacity-70">
                ({{ getIndicatorHits(conf.label).length }})
              </span>
            </span>
            <div class="flex items-center gap-1">
              <span
                v-if="priceChart"
                class="text-[10px] font-mono font-bold"
                :class="[isStealth ? 'text-slate-500' : conf.textClass]"
              >
                <template v-if="priceChart.find((p) => p.label === conf.label)">
                  {{
                    priceChart.find((p) => p.label === conf.label).diff === 0
                      ? 'HIT'
                      : (priceChart.find((p) => p.label === conf.label).diffPercent >= 0 ? '+' : '') +
                        priceChart.find((p) => p.label === conf.label).diffPercent +
                        '%'
                  }}
                </template>
                <template v-else>-</template>
              </span>
              <span v-if="hasMoreHits(conf.label)" class="text-[9px] opacity-50 group-hover:opacity-100 transition-opacity ml-1">
                {{ showHistoryForIndicator[conf.label] ? '▼' : '▲' }}
              </span>
            </div>
          </div>
          <div
            class="text-sm font-mono font-black"
            :class="isStealth ? 'text-slate-700' : conf.textClass"
          >
            {{ formatAnalysisPrice(item[conf.key]) }}
          </div>

          <!-- Latest Hit Info -->
          <div v-if="getLatestHit(conf.label)" class="mt-2 pt-2 border-t" :class="isStealth ? 'border-gray-200' : 'border-zinc-700'">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1">
                <span class="relative flex h-1.5 w-1.5">
                  <template v-if="isToday(getLatestHit(conf.label).happenedAt)">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                  </template>
                </span>
                <span class="text-[9px] font-mono font-bold" :class="isStealth ? 'text-slate-900' : 'text-white'">
                  {{ getLatestHit(conf.label).triggerPrice.toFixed(2) }}
                </span>
              </div>
              <span class="text-[9px] font-mono" :class="isToday(getLatestHit(conf.label).happenedAt) ? 'text-red-400 font-bold' : 'opacity-50'">
                {{ isToday(getLatestHit(conf.label).happenedAt) ? 'TODAY' : new Date(getLatestHit(conf.label).happenedAt).toLocaleDateString('en-CA').slice(5) }}
              </span>
            </div>
          </div>

          <!-- Expanded Hit History -->
          <transition
            enter-active-class="transition-all duration-300 ease-out"
            leave-active-class="transition-all duration-200 ease-in"
            enter-from-class="opacity-0 max-h-0"
            enter-to-class="opacity-100 max-h-40"
            leave-from-class="opacity-100 max-h-40"
            leave-to-class="opacity-0 max-h-0"
          >
            <div v-if="(showHistoryForIndicator[conf.label] || hoverHistoryForIndicator[conf.label]) && hasMoreHits(conf.label)" class="mt-2 pt-2 border-t overflow-hidden" :class="isStealth ? 'border-gray-200' : 'border-zinc-700'">
              <div class="max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                <ul class="space-y-1">
                  <li v-for="hit in getIndicatorHits(conf.label).slice(1, 10)" :key="hit._id" 
                    class="flex justify-between items-center text-[10px] py-0.5 px-1 rounded opacity-70 hover:opacity-100 transition-all"
                  >
                    <span class="font-mono font-bold" :class="isStealth ? 'text-slate-900' : 'text-white'">
                      {{ hit.triggerPrice.toFixed(2) }}
                    </span>
                    <span class="font-mono opacity-50">
                      {{ new Date(hit.happenedAt).toLocaleDateString('en-CA').slice(5) }}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </transition>
        </div>
      </div>

      <div
        class="mt-3 pt-2 border-t text-xs opacity-50 flex justify-between items-center"
        :class="isStealth ? 'border-gray-100' : 'border-zinc-700/50'"
      >
        <span>{{
          new Date(item.updatedAt || item.createdAt).toLocaleString('zh-TW', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        }}</span>
      </div>
  </div>
</template>

<style scoped>
@keyframes limit-glow-red {
  0%,
  100% {
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
  0%,
  100% {
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

@keyframes indicator-glow-emerald {
  0%, 100% {
    background-color: rgba(16, 185, 129, 0.2);
    border-color: rgba(16, 185, 129, 0.6);
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
  }
  50% {
    background-color: rgba(16, 185, 129, 0.35);
    border-color: rgba(16, 185, 129, 1);
    box-shadow: 0 0 30px rgba(16, 185, 129, 0.5);
  }
}

@keyframes indicator-glow-cyan {
  0%, 100% {
    background-color: rgba(6, 182, 212, 0.2);
    border-color: rgba(6, 182, 212, 0.6);
    box-shadow: 0 0 20px rgba(6, 182, 212, 0.3);
  }
  50% {
    background-color: rgba(6, 182, 212, 0.35);
    border-color: rgba(6, 182, 212, 1);
    box-shadow: 0 0 30px rgba(6, 182, 212, 0.5);
  }
}

@keyframes indicator-glow-amber {
  0%, 100% {
    background-color: rgba(245, 158, 11, 0.2);
    border-color: rgba(245, 158, 11, 0.6);
    box-shadow: 0 0 20px rgba(245, 158, 11, 0.3);
  }
  50% {
    background-color: rgba(245, 158, 11, 0.35);
    border-color: rgba(245, 158, 11, 1);
    box-shadow: 0 0 30px rgba(245, 158, 11, 0.5);
  }
}

@keyframes indicator-glow-rose {
  0%, 100% {
    background-color: rgba(244, 63, 94, 0.2);
    border-color: rgba(244, 63, 94, 0.6);
    box-shadow: 0 0 20px rgba(244, 63, 94, 0.3);
  }
  50% {
    background-color: rgba(244, 63, 94, 0.35);
    border-color: rgba(244, 63, 94, 1);
    box-shadow: 0 0 30px rgba(244, 63, 94, 0.5);
  }
}

.indicator-active-hit-emerald {
  animation: indicator-glow-emerald 1.5s ease-in-out infinite;
  z-index: 10;
}
.indicator-active-hit-cyan {
  animation: indicator-glow-cyan 1.5s ease-in-out infinite;
  z-index: 10;
}
.indicator-active-hit-amber {
  animation: indicator-glow-amber 1.5s ease-in-out infinite;
  z-index: 10;
}
.indicator-active-hit-rose {
  animation: indicator-glow-rose 1.5s ease-in-out infinite;
  z-index: 10;
}

/* Custom Scrollbar */
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(155, 155, 155, 0.5) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(155, 155, 155, 0.4);
  border-radius: 10px;
  border: 1px solid transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(155, 155, 155, 0.7);
}

/* Stealth Mode adjustments for scrollbar */
.is-stealth .custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
}
.is-stealth .custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.4);
}
</style>
