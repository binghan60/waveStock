import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import api from '@/services/api'

export const useBacktestStore = defineStore('backtest', () => {
  const filters = ref({
    buyStrategy: 'support',
    sellStrategy: 'profitTarget',
    profitTarget: 20,
    maxHoldingDays: 60,
    symbol: '',
    startDate: '',
    endDate: '',
    status: 'all',
    ignoreStopLoss: true,
  })
  const sortConfig = ref({ sortKey: 'recommendedDate', sortOrder: 'desc' })
  const pagination = ref({ page: 1, pageSize: 20, total: 0 })
  const summary = ref(null)
  const strategyComparison = ref([])
  const targetStats = ref([])
  const datasetSummary = ref(null)
  const chartData = ref({
    profitTargetDays: [],
    holdingReturnPoints: [],
    averageReturnByHoldingDays: [],
  })
  const trades = ref([])
  const isLoading = ref(false)
  const error = ref('')

  const requestParams = computed(() => ({
    ...filters.value,
    ignoreStopLoss: filters.value.ignoreStopLoss ? 'true' : 'false',
    page: pagination.value.page,
    pageSize: pagination.value.pageSize,
    sortKey: sortConfig.value.sortKey,
    sortOrder: sortConfig.value.sortOrder,
  }))

  const fetchBacktest = async () => {
    isLoading.value = true
    error.value = ''
    try {
      const { data } = await api.getBacktestAll(requestParams.value)

      summary.value = data.summary.summary
      strategyComparison.value = data.summary.strategyComparison || []
      targetStats.value = data.summary.targetStats || []
      datasetSummary.value = data.summary.datasetSummary || null
      trades.value = data.trades.items || []
      pagination.value.total = data.trades.total || 0
      chartData.value = data.chart || chartData.value
    } catch (err) {
      error.value = err?.response?.data?.details || err?.message || '回測資料載入失敗'
    } finally {
      isLoading.value = false
    }
  }

  const setFilters = (patch) => {
    filters.value = { ...filters.value, ...patch }
    pagination.value.page = 1
  }

  const setPage = (page) => {
    pagination.value.page = Math.max(1, page)
  }

  const setSort = (sortKey) => {
    if (sortConfig.value.sortKey === sortKey) {
      sortConfig.value.sortOrder = sortConfig.value.sortOrder === 'asc' ? 'desc' : 'asc'
    } else {
      sortConfig.value = { sortKey, sortOrder: 'desc' }
    }
    pagination.value.page = 1
  }

  return {
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
    fetchBacktest,
    setFilters,
    setPage,
    setSort,
  }
})
