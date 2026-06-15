<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  History,
  Loader2,
  RefreshCw,
  TrendingUp,
  WalletCards,
} from 'lucide-vue-next'
import api from '@/services/api'
import { useStockStore } from '@/stores/stockStore'

const stockStore = useStockStore()
const { isStealth } = storeToRefs(stockStore)

const summary = ref({})
const positions = ref([])
const isLoading = ref(false)
const error = ref('')

const openPositions = computed(() => positions.value.filter((position) => position.status === 'open'))
const closedPositions = computed(() => positions.value.filter((position) => position.status === 'closed'))

const panelClass = computed(() => isStealth.value
  ? 'bg-white border-slate-200 shadow-sm'
  : 'bg-zinc-900/40 border-zinc-800')

const formatNumber = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

const formatPct = (value) => {
  if (value === null || value === undefined) return '-'
  const number = Number(value)
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`
}

const pnlClass = (value) => {
  const positive = Number(value) >= 0
  if (isStealth.value) return positive ? 'text-red-600' : 'text-green-700'
  return positive ? 'text-red-400' : 'text-green-400'
}

const summaryCards = computed(() => [
  { label: '目前持股', value: `${summary.value.openPositionCount || 0} 檔`, tone: null },
  { label: '持股成本', value: formatNumber(summary.value.openCost), tone: null },
  { label: '目前市值', value: formatNumber(summary.value.marketValue), tone: null },
  { label: '已實現損益', value: formatNumber(summary.value.realizedPnl), tone: summary.value.realizedPnl },
  { label: '未實現損益', value: formatNumber(summary.value.unrealizedPnl), tone: summary.value.unrealizedPnl },
  { label: '總損益', value: formatNumber(summary.value.totalPnl), tone: summary.value.totalPnl },
  { label: '累積報酬率', value: formatPct(summary.value.totalReturnPct), tone: summary.value.totalReturnPct },
  { label: '交易訊號', value: `${summary.value.recordCount || 0} 筆`, tone: null },
])

const fetchJournal = async () => {
  isLoading.value = true
  error.value = ''
  try {
    const performanceResponse = await api.getTradeJournalPerformance()
    summary.value = performanceResponse.data.summary || {}
    positions.value = performanceResponse.data.positions || []
  } catch (err) {
    error.value = err?.response?.data?.error || err?.message || '交易紀錄載入失敗'
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchJournal)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <div class="flex items-center gap-3 mb-2">
          <TrendingUp class="w-6 h-6" :class="isStealth ? 'text-blue-600' : 'text-blue-400'" />
          <h2 class="text-2xl font-black tracking-tight">群組交易績效</h2>
        </div>
        <p class="text-sm opacity-60">記錄 Allen 的買進、賣一半與全賣訊號</p>
      </div>
      <button
        class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-all"
        :class="isStealth ? 'bg-white border-slate-200 hover:border-blue-400' : 'bg-zinc-900 border-zinc-700 hover:border-blue-500'"
        :disabled="isLoading"
        @click="fetchJournal"
      >
        <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
        <RefreshCw v-else class="w-4 h-4" />
        更新資料
      </button>
    </div>

    <div v-if="error" class="rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 px-4 py-3 text-sm">
      {{ error }}
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
      <div v-for="card in summaryCards" :key="card.label" class="rounded-xl border p-4" :class="panelClass">
        <div class="text-[11px] font-bold tracking-widest opacity-50 mb-2">{{ card.label }}</div>
        <div class="text-xl font-black" :class="card.tone === null ? '' : pnlClass(card.tone)">
          {{ card.value }}
        </div>
      </div>
    </div>

    <section class="rounded-xl border overflow-hidden" :class="panelClass">
      <div class="p-4 flex items-center justify-between border-b" :class="isStealth ? 'border-slate-200' : 'border-zinc-800'">
        <h3 class="font-bold flex items-center gap-2"><WalletCards class="w-4 h-4" />目前持股</h3>
        <span class="text-xs opacity-50">{{ openPositions.length }} 檔</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[850px]">
          <thead :class="isStealth ? 'bg-slate-50 text-slate-600' : 'bg-zinc-950 text-zinc-300'">
            <tr>
              <th class="px-4 py-3 text-left">股票</th>
              <th class="px-4 py-3 text-right">剩餘部位</th>
              <th class="px-4 py-3 text-right">平均成本</th>
              <th class="px-4 py-3 text-right">目前股價</th>
              <th class="px-4 py-3 text-right">持股成本</th>
              <th class="px-4 py-3 text-right">目前市值</th>
              <th class="px-4 py-3 text-right">未實現損益</th>
              <th class="px-4 py-3 text-right">報酬率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="position in openPositions" :key="position.code" class="border-t" :class="isStealth ? 'border-slate-100' : 'border-zinc-800'">
              <td class="px-4 py-3"><div class="font-black">{{ position.code }}</div><div class="text-xs opacity-50">{{ position.name }}</div></td>
              <td class="px-4 py-3 text-right font-mono">{{ formatNumber(position.quantity, 4) }}</td>
              <td class="px-4 py-3 text-right font-mono">{{ formatNumber(position.averageCost) }}</td>
              <td class="px-4 py-3 text-right font-mono">{{ formatNumber(position.currentPrice) }}</td>
              <td class="px-4 py-3 text-right font-mono">{{ formatNumber(position.cost) }}</td>
              <td class="px-4 py-3 text-right font-mono">{{ formatNumber(position.marketValue) }}</td>
              <td class="px-4 py-3 text-right font-mono font-bold" :class="pnlClass(position.unrealizedPnl)">{{ formatNumber(position.unrealizedPnl) }}</td>
              <td class="px-4 py-3 text-right font-mono font-bold" :class="pnlClass(position.returnPct)">{{ formatPct(position.returnPct) }}</td>
            </tr>
            <tr v-if="!isLoading && openPositions.length === 0">
              <td colspan="8" class="px-4 py-12 text-center opacity-40">目前沒有持股</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="rounded-xl border overflow-hidden" :class="panelClass">
      <div class="p-4 flex items-center justify-between border-b" :class="isStealth ? 'border-slate-200' : 'border-zinc-800'">
        <h3 class="font-bold flex items-center gap-2"><History class="w-4 h-4" />歷史績效</h3>
        <span class="text-xs opacity-50">{{ closedPositions.length }} 檔已結清</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[700px]">
          <thead :class="isStealth ? 'bg-slate-50 text-slate-600' : 'bg-zinc-950 text-zinc-300'">
            <tr>
              <th class="px-4 py-3 text-left">股票</th>
              <th class="px-4 py-3 text-right">賣一半績效</th>
              <th class="px-4 py-3 text-right">全賣績效</th>
              <th class="px-4 py-3 text-right">平均績效</th>
              <th class="px-4 py-3 text-center">狀態</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="position in closedPositions" :key="position.code" class="border-t" :class="isStealth ? 'border-slate-100' : 'border-zinc-800'">
              <td class="px-4 py-3"><span class="font-black">{{ position.code }}</span><span class="ml-2 opacity-50">{{ position.name }}</span></td>
              <td class="px-4 py-3 text-right font-mono font-bold" :class="position.sellHalfReturnPct === null ? '' : pnlClass(position.sellHalfReturnPct)">{{ formatPct(position.sellHalfReturnPct) }}</td>
              <td class="px-4 py-3 text-right font-mono font-bold" :class="position.sellAllReturnPct === null ? '' : pnlClass(position.sellAllReturnPct)">{{ formatPct(position.sellAllReturnPct) }}</td>
              <td class="px-4 py-3 text-right font-mono font-bold" :class="position.averageSellReturnPct === null ? '' : pnlClass(position.averageSellReturnPct)">{{ formatPct(position.averageSellReturnPct) }}</td>
              <td class="px-4 py-3 text-center"><span class="px-2 py-1 rounded-full text-xs" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800'">已結清</span></td>
            </tr>
            <tr v-if="!isLoading && closedPositions.length === 0">
              <td colspan="5" class="px-4 py-12 text-center opacity-40">目前沒有已結清部位</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

  </div>
</template>
