import { computed } from 'vue'

export const INDICATOR_COLORS = {
  swap: {
    label: '換股',
    key: 'swapRef',
    color: 'emerald',
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/20',
    indicatorClass: 'emerald',
    stealthTextClass: 'text-emerald-600'
  },
  support: {
    label: '支撐',
    key: 'support',
    color: 'cyan',
    textClass: 'text-cyan-400',
    bgClass: 'bg-cyan-500/10',
    borderClass: 'border-cyan-500/20',
    indicatorClass: 'cyan',
    stealthTextClass: 'text-cyan-600'
  },
  shortTerm: {
    label: '短線',
    key: 'shortTermProfit',
    color: 'amber',
    textClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/20',
    indicatorClass: 'amber',
    stealthTextClass: 'text-amber-600'
  },
  wave: {
    label: '波段',
    key: 'waveProfit',
    color: 'rose',
    textClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    borderClass: 'border-rose-500/20',
    indicatorClass: 'rose',
    stealthTextClass: 'text-rose-600'
  }
}

export function useStockColors() {
  const getStatusColor = (isSuccess, isStealth = false) => {
    if (isSuccess === true) {
      return isStealth ? 'text-[#B3261E]' : 'text-rose-400' // M3 Error Color
    }
    if (isSuccess === false) {
      return isStealth ? 'text-[#146C2E]' : 'text-emerald-400' 
    }
    return isStealth ? 'text-[#5F6368]' : 'text-zinc-500'
  }

  const getStatusBg = (isSuccess, isStealth = false) => {
    if (isSuccess === true) {
      return isStealth ? 'bg-[#F9DEDC]' : 'bg-rose-500/10'
    }
    if (isSuccess === false) {
      return isStealth ? 'bg-[#C4EED0]' : 'bg-emerald-500/10'
    }
    return isStealth ? 'bg-[#F1F3F4]' : 'bg-zinc-800/50'
  }

  return {
    INDICATOR_COLORS,
    getStatusColor,
    getStatusBg
  }
}