// client/src/composables/useStockDetails.js
import { computed, unref } from 'vue'

export function useStockDetails(stockItem, isStealth) {
  const details = computed(() => {
    const item = unref(stockItem)
    const stealth = unref(isStealth)

    // 檢查資料完整性
    if (!item?.market || item.market.yesterdayClose == null) {
      return {
        diff: '0.0',
        percent: '0.00',
        rawAbsPercent: 0,
        isUp: false,
        isDown: false,
        colorClass: 'text-gray-500'
      }
    }

    const c = parseFloat(item.market.currentPrice)
    const y = parseFloat(item.market.yesterdayClose)
    
    // 避免除以 0
    if (y === 0) {
       return { 
         diff: '0.0', 
         percent: '0.00', 
         rawAbsPercent: 0, 
         isUp: false, 
         isDown: false, 
         colorClass: 'text-gray-500' 
       }
    }

    const diff = c - y
    const rawPercent = (diff / y) * 100
    const isUp = diff > 0
    const isDown = diff < 0

    let colorClass = 'text-gray-500'

    if (!stealth) {
      // 正常模式：紅漲綠跌
      colorClass = isUp ? 'text-red-400' : isDown ? 'text-green-400' : 'text-white'
    } else {
      // 辦公室模式：深淺對比
      // 漲：深黑 + 粗體
      // 跌：中灰 + 一般
      if (isUp) {
        colorClass = 'text-slate-900 font-bold'
      } else if (isDown) {
        colorClass = 'text-slate-500 font-medium'
      } else {
        colorClass = 'text-slate-400'
      }
    }

    return {
      diff: Math.abs(diff).toFixed(1),
      percent: Math.abs(rawPercent).toFixed(2),
      rawAbsPercent: Math.abs(rawPercent),
      isUp,
      isDown,
      colorClass
    }
  })

  return { details }
}
