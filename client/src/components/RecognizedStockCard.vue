<script setup>
import { computed } from 'vue'

const props = defineProps(['item', 'isStealth'])
const emit = defineEmits(['remove', 'toggleFavorite'])

// --- 工具函式 ---
const formatPrice = (val) => {
  const num = parseFloat(val)
  return isNaN(num) ? '-' : num.toFixed(1)
}

const formatNumber = (val) => (val ? parseInt(val).toLocaleString() : '-')

const formatAnalysisPrice = (val) => {
  return val || '無資料'
}

// --- 計算屬性 ---

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

const favoriteIcon = computed(() => {
  return props.item.isFavorite ? '⭐' : '☆'
})

const marketDetails = computed(() => {
  const stock = props.item
  if (!stock.market || stock.market.yesterdayClose == null) {
    return { diff: '0.0', percent: '0.00', isUp: false, isDown: false, colorClass: 'text-gray-500' }
  }

  const c = parseFloat(stock.market.currentPrice)
  const y = parseFloat(stock.market.yesterdayClose)
  const diff = c - y
  const percent = ((diff / y) * 100).toFixed(2)
  const isUp = diff > 0
  const isDown = diff < 0

  let colorClass = 'text-gray-500'
  if (!props.isStealth) {
    colorClass = isUp ? 'text-red-400' : isDown ? 'text-green-400' : 'text-white'
  } else {
    colorClass = isUp ? 'text-red-600' : isDown ? 'text-green-600' : 'text-slate-600'
  }

  return {
    diff: Math.abs(diff).toFixed(1),
    percent: Math.abs(parseFloat(percent)).toFixed(2),
    isUp,
    isDown,
    colorClass,
  }
})

const daysLeft = computed(() => {
  const created = new Date(props.item.createdAt)
  if (isNaN(created.getTime())) return 0
  const now = new Date()
  const diffTime = 30 * 24 * 60 * 60 * 1000 - (now - created)
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays)
})

const priceInRange = computed(() => {
  if (!props.item.market) return { inRange: false, matchedIndicator: null }

  const currentPrice = parseFloat(props.item.market.currentPrice)
  if (isNaN(currentPrice)) return { inRange: false, matchedIndicator: null }

  const tolerance = 0.5

  if (props.item.support) {
    const supportStr = props.item.support.toString()
    if (supportStr.includes('-')) {
      const [low, high] = supportStr.split('-').map((v) => parseFloat(v.trim()))
      if (!isNaN(low) && !isNaN(high) && currentPrice >= low && currentPrice <= high) {
        return { inRange: true, matchedIndicator: '支撐區間', color: 'blue' }
      }
    } else {
      const val = parseFloat(supportStr)
      if (!isNaN(val) && Math.abs(currentPrice - val) <= tolerance) {
        return { inRange: true, matchedIndicator: '支撐', color: 'blue' }
      }
    }
  }

  const indicators = [
    { key: 'shortTermProfit', label: '短線', color: 'green' },
    { key: 'waveProfit', label: '波段', color: 'purple' },
    { key: 'swapRef', label: '換股', color: 'orange' },
  ]

  for (const ind of indicators) {
    const val = parseFloat(props.item[ind.key])
    if (!isNaN(val) && Math.abs(currentPrice - val) <= tolerance) {
      return { inRange: true, matchedIndicator: ind.label, color: ind.color }
    }
  }

  return { inRange: false, matchedIndicator: null }
})

