<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  LineChart,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-vue-next'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Bar, Scatter } from 'vue-chartjs'
import { useStockStore } from '@/stores/stockStore'
import { useBacktestStore } from '@/stores/backtestStore'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip)

const stockStore = useStockStore()
const { isStealth } = storeToRefs(stockStore)
const backtestStore = useBacktestStore()
const {
  filters,
  sortConfig,
  pagination,
  summary,
  strategyComparison,
  targetStats,
  datasetSummary,
  chartData,
  trades,
  isLoading,
  error,
} = storeToRefs(backtestStore)
const { fetchBacktest, setFilters, setPage, setSort } = backtestStore

const totalPages = computed(() => Math.max(1, Math.ceil((pagination.value.total || 0) / pagination.value.pageSize)))

const formatPct = (value) => value === null || value === undefined ? '-' : `${value > 0 ? '+' : ''}${Number(value).toFixed(2)}%`
const formatPlainPct = (value) => value === null || value === undefined ? '-' : `${Number(value).toFixed(2)}%`
const formatNumber = (value, digits = 0) => value === null || value === undefined ? '-' : Number(value).toFixed(digits)
const formatPrice = (value) => value === null || value === undefined ? '-' : Number(value).toFixed(2).replace(/\.00$/, '')

const exitReasonLabel = {
  targetHit: '達標出場',
  stopLoss: '換股停損',
  timeExit: '到期出場',
  missingData: '資料不足',
  '找不到推薦日後日K': '資料不足',
  '觀察期間未跌到支撐': '未觸發買進',
  '沒有支撐價': '沒有支撐價',
}

const statusLabel = {
  win: '獲利',
  loss: '虧損',
  notTriggered: '未買進',
  missingData: '資料不足',
}

const summaryCards = computed(() => {
  const s = summary.value || {}
  return [
    { label: '回測筆數', value: formatNumber(s.recommendationCount), tone: 'neutral' },
    { label: '有效進場', value: formatNumber(s.enteredCount), tone: 'neutral' },
    { label: '勝率', value: formatPlainPct(s.winRate), tone: 'positive' },
    { label: '平均報酬', value: formatPct(s.averageReturnPct), tone: s.averageReturnPct >= 0 ? 'positive' : 'negative' },
    { label: '中位數報酬', value: formatPct(s.medianReturnPct), tone: s.medianReturnPct >= 0 ? 'positive' : 'negative' },
    { label: '最大虧損', value: formatPct(s.minReturnPct), tone: 'negative' },
    { label: '平均持有', value: s.averageHoldingDays === null || s.averageHoldingDays === undefined ? '-' : `${s.averageHoldingDays} 天`, tone: 'neutral' },
    { label: '停損率', value: formatPlainPct(s.stopLossRate), tone: 'negative' },
  ]
})

const barChartData = computed(() => ({
  labels: targetStats.value.map((item) => `${item.target}%`),
  datasets: [
    {
      type: 'bar',
      label: '平均達標天數',
      data: targetStats.value.map((item) => item.averageDays || 0),
      backgroundColor: isStealth.value ? 'rgba(37, 99, 235, 0.65)' : 'rgba(96, 165, 250, 0.55)',
      borderColor: isStealth.value ? 'rgb(37, 99, 235)' : 'rgb(96, 165, 250)',
      borderWidth: 1,
    },
  ],
}))

const scatterChartData = computed(() => ({
  datasets: [
    {
      label: '單筆回測',
      data: chartData.value.holdingReturnPoints || [],
      backgroundColor: (ctx) => {
        const y = ctx.raw?.y || 0
        if (isStealth.value) return y >= 0 ? 'rgba(15, 23, 42, 0.75)' : 'rgba(100, 116, 139, 0.65)'
        return y >= 0 ? 'rgba(248, 113, 113, 0.9)' : 'rgba(74, 222, 128, 0.85)'
      },
      pointRadius: 5,
      pointHoverRadius: 8,
    },
    {
      type: 'line',
      label: '同持有天數平均',
      data: chartData.value.averageReturnByHoldingDays || [],
      borderColor: isStealth.value ? 'rgb(37, 99, 235)' : 'rgb(96, 165, 250)',
      backgroundColor: 'transparent',
      pointRadius: 0,
      borderWidth: 2,
      tension: 0.25,
    },
  ],
}))

