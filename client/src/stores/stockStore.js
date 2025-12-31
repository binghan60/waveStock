import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useToast } from 'vue-toastification'
import api from '@/services/api'
import { useConfirm } from '@/composables/useConfirm'

// --- Helper Functions (Local to this file) ---
const getLimitHitStatus = (stock) => {
  if (!stock.market || !stock.market.yesterdayClose || !stock.market.currentPrice) {
    return { isLimit: false }
  }
  const c = parseFloat(stock.market.currentPrice)
  const y = parseFloat(stock.market.yesterdayClose)
  if (y === 0) return { isLimit: false }

  const rawPercent = ((c - y) / y) * 100
  const absPercent = Math.abs(rawPercent)

  return {
    isLimit: absPercent >= 9.5,
    isUp: rawPercent > 0,
    isDown: rawPercent < 0,
  }
}

const sortStocksWithLimitPriority = (stocks) => {
  const getSortValue = (stock) => {
    const status = getLimitHitStatus(stock)
    if (!status.isLimit) return 0
    return status.isUp ? 2 : 1 // 漲停=2, 跌停=1, 其他=0
  }

  return [...stocks].sort((a, b) => {
    const sortValA = getSortValue(a)
    const sortValB = getSortValue(b)
    if (sortValA !== sortValB) {
      return sortValB - sortValA
    }
    return new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt)
  })
}

// --- Smart Refresh Helpers ---
const isTradingHours = () => {
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const time = hour * 60 + minute

  if (day === 0 || day === 6) return false

  const marketOpen = 9 * 60
  const marketClose = 13 * 60 + 30

  return time >= marketOpen && time <= marketClose
}

const getRefreshInterval = () => {
  if (isTradingHours()) {
    return 5000
  } else {
    const now = new Date()
    const hour = now.getHours()
    if (hour >= 13 && hour < 18) {
      return 120000
    }
    return 300000
  }
}

