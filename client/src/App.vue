<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import StockSection from './components/StockSection.vue'
import PriceEditModal from './components/PriceEditModal.vue'
import ConfirmModal from './components/ConfirmModal.vue'
import { useStockFormatter } from '@/composables/useStockFormatter'
import { useStockStore } from '@/stores/stockStore'

const toast = useToast()
const { formatPrice: formatStockPrice } = useStockFormatter()
const stockStore = useStockStore()

// 使用 storeToRefs 保持響應性
const { 
  pinnedStocks, 
  unpinnedManualStocks: unpinnedStocks, 
  unpinnedRecognizedStocks, 
  processedRecognizedStocks: recognizedStocks, 
  isLoading, 
  lastUpdated, 
  isStealth,
  pinnedList,
  searchQuery,
  sortConfig,
  activeTab
} = storeToRefs(stockStore)

const { 
  addStock, 
  removeStock, 
  removeRecognizedStock, 
  updateRecognizedPrice, 
  togglePin, 
  toggleStealth, 
  triggerBot,
  getLimitHitStatus,
  startAutoRefresh,
  stopAutoRefresh,
  setSearchQuery,
  toggleSort,
  setActiveTab
} = stockStore

// --- Modal 狀態 ---
const isPriceModalVisible = ref(false)
const editingStock = ref(null)

// UI Input
const inputSymbol = ref('')

// --- API 互動 ---
const editInitialPrice = (stock) => {
  editingStock.value = stock
  isPriceModalVisible.value = true
}

const handleCloseModal = () => {
  isPriceModalVisible.value = false
  editingStock.value = null
}

const handleSavePrice = async (newPrice) => {
  if (!editingStock.value) return
  const success = await updateRecognizedPrice(editingStock.value._id, newPrice)
  if (success) {
    handleCloseModal()
  }
}

