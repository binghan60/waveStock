import { computed } from 'vue'

export const INDICATOR_COLORS = {
  swap: {
    label: '換股',
    key: 'swapRef',
    color: 'green',
    textClass: 'text-green-400',
    bgClass: 'bg-green-500/20',
    borderClass: 'border-green-500/30',
    indicatorClass: 'green'
  },
  support: {
    label: '支撐',
    key: 'support',
    color: 'cyan',
    textClass: 'text-cyan-400',
    bgClass: 'bg-cyan-500/20',
    borderClass: 'border-cyan-500/30',
    indicatorClass: 'cyan'
  },
  shortTerm: {
    label: '短線',
    key: 'shortTermProfit',
    color: 'orange',
    textClass: 'text-orange-400',
    bgClass: 'bg-orange-500/20',
    borderClass: 'border-orange-500/30',
    indicatorClass: 'orange'
  },
  wave: {
    label: '波段',
    key: 'waveProfit',
    color: 'red',
    textClass: 'text-red-400',
    bgClass: 'bg-red-500/20',
    borderClass: 'border-red-500/30',
    indicatorClass: 'red'
  }
}

export function useStockColors() {
  const getStatusColor = (isSuccess, isStealth = false) => {
    if (isSuccess === true) {
      return isStealth ? 'text-rose-600' : 'text-red-400' // 成功對應高位紅
    }
    if (isSuccess === false) {
      return isStealth ? 'text-emerald-600' : 'text-green-400' // 失敗(或止損)對應低位綠
    }
    return isStealth ? 'text-slate-400' : 'text-zinc-500'
  }

  const getStatusBg = (isSuccess, isStealth = false) => {
    if (isSuccess === true) {
      return isStealth ? 'bg-rose-50' : 'bg-red-500/10'
    }
    if (isSuccess === false) {
      return isStealth ? 'bg-emerald-50' : 'bg-green-500/10'
    }
    return isStealth ? 'bg-slate-50' : 'bg-zinc-800/50'
  }

  return {
    INDICATOR_COLORS,
    getStatusColor,
    getStatusBg
  }
}