export const useStockStore = defineStore('stock', () => {
  const toast = useToast()
  const { showConfirm } = useConfirm()

  // --- State ---
  const rawManualStocks = ref([])
  const rawRecognizedStocks = ref([])
  const marketPrices = ref({})

  const pinnedList = ref([])
  const isLoading = ref(false)
  const lastUpdated = ref('')
  const isStealth = ref(false)
  const activeTab = ref('dashboard') // 'dashboard' or 'dataTable'

  // Data Table State
  const searchQuery = ref('')
  const sortConfig = ref({ key: 'updatedAt', order: 'desc' })

  // Internal timers
  let refreshTimer = null
  let monitorTimer = null

  // --- Actions: LocalStorage Helpers ---
  const loadFromLocalStorage = () => {
    try {
      const pinned = localStorage.getItem('pinned-stocks')
      pinnedList.value = pinned ? JSON.parse(pinned) : []

      const manual = localStorage.getItem('manual-stocks')
      rawManualStocks.value = manual ? JSON.parse(manual) : []

      isStealth.value = localStorage.getItem('stealth-mode') === '1'

      const savedTab = localStorage.getItem('active-tab')
      if (savedTab) activeTab.value = savedTab
    } catch (e) {
      console.error('Failed to load from localStorage', e)
    }
  }

  const savePinnedList = () => {
    localStorage.setItem('pinned-stocks', JSON.stringify(pinnedList.value))
  }

  const saveManualStocks = () => {
    localStorage.setItem('manual-stocks', JSON.stringify(rawManualStocks.value))
  }

  // --- Actions: UI ---
  const setActiveTab = (tab) => {
    activeTab.value = tab
    localStorage.setItem('active-tab', tab)
  }

  const toggleStealth = () => {
    isStealth.value = !isStealth.value
    localStorage.setItem('stealth-mode', isStealth.value ? '1' : '0')
  }

  // --- Actions: Core Business ---
  const togglePin = (symbol) => {
    const index = pinnedList.value.indexOf(symbol)
    if (index > -1) {
      pinnedList.value.splice(index, 1)
    } else {
      pinnedList.value.push(symbol)
    }
    savePinnedList()
  }

  const fetchData = async () => {
    try {
      const manual = localStorage.getItem('manual-stocks')
      if (manual) rawManualStocks.value = JSON.parse(manual)

      const res = await api.getDashboardData()
      rawRecognizedStocks.value = res.data.recognizedStocks || []

      const manualSymbols = rawManualStocks.value.map((s) => s.symbol)
      const recognizedSymbols = rawRecognizedStocks.value.map((s) => s.code)
      const allSymbols = [...new Set([...manualSymbols, ...recognizedSymbols])]

      if (allSymbols.length > 0) {
        try {
          const priceRes = await api.getStockPrices(allSymbols)
          const pricesArr = priceRes.data || []

          const newPriceMap = {}
          pricesArr.forEach((p) => {
            newPriceMap[p.symbol] = p
          })
          marketPrices.value = newPriceMap
        } catch (err) {
          console.error('獲取股價失敗:', err)
        }
      }

      lastUpdated.value = new Date().toLocaleTimeString('zh-TW', { hour12: false })
    } catch (e) {
      console.error('Fetch Data Error:', e)
    }
  }

  const startAutoRefresh = async () => {
    isLoading.value = true
    await fetchData()
    isLoading.value = false

    const updateTimer = () => {
      if (refreshTimer) clearInterval(refreshTimer)

      const interval = getRefreshInterval()
      const intervalText = interval >= 60000 ? `${interval / 60000}分鐘` : `${interval / 1000}秒`
      console.log(`📡 刷新間隔: ${intervalText} (${isTradingHours() ? '交易時段' : '非交易時段'})`)

      refreshTimer = setInterval(fetchData, interval)
    }

    updateTimer()

    if (monitorTimer) clearInterval(monitorTimer)
    monitorTimer = setInterval(updateTimer, 60000)
  }

  const stopAutoRefresh = () => {
    if (refreshTimer) clearInterval(refreshTimer)
    if (monitorTimer) clearInterval(monitorTimer)
    refreshTimer = null
    monitorTimer = null
  }

  const setSearchQuery = (query) => {
    searchQuery.value = query
  }

  const toggleSort = (key) => {
    if (sortConfig.value.key === key) {
      sortConfig.value.order = sortConfig.value.order === 'asc' ? 'desc' : 'asc'
    } else {
      sortConfig.value.key = key
      sortConfig.value.order = 'desc'
    }
  }

  // --- CRUD Actions ---
  const addStock = async (symbol) => {
    symbol = symbol.trim().toUpperCase()
    if (!symbol) return
    isLoading.value = true
    try {
      const exists = rawManualStocks.value.find((s) => s.symbol === symbol)
      if (exists) {
        toast.warning('此股票已在清單中')
        return
      }
      const newStock = {
        _id: `manual-${Date.now()}`,
        id: Date.now(),
        symbol: symbol,
        type: 'manual',
        createdAt: new Date().toISOString(),
      }
      rawManualStocks.value.push(newStock)
      saveManualStocks()
      await fetchData()
      toast.success('已加入監控清單')
    } catch (e) {
      toast.error('新增失敗')
    } finally {
      isLoading.value = false
    }
  }

  const removeStock = async (id) => {
    const confirmed = await showConfirm('確認移除', '確定移除此監控項目?')
    if (!confirmed) return
    rawManualStocks.value = rawManualStocks.value.filter((s) => s._id !== id && s.id !== id)
    saveManualStocks()
    toast.success('已移除監控項目')
  }

  const removeRecognizedStock = async (id) => {
    const confirmed = await showConfirm('確認刪除', '確定刪除此辨識記錄?')
    if (!confirmed) return
    try {
      await api.deleteRecognizedStock(id)
      rawRecognizedStocks.value = rawRecognizedStocks.value.filter((s) => s._id !== id)
      toast.success('已刪除辨識記錄')
    } catch (e) {
      toast.error('刪除失敗')
    }
  }

  const updateRecognizedPrice = async (stockId, newPrice) => {
    try {
      await api.updateRecognizedStock(stockId, {
        currentPrice: newPrice,
      })
      await fetchData()
      toast.success('價格更新成功')
      return true
    } catch (error) {
      toast.error('更新價格失敗')
      return false
    }
  }

  const triggerBot = async () => {
    try {
      await api.triggerBot()
      await fetchData()
      toast.success('Bot 觸發成功')
    } catch (e) {
      toast.warning('Bot trigger 功能暫時不可用')
    }
  }

  // --- Getters ---
  const mergedManualStocks = computed(() => {
    return rawManualStocks.value.map(stock => ({
      ...stock,
      market: marketPrices.value[stock.symbol] || null,
      isPinned: pinnedList.value.includes(stock.symbol),
      listType: 'manual'
    }))
  })

  const mergedRecognizedStocks = computed(() => {
    return rawRecognizedStocks.value.map(stock => ({
      ...stock,
      symbol: stock.code, 
      market: marketPrices.value[stock.code] || null,
      isPinned: pinnedList.value.includes(stock.code),
      listType: 'recognized'
    }))
  })

  const pinnedStocks = computed(() => {
    const pManual = mergedManualStocks.value.filter(s => s.isPinned)
    const pRecognized = mergedRecognizedStocks.value.filter(s => s.isPinned)
    return sortStocksWithLimitPriority([...pManual, ...pRecognized])
  })

  const unpinnedManualStocks = computed(() => {
    return mergedManualStocks.value.filter((s) => !s.isPinned)
  })

  const unpinnedRecognizedStocks = computed(() => {
    const unpinned = mergedRecognizedStocks.value.filter((s) => !s.isPinned)
    return sortStocksWithLimitPriority(unpinned)
  })

  const processedRecognizedStocks = computed(() => {
    let result = mergedRecognizedStocks.value
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      result = result.filter(
        (s) =>
          s.code.toLowerCase().includes(q) ||
          (s.market?.name && s.market.name.toLowerCase().includes(q)),
      )
    }
    const { key, order } = sortConfig.value
    const getValue = (s, sortKey) => {
      switch (sortKey) {
        case 'code':
          return s.code
        case 'initialPrice':
          return parseFloat(s.currentPrice || 0)
        case 'currentPrice':
          return parseFloat(s.market?.currentPrice || 0)
        case 'percent':
          if (!s.market || !s.market.yesterdayClose) return -9999
          return (
            (parseFloat(s.market.currentPrice) - parseFloat(s.market.yesterdayClose)) /
            parseFloat(s.market.yesterdayClose)
          )
        case 'swapRef':
          return parseFloat(s.swapRef || 0)
        case 'support':
          const sup = s.support ? s.support.toString() : '0'
          return parseFloat(sup.split('-')[0] || 0)
        case 'shortTermProfit':
          return parseFloat(s.shortTermProfit || 0)
        case 'waveProfit':
          return parseFloat(s.waveProfit || 0)
        case 'isSuccess':
          if (s.isSuccess === true) return 2
          if (s.isSuccess === null || s.isSuccess === undefined) return 1
          return 0
        case 'updatedAt':
          return new Date(s.updatedAt || s.createdAt).getTime()
        default:
          return 0
      }
    }
    return [...result].sort((a, b) => {
      const valA = getValue(a, key)
      const valB = getValue(b, key)
      if (valA < valB) return order === 'asc' ? -1 : 1
      if (valA > valB) return order === 'asc' ? 1 : -1
      return 0
    })
  })

  loadFromLocalStorage()

  return {
    pinnedList,
    isLoading,
    lastUpdated,
    isStealth,
    activeTab,
    searchQuery,
    sortConfig,
    startAutoRefresh,
    stopAutoRefresh,
    fetchData,
    addStock,
    removeStock,
    removeRecognizedStock,
    updateRecognizedPrice,
    togglePin,
    toggleStealth,
    triggerBot,
    setSearchQuery,
    toggleSort,
    setActiveTab,
    pinnedStocks,
    unpinnedManualStocks,
    unpinnedRecognizedStocks,
    processedRecognizedStocks,
    getLimitHitStatus,
  }
})