const priceChart = computed(() => {
  if (!props.item.market) return null

  const currentPrice = parseFloat(props.item.market.currentPrice)
  if (isNaN(currentPrice)) return null

  const targets = []

  if (props.item.support) {
    const supportStr = props.item.support.toString()
    if (supportStr.includes('-')) {
      const parts = supportStr.split('-').map((p) => parseFloat(p.trim()))
      if (!isNaN(parts[0]) && !isNaN(parts[1])) {
        targets.push({
          label: '支撐',
          value: parts[0],
          color: 'blue',
          isRange: true,
          rangeEnd: parts[1],
          rangeLabel: `${parts[0]}-${parts[1]}`,
        })
      }
    } else {
      const val = parseFloat(supportStr)
      if (!isNaN(val)) targets.push({ label: '支撐', value: val, color: 'blue' })
    }
  }

  const otherKeys = [
    { key: 'shortTermProfit', label: '短線', color: 'green' },
    { key: 'waveProfit', label: '波段', color: 'purple' },
    { key: 'swapRef', label: '換股', color: 'orange' },
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
    { label: '現價', value: currentPrice, color: 'current', isCurrent: true },
  ]
  finalPoints.sort((a, b) => a.value - b.value)

  return finalPoints.map((target) => {
    const position = ((target.value - minPrice) / priceRange) * 100
    const positionEnd = target.rangeEnd ? ((target.rangeEnd - minPrice) / priceRange) * 100 : null

    let diff, diffPercent
    if (target.rangeEnd) {
      if (currentPrice >= target.value && currentPrice <= target.rangeEnd) {
        diff = 0
      } else {
        const closest = currentPrice < target.value ? target.value : target.rangeEnd
        diff = closest - currentPrice
      }
    } else {
      diff = target.value - currentPrice
    }
    diffPercent = ((diff / currentPrice) * 100).toFixed(2)

    return { ...target, position, positionEnd, diff, diffPercent }
  })
})
</script>