const chartOptions = computed(() => {
  const text = isStealth.value ? '#334155' : '#d4d4d8'
  const grid = isStealth.value ? '#e2e8f0' : '#27272a'
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const raw = ctx.raw || {}
            if (raw.code) return `${raw.code} ${raw.name || ''}: ${raw.x}天 / ${formatPct(raw.y)}`
            if (ctx.dataset.type === 'line') {
              return `${ctx.dataset.label}: ${ctx.raw.y}%`
            }
            return `${ctx.dataset.label}: ${ctx.raw}`
          },
        },
      },
    },
    scales: {
      x: { grid: { color: grid }, ticks: { color: text } },
      y: {
        grid: { color: grid },
        ticks: { color: text },
      },
    },
  }
})

// Removed ctxIsScatter as it is handled in specific chart options
const scatterOptions = computed(() => ({
  ...chartOptions.value,
  scales: {
    x: {
      ...chartOptions.value.scales.x,
      title: { display: true, text: '持有天數', color: isStealth.value ? '#334155' : '#d4d4d8' },
    },
    y: {
      ...chartOptions.value.scales.y,
      title: { display: true, text: '報酬率', color: isStealth.value ? '#334155' : '#d4d4d8' },
      ticks: {
        ...chartOptions.value.scales.y.ticks,
        callback: (value) => `${value}%`,
      },
    },
  },
}))

const barOptions = computed(() => ({
  ...chartOptions.value,
  scales: {
    x: chartOptions.value.scales.x,
    y: {
      ...chartOptions.value.scales.y,
      ticks: {
        ...chartOptions.value.scales.y.ticks,
        callback: (value) => `${value}天`,
      },
    },
  },
}))

