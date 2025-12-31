// client/src/composables/useStockFormatter.js

export function useStockFormatter() {
  // 根據股價區間動態調整顯示位數
  const formatPrice = (val) => {
    if (!val || val === '-') return '-'

    const num = parseFloat(val)
    if (isNaN(num)) return '-'

    if (num < 10) {
      return num.toFixed(2) // < 10: 顯示 2 位小數
    } else if (num < 50) {
      return num.toFixed(2) // 10-50: 顯示 2 位小數
    } else if (num < 100) {
      return num.toFixed(1) // 50-100: 顯示 1 位小數
    } else if (num < 500) {
      return num.toFixed(1) // 100-500: 顯示 1 位小數
    } else if (num < 1000) {
      return num.toFixed(0) // 500-1000: 顯示整數
    } else {
      return num.toFixed(0) // > 1000: 顯示整數
    }
  }

  const formatNumber = (val) => (val ? parseInt(val).toLocaleString() : '-')

  return { formatPrice, formatNumber }
}
