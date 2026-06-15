<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  History,
  Loader2,
  RefreshCw,
  TrendingUp,
  WalletCards,
  Coins,
  Activity,
  Award,
  Clock,
  Wallet,
  Percent,
  Info
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
const realizedPositions = computed(() => positions.value.filter((position) =>
  position.sellHalfReturnPct !== null || position.sellAllReturnPct !== null
))

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

const formatPositionPct = (value) => {
  if (value === null || value === undefined) return '-'
  return `${Number(value).toFixed(2)}%`
}

const formatDateTime = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

const formatTradeDate = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

const formatTradeTime = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

const pnlClass = (value) => {
  const positive = Number(value) >= 0
  if (isStealth.value) return positive ? 'text-slate-900' : 'text-slate-500'
  return positive ? 'text-red-400' : 'text-green-400'
}

const summaryCards = computed(() => [
  { label: '目前持股', value: `${summary.value.openPositionCount || 0} 檔`, tone: null, icon: WalletCards },
  { label: '交易訊號', value: `${summary.value.recordCount || 0} 筆`, tone: null, icon: History },
  { label: '持股成本', value: formatNumber(summary.value.openCost), tone: null, icon: Coins },
  { label: '目前市值', value: formatNumber(summary.value.marketValue), tone: null, icon: Activity },
  { label: '未實現損益', value: formatNumber(summary.value.unrealizedPnl), tone: summary.value.unrealizedPnl, icon: Clock },
  { label: '已實現損益', value: formatNumber(summary.value.realizedPnl), tone: summary.value.realizedPnl, icon: Award },
  { label: '總損益', value: formatNumber(summary.value.totalPnl), tone: summary.value.totalPnl, icon: Wallet },
  { label: '累積報酬率', value: formatPct(summary.value.totalReturnPct), tone: summary.value.totalReturnPct, icon: Percent },
])

