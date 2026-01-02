<script setup>
import { computed, toRef } from 'vue'
import { useStockFormatter } from '@/composables/useStockFormatter'
import { useStockDetails } from '@/composables/useStockDetails'

const { formatPrice, formatNumber } = useStockFormatter()

const props = defineProps({
  item: Object,
  isStealth: Boolean,
  badge: String,
  allowDelete: {
    type: Boolean,
    default: true
  }
})
const emit = defineEmits(['remove', 'togglePin'])

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

const daysLeft = computed(() => {
  const dateStr = props.item.updatedAt || props.item.createdAt
  const trackingDate = new Date(dateStr)

  if (isNaN(trackingDate.getTime())) return 0

  const now = new Date()
  const expiryDate = new Date(trackingDate)
  expiryDate.setDate(expiryDate.getDate() + 30)

  const diffTime = expiryDate - now
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  return Math.max(0, diffDays)
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
    { key: 'shortTermProfit', label: '短線', color: 'orange' },
    { key: 'waveProfit', label: '波段', color: 'red' },
    { key: 'swapRef', label: '換股', color: 'green' },
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

const getHitTypeName = (type) => {
  const names = {
    shortTerm: '短線',
    wave: '波段',
    support: '支撐',
    swap: '換股',
  }
  return names[type] || type
}

const getHitTypeClass = (type, isStealth) => {
  const colors = {
    shortTerm: { normal: 'bg-orange-500/20 text-orange-300', stealth: 'bg-orange-100 text-orange-700' },
    wave: { normal: 'bg-red-500/20 text-red-300', stealth: 'bg-red-100 text-red-700' },
    support: { normal: 'bg-cyan-500/20 text-cyan-300', stealth: 'bg-cyan-100 text-cyan-700' },
    swap: { normal: 'bg-green-500/20 text-green-400', stealth: 'bg-green-100 text-green-700' },
  }
  const style = colors[type] || { normal: 'bg-zinc-700 text-zinc-300', stealth: 'bg-slate-200 text-slate-600' }
  return isStealth ? style.stealth : style.normal
}
</script>

<template>
  <div
    class="group relative rounded-xl p-5 border transition-all duration-300"
    :class="[
      isStealth
        ? 'bg-white border-gray-200 shadow-sm'
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
    <div class="flex justify-between items-start mb-3">
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
    <div v-if="item.market" class="space-y-3 mb-4 pb-4 border-b" :class="isStealth ? 'border-gray-200' : 'border-zinc-700'">
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
    <div v-else class="h-20 flex items-center justify-center text-sm opacity-30 animate-pulse mb-4 pb-4 border-b">
      Syncing...
    </div>

    <!-- Analysis Section (Only for Recognized/System Items) -->
    
      <div v-if="priceChart" class="mb-4">
        <div class="text-xs opacity-60 mb-4 uppercase">價格區間分析</div>
        <div
          class="relative h-16 bg-gradient-to-r from-transparent via-white/5 to-transparent rounded-lg my-12"
        >
          <div class="absolute inset-0 flex justify-between px-2">
            <div
              v-for="i in 5"
              :key="i"
              class="w-px h-full opacity-10"
              :class="isStealth ? 'bg-gray-300' : 'bg-white'"
            ></div>
          </div>

          <div v-for="point in priceChart" :key="point.label + point.value">
            <div
              v-if="point.isRange && point.positionEnd"
              class="absolute h-16 bg-cyan-500/20 border-l-2 border-r-2 border-cyan-500"
              :style="{ left: point.position + '%', width: point.positionEnd - point.position + '%' }"
            >
              <div
                class="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] font-bold whitespace-nowrap"
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
                  'bg-green-500': point.color === 'green' && !isStealth,
                  'bg-red-500': point.color === 'red' && !isStealth,
                  'bg-orange-500': point.color === 'orange' && !isStealth,
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
                  'bg-green-500 border-green-400': point.color === 'green' && !isStealth,
                  'bg-red-500 border-red-400': point.color === 'red' && !isStealth,
                  'bg-orange-500 border-orange-400': point.color === 'orange' && !isStealth,
                  'bg-white border-zinc-200 scale-125': point.isCurrent && !isStealth,
                  'bg-slate-800 border-slate-900 scale-125': point.isCurrent && point.isUp && isStealth,
                  'bg-slate-300 border-slate-400 scale-110': point.isCurrent && point.isDown && isStealth,
                  'bg-slate-200 border-slate-300': !point.isCurrent && isStealth,
                }"
              ></div>
              <div
                class="absolute -top-8 text-[10px] font-bold whitespace-nowrap"
                :class="[
                  isStealth ? 'text-slate-600' : 'text-white',
                  point.isCurrent ? 'scale-110' : 'opacity-70',
                  isStealth && point.isCurrent && point.isUp ? 'font-black text-slate-900' : '',
                ]"
              >
                {{ point.label }}
              </div>
              <div class="absolute -bottom-8 text-[9px] font-mono opacity-70 whitespace-nowrap">
                {{ point.value.toFixed(1) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 mt-4">
        <div
          v-for="conf in [
            { label: '換股', key: 'swapRef', color: 'text-green-400', indicatorColor: 'green', bgColor: 'bg-green-500/20' },
            { label: '支撐', key: 'support', color: 'text-cyan-400', indicatorColor: 'cyan', bgColor: 'bg-cyan-500/20' },
            { label: '短線', key: 'shortTermProfit', color: 'text-orange-400', indicatorColor: 'orange', bgColor: 'bg-orange-500/20' },
            { label: '波段', key: 'waveProfit', color: 'text-red-400', indicatorColor: 'red', bgColor: 'bg-red-500/20' },
          ].filter(c => item[c.key])"
          :key="conf.key"
          class="relative flex flex-col p-3 rounded-xl border transition-all duration-500"
          :class="[
            isStealth ? 'bg-gray-50 border-gray-100' : 'bg-white/5 border-transparent',
            priceInRange.matchedIndicators.includes(conf.label)
              ? [
                  !isStealth ? `indicator-active-hit-${conf.indicatorColor}` : 'border-slate-400 shadow-md',
                  'border-2',
                  isStealth ? 'bg-gray-200 text-slate-900 font-bold' : conf.color,
                ]
              : '',
          ]"
        >
          <div class="flex justify-between items-start mb-1">
            <span class="text-[10px] uppercase font-bold tracking-wider opacity-50">
              {{ conf.label }}
            </span>
            <span
              v-if="priceChart"
              class="text-[10px] font-mono font-bold"
              :class="[isStealth ? 'text-slate-500' : conf.color]"
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
          </div>
          <div
            class="text-sm font-mono font-black"
            :class="isStealth ? 'text-slate-700' : conf.color"
          >
            {{ formatAnalysisPrice(item[conf.key]) }}
          </div>
        </div>
      </div>

      <!-- Hit History -->
      <div v-if="item.hitHistory && item.hitHistory.length > 0" class="mt-4 pt-4 border-t" :class="isStealth ? 'border-gray-200' : 'border-zinc-800'">
        <h4 class="text-[10px] font-bold opacity-50 mb-2 uppercase tracking-wider">觸及歷史</h4>
        <ul class="space-y-1.5 text-xs">
          <li v-for="hit in item.hitHistory.slice(0, 3)" :key="hit._id" class="flex justify-between items-center opacity-80 hover:opacity-100">
            <span class="font-bold px-1.5 py-0.5 rounded text-[9px] tracking-tight" :class="getHitTypeClass(hit.type, isStealth)">
              {{ getHitTypeName(hit.type) }}
            </span>
            <span class="font-mono" :class="isStealth ? 'text-slate-600' : 'text-gray-300'">
              {{ hit.triggerPrice.toFixed(2) }}
            </span>
            <span class="opacity-60 font-mono text-[11px]">
              {{ new Date(hit.happenedAt).toLocaleDateString('en-CA') }}
            </span>
          </li>
        </ul>
      </div>

      <div
        class="mt-4 pt-3 border-t text-xs opacity-50 flex justify-between items-center"
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
        <span class="text-[10px] opacity-70">
          {{ isStealth ? 'Exp' : '追蹤' }}: {{ daysLeft }} {{ isStealth ? 'D' : '天' }}
        </span>
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