const handleAddStock = async () => {
  if (!inputSymbol.value) return
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

// --- Lifecycle ---
onMounted(() => {
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <div
    class="min-h-screen transition-colors duration-500 font-sans pb-20 selection:bg-blue-500/30"
    :class="isStealth ? 'bg-slate-50 text-slate-700' : 'bg-[#0f0f0f] text-gray-100'"
  >
    <div class="max-w-7xl mx-auto p-4 md:p-8">
      <header
        class="flex flex-col md:flex-row justify-between items-center border-b pb-6 mb-8 gap-4"
        :class="isStealth ? 'border-gray-200' : 'border-zinc-800'"
      >
        <div class="flex items-center gap-4">
          <h1 class="text-2xl font-black tracking-tight italic">
            {{ isStealth ? 'Core_System_Report' : '🚀 2026 財富自由戰情室' }}
          </h1>
          <button
            v-if="!isStealth"
            @click="triggerBot"
            class="px-2 py-1 rounded text-[10px] border border-zinc-700 text-zinc-500 hover:border-blue-500 hover:text-blue-400 transition-all uppercase tracking-tighter"
          >
            Run Bot Test
          </button>
        </div>

        <div class="flex items-center gap-6">
          <div class="flex flex-col items-end">
            <div
              class="flex items-center gap-2 text-[10px] font-mono opacity-50 uppercase tracking-widest"
            >
              <span
                class="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
              ></span>
              Live Syncing
            </div>
            <span class="text-xs font-mono opacity-70">{{ lastUpdated }}</span>
          </div>

          <button
            @click="toggleStealth"
            class="px-5 py-2 rounded-full text-xs font-bold border transition-all hover:scale-105 active:scale-95 shadow-sm"
            :class="
              isStealth
                ? 'border-slate-300 text-slate-500 bg-white hover:bg-slate-100'
                : 'border-zinc-700 text-zinc-400 hover:border-blue-500 hover:text-blue-400 bg-zinc-900/50'
            "
          >
            {{ isStealth ? '🏢 OFFICE MODE' : '🚀 TRADER MODE' }}
          </button>
        </div>
      </header>

      <!-- Tab Navigation & Quick Add -->
      <div class="mb-8 flex flex-col md:flex-row justify-between items-center border-b gap-4" :class="isStealth ? 'border-slate-200' : 'border-zinc-800'">
        <div class="flex">
          <button
            @click="setActiveTab('dashboard')"
            class="px-6 py-3 text-sm font-bold tracking-wider uppercase transition-all whitespace-nowrap"
            :class="[
              activeTab === 'dashboard'
                ? isStealth
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-blue-400 border-b-2 border-blue-400'
                : isStealth
                  ? 'text-slate-500 hover:bg-slate-100'
                  : 'text-zinc-500 hover:bg-zinc-800/50',
            ]"
          >
            戰情室
          </button>
          <button
            @click="setActiveTab('dataTable')"
            class="px-6 py-3 text-sm font-bold tracking-wider uppercase transition-all whitespace-nowrap"
            :class="[
              activeTab === 'dataTable'
                ? isStealth
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-blue-400 border-b-2 border-blue-400'
                : isStealth
                  ? 'text-slate-500 hover:bg-slate-100'
                  : 'text-zinc-500 hover:bg-zinc-800/50',
            ]"
          >
            戰果榜
          </button>
        </div>

        <!-- Quick Add Section (Only in Dashboard) -->
        <div v-if="activeTab === 'dashboard'" class="flex gap-2 pb-2 md:pb-0 md:mb-[-1px]">
          <div class="relative w-48 md:w-64">
            <input
              v-model="inputSymbol"
              @keyup.enter="handleAddStock"
              :placeholder="isStealth ? 'Symbol...' : '快速加入代號'"
              class="w-full px-3 py-1.5 text-sm rounded-lg border outline-none transition-all"
              :class="
                isStealth
                  ? 'bg-white border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                  : 'bg-zinc-900 border-zinc-800 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              "
            />
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

      <!-- Tab Content -->
      <main>
        <!-- Dashboard / 戰情室 -->
        <div v-if="activeTab === 'dashboard'">
          <!-- 置頂區域 -->
          <StockSection
            title="📌 置頂監控"
            stealthTitle="PINNED_WATCHLIST"
            :stocks="pinnedStocks"
            :count="pinnedStocks.length"
            :is-loading="isLoading"
            :is-stealth="isStealth"
            :show-if-empty="false"
            badge-class="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
            @remove="handleRemoveItem"
            @togglePin="togglePin"
          />

          <!-- 圖片辨識區域 -->
          <StockSection
            title="圖片辨識分析"
            stealthTitle="AI_ANALYTICS_DATA"
            :stocks="unpinnedRecognizedStocks"
            :count="unpinnedRecognizedStocks.length"
            :is-loading="isLoading"
            :is-stealth="isStealth"
            :allow-delete="false"
            badge-class="bg-green-500/10 text-green-400 border border-green-500/20"
            @remove="handleRemoveItem"
            @togglePin="togglePin"
          >
            <template #actions v-if="!isStealth">
              <button
                @click="triggerBot"
                class="px-2 py-1 rounded text-[10px] border border-zinc-700 text-zinc-500 hover:border-blue-500 hover:text-blue-400 transition-all uppercase tracking-tighter"
              >
                Run Bot Test
              </button>
            </template>
          </StockSection>


          <!-- 個人自選區域 -->
          <StockSection
            title="個人自選清單"
            stealthTitle="USER_WATCHLIST_LOCAL"
            :stocks="unpinnedStocks"
            :count="unpinnedStocks.length"
            :is-loading="isLoading"
            :is-stealth="isStealth"
            grid-cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            empty-message="Watchlist is empty."
            @remove="handleRemoveItem"
            @togglePin="togglePin"
          />
        </div>

        <!-- Data Table / 戰果榜 -->
        <div v-if="activeTab === 'dataTable'">
          <div class="flex justify-between items-end mb-6">
            <div>
              <div class="flex items-center gap-3 mb-2">
                <h2 class="text-2xl font-bold tracking-tight">
                  {{ isStealth ? 'RECOGNITION_RECORDS' : '📊 圖片辨識戰果榜' }}
                </h2>
                <span
                  class="px-3 py-1 rounded-full text-xs font-mono font-bold"
                  :class="
                    isStealth
                      ? 'bg-slate-200 text-slate-600'
                      : 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-400 border border-blue-500/30'
                  "
                >
                  總計: {{ recognizedStocks.length }} 筆
                </span>
              </div>
              <p class="text-sm opacity-60" :class="isStealth ? 'text-slate-500' : 'text-zinc-400'">
                所有透過圖片辨識的股票資料
              </p>
            </div>

            <!-- Search Bar -->
            <div class="relative w-64">
              <input
                :value="searchQuery"
                @input="setSearchQuery($event.target.value)"
                placeholder="搜尋代號或名稱..."
                class="w-full px-4 py-2 rounded-lg text-sm border outline-none transition-all"
                :class="
                  isStealth
                    ? 'bg-white border-slate-200 focus:border-blue-400'
                    : 'bg-zinc-900 border-zinc-700 text-white focus:border-blue-500'
                "
              />
              <span v-if="searchQuery" @click="setSearchQuery('')" class="absolute right-3 top-2.5 text-xs cursor-pointer opacity-50 hover:opacity-100">✕</span>
            </div>
          </div>

          <!-- 空狀態 -->
          <div
            v-if="recognizedStocks.length === 0"
            class="py-20 text-center border-2 border-dashed rounded-2xl transition-colors"
            :class="isStealth ? 'border-slate-200 text-slate-400' : 'border-zinc-800 text-zinc-600'"
          >
            <div class="text-6xl mb-4 opacity-20">📊</div>
            <h3 class="text-lg font-bold mb-2">無符合資料</h3>
            <p class="text-sm opacity-60">
              {{ searchQuery ? '嘗試使用其他關鍵字搜尋' : '上傳股票圖片後，資料將顯示在此處' }}
            </p>
          </div>

          <!-- 表格 -->
          <div
            v-else
            class="overflow-x-auto rounded-2xl border"
            :class="isStealth ? 'border-slate-200' : 'border-zinc-800'"
          >
            <table class="w-full text-sm">
              <thead>
                <tr
                  class="border-b font-bold"
                  :class="
                    isStealth
                      ? 'bg-slate-100 border-slate-200 text-slate-700'
                      : 'bg-zinc-900/50 border-zinc-800 text-zinc-300'
                  "
                >
                  <th class="px-4 py-4 text-left font-bold tracking-wide">#</th>
                  
                  <th 
                    @click="toggleSort('code')" 
                    class="px-4 py-4 text-left font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
                  >
                    股票代號
                    <span v-if="sortConfig.key === 'code'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
                  </th>

                  <th 
                    @click="toggleSort('initialPrice')" 
                    class="px-4 py-4 text-right font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
                  >
                    新增時股價
                    <span v-if="sortConfig.key === 'initialPrice'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
                  </th>

                  <th 
                    @click="toggleSort('currentPrice')" 
                    class="px-4 py-4 text-right font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
                  >
                    目前股價
                    <span v-if="sortConfig.key === 'currentPrice'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
                  </th>

                  <th 
                    @click="toggleSort('swapRef')" 
                    class="px-4 py-4 text-right font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
                  >
                    換股價
                    <span v-if="sortConfig.key === 'swapRef'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
                  </th>

                  <th 
                    @click="toggleSort('support')" 
                    class="px-4 py-4 text-right font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
                  >
                    支撐區間
                    <span v-if="sortConfig.key === 'support'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
                  </th>

                  <th 
                    @click="toggleSort('shortTermProfit')" 
                    class="px-4 py-4 text-right font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
                  >
                    短線目標
                    <span v-if="sortConfig.key === 'shortTermProfit'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
                  </th>

                  <th 
                    @click="toggleSort('waveProfit')" 
                    class="px-4 py-4 text-right font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
                  >
                    波段目標
                    <span v-if="sortConfig.key === 'waveProfit'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
                  </th>

                  <th 
                    @click="toggleSort('isSuccess')" 
                    class="px-4 py-4 text-center font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
                  >
                    狀態
                    <span v-if="sortConfig.key === 'isSuccess'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
                  </th>

                  <th 
                    @click="toggleSort('updatedAt')" 
                    class="px-4 py-4 text-left font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
                  >
                    傳入時間
                    <span v-if="sortConfig.key === 'updatedAt'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(stock, index) in recognizedStocks"
                  :key="stock._id"
                  class="border-b transition-colors hover:bg-opacity-50"
                  :class="[
                    isStealth
                      ? 'border-slate-100 hover:bg-slate-50'
                      : 'border-zinc-800/50 hover:bg-zinc-900/30',
                    { 'limit-up-glory-animation': getLimitHitStatus(stock).isLimit && getLimitHitStatus(stock).isUp && !isStealth },
                    { 'limit-down-table-animation': getLimitHitStatus(stock).isLimit && getLimitHitStatus(stock).isDown && !isStealth }
                  ]"
                >
                  <!-- 序號 -->
                  <td class="px-4 py-4 font-mono text-xs opacity-50">
                    {{ index + 1 }}
                  </td>

                  <!-- 股票代號 -->
                  <td class="px-4 py-4">
                    <div class="flex items-center gap-2">
                      <button
                        @click="togglePin(stock.code)"
                        class="opacity-40 hover:opacity-100 transition-opacity"
                      >
                        {{ pinnedList.includes(stock.code) ? '📌' : '📍' }}
                      </button>
                      <span
                        class="font-black text-lg tracking-tight"
                        :class="isStealth ? 'text-slate-900' : 'text-white'"
                      >
                        {{ stock.code }} {{ stock.market.name }}
                      </span>
                    </div>
                  </td>

                  <!-- 新增時股價 (資料庫記錄) -->
                  <td class="px-4 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                      <span
                        v-if="stock.currentPrice"
                        class="font-mono text-sm"
                        :class="isStealth ? 'text-slate-600' : 'text-zinc-400'"
                      >
                        {{ formatStockPrice(stock.currentPrice) }}
                      </span>
                      <span v-else class="text-xs opacity-40">-</span>
                      <button @click="editInitialPrice(stock)" class="opacity-20 hover:opacity-100 text-xs">✎</button>
                    </div>
                  </td>

                  <!-- 目前股價 (即時 API) -->
                  <td class="px-4 py-4 text-right">
                    <div
                      v-if="stock.market && stock.market.currentPrice"
                      class="flex flex-col items-end gap-1"
                    >
                      <!-- 股價顏色：紅漲綠跌（比照戰情室，比較 currentPrice vs yesterdayClose） -->
                      <span
                        class="font-bold text-base"
                        :class="
                          stock.market.yesterdayClose
                            ? parseFloat(stock.market.currentPrice) >
                              parseFloat(stock.market.yesterdayClose)
                              ? isStealth
                                ? 'text-slate-900 font-black'
                                : 'text-red-400'
                              : parseFloat(stock.market.currentPrice) <
                                  parseFloat(stock.market.yesterdayClose)
                                ? isStealth
                                  ? 'text-slate-500 font-medium'
                                  : 'text-green-400'
                                : isStealth
                                  ? 'text-slate-700'
                                  : 'text-white'
                            : isStealth
                              ? 'text-blue-600'
                              : 'text-blue-400'
                        "
                      >
                        {{ formatStockPrice(stock.market.currentPrice) }}
                      </span>
                      <!-- 漲跌幅 (相比昨收價)：紅漲綠跌 -->
                      <span
                        v-if="stock.market.yesterdayClose"
                        class="text-xs font-mono"
                        :class="
                          parseFloat(stock.market.currentPrice) >
                          parseFloat(stock.market.yesterdayClose)
                            ? isStealth
                              ? 'text-slate-900 font-bold'
                              : 'text-red-400'
                            : parseFloat(stock.market.currentPrice) <
                                parseFloat(stock.market.yesterdayClose)
                              ? isStealth
                                ? 'text-slate-500'
                                : 'text-green-400'
                              : 'text-gray-500'
                        "
                      >
                        {{
                          parseFloat(stock.market.currentPrice) >
                          parseFloat(stock.market.yesterdayClose)
                            ? '▲ ' +
                              (
                                ((parseFloat(stock.market.currentPrice) -
                                  parseFloat(stock.market.yesterdayClose)) /
                                  parseFloat(stock.market.yesterdayClose)) *
                                100
                              ).toFixed(2) +
                              '%'
                            : parseFloat(stock.market.currentPrice) <
                                parseFloat(stock.market.yesterdayClose)
                              ? '▼ ' +
                                (
                                  ((parseFloat(stock.market.yesterdayClose) -
                                    parseFloat(stock.market.currentPrice)) /
                                    parseFloat(stock.market.yesterdayClose)) *
                                  100
                                ).toFixed(2) +
                                '%'
                              : '— 0.00%'
                        }}
                      </span>
                      <!-- 相比新增時股價的變化 (次要資訊) -->
                      <span v-if="stock.currentPrice" class="text-[10px] font-mono opacity-40">
                        vs 新增:
                        {{
                          parseFloat(stock.market.currentPrice) > parseFloat(stock.currentPrice)
                            ? '▲' +
                              (
                                ((parseFloat(stock.market.currentPrice) -
                                  parseFloat(stock.currentPrice)) /
                                  parseFloat(stock.currentPrice)) *
                                100
                              ).toFixed(1) +
                              '%'
                            : parseFloat(stock.market.currentPrice) < parseFloat(stock.currentPrice)
                              ? '▼' +
                                (
                                  ((parseFloat(stock.currentPrice) -
                                    parseFloat(stock.market.currentPrice)) /
                                    parseFloat(stock.currentPrice)) *
                                  100
                                ).toFixed(1) +
                                '%'
                              : '0.0%'
                        }}
                      </span>
                    </div>
                    <span v-else class="text-xs opacity-40">-</span>
                  </td>
                  <!-- 換股價 -->
                  <td class="px-4 py-4 text-right">
                    <span
                      v-if="stock.swapRef"
                      class="font-mono text-sm"
                      :class="isStealth ? 'text-orange-600' : 'text-orange-400'"
                    >
                      {{ stock.swapRef }}
                    </span>
                    <span v-else class="text-xs opacity-40">-</span>
                  </td>

                  <!-- 支撐 -->
                  <td class="px-4 py-4 text-right">
                    <span
                      v-if="stock.support"
                      class="font-mono text-sm"
                      :class="isStealth ? 'text-slate-700' : 'text-zinc-300'"
                    >
                      {{ stock.support }}
                    </span>
                    <span v-else class="text-xs opacity-40">-</span>
                  </td>

                  <!-- 短線目標 -->
                  <td class="px-4 py-4 text-right">
                    <span
                      v-if="stock.shortTermProfit"
                      class="font-mono text-sm"
                      :class="isStealth ? 'text-green-600' : 'text-green-400'"
                    >
                      {{ stock.shortTermProfit }}
                    </span>
                    <span v-else class="text-xs opacity-40">-</span>
                  </td>

                  <!-- 波段目標 -->
                  <td class="px-4 py-4 text-right">
                    <span
                      v-if="stock.waveProfit"
                      class="font-mono text-sm"
                      :class="isStealth ? 'text-purple-600' : 'text-purple-400'"
                    >
                      {{ stock.waveProfit }}
                    </span>
                    <span v-else class="text-xs opacity-40">-</span>
                  </td>


                  <!-- 狀態 (isSuccess) + 達標日期 -->
                  <td class="px-4 py-3 text-center align-middle">
                    <div class="flex flex-col items-center justify-center gap-1">
                      <span
                        class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold shadow-sm min-w-[60px]"
                        :class="[
                          stock.isSuccess === true
                            ? isStealth
                              ? 'bg-green-100 text-green-700'
                              : 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : '',
                          stock.isSuccess === false
                            ? isStealth
                              ? 'bg-red-100 text-red-700'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : '',
                          stock.isSuccess === null || stock.isSuccess === undefined
                            ? isStealth
                              ? 'bg-slate-100 text-slate-400'
                              : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                            : '',
                        ]"
                      >
                        <template v-if="stock.isSuccess === true">✓ 成功</template>
                        <template v-else-if="stock.isSuccess === false">✗ 失敗</template>
                        <template v-else>- 待定</template>
                      </span>

                      <div class="h-4 flex items-center justify-center">
                        <span
                          v-if="stock.isSuccess === true && stock.successDate"
                          class="text-[10px] font-mono tracking-tight"
                          :class="isStealth ? 'text-green-600/80' : 'text-green-400/70'"
                        >
                          {{
                            new Date(stock.successDate).toLocaleDateString('zh-TW', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                            })
                          }}
                        </span>
                        <span
                          v-else-if="stock.isSuccess === false && stock.updatedAt"
                          class="text-[10px] font-mono tracking-tight"
                          :class="isStealth ? 'text-red-600/80' : 'text-red-400/70'"
                        >
                          {{
                            new Date(stock.updatedAt).toLocaleDateString('zh-TW', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                            })
                          }}
                        </span>
                      </div>
                    </div>
                  </td>

                  <!-- 傳入時間 -->
                  <td class="px-4 py-4 font-mono text-xs opacity-60">
                    {{
                      new Date(stock.updatedAt).toLocaleString('zh-TW', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 統計資訊 -->
          <div
            class="mt-6 p-6 rounded-xl border"
            :class="isStealth ? 'bg-slate-50 border-slate-200' : 'bg-zinc-900/30 border-zinc-800'"
          >
            <h3 class="text-sm font-bold mb-4 opacity-60 uppercase tracking-wide">
              {{ isStealth ? 'Statistics' : '統計摘要' }}
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <div class="text-xs opacity-60 mb-1">總記錄數</div>
                <div class="text-2xl font-black">{{ recognizedStocks.length }}</div>
              </div>
              <div>
                <div class="text-xs opacity-60 mb-1">有新增時股價</div>
                <div class="text-2xl font-black text-slate-500">
                  {{ recognizedStocks.filter((s) => s.currentPrice).length }}
                </div>
              </div>
              <div>
                <div class="text-xs opacity-60 mb-1">有即時股價</div>
                <div class="text-2xl font-black text-blue-500">
                  {{ recognizedStocks.filter((s) => s.market && s.market.currentPrice).length }}
                </div>
              </div>
              <div>
                <div class="text-xs opacity-60 mb-1">成功案例</div>
                <div class="text-2xl font-black text-green-500">
                  {{ recognizedStocks.filter((s) => s.isSuccess === true).length }}
                </div>
              </div>
              <div>
                <div class="text-xs opacity-60 mb-1">待評估</div>
                <div class="text-2xl font-black text-zinc-500">
                  {{ recognizedStocks.filter((s) => s.isSuccess === null).length }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
    <PriceEditModal 
      :show="isPriceModalVisible" 
      :stock="editingStock"
      :is-stealth="isStealth"
      @close="handleCloseModal" 
      @save="handleSavePrice" 
    />
    <ConfirmModal :is-stealth="isStealth" />
  </div>
</template>