const cardClass = (card) => {
  if (isStealth.value) {
    return 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md transition-all duration-300'
  }
  
  // Trader Mode
  let base = 'transition-all duration-300 hover:-translate-y-0.5 '
  if (card.tone === null) {
    return base + 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 hover:shadow-[0_4px_25px_rgba(0,0,0,0.5)]'
  }
  
  const positive = Number(card.tone) >= 0
  if (positive) {
    return base + 'bg-gradient-to-br from-zinc-900/60 to-red-950/10 border-red-950/60 hover:border-red-500/30 hover:shadow-[0_0_20px_rgba(239,68,68,0.12)]'
  } else {
    return base + 'bg-gradient-to-br from-zinc-900/60 to-green-950/10 border-green-950/60 hover:border-green-500/30 hover:shadow-[0_0_20px_rgba(34,197,94,0.12)]'
  }
}

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
  <div class="space-y-8">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-3 mb-1">
          <div class="p-2 rounded-lg" :class="isStealth ? 'bg-blue-50 text-blue-600' : 'bg-blue-500/10 text-blue-400'">
            <TrendingUp class="w-6 h-6" />
          </div>
          <h2 class="text-2xl font-black tracking-tight">
            {{ isStealth ? '交易績效分析報告' : '群組交易績效' }}
          </h2>
        </div>
      </div>
      <button
        class="self-start sm:self-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
        :class="isStealth
          ? 'bg-white border-slate-200 hover:border-blue-400 hover:text-blue-600 hover:shadow-sm'
          : 'bg-zinc-900 border-zinc-700 hover:border-blue-500 hover:text-blue-400 hover:shadow-[0_0_15px_rgba(59,130,246,0.15)]'"
        :disabled="isLoading"
        @click="fetchJournal"
      >
        <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
        <RefreshCw v-else class="w-4 h-4" />
        更新資料
      </button>
    </div>

    <!-- Error -->
    <div
      v-if="error"
      class="rounded-xl border px-4 py-3 text-sm flex items-center gap-2"
      :class="isStealth
        ? 'border-slate-300 bg-slate-100 text-slate-700'
        : 'border-red-500/30 bg-red-500/10 text-red-400'"
    >
      <Info class="w-4 h-4 shrink-0" />
      {{ error }}
    </div>

    <!-- Calculation Notes -->
    <section
      class="rounded-xl border px-5 py-4"
      :class="isStealth
        ? 'bg-blue-50/60 border-blue-100 text-slate-700'
        : 'bg-blue-500/[0.06] border-blue-500/20 text-zinc-300'"
    >
      <div class="flex items-start gap-3">
        <Info class="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
        <div class="min-w-0 flex-1">
          <h3 class="text-xs font-black tracking-widest mb-2">績效計算方式</h3>
          <p class="text-xs leading-5 opacity-80">
            這是投顧訊號的模擬績效，非實際帳戶損益。每次買進固定投入
            <strong class="font-mono text-blue-500">NT$100,000</strong>；
            減碼視為賣出當時部位的 50%，出清則賣出全部剩餘部位。
            成交價採訊息發出後下一分鐘的第一筆 Shioaji 成交價。
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2 mt-3 text-[11px] leading-4">
            <div><span class="font-bold">持股成本：</span><span class="opacity-65">剩餘部位買進成本，含買進手續費</span></div>
            <div><span class="font-bold">目前市值：</span><span class="opacity-65">剩餘模擬股數 × 目前股價</span></div>
            <div><span class="font-bold">已實現損益：</span><span class="opacity-65">已賣出部位損益，已扣交易成本</span></div>
            <div><span class="font-bold">未實現損益：</span><span class="opacity-65">剩餘部位依目前股價估算</span></div>
            <div><span class="font-bold">總損益：</span><span class="opacity-65">已實現損益 + 未實現損益</span></div>
            <div><span class="font-bold">累積報酬率：</span><span class="opacity-65">總損益 ÷ 所有買進投入成本</span></div>
            <div><span class="font-bold">交易成本：</span><span class="opacity-65">手續費 6 折；賣出另計 0.3% 證交稅</span></div>
            <div><span class="font-bold">剩餘比例：</span><span class="opacity-65">未減碼 100%，賣一半後 50%</span></div>
          </div>
        </div>
      </div>
    </section>

    <!-- Summary Cards -->
    <!-- Loading State -->
    <div v-if="isLoading" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div
        v-for="i in 8"
        :key="i"
        class="rounded-xl border p-5 flex flex-col gap-3 animate-pulse"
        :class="isStealth ? 'bg-white border-slate-200 shadow-sm' : 'bg-zinc-900/40 border-zinc-800'"
      >
        <div class="flex justify-between items-center">
          <div class="h-3 w-16 rounded" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800/80'" />
          <div class="h-4 w-4 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
        </div>
        <div class="h-7 w-28 rounded mt-1" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800/80'" />
      </div>
    </div>

    <!-- Data Cards -->
    <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
      <div
        v-for="card in summaryCards"
        :key="card.label"
        class="rounded-xl border p-5 flex flex-col gap-2 relative overflow-hidden group"
        :class="cardClass(card)"
      >
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold tracking-widest uppercase opacity-40">{{ card.label }}</span>
          <component
            :is="card.icon"
            class="w-4 h-4 transition-transform duration-300 group-hover:scale-110"
            :class="[
              card.tone === null
                ? (isStealth ? 'text-slate-400' : 'text-zinc-500')
                : pnlClass(card.tone)
            ]"
          />
        </div>
        <div
          class="text-xl md:text-2xl font-black tabular-nums leading-tight tracking-tight mt-1"
          :class="card.tone === null ? '' : pnlClass(card.tone)"
        >
          {{ card.value }}
        </div>
      </div>
    </div>
    <!-- Open Positions -->
    <section class="rounded-lg border overflow-hidden transition-colors duration-300" :class="panelClass">
      <div
        class="px-4 py-3 flex items-center justify-between border-b"
        :class="isStealth ? 'border-slate-200 bg-slate-100/80' : 'border-zinc-700 bg-zinc-950'"
      >
        <h3 class="text-xs font-black flex items-center gap-2 tracking-widest uppercase">
          <WalletCards class="w-3.5 h-3.5 text-blue-500" />
          {{ isStealth ? '現有持股明細' : '目前持股' }}
        </h3>
        <span
          class="text-[10px] font-mono font-bold tracking-wider"
          :class="isStealth ? 'text-slate-500' : 'text-zinc-500'"
        >共 {{ openPositions.length }} 檔</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full table-fixed text-sm min-w-[760px] border-collapse">
          <colgroup>
            <col class="w-[180px]">
            <col class="w-[130px]">
            <col class="w-[150px]">
            <col class="w-[150px]">
            <col class="w-[150px]">
          </colgroup>
          <thead>
            <tr 
              class="border-b"
              :class="isStealth ? 'text-slate-500 border-slate-300 bg-slate-100' : 'text-zinc-500 border-zinc-700 bg-zinc-950'"
            >
              <th class="sticky left-0 z-20 px-4 py-3 text-left text-xs font-black tracking-[0.14em]" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-950'">商品</th>
              <th class="px-3 py-3 text-right text-xs font-black tracking-[0.14em]">剩餘比例</th>
              <th class="px-3 py-3 text-right text-xs font-black tracking-[0.14em]">平均成本</th>
              <th class="px-3 py-3 text-right text-xs font-black tracking-[0.14em]">目前股價</th>
              <th class="px-4 py-3 text-right text-xs font-black tracking-[0.14em]">報酬率</th>
            </tr>
          </thead>
          
          <!-- Loading state for table -->
          <tbody v-if="isLoading">
            <tr v-for="i in 3" :key="i" class="border-t animate-pulse" :class="isStealth ? 'border-slate-100' : 'border-zinc-800/60'">
              <td class="px-6 py-3 align-middle">
                <div class="h-4 w-12 rounded mb-2" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800'" />
                <div class="h-3 w-16 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
              </td>
              <td class="px-6 py-3 align-middle"><div class="h-4 w-14 rounded ml-auto" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" /></td>
              <td class="px-6 py-3 align-middle"><div class="h-4 w-16 rounded ml-auto" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" /></td>
              <td class="px-6 py-3 align-middle"><div class="h-4 w-16 rounded ml-auto" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" /></td>
              <td class="px-6 py-3 align-middle"><div class="h-5 w-20 rounded ml-auto" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800'" /></td>
            </tr>
          </tbody>

          <!-- Table Body -->
          <tbody v-else>
            <tr
              v-for="position in openPositions"
              :key="position.code"
              class="border-t transition-colors duration-150 relative group"
              :class="[
                isStealth
                  ? 'border-slate-200 hover:bg-blue-50/60'
                  : 'border-zinc-800 hover:bg-blue-500/[0.06] trader-row-glow'
              ]"
            >
              <td
                class="sticky left-0 z-10 px-4 py-3 align-middle border-r"
                :class="isStealth ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800'"
              >
                <div class="flex items-baseline gap-2">
                  <span class="font-mono text-base font-black tabular-nums" :class="isStealth ? 'text-slate-900' : 'text-white'">
                    {{ position.code }}
                  </span>
                  <span class="text-sm font-bold truncate" :class="isStealth ? 'text-slate-500' : 'text-zinc-400'">{{ position.name }}</span>
                </div>
              </td>
              <td class="px-3 py-3 align-middle text-right font-mono tabular-nums font-bold" :class="isStealth ? 'text-slate-700' : 'text-zinc-300'">
                {{ formatPositionPct(position.remainingPositionPct) }}
              </td>
              <td class="px-3 py-3 align-middle text-right font-mono tabular-nums font-bold" :class="isStealth ? 'text-slate-700' : 'text-zinc-300'">
                {{ formatNumber(position.averageCost) }}
              </td>
              <td class="px-3 py-3 align-middle text-right font-mono tabular-nums font-bold" :class="isStealth ? 'text-slate-700' : 'text-zinc-300'">
                {{ formatNumber(position.currentPrice) }}
              </td>
              <td class="px-4 py-3 align-middle text-right">
                <span class="font-mono text-base font-black tabular-nums" :class="pnlClass(position.returnPct)">
                  {{ formatPct(position.returnPct) }}
                </span>
              </td>
            </tr>
            <tr v-if="openPositions.length === 0">
              <td colspan="5" class="px-6 py-16 text-center">
                <div class="flex flex-col items-center justify-center gap-3 py-6">
                  <div class="p-3 rounded-full" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/40'">
                    <WalletCards class="w-8 h-8 opacity-40" />
                  </div>
                  <div class="text-sm font-bold" :class="isStealth ? 'text-slate-500' : 'text-zinc-400'">目前沒有持股</div>
                  <p class="text-xs opacity-40 max-w-xs mx-auto">新增股票推薦並進行交易後，持股資料會即時呈現在這裡。</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Realized History -->
    <section class="rounded-lg border overflow-hidden transition-colors duration-300" :class="panelClass">
      <div
        class="px-4 py-3 flex items-center justify-between border-b"
        :class="isStealth ? 'border-slate-200 bg-slate-100/80' : 'border-zinc-700 bg-zinc-950'"
      >
        <h3 class="text-xs font-black flex items-center gap-2 tracking-widest uppercase">
          <History class="w-3.5 h-3.5 text-blue-500" />
          {{ isStealth ? '歷史交易績效' : '歷史績效' }}
        </h3>
        <span
          class="text-[10px] font-mono font-bold tracking-wider"
          :class="isStealth ? 'text-slate-500' : 'text-zinc-500'"
        >共 {{ realizedPositions.length }} 檔</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full table-fixed text-sm min-w-[900px] border-collapse">
          <colgroup>
            <col class="w-[180px]">
            <col class="w-[150px]">
            <col class="w-[180px]">
            <col class="w-[180px]">
            <col class="w-[130px]">
          </colgroup>
          <thead class="sticky top-0 z-20">
            <tr 
              class="border-b"
              :class="isStealth ? 'text-slate-500 border-slate-300 bg-slate-100' : 'text-zinc-500 border-zinc-700 bg-zinc-950'"
            >
              <th class="sticky left-0 z-30 px-4 py-3 text-left text-xs font-black tracking-[0.14em]" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-950'">商品</th>
              <th class="px-3 py-3 text-right text-xs font-black tracking-[0.14em]">買入</th>
              <th class="px-3 py-3 text-right text-xs font-black tracking-[0.14em]">減碼</th>
              <th class="px-3 py-3 text-right text-xs font-black tracking-[0.14em]">出清</th>
              <th class="px-4 py-3 text-right text-xs font-black tracking-[0.14em]">總績效</th>
            </tr>
          </thead>
          
          <!-- Loading state for table -->
          <tbody v-if="isLoading">
            <tr v-for="i in 5" :key="i" class="border-t animate-pulse" :class="isStealth ? 'border-slate-200' : 'border-zinc-800'">
              <td class="px-4 py-3 align-middle">
                <div class="h-4 w-12 rounded mb-2" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800'" />
                <div class="h-3 w-16 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
              </td>
              <td class="px-3 py-3 align-middle">
                <div class="h-4 w-24 rounded ml-auto" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
              </td>
              <td class="px-3 py-3 align-middle">
                <div class="h-4 w-24 rounded ml-auto" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
              </td>
              <td class="px-3 py-3 align-middle">
                <div class="h-4 w-24 rounded ml-auto" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
              </td>
              <td class="px-4 py-3 align-middle"><div class="h-5 w-20 rounded ml-auto" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800'" /></td>
            </tr>
          </tbody>

          <!-- Table Body -->
          <tbody v-else>
            <tr
              v-for="position in realizedPositions"
              :key="position.code"
              class="border-t transition-colors duration-150 relative"
              :class="[
                isStealth
                  ? 'border-slate-200 hover:bg-blue-50/60'
                  : 'border-zinc-800 hover:bg-blue-500/[0.06] trader-row-glow'
              ]"
            >
              <td
                class="sticky left-0 z-10 px-4 py-3 align-middle border-r"
                :class="isStealth ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800'"
              >
                <div class="flex items-baseline gap-2">
                  <span class="font-mono text-base font-black tabular-nums" :class="isStealth ? 'text-slate-900' : 'text-white'">
                    {{ position.code }}
                  </span>
                  <span class="text-sm font-bold truncate" :class="isStealth ? 'text-slate-500' : 'text-zinc-400'">{{ position.name }}</span>
                </div>
              </td>

              <!-- 買入 -->
              <td class="px-3 py-2 align-middle text-right">
                <div class="trade-quote-cell" :title="`買入時間: ${formatDateTime(position.buyAt)}`">
                  <span class="trade-time" :class="isStealth ? 'text-slate-400' : 'text-zinc-600'">
                    {{ formatTradeDate(position.buyAt) }} {{ formatTradeTime(position.buyAt) }}
                  </span>
                  <span class="trade-price" :class="isStealth ? 'text-slate-800' : 'text-zinc-200'">
                    {{ formatNumber(position.buyPrice) }}
                  </span>
                </div>
              </td>
              
              <!-- 減碼 -->
              <td class="px-3 py-2 align-middle text-right">
                <div v-if="position.sellHalfReturnPct !== null" class="trade-quote-cell" :title="`減碼時間: ${formatDateTime(position.sellHalfAt)}`">
                  <span class="trade-time" :class="isStealth ? 'text-slate-400' : 'text-zinc-600'">
                    {{ formatTradeDate(position.sellHalfAt) }} {{ formatTradeTime(position.sellHalfAt) }}
                  </span>
                  <div class="flex items-baseline justify-end gap-2">
                    <span class="trade-price" :class="pnlClass(position.sellHalfReturnPct)">
                      {{ formatNumber(position.sellHalfPrice) }}
                    </span>
                    <span class="font-mono text-xs font-black tabular-nums" :class="pnlClass(position.sellHalfReturnPct)">
                      {{ formatPct(position.sellHalfReturnPct) }}
                    </span>
                  </div>
                </div>
                <span v-else class="font-mono text-[11px]" :class="isStealth ? 'text-slate-300' : 'text-zinc-700'">
                  --
                </span>
              </td>
              
              <!-- 出清 -->
              <td class="px-3 py-2 align-middle text-right">
                <div v-if="position.sellAllReturnPct !== null" class="trade-quote-cell" :title="`出清時間: ${formatDateTime(position.sellAllAt)}`">
                  <span class="trade-time" :class="isStealth ? 'text-slate-400' : 'text-zinc-600'">
                    {{ formatTradeDate(position.sellAllAt) }} {{ formatTradeTime(position.sellAllAt) }}
                  </span>
                  <div class="flex items-baseline justify-end gap-2">
                    <span class="trade-price" :class="pnlClass(position.sellAllReturnPct)">
                      {{ formatNumber(position.sellAllPrice) }}
                    </span>
                    <span class="font-mono text-xs font-black tabular-nums" :class="pnlClass(position.sellAllReturnPct)">
                      {{ formatPct(position.sellAllReturnPct) }}
                    </span>
                  </div>
                </div>
                <span v-else class="font-mono text-[11px]" :class="isStealth ? 'text-slate-300' : 'text-zinc-700'">
                  --
                </span>
              </td>
              
              <!-- 平均績效 -->
              <td class="px-4 py-3 align-middle text-right">
                <span class="font-mono text-base font-black tabular-nums" :class="pnlClass(position.averageSellReturnPct)">
                  {{ formatPct(position.averageSellReturnPct) }}
                </span>
              </td>
            </tr>
            <tr v-if="realizedPositions.length === 0">
              <td colspan="5" class="px-6 py-16 text-center">
                <div class="flex flex-col items-center justify-center gap-3 py-6">
                  <div class="p-3 rounded-full" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/40'">
                    <History class="w-8 h-8 opacity-40" />
                  </div>
                  <div class="text-sm font-bold" :class="isStealth ? 'text-slate-500' : 'text-zinc-400'">目前沒有已實現績效</div>
                  <p class="text-xs opacity-40 max-w-xs mx-auto">當您的交易訊號完成減碼或出清後，歷史績效明細會自動呈現在這裡。</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Trader Mode Hover Indicators & Glows */
.trader-row-glow td:first-child {
  position: relative;
}

.trader-row-glow td:first-child::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: #3b82f6;
  opacity: 0;
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.trader-row-glow:hover td:first-child::before {
  opacity: 1;
}

.trade-quote-cell {
  display: inline-flex;
  min-width: 112px;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}

.trade-price {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 1rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}

.trade-time {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  line-height: 1.15;
  white-space: nowrap;
}

tr {
  transition: background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