const panelClass = computed(() => isStealth.value ? 'bg-white border-slate-200 shadow-sm' : 'bg-zinc-900/40 border-zinc-800')
const inputClass = computed(() => isStealth.value
  ? 'bg-white border-slate-200 text-slate-700 focus:border-blue-400'
  : 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-blue-500')

const toneClass = (tone) => {
  if (isStealth.value) {
    if (tone === 'positive') return 'text-slate-950'
    if (tone === 'negative') return 'text-slate-500'
    return 'text-blue-700'
  }
  if (tone === 'positive') return 'text-red-400'
  if (tone === 'negative') return 'text-green-400'
  return 'text-blue-300'
}

const applyFilters = async () => {
  setFilters({ ...filters.value })
  await fetchBacktest()
}

const changePage = async (page) => {
  setPage(page)
  await fetchBacktest()
}

const changeSort = async (key) => {
  setSort(key)
  await fetchBacktest()
}

const tempCustomDays = ref(filters.value.maxHoldingDays)
const updateCustomDays = async () => {
  if (tempCustomDays.value > 0) {
    filters.value.maxHoldingDays = tempCustomDays.value
    await applyFilters()
  }
}

onMounted(fetchBacktest)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div>
        <div class="flex items-center gap-3 mb-2">
          <LineChart class="w-6 h-6" :class="isStealth ? 'text-blue-600' : 'text-blue-400'" />
          <h2 class="text-2xl font-black tracking-tight">{{ isStealth ? 'BACKTEST_LAB' : '回測專區' }}</h2>
        </div>
        <p class="text-sm opacity-60">
          {{ datasetSummary ? `${datasetSummary.stockCount} 檔 / ${datasetSummary.dailyKbarCount} 筆日K / ${datasetSummary.firstDate} ~ ${datasetSummary.lastDate}` : '讀取老師推薦股票日K資料中' }}
        </p>
      </div>

      <button
        @click="fetchBacktest"
        class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold border transition-all active:scale-95"
        :class="isStealth ? 'bg-white border-slate-200 text-slate-600 hover:border-blue-400' : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-blue-500'"
      >
        <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
        <RefreshCw v-else class="w-4 h-4" />
        重新計算
      </button>
    </div>

    <div class="rounded-xl border p-4" :class="panelClass">
      <div class="flex items-center gap-2 mb-4">
        <SlidersHorizontal class="w-4 h-4 opacity-60" />
        <span class="text-xs font-bold uppercase tracking-widest opacity-60">Filters</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
        <label class="space-y-1">
          <span class="text-[11px] opacity-50 font-bold">買進策略</span>
          <select v-model="filters.buyStrategy" @change="applyFilters" class="w-full px-3 py-2 rounded-lg border text-sm outline-none" :class="inputClass">
            <option value="nextOpen">隔天開盤買進</option>
            <option value="support">跌到支撐買進</option>
            <option value="swapRef">跌到換股價買進</option>
          </select>
        </label>

        <label class="space-y-1">
          <span class="text-[11px] opacity-50 font-bold">獲利目標</span>
          <select v-model="filters.profitTarget" @change="applyFilters" class="w-full px-3 py-2 rounded-lg border text-sm outline-none" :class="inputClass">
            <option :value="0">不設定 (無目標)</option>
            <option :value="10">10%</option>
            <option :value="20">20%</option>
            <option :value="30">30%</option>
            <option :value="40">40%</option>
            <option :value="50">50%</option>
          </select>
        </label>

        <label class="space-y-1">
          <span class="text-[11px] opacity-50 font-bold">最長持有</span>
          <div class="flex gap-2">
            <select v-model="filters.maxHoldingDays" @change="applyFilters" class="flex-1 px-3 py-2 rounded-lg border text-sm outline-none" :class="inputClass">
              <option :value="0">不設定 (無限期)</option>
              <option :value="10">10 天</option>
              <option :value="20">20 天</option>
              <option :value="40">40 天</option>
              <option :value="60">60 天</option>
              <option :value="120">120 天</option>
              <option value="custom">自定義</option>
            </select>
            <input
              v-if="filters.maxHoldingDays === 'custom' || ![0, 10, 20, 40, 60, 120].includes(filters.maxHoldingDays)"
              type="number"
              v-model.number="tempCustomDays"
              @change="updateCustomDays"
              @keyup.enter="updateCustomDays"
              class="w-20 px-2 py-2 rounded-lg border text-sm outline-none"
              :class="inputClass"
              placeholder="天數"
            />
          </div>
        </label>

        <label class="space-y-1">
          <span class="text-[11px] opacity-50 font-bold">狀態</span>
          <select v-model="filters.status" @change="applyFilters" class="w-full px-3 py-2 rounded-lg border text-sm outline-none" :class="inputClass">
            <option value="all">全部</option>
            <option value="win">獲利</option>
            <option value="loss">虧損</option>
            <option value="stopLoss">換股停損</option>
            <option value="notTriggered">未買進</option>
            <option value="missingData">資料不足</option>
          </select>
        </label>

        <label class="space-y-1">
          <span class="text-[11px] opacity-50 font-bold">開始日期</span>
          <input v-model="filters.startDate" @change="applyFilters" type="date" class="w-full px-3 py-2 rounded-lg border text-sm outline-none" :class="inputClass" />
        </label>

        <label class="space-y-1">
          <span class="text-[11px] opacity-50 font-bold">結束日期</span>
          <input v-model="filters.endDate" @change="applyFilters" type="date" class="w-full px-3 py-2 rounded-lg border text-sm outline-none" :class="inputClass" />
        </label>
      </div>

      <div class="flex flex-col sm:flex-row gap-3 mt-3">
        <div class="relative flex-1">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
          <input
            v-model="filters.symbol"
            @keyup.enter="applyFilters"
            placeholder="搜尋股票代號"
            class="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none"
            :class="inputClass"
          />
        </div>
        <label class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm" :class="isStealth ? 'border-slate-200 bg-slate-50' : 'border-zinc-800 bg-zinc-950'">
          <input v-model="filters.ignoreStopLoss" @change="applyFilters" type="checkbox" />
          達到換股價不停損
        </label>
        <button @click="applyFilters" class="px-5 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-95 transition-all">套用</button>
      </div>
    </div>

    <div v-if="error" class="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 px-4 py-3 text-sm">
      {{ error }}
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
      <div v-for="card in summaryCards" :key="card.label" class="rounded-xl border p-4" :class="panelClass">
        <div class="text-[11px] font-bold uppercase tracking-widest opacity-50 mb-2">{{ card.label }}</div>
        <div class="text-2xl font-black" :class="toneClass(card.tone)">{{ card.value }}</div>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div class="rounded-xl border p-4 xl:col-span-1" :class="panelClass">
        <h3 class="text-sm font-bold mb-4 flex items-center gap-2"><BarChart3 class="w-4 h-4" />策略比較</h3>
        <div class="space-y-3">
          <div v-for="item in strategyComparison" :key="item.strategy" class="rounded-lg border p-3" :class="isStealth ? 'border-slate-100 bg-slate-50' : 'border-zinc-800 bg-zinc-950/60'">
            <div class="flex justify-between items-center mb-2">
              <span class="font-bold text-sm">{{ item.label }}</span>
              <span class="text-xs opacity-50">{{ item.enteredCount }} / {{ item.recommendationCount }} 筆</span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-xs">
              <div><div class="opacity-40">勝率</div><div class="font-bold">{{ formatPlainPct(item.winRate) }}</div></div>
              <div><div class="opacity-40">平均報酬</div><div class="font-bold" :class="toneClass(item.averageReturnPct >= 0 ? 'positive' : 'negative')">{{ formatPct(item.averageReturnPct) }}</div></div>
              <div><div class="opacity-40">停損率</div><div class="font-bold">{{ formatPlainPct(item.stopLossRate) }}</div></div>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-xl border p-4 min-h-[320px]" :class="panelClass">
        <h3 class="text-sm font-bold mb-4">獲利目標平均達標天數</h3>
        <div class="h-[260px]">
          <Bar :data="barChartData" :options="barOptions" />
        </div>
      </div>

      <div class="rounded-xl border p-4 min-h-[320px]" :class="panelClass">
        <h3 class="text-sm font-bold mb-4">持有時間與報酬率</h3>
        <div class="h-[260px]">
          <Scatter :data="scatterChartData" :options="scatterOptions" />
        </div>
      </div>
    </div>

    <div class="rounded-xl border overflow-hidden" :class="panelClass">
      <div class="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b" :class="isStealth ? 'border-slate-200' : 'border-zinc-800'">
        <h3 class="text-sm font-bold">回測明細</h3>
        <span class="text-xs opacity-50">{{ pagination.total }} 筆</span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[1100px]">
          <thead :class="isStealth ? 'bg-slate-50 text-slate-600' : 'bg-zinc-950 text-zinc-300'">
            <tr>
              <th class="px-4 py-3 text-left">股票</th>
              <th class="px-4 py-3 text-left cursor-pointer" @click="changeSort('recommendedDate')">
                推薦日
                <ArrowUp v-if="sortConfig.sortKey === 'recommendedDate' && sortConfig.sortOrder === 'asc'" class="inline w-3 h-3" />
                <ArrowDown v-else-if="sortConfig.sortKey === 'recommendedDate'" class="inline w-3 h-3" />
              </th>
              <th class="px-4 py-3 text-right">推薦價</th>
              <th class="px-4 py-3 text-right">支撐</th>
              <th class="px-4 py-3 text-right">換股</th>
              <th class="px-4 py-3 text-left">買進</th>
              <th class="px-4 py-3 text-left">賣出</th>
              <th class="px-4 py-3 text-right cursor-pointer" @click="changeSort('holdingDays')">持有</th>
              <th class="px-4 py-3 text-right cursor-pointer" @click="changeSort('returnPct')">報酬</th>
              <th class="px-4 py-3 text-center">狀態</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="trade in trades" :key="trade.id + trade.buyStrategy" class="border-t" :class="isStealth ? 'border-slate-100 hover:bg-slate-50' : 'border-zinc-800 hover:bg-zinc-800/30'">
              <td class="px-4 py-3">
                <div class="font-black">{{ trade.code }}</div>
                <div class="text-xs opacity-50">{{ trade.name }}</div>
              </td>
              <td class="px-4 py-3 font-mono text-xs">{{ trade.recommendedDate }}</td>
              <td class="px-4 py-3 text-right font-mono">{{ formatPrice(trade.recommendedPrice) }}</td>
              <td class="px-4 py-3 text-right font-mono">{{ trade.support || '-' }}</td>
              <td class="px-4 py-3 text-right font-mono">{{ trade.swapRef || '-' }}</td>
              <td class="px-4 py-3">
                <div class="font-mono">{{ trade.buyDate || '-' }}</div>
                <div class="text-xs opacity-50">{{ formatPrice(trade.buyPrice) }}</div>
              </td>
              <td class="px-4 py-3">
                <div class="font-mono">{{ trade.sellDate || '-' }}</div>
                <div class="text-xs opacity-50">{{ formatPrice(trade.sellPrice) }} / {{ exitReasonLabel[trade.exitReason] || trade.exitReason }}</div>
              </td>
              <td class="px-4 py-3 text-right font-mono">{{ trade.holdingDays === null ? '-' : `${trade.holdingDays}天` }}</td>
              <td class="px-4 py-3 text-right font-mono font-bold" :class="toneClass(trade.returnPct >= 0 ? 'positive' : 'negative')">{{ formatPct(trade.returnPct) }}</td>
              <td class="px-4 py-3 text-center">
                <span class="px-2 py-1 rounded-full text-xs font-bold" :class="trade.status === 'win' ? (isStealth ? 'bg-slate-900 text-white' : 'bg-red-500/20 text-red-300') : trade.status === 'loss' ? (isStealth ? 'bg-slate-100 text-slate-500' : 'bg-green-500/15 text-green-300') : (isStealth ? 'bg-slate-100 text-slate-500' : 'bg-zinc-800 text-zinc-400')">
                  {{ statusLabel[trade.status] || trade.status }}
                </span>
              </td>
            </tr>
            <tr v-if="!isLoading && trades.length === 0">
              <td colspan="10" class="px-4 py-12 text-center opacity-40">
                無符合條件的回測資料
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="p-4 flex items-center justify-between border-t" :class="isStealth ? 'border-slate-200' : 'border-zinc-800'">
        <span class="text-xs opacity-50">第 {{ pagination.page }} / {{ totalPages }} 頁</span>
        <div class="flex gap-1">
          <button @click="changePage(1)" :disabled="pagination.page === 1" class="p-2 rounded disabled:opacity-30" :class="isStealth ? 'hover:bg-slate-100' : 'hover:bg-zinc-800'"><ChevronsLeft class="w-4 h-4" /></button>
          <button @click="changePage(Math.max(1, pagination.page - 1))" :disabled="pagination.page === 1" class="px-3 py-2 rounded disabled:opacity-30" :class="isStealth ? 'hover:bg-slate-100' : 'hover:bg-zinc-800'">上一頁</button>
          <button @click="changePage(Math.min(totalPages, pagination.page + 1))" :disabled="pagination.page === totalPages" class="px-3 py-2 rounded disabled:opacity-30" :class="isStealth ? 'hover:bg-slate-100' : 'hover:bg-zinc-800'">下一頁</button>
          <button @click="changePage(totalPages)" :disabled="pagination.page === totalPages" class="p-2 rounded disabled:opacity-30" :class="isStealth ? 'hover:bg-slate-100' : 'hover:bg-zinc-800'"><ChevronsRight class="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  </div>
</template>
