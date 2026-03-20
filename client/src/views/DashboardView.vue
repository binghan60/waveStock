<script setup>
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import StockSection from '@/components/StockSection.vue'
import StockSpectrumChart from '@/components/StockSpectrumChart.vue'
import StockSpectrumCards from '@/components/StockSpectrumCards.vue'
import { useStockStore } from '@/stores/stockStore'
import { BarChart2, TrendingUp, Eye, EyeOff, Search, X } from 'lucide-vue-next'

const stockStore = useStockStore()
const {
  pinnedStocks,
  unpinnedManualStocks: unpinnedStocks,
  unpinnedRecognizedStocks,
  processedRecognizedStocks,
  isLoading,
  isStealth,
  showSpectrum,
  allStocksForManagement,
  hiddenStocks,
} = storeToRefs(stockStore)

const {
  addStock,
  removeStock,
  removeRecognizedStock,
  togglePin,
  toggleSpectrum,
  switchVersion,
  toggleHideStock,
} = stockStore

const showHiddenPanel = ref(false)
const visibilityFilter = ref(localStorage.getItem('visibilityFilter') || 'all')
watch(visibilityFilter, val => localStorage.setItem('visibilityFilter', val))

const getDateCutoff = () => {
  if (visibilityFilter.value === 'all') return null
  const ms = visibilityFilter.value === '1m' ? 30 * 24 * 60 * 60 * 1000 : 90 * 24 * 60 * 60 * 1000
  return Date.now() - ms
}

const filterByDate = (list) => {
  const cutoff = getDateCutoff()
  if (!cutoff) return list
  return list.filter(s => s.createdAt && new Date(s.createdAt).getTime() >= cutoff)
}

const dashboardSearch = ref('')

const filterBySearch = (list) => {
  const q = dashboardSearch.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(s => {
    const symbol = (s.symbol || s.code || '').toLowerCase()
    const name = (s.market?.name || '').toLowerCase()
    return symbol.includes(q) || name.includes(q)
  })
}

const applyFilters = (list) => filterBySearch(filterByDate(list))

const filteredStocksForManagement = computed(() => filterByDate(allStocksForManagement.value))
const filteredPinnedStocks = computed(() => applyFilters(pinnedStocks.value))
const filteredUnpinnedRecognizedStocks = computed(() => applyFilters(unpinnedRecognizedStocks.value))
const filteredUnpinnedStocks = computed(() => applyFilters(unpinnedStocks.value))

// UI Input
const inputSymbol = ref('')
const inputError = ref('')

const handleAddStock = async () => {
  if (!inputSymbol.value) return
  if (stockStore.isTracking(inputSymbol.value)) {
    inputError.value = 'duplicate'
    setTimeout(() => {
      inputError.value = ''
    }, 1500)
    return
  }
  inputError.value = ''
  await addStock(inputSymbol.value)
  inputSymbol.value = ''
}

const handleRemoveItem = (item) => {
  if (item.listType === 'manual') {
    removeStock(item.id || item._id)
  } else {
    removeRecognizedStock(item._id)
  }
}

const scrollToCard = (code) => {
  const el = document.getElementById('stock-card-' + code)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('card-highlight')
  setTimeout(() => el.classList.remove('card-highlight'), 1500)
}
</script>