@keyframes indicator-glow-green {
  0%, 100% {
    background-color: rgba(34, 197, 94, 0.2);
    border-color: rgba(34, 197, 94, 0.6);
    box-shadow: 0 0 20px rgba(34, 197, 94, 0.3);
  }
  50% {
    background-color: rgba(34, 197, 94, 0.35);
    border-color: rgba(34, 197, 94, 1);
    box-shadow: 0 0 30px rgba(34, 197, 94, 0.5);
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

@keyframes indicator-glow-orange {
  0%, 100% {
    background-color: rgba(249, 115, 22, 0.2);
    border-color: rgba(249, 115, 22, 0.6);
    box-shadow: 0 0 20px rgba(249, 115, 22, 0.3);
  }
  50% {
    background-color: rgba(249, 115, 22, 0.35);
    border-color: rgba(249, 115, 22, 1);
    box-shadow: 0 0 30px rgba(249, 115, 22, 0.5);
  }
}

@keyframes indicator-glow-red {
  0%, 100% {
    background-color: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.6);
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
  }
  50% {
    background-color: rgba(239, 68, 68, 0.35);
    border-color: rgba(239, 68, 68, 1);
    box-shadow: 0 0 30px rgba(239, 68, 68, 0.5);
  }
}

.indicator-active-hit-green {
  animation: indicator-glow-green 1.5s ease-in-out infinite;
  z-index: 10;
}
.indicator-active-hit-cyan {
  animation: indicator-glow-cyan 1.5s ease-in-out infinite;
  z-index: 10;
}
.indicator-active-hit-orange {
  animation: indicator-glow-orange 1.5s ease-in-out infinite;
  z-index: 10;
}
.indicator-active-hit-red {
  animation: indicator-glow-red 1.5s ease-in-out infinite;
  z-index: 10;
}
</style>