<template>
  <div
    class="group relative rounded-xl p-5 border transition-all duration-300"
    :class="[
      isStealth
        ? 'bg-white border-gray-200 shadow-sm'
        : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/80 hover:-translate-y-1 hover:shadow-xl',
      item.isFavorite && !isStealth ? 'border-yellow-500/50!' : '',
    ]"
  >
    <div
      class="absolute -top-2 -right-2 px-2 py-0.5 text-white text-[10px] font-bold rounded shadow-lg z-10"
      :class="sourceBadgeClass"
    >
      {{ isStealth ? 'AI' : sourceLabel }}
    </div>

    <div class="flex justify-between items-start mb-3">
      <div class="flex items-center gap-2">
        <span
          class="text-2xl font-bold tracking-tight"
          :class="isStealth ? 'text-slate-700' : 'text-white'"
        >
          {{ item.code }}
        </span>
        <button
          @click="$emit('toggleFavorite', item._id)"
          class="text-xl transition-all hover:scale-125"
          :class="item.isFavorite ? 'opacity-100' : 'opacity-30 hover:opacity-100'"
        >
          {{ favoriteIcon }}
        </button>
        <span v-if="item.market" class="text-xs opacity-50">
          {{ isStealth ? 'Node' : item.market.name }}
        </span>
      </div>
      <button
        @click="$emit('remove', item._id)"
        class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400"
      >
        ✕
      </button>
    </div>

    <div
      v-if="item.market"
      class="space-y-3 mb-4 pb-4 border-b"
      :class="isStealth ? 'border-gray-200' : 'border-zinc-700'"
    >
      <div class="flex items-end gap-3">
        <div
          class="text-4xl font-extrabold leading-none tabular-nums tracking-tight"
          :class="marketDetails.colorClass"
        >
          {{ formatPrice(item.market.currentPrice) }}
        </div>
        <div class="flex flex-col text-xs font-medium mb-1" :class="marketDetails.colorClass">
          <span class="flex items-center">
            {{
              marketDetails.isUp
                ? isStealth
                  ? '+'
                  : '▲'
                : marketDetails.isDown
                  ? isStealth
                    ? '-'
                    : '▼'
                  : ''
            }}
            {{ marketDetails.diff }}
          </span>
          <span class="opacity-80">{{ marketDetails.percent }}%</span>
        </div>
      </div>
      <div
        class="flex justify-between items-center text-xs"
        :class="isStealth ? 'text-gray-500' : 'text-gray-400'"
      >
        <div class="flex flex-col">
          <span class="opacity-50 scale-90 origin-left uppercase">前收</span>
          <span class="font-mono">{{ formatPrice(item.market.yesterdayClose) }}</span>
        </div>
        <div class="flex flex-col items-end">
          <span class="opacity-50 scale-90 origin-right uppercase">量</span>
          <span class="font-mono">{{ formatNumber(item.market.volume) }}</span>
        </div>
      </div>
    </div>
    <div
      v-else
      class="h-20 flex items-center justify-center text-sm opacity-30 animate-pulse mb-4 pb-4 border-b"
    >
      Syncing...
    </div>

    <div v-if="priceChart" class="mb-4">
      <div class="text-xs opacity-60 mb-4 uppercase">價格區間分析</div>
      <div
        class="relative h-16 bg-linear-to-r from-transparent via-white/5 to-transparent rounded-lg my-12"
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
            class="absolute h-16 bg-blue-500/20 border-l-2 border-r-2 border-blue-500"
            :style="{ left: point.position + '%', width: point.positionEnd - point.position + '%' }"
          >
            <div
              class="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] font-bold whitespace-nowrap"
              :class="isStealth ? 'text-slate-600' : 'text-blue-400'"
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
                'bg-blue-500': point.color === 'blue',
                'bg-green-500': point.color === 'green',
                'bg-purple-500': point.color === 'purple',
                'bg-orange-500': point.color === 'orange',
                'bg-red-500': point.isCurrent && !isStealth,
                'bg-gray-700': point.isCurrent && isStealth,
              }"
            ></div>
            <div
              class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 shadow-lg"
              :class="{
                'bg-blue-500 border-blue-400': point.color === 'blue',
                'bg-green-500 border-green-400': point.color === 'green',
                'bg-purple-500 border-purple-400': point.color === 'purple',
                'bg-orange-500 border-orange-400': point.color === 'orange',
                'bg-red-500 border-red-400 scale-125': point.isCurrent && !isStealth,
                'bg-gray-700 border-gray-600 scale-125': point.isCurrent && isStealth,
              }"
            ></div>
            <div
              class="absolute -top-8 text-[10px] font-bold whitespace-nowrap"
              :class="[
                isStealth ? 'text-slate-600' : 'text-white',
                point.isCurrent ? 'scale-110' : 'opacity-70',
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
          { label: '換股', key: 'swapRef', color: 'text-orange-400', indicatorColor: 'orange' },
          { label: '支撐', key: 'support', color: 'text-blue-400', indicatorColor: 'blue' },
          {
            label: '短線',
            key: 'shortTermProfit',
            color: 'text-green-400',
            indicatorColor: 'green',
          },
          { label: '波段', key: 'waveProfit', color: 'text-purple-400', indicatorColor: 'purple' },
        ]"
        :key="conf.key"
        class="relative flex flex-col p-3 rounded-xl border transition-all duration-500"
        :class="[
          isStealth ? 'bg-gray-50 border-gray-100' : 'bg-white/5 border-transparent',

          // 命中時觸發自定義閃爍動畫
          priceInRange.inRange &&
          (priceInRange.matchedIndicator === conf.label ||
            (priceInRange.matchedIndicator === '支撐區間' && conf.label === '支撐'))
            ? [
                'indicator-active-hit',
                'border-2',
                'shadow-lg',
                isStealth ? 'text-slate-600' : conf.color,
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
                  : (priceChart.find((p) => p.label === conf.label).diff > 0 ? '+' : '') +
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

    <div
      class="mt-4 pt-3 border-t text-xs opacity-50 flex justify-between items-center"
      :class="isStealth ? 'border-gray-100' : 'border-zinc-700/50'"
    >
      <span>{{
        new Date(item.createdAt).toLocaleString('zh-TW', {
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
@keyframes indicator-glow {
  0%,
  100% {
    background-color: rgba(currentColor, 0.1);
    border-color: rgba(currentColor, 0.4);
  }
  50% {
    background-color: rgba(currentColor, 0.25);
    border-color: rgba(currentColor, 0.9);
  }
}

.indicator-active-hit {
  /* 這裡使用 currentColor 會自動抓取 class 中的 text-{color} */
  animation: indicator-glow 1.5s ease-in-out infinite;
  z-index: 10;
  border-color: currentColor !important;
}
</style>
