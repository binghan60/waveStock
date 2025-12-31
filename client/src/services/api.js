import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_PATH,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 錯誤處理 Interceptor (可選，但建議加上)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error)
    // 這裡未來可以接入全域的 Notification Store
    return Promise.reject(error)
  }
)

export default {
  // 取得儀表板資料 (辨識股票)
  getDashboardData() {
    return apiClient.get('/dashboard')
  },

  // 批量取得即時股價
  getStockPrices(symbols) {
    return apiClient.post('/stock-prices', { symbols })
  },

  // 觸發 Bot
  triggerBot() {
    return apiClient.post('/bot-trigger')
  },

  // 刪除辨識股票
  deleteRecognizedStock(id) {
    return apiClient.delete(`/recognized-stocks/${id}`)
  },

  // 更新辨識股票 (例如更新初始價格)
  updateRecognizedStock(id, data) {
    return apiClient.patch(`/recognized-stocks/${id}`, data)
  },
}
