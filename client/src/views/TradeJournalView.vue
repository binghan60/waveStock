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

const formatShortDate = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

const formatDateTimeToMinute = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

const pnlClass = (value) => {
  const positive = Number(value) >= 0
  if (isStealth.value) return positive ? 'text-red-600' : 'text-green-700'
  return positive ? 'text-red-400' : 'text-green-400'
}

const returnBadgeClass = (value) => {
  if (value === null || value === undefined) return 'opacity-30'
  const positive = Number(value) >= 0
  if (isStealth.value) {
    return positive 
      ? 'bg-red-50 text-red-600 border border-red-200 px-2.5 py-0.5 rounded text-xs font-bold' 
      : 'bg-green-50 text-green-700 border border-green-200 px-2.5 py-0.5 rounded text-xs font-bold'
  }
  return positive 
    ? 'bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-0.5 rounded text-xs font-bold shadow-[0_0_8px_rgba(239,68,68,0.1)]' 
    : 'bg-green-500/10 text-green-400 border border-green-500/20 px-2.5 py-0.5 rounded text-xs font-bold shadow-[0_0_8px_rgba(34,197,94,0.1)]'
}

const summaryCards = computed(() => [
  { label: '目前持股', value: `${summary.value.openPositionCount || 0} 檔`, tone: null, icon: WalletCards },
  { label: '持股成本', value: formatNumber(summary.value.openCost), tone: null, icon: Coins },
  { label: '目前市值', value: formatNumber(summary.value.marketValue), tone: null, icon: Activity },
  { label: '已實現損益', value: formatNumber(summary.value.realizedPnl), tone: summary.value.realizedPnl, icon: Award },
  { label: '未實現損益', value: formatNumber(summary.value.unrealizedPnl), tone: summary.value.unrealizedPnl, icon: Clock },
  { label: '總損益', value: formatNumber(summary.value.totalPnl), tone: summary.value.totalPnl, icon: Wallet },
  { label: '累積報酬率', value: formatPct(summary.value.totalReturnPct), tone: summary.value.totalReturnPct, icon: Percent },
  { label: '交易訊號', value: `${summary.value.recordCount || 0} 筆`, tone: null, icon: History },
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
        <p class="text-sm opacity-50 pl-12">記錄買進、減碼與出清績效</p>
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
    <div v-if="error" class="rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 px-4 py-3 text-sm flex items-center gap-2">
      <Info class="w-4 h-4 shrink-0" />
      {{ error }}
    </div>

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
    <section class="rounded-xl border overflow-hidden transition-colors duration-300" :class="panelClass">
      <div
        class="px-5 py-4 flex items-center justify-between border-b"
        :class="isStealth ? 'border-slate-200 bg-slate-50/50' : 'border-zinc-800 bg-zinc-950/60'"
      >
        <h3 class="text-sm font-bold flex items-center gap-2.5 tracking-wide">
          <WalletCards class="w-4 h-4 text-blue-500" />
          {{ isStealth ? '現有持股明細' : '目前持股' }}
        </h3>
        <span
          class="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full"
          :class="isStealth ? 'bg-slate-200 text-slate-600' : 'bg-zinc-800 text-zinc-300'"
        >{{ openPositions.length }} 檔</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[640px]">
          <thead>
            <tr 
              class="border-b"
              :class="isStealth ? 'text-slate-500 border-slate-100 bg-slate-50/20' : 'text-zinc-400 border-zinc-800/80 bg-zinc-900/10'"
            >
              <th class="px-6 py-3 text-left text-xs font-semibold tracking-wide">股票</th>
              <th class="px-6 py-3 text-right text-xs font-semibold tracking-wide">剩餘部位</th>
              <th class="px-6 py-3 text-right text-xs font-semibold tracking-wide">平均成本</th>
              <th class="px-6 py-3 text-right text-xs font-semibold tracking-wide">目前股價</th>
              <th class="px-6 py-3 text-right text-xs font-semibold tracking-wide">報酬率</th>
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
              class="border-t transition-colors duration-300 relative group"
              :class="[
                isStealth
                  ? 'border-slate-100 hover:bg-slate-50/60'
                  : 'border-zinc-800/60 hover:bg-zinc-800/25 trader-row-glow'
              ]"
            >
              <td class="px-6 py-3 align-middle relative z-10">
                <div class="flex items-center gap-2">
                  <span 
                    :class="[
                      isStealth 
                        ? 'text-slate-700 font-semibold bg-slate-100 border border-slate-200/60 px-2.5 py-0.5 rounded font-mono text-xs' 
                        : 'text-zinc-100 font-bold bg-zinc-800/60 border border-zinc-700/50 px-2.5 py-0.5 rounded font-mono text-xs'
                    ]"
                  >
                    {{ position.code }}
                  </span>
                  <span class="text-xs opacity-50 font-medium" :class="isStealth ? '' : 'text-zinc-400'">{{ position.name }}</span>
                </div>
              </td>
              <td class="px-6 py-3 align-middle text-right font-mono tabular-nums font-semibold" :class="isStealth ? 'text-slate-700' : 'text-zinc-300'">
                {{ formatNumber(position.quantity, 4) }}
              </td>
              <td class="px-6 py-3 align-middle text-right font-mono tabular-nums" :class="isStealth ? 'text-slate-600' : 'text-zinc-400'">
                {{ formatNumber(position.averageCost) }}
              </td>
              <td class="px-6 py-3 align-middle text-right font-mono tabular-nums" :class="isStealth ? 'text-slate-600' : 'text-zinc-400'">
                {{ formatNumber(position.currentPrice) }}
              </td>
              <td class="px-6 py-3 align-middle text-right font-mono">
                <span :class="returnBadgeClass(position.returnPct)">
                  <span v-if="position.returnPct > 0" class="text-[9px] mr-0.5">▲</span>
                  <span v-else-if="position.returnPct < 0" class="text-[9px] mr-0.5">▼</span>
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
    <section class="rounded-xl border overflow-hidden transition-colors duration-300" :class="panelClass">
      <div
        class="px-5 py-4 flex items-center justify-between border-b"
        :class="isStealth ? 'border-slate-200 bg-slate-50/50' : 'border-zinc-800 bg-zinc-950/60'"
      >
        <h3 class="text-sm font-bold flex items-center gap-2.5 tracking-wide">
          <History class="w-4 h-4 text-emerald-500" />
          {{ isStealth ? '歷史交易績效' : '歷史績效' }}
        </h3>
        <span
          class="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full"
          :class="isStealth ? 'bg-slate-200 text-slate-600' : 'bg-zinc-800 text-zinc-300'"
        >{{ realizedPositions.length }} 筆</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[560px]">
          <thead>
            <tr 
              class="border-b"
              :class="isStealth ? 'text-slate-500 border-slate-100 bg-slate-50/20' : 'text-zinc-400 border-zinc-800/80 bg-zinc-900/10'"
            >
              <th class="px-6 py-3 text-left text-xs font-semibold tracking-wide">股票</th>
              <th class="px-6 py-3 text-right text-xs font-semibold tracking-wide">減碼</th>
              <th class="px-6 py-3 text-right text-xs font-semibold tracking-wide">出清</th>
              <th class="px-6 py-3 text-right text-xs font-semibold tracking-wide">平均績效</th>
            </tr>
          </thead>
          
          <!-- Loading state for table -->
          <tbody v-if="isLoading">
            <tr v-for="i in 3" :key="i" class="border-t animate-pulse" :class="isStealth ? 'border-slate-100' : 'border-zinc-800/60'">
              <td class="px-6 py-3 align-middle">
                <div class="h-4 w-12 rounded mb-2" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800'" />
                <div class="h-3 w-16 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
              </td>
              <td class="px-6 py-3 align-middle">
                <div class="h-4 w-24 rounded ml-auto" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
              </td>
              <td class="px-6 py-3 align-middle">
                <div class="h-4 w-24 rounded ml-auto" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
              </td>
              <td class="px-6 py-3 align-middle"><div class="h-5 w-20 rounded ml-auto" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800'" /></td>
            </tr>
          </tbody>

          <!-- Table Body -->
          <tbody v-else>
            <tr
              v-for="position in realizedPositions"
              :key="position.code"
              class="border-t transition-colors duration-300 relative"
              :class="[
                isStealth
                  ? 'border-slate-100 hover:bg-slate-50/60'
                  : 'border-zinc-800/60 hover:bg-zinc-800/25 trader-row-glow'
              ]"
            >
              <td class="px-6 py-3 align-middle">
                <div class="flex items-center gap-2">
                  <span 
                    :class="[
                      isStealth 
                        ? 'text-slate-700 font-semibold bg-slate-100 border border-slate-200/60 px-2.5 py-0.5 rounded font-mono text-xs' 
                        : 'text-zinc-100 font-bold bg-zinc-800/60 border border-zinc-700/50 px-2.5 py-0.5 rounded font-mono text-xs'
                    ]"
                  >
                    {{ position.code }}
                  </span>
                  <span class="text-xs opacity-50 font-medium" :class="isStealth ? '' : 'text-zinc-400'">{{ position.name }}</span>
                </div>
              </td>
              
              <!-- 減碼 -->
              <td class="px-6 py-3 align-middle text-right">
                <div v-if="position.sellHalfReturnPct !== null" class="inline-flex items-center justify-end gap-2" :title="`減碼時間: ${formatDateTime(position.sellHalfAt)}`">
                  <span class="text-[11px] opacity-40 font-mono tracking-tight whitespace-nowrap">
                    {{ formatDateTimeToMinute(position.sellHalfAt) }}
                  </span>
                  <span :class="returnBadgeClass(position.sellHalfReturnPct)">
                    <span v-if="position.sellHalfReturnPct > 0" class="text-[9px] mr-0.5">▲</span>
                    <span v-else-if="position.sellHalfReturnPct < 0" class="text-[9px] mr-0.5">▼</span>
                    {{ formatPct(position.sellHalfReturnPct) }}
                  </span>
                </div>
                <span v-else class="text-xs opacity-30 px-2 py-0.5 rounded border border-dashed inline-block align-middle" :class="isStealth ? 'border-slate-200 text-slate-400' : 'border-zinc-800 text-zinc-600'">
                  未減碼
                </span>
              </td>
              
              <!-- 出清 -->
              <td class="px-6 py-3 align-middle text-right">
                <div v-if="position.sellAllReturnPct !== null" class="inline-flex items-center justify-end gap-2" :title="`出清時間: ${formatDateTime(position.sellAllAt)}`">
                  <span class="text-[11px] opacity-40 font-mono tracking-tight whitespace-nowrap">
                    {{ formatDateTimeToMinute(position.sellAllAt) }}
                  </span>
                  <span :class="returnBadgeClass(position.sellAllReturnPct)">
                    <span v-if="position.sellAllReturnPct > 0" class="text-[9px] mr-0.5">▲</span>
                    <span v-else-if="position.sellAllReturnPct < 0" class="text-[9px] mr-0.5">▼</span>
                    {{ formatPct(position.sellAllReturnPct) }}
                  </span>
                </div>
                <span v-else class="text-xs opacity-30 px-2 py-0.5 rounded border border-dashed inline-block align-middle" :class="isStealth ? 'border-slate-200 text-slate-400' : 'border-zinc-800 text-zinc-600'">
                  未出清
                </span>
              </td>
              
              <!-- 平均績效 -->
              <td class="px-6 py-3 align-middle text-right">
                <span :class="returnBadgeClass(position.averageSellReturnPct)" class="font-extrabold text-sm tracking-tight inline-block align-middle">
                  <span v-if="position.averageSellReturnPct > 0" class="text-[9px] mr-0.5">▲</span>
                  <span v-else-if="position.averageSellReturnPct < 0" class="text-[9px] mr-0.5">▼</span>
                  {{ formatPct(position.averageSellReturnPct) }}
                </span>
              </td>
            </tr>
            <tr v-if="realizedPositions.length === 0">
              <td colspan="4" class="px-6 py-16 text-center">
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

tr {
  transition: background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
