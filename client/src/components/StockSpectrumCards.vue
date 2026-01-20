<script setup>
import { computed } from 'vue'
import { useStockStore } from '@/stores/stockStore'
import { storeToRefs } from 'pinia'
import { useStockColors } from '@/composables/useStockColors'

const stockStore = useStockStore()
const { processedRecognizedStocks, isStealth } = storeToRefs(stockStore)
const { INDICATOR_COLORS } = useStockColors()

// Define the 4 Zones
const zones = [
  { id: 'swap', label: INDICATOR_COLORS.swap.label, color: INDICATOR_COLORS.swap },
  { id: 'support', label: INDICATOR_COLORS.support.label, color: INDICATOR_COLORS.support },
  { id: 'shortTerm', label: INDICATOR_COLORS.shortTerm.label, color: INDICATOR_COLORS.shortTerm },
  { id: 'wave', label: INDICATOR_COLORS.wave.label, color: INDICATOR_COLORS.wave }
]

// Same logic as StockSpectrumChart
const getStrategicScore = (stock) => {
  if (!stock.market || !stock.market.currentPrice) return null
  const P = parseFloat(stock.market.currentPrice)
  
  let Swap = parseFloat(stock.swapRef)
  let SupportMin = null
  let SupportMax = null
  
  if (stock.support) {
    const sStr = stock.support.toString()
    if (sStr.includes('-')) {
      const parts = sStr.split('-').map(v => parseFloat(v.trim()))
      SupportMin = parts[0]; SupportMax = parts[1]
    } else {
      const val = parseFloat(sStr)
      SupportMin = val - 0.5; SupportMax = val + 0.5
    }
  }

  if (SupportMin === null) return 2.0 // Fallback

  const Short = parseFloat(stock.shortTermProfit)
  const Wave = parseFloat(stock.waveProfit)
  
  if (!Swap || isNaN(Swap)) Swap = SupportMin * 0.9
  if (Swap >= SupportMin) Swap = SupportMin * 0.9

  const effShort = Short || (SupportMax * 1.1)
  const effWave = Wave || (effShort * 1.1)

  // Calculate Score
  if (P <= Swap) {
    // Zone 1: Below Swap (X <= 1.3)
    return 1.0 // Assign generic score for sorting/grouping
  }
  if (P < SupportMin) {
    // Gap 1 (1.35 ~ 1.65)
    return 1.5
  }
  if (P <= SupportMax) {
    // Zone 2: Support (1.75 ~ 2.25)
    return 2.0
  }
  if (P < effShort) {
    // Gap 2 (2.35 ~ 2.65)
    return 2.5
  }
  if (P < effWave) {
    // Zone 3: Short (2.75 ~ 3.65)
    return 3.0
  }
  // Zone 4: Wave (3.75+)
  return 4.0
}

const categorizedStocks = computed(() => {
  const result = { swap: [], support: [], shortTerm: [], wave: [] }
  const sourceList = processedRecognizedStocks.value

  sourceList.forEach(stock => {
    const score = getStrategicScore(stock)
    if (score === null) return

    let zone = null
    
    // Strict Filtering based on Score ranges (matching Chart logic)
    // Swap: <= 1.3
    // Gap: 1.3 < x < 1.7 (Ignored)
    // Support: 1.7 <= x <= 2.3
    // Gap: 2.3 < x < 2.7 (Ignored)
    // Short: 2.7 <= x < 3.7
    // Wave: >= 3.7

    // Using simplified discrete scores from helper above:
    // 1.0 -> Swap
    // 1.5 -> Gap
    // 2.0 -> Support
    // 2.5 -> Gap
    // 3.0 -> Short
    // 4.0 -> Wave

    if (score === 1.0) zone = 'swap'
    else if (score === 2.0) zone = 'support'
    else if (score === 3.0) zone = 'shortTerm'
    else if (score >= 4.0) zone = 'wave'
    
    // If zone is null (gaps), we skip it

    if (zone) {
      const yesterdayClose = parseFloat(stock.market?.yesterdayClose)
      const currentPrice = parseFloat(stock.market?.currentPrice)
      const percent = yesterdayClose ? ((currentPrice - yesterdayClose) / yesterdayClose) * 100 : 0
      result[zone].push({ ...stock, percent })
    }
  })

  Object.keys(result).forEach(key => result[key].sort((a, b) => b.percent - a.percent))
  return result
})

const getPercentClass = (percent) => {
  if (isStealth.value) {
     return 'text-slate-700'
  }
  if (percent > 0) return 'text-red-400'
  if (percent < 0) return 'text-green-400'
  return 'text-zinc-400'
}

const getBgClass = (zoneId) => {
  const mapping = {
    swap: isStealth.value ? 'bg-white border-slate-200 border-t-emerald-500' : 'bg-emerald-500/5 border-emerald-500/10',
    support: isStealth.value ? 'bg-white border-slate-200 border-t-cyan-500' : 'bg-cyan-500/5 border-cyan-500/10',
    shortTerm: isStealth.value ? 'bg-white border-slate-200 border-t-amber-500' : 'bg-amber-500/5 border-amber-500/10',
    wave: isStealth.value ? 'bg-white border-slate-200 border-t-rose-500' : 'bg-rose-500/5 border-rose-500/10'
  }
  return mapping[zoneId]
}
</script>

<template>
  <div class="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
    <div v-for="zone in zones" :key="zone.id"
      class="flex flex-col rounded-xl border overflow-hidden min-h-[100px] transition-all"
      :class="[
        getBgClass(zone.id), 
        isStealth ? 'shadow-sm border-t-4' : 'border border-zinc-800'
      ]"
    >
      <div class="py-2 px-3 text-xs font-bold uppercase tracking-widest text-center border-b"
        :class="isStealth ? 'text-slate-600 bg-slate-50 border-slate-100' : `${zone.color.textClass} ${zone.color.bgClass} border-zinc-800`"
      >
        {{ zone.label }} ({{ categorizedStocks[zone.id].length }})
      </div>
      <div class="p-2 space-y-1.5">
        <div v-for="stock in categorizedStocks[zone.id]" :key="stock._id"
          class="w-full flex items-center justify-between p-1.5 rounded transition-all gap-2"
          :class="isStealth ? 'bg-transparent border-b border-slate-100 rounded-none' : 'bg-zinc-900/50 border border-zinc-800/50'"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-bold text-sm flex-shrink-0" :class="isStealth ? 'text-slate-700' : 'text-zinc-200'">{{ stock.code }}</span>
            <span class="text-[11px] opacity-60 truncate font-medium" :class="isStealth ? 'text-slate-500' : 'text-zinc-400'">{{ stock.market?.name }}</span>
          </div>
          <span class="text-sm font-mono font-bold flex-shrink-0" :class="getPercentClass(stock.percent)">{{ stock.percent > 0 ? '+' : '' }}{{ stock.percent.toFixed(1) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>