<template>
  <div>
    <!-- Quick Add Section -->
    <div class="mb-2 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 sm:items-center">
      <!-- 上排 (手機) / 右側按鈕群 (桌面) -->
      <div class="flex justify-end gap-2 sm:contents">
        <!-- Spectrum Toggle -->
        <button
          @click="toggleSpectrum"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer"
          :class="
            isStealth
              ? showSpectrum
                ? 'bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-white border-slate-200 text-slate-400'
              : showSpectrum
                ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400'
          "
          :title="showSpectrum ? '隱藏分布圖' : '顯示分布圖'"
        >
          <BarChart2 v-if="showSpectrum" class="w-4 h-4 shrink-0" />
          <TrendingUp v-else class="w-4 h-4 shrink-0" />
          <span class="sm:hidden">{{ showSpectrum ? '分布圖' : '分布圖' }}</span>
          <span class="hidden sm:inline">{{ showSpectrum ? '隱藏分布圖' : '顯示分布圖' }}</span>
        </button>

        <!-- 顯示管理按鈕 -->
        <button
          @click="showHiddenPanel = !showHiddenPanel"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer"
          :class="
            isStealth
              ? showHiddenPanel
                ? 'bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-white border-slate-200 text-slate-400'
              : showHiddenPanel
                ? 'bg-zinc-700 border-zinc-500 text-zinc-200'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400'
          "
          title="顯示管理"
        >
          <Eye v-if="!showHiddenPanel" class="w-4 h-4 shrink-0" />
          <EyeOff v-else class="w-4 h-4 shrink-0" />
          <span class="sm:hidden">管理</span>
          <span class="hidden sm:inline">顯示管理</span>
          <span
            v-if="hiddenStocks.length > 0"
            class="px-1.5 py-0.5 rounded text-[9px] bg-red-500/20 text-red-400 border border-red-500/30"
          >
            {{ hiddenStocks.length }}
          </span>
        </button>
      </div>

      <!-- 下排 (手機) / 右側 input 群 (桌面) -->
      <div class="flex gap-2">
        <!-- 搜尋框 -->
        <div class="relative flex-1 sm:flex-none sm:w-36 md:w-48">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            :class="isStealth ? 'text-slate-400' : 'text-zinc-500'" />
          <input
            v-model="dashboardSearch"
            :placeholder="isStealth ? 'Search...' : '搜尋股票'"
            class="w-full pl-7 pr-7 py-1.5 text-sm rounded-lg border outline-none transition-all"
            :class="isStealth
              ? 'bg-white border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
              : 'bg-zinc-900 border-zinc-800 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'"
          />
          <button v-if="dashboardSearch" @click="dashboardSearch = ''"
            class="absolute right-2 top-1/2 -translate-y-1/2"
            :class="isStealth ? 'text-slate-400 hover:text-slate-600' : 'text-zinc-500 hover:text-zinc-300'">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <div class="relative flex-1 sm:flex-none sm:w-48 md:w-64">
          <input
            v-model="inputSymbol"
            @keyup.enter="handleAddStock"
            :placeholder="isStealth ? 'Symbol...' : '快速加入代號'"
            class="w-full px-3 py-1.5 text-sm rounded-lg border outline-none transition-all"
            :class="
              inputError === 'duplicate'
                ? 'border-red-500 ring-2 ring-red-500/30 animate-shake'
                : isStealth
                  ? 'bg-white border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                  : 'bg-zinc-900 border-zinc-800 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
            "
          />
          <span
            v-if="inputError === 'duplicate'"
            class="absolute -bottom-5 left-0 text-[10px] text-red-400 font-bold whitespace-nowrap"
            >已在清單中</span
          >
        </div>
        <button
          @click="handleAddStock"
          :disabled="isLoading"
          class="px-4 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
          :class="
            isStealth
              ? 'bg-slate-700 text-white hover:bg-slate-800'
              : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20'
          "
        >
          {{ isLoading ? '...' : 'ADD' }}
        </button>
      </div>
    </div>

    <!-- 顯示管理面板 -->
    <transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="showHiddenPanel && allStocksForManagement.length > 0"
        class="mb-6 p-4 rounded-xl border"
        :class="isStealth ? 'bg-slate-50 border-slate-200' : 'bg-zinc-900 border-zinc-700'"
      >
        <!-- 頂部：快捷篩選 -->
        <div class="flex items-center gap-2 mb-4">
          <span class="text-[10px] font-bold uppercase tracking-wider opacity-40 mr-1">篩選</span>
          <button
            v-for="f in [
              { key: 'all', label: '全部' },
              { key: '1m', label: '近1個月' },
              { key: '3m', label: '近3個月' },
            ]"
            :key="f.key"
            @click="visibilityFilter = f.key"
            class="px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all"
            :class="
              visibilityFilter === f.key
                ? isStealth
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'bg-zinc-500 text-white border-zinc-500'
                : isStealth
                  ? 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                  : 'bg-transparent text-zinc-500 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300'
            "
          >
            {{ f.label }}
          </button>
          <span class="ml-auto text-[10px] opacity-30 font-mono"
            >{{ filteredStocksForManagement.length }} 筆</span
          >
        </div>

        <div class="space-y-4">
          <!-- 辨識股票 -->
          <div
            v-if="filteredStocksForManagement.filter((s) => s.listType === 'recognized').length > 0"
          >
            <div class="flex items-center gap-2 mb-2">
              <span
                class="w-1.5 h-1.5 rounded-full"
                :class="isStealth ? 'bg-green-500' : 'bg-green-400'"
              />
              <span class="text-[10px] font-bold uppercase tracking-wider opacity-50"
                >圖片辨識</span
              >
            </div>
            <div
              class="grid gap-1.5"
              style="grid-template-columns: repeat(auto-fill, minmax(88px, 1fr))"
            >
              <button
                v-for="s in filteredStocksForManagement.filter((s) => s.listType === 'recognized')"
                :key="s.symbol"
                @click="toggleHideStock(s.symbol)"
                :title="s.isHidden ? '點擊顯示' : '點擊隱藏'"
                class="py-1.5 px-1 rounded-lg border text-center transition-all active:scale-95 flex flex-col items-center gap-0.5"
                :class="
                  s.isHidden
                    ? isStealth
                      ? 'bg-white border-slate-200 text-slate-300 line-through'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-600 line-through'
                    : isStealth
                      ? 'bg-white border-green-300 text-slate-700 hover:border-green-500'
                      : 'bg-zinc-800 border-green-500/40 text-zinc-200 hover:border-green-400'
                "
              >
                <span class="text-xs font-mono font-bold leading-none">{{ s.symbol }}</span>
                <span v-if="s.name && s.name !== s.symbol" class="text-[9px] opacity-60 leading-none truncate w-full text-center">{{ s.name }}</span>
              </button>
            </div>
          </div>

          <!-- 自選股票 -->
          <div v-if="filteredStocksForManagement.filter((s) => s.listType === 'manual').length > 0">
            <div class="flex items-center gap-2 mb-2">
              <span
                class="w-1.5 h-1.5 rounded-full"
                :class="isStealth ? 'bg-blue-500' : 'bg-blue-400'"
              />
              <span class="text-[10px] font-bold uppercase tracking-wider opacity-50"
                >個人自選</span
              >
            </div>
            <div
              class="grid gap-1.5"
              style="grid-template-columns: repeat(auto-fill, minmax(88px, 1fr))"
            >
              <button
                v-for="s in filteredStocksForManagement.filter((s) => s.listType === 'manual')"
                :key="s.symbol"
                @click="toggleHideStock(s.symbol)"
                :title="s.isHidden ? '點擊顯示' : '點擊隱藏'"
                class="py-1.5 px-1 rounded-lg border text-center transition-all active:scale-95 flex flex-col items-center gap-0.5"
                :class="
                  s.isHidden
                    ? isStealth
                      ? 'bg-white border-slate-200 text-slate-300 line-through'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-600 line-through'
                    : isStealth
                      ? 'bg-white border-blue-300 text-slate-700 hover:border-blue-500'
                      : 'bg-zinc-800 border-blue-500/40 text-zinc-200 hover:border-blue-400'
                "
              >
                <span class="text-xs font-mono font-bold leading-none">{{ s.symbol }}</span>
                <span v-if="s.name && s.name !== s.symbol" class="text-[9px] opacity-60 leading-none truncate w-full text-center">{{ s.name }}</span>
              </button>
            </div>
          </div>

          <!-- 篩選後無結果 -->
          <div
            v-if="filteredStocksForManagement.length === 0"
            class="text-center py-4 text-xs opacity-30"
          >
            此時間範圍內無股票
          </div>
        </div>
      </div>
    </transition>

    <!-- 光譜圖區域 -->
    <template v-if="!isLoading && processedRecognizedStocks.length > 0">
      <StockSpectrumChart v-if="showSpectrum" :filter-mode="visibilityFilter" @card-click="scrollToCard" />
      <StockSpectrumCards :filter-mode="visibilityFilter" />
    </template>

    <!-- 置頂區域 -->
    <StockSection
      title="置頂監控"
      stealthTitle="PINNED_WATCHLIST"
      :stocks="filteredPinnedStocks"
      :count="filteredPinnedStocks.length"
      :is-loading="isLoading"
      :is-stealth="isStealth"
      :show-if-empty="false"
      badge-class="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
      @remove="handleRemoveItem"
      @togglePin="togglePin"
      @switchVersion="switchVersion"
      @hideStock="toggleHideStock"
    />

    <!-- 圖片辨識區域 -->
    <StockSection
      title="圖片辨識分析"
      stealthTitle="AI_ANALYTICS_DATA"
      :stocks="filteredUnpinnedRecognizedStocks"
      :count="filteredUnpinnedRecognizedStocks.length"
      :is-loading="isLoading"
      :is-stealth="isStealth"
      :allow-delete="false"
      badge-class="bg-green-500/10 text-green-400 border border-green-500/20"
      @remove="handleRemoveItem"
      @togglePin="togglePin"
      @switchVersion="switchVersion"
      @hideStock="toggleHideStock"
    >
    </StockSection>

    <!-- 個人自選區域 -->
    <StockSection
      title="個人自選清單"
      stealthTitle="USER_WATCHLIST_LOCAL"
      :stocks="filteredUnpinnedStocks"
      :count="filteredUnpinnedStocks.length"
      :is-loading="isLoading"
      :is-stealth="isStealth"
      grid-cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      empty-message="Watchlist is empty."
      @remove="handleRemoveItem"
      @togglePin="togglePin"
      @hideStock="toggleHideStock"
    />
  </div>
</template>

<style scoped>
@keyframes card-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
  50%  { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0.2); }
  100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
}

:global(.card-highlight) {
  animation: card-pulse 3s ease-out;
  border-color: rgb(99, 102, 241) !important;
}
</style>
