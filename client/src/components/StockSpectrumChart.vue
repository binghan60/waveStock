<script setup>
import { computed } from 'vue'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Title
} from 'chart.js'
import { Scatter } from 'vue-chartjs'
import annotationPlugin from 'chartjs-plugin-annotation'
import datalabelsPlugin from 'chartjs-plugin-datalabels'
import { useStockStore } from '@/stores/stockStore'
import { storeToRefs } from 'pinia'

// Register ChartJS components
ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Title,
  annotationPlugin,
  datalabelsPlugin
)

const stockStore = useStockStore()
const { processedRecognizedStocks, isStealth } = storeToRefs(stockStore)

// --- Logic to Calculate Strategic Position (X-Axis) ---
const getStrategicScore = (stock) => {
  if (!stock.market || !stock.market.currentPrice) return null

  const P = parseFloat(stock.market.currentPrice)
  
  // 1. Parse Swap
  let Swap = parseFloat(stock.swapRef)
  
  // 2. Parse Support (Range or Single)
  let SupportMin = null
  let SupportMax = null
  
  if (stock.support) {
    const sStr = stock.support.toString()
    if (sStr.includes('-')) {
      const parts = sStr.split('-').map(v => parseFloat(v.trim()))
      if (!isNaN(parts[0]) && !isNaN(parts[1])) {
        SupportMin = parts[0]
        SupportMax = parts[1]
      }
    } else {
      const val = parseFloat(sStr)
      if (!isNaN(val)) {
        // Mimic StockCard logic: +/- 0.5 is considered "In Support"
        SupportMin = val - 0.5
        SupportMax = val + 0.5
      }
    }
  }

  // Fallback if Support is missing
  if (SupportMin === null) return 2.5

  // 3. Parse Targets
  const Short = parseFloat(stock.shortTermProfit)
  const Wave = parseFloat(stock.waveProfit)

  // Define effective boundaries
  if (!Swap || isNaN(Swap)) Swap = SupportMin * 0.9
  // Ensure logical ordering for calculation (Swap < Support)
  if (Swap >= SupportMin) Swap = SupportMin * 0.9

  const effShort = Short || (SupportMax * 1.1)
  const effWave = Wave || (effShort * 1.1)

  // --- Zone Calculation ---

  // Zone 1: Below Swap -> X <= 1.3 (Inside Swap Box)
  if (P <= Swap) {
    // Map [0, Swap] to [0.5, 1.25]
    const diffRatio = (Swap - P) / (Swap * 0.1)
    return Math.max(0.5, 1.25 - diffRatio * 0.5)
  }

  // Zone 2: Swap to Support Min (Approaching Support)
  // "Not Swap" -> Map to GAP [1.35, 1.65]
  if (P < SupportMin) {
    const range = SupportMin - Swap
    const progress = (P - Swap) / range
    return 1.35 + (progress * 0.3)
  }

  // Zone 3: Inside Support Range -> Map to [1.75, 2.25] (Inside Support Box)
  if (P <= SupportMax) {
    if (SupportMax - SupportMin < 0.1) return 2.0
    const range = SupportMax - SupportMin
    const progress = (P - SupportMin) / range
    return 1.75 + (progress * 0.5)
  }

  // Zone 4: Support Max to Short (Rising)
  // "Not Support" -> Map to GAP [2.35, 2.65]
  if (P < effShort) {
    const range = effShort - SupportMax
    const progress = (P - SupportMax) / range
    return 2.35 + (progress * 0.3)
  }

  // Zone 5: Short to Wave (Profiting)
  // "Counts as Short" -> Map to [2.75, 3.65] (Inside Short Box, stretching to the edge of Wave)
  if (P < effWave) {
    const range = effWave - effShort
    const progress = (P - effShort) / range
    // No GAP here: from end of Short (3.3) we continue directly
    // Let's use 2.75 to 3.65 to fill the Short box and the space up to Wave box
    return 2.75 + (progress * 0.9)
  }

  // Zone 6: Above Wave -> 3.75+ (Stay in Wave Zone)
  // Compress distance using Log scale to prevent chart from stretching too much
  // progressRaw = 1.0 means 10% above wave
  const progressRaw = (P - effWave) / (effWave * 0.1)
  
  // Use log1p to compress: log(1 + x)
  // if raw=1 (10%), add ~0.7
  // if raw=5 (50%), add ~1.8 instead of 5
  // if raw=10 (100%), add ~2.4 instead of 10
  const compressedProgress = Math.log1p(progressRaw)
  
  return 3.75 + (compressedProgress * 0.8)
}

const getDailyChange = (stock) => {
  if (!stock.market || !stock.market.yesterdayClose || !stock.market.currentPrice) return 0
  const c = parseFloat(stock.market.currentPrice)
  const y = parseFloat(stock.market.yesterdayClose)
  return ((c - y) / y) * 100
}

// --- Chart Data ---
const chartData = computed(() => {
  const points = processedRecognizedStocks.value.map(stock => {
    const x = getStrategicScore(stock)
    if (x === null) return null
    return {
      x,
      y: getDailyChange(stock),
      label: stock.code,
      name: stock.market?.name || '',
      stockObj: stock // For tooltip
    }
  }).filter(p => p !== null)

  return {
    datasets: [{
      label: 'Stocks',
      data: points,
      backgroundColor: (ctx) => {
        const val = ctx.raw?.y || 0
        if (isStealth.value) {
            return val >= 0 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(34, 197, 94, 0.8)'
        }
        return val >= 0 ? 'rgba(248, 113, 113, 1)' : 'rgba(74, 222, 128, 1)' // Red-400 : Green-400
      },
      pointRadius: 6,
      pointHoverRadius: 10,
      clip: false
    }]
  }
})

// --- Chart Options ---
const chartOptions = computed(() => {
  const isDark = !isStealth.value
  const textColor = isDark ? '#e4e4e7' : '#374151'

  // Calculate the maximum X value from points to prevent the Wave zone from stretching too far
  const dataPoints = chartData.value.datasets[0].data
  const maxX = dataPoints.length > 0 
    ? Math.max(...dataPoints.map(p => p.x)) 
    : 4.5
  const finalMaxX = Math.max(4.6, maxX + 0.1)

  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
        padding: { top: 50, bottom: 20, left: 10, right: 30 }
    },
    scales: {
      x: {
        type: 'linear',
        min: 0.5,
        max: finalMaxX,
        grid: {
          display: false // Hide grid, we use zones
        },
        ticks: {
          // Explicitly show labels only at anchor points
          callback: (value) => {
             // 1=Swap, 2=Support, 3=Short, 4=Wave
             if (Math.abs(value - 1) < 0.1) return '換股'
             if (Math.abs(value - 2) < 0.1) return '支撐'
             if (Math.abs(value - 3) < 0.1) return '短線'
             if (Math.abs(value - 4) < 0.1) return '波段'
             return ''
          },
          color: textColor,
          font: { weight: 'bold' }
        },
        border: { display: false }
      },
      y: {
        display: true, // Show Y axis for "Change %" context
        min: -12,
        max: 12,
        grid: {
            color: (ctx) => ctx.tick.value === 0 ? (isDark ? '#52525b' : '#d4d4d8') : 'transparent', // Highlight 0 line
            lineWidth: 2
        },
        ticks: {
            display: true,
            callback: (val) => val + '%',
            color: (ctx) => ctx.tick.value > 0 ? '#f87171' : (ctx.tick.value < 0 ? '#4ade80' : textColor)
        },
        border: { display: false }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const s = ctx.raw.stockObj
            const name = s.market?.name || ''
            const p = parseFloat(s.market?.currentPrice).toFixed(1)
            return `${s.code} ${name} $${p} (${ctx.raw.y.toFixed(2)}%)`
          }
        },
        backgroundColor: isDark ? 'rgba(24, 24, 27, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        titleColor: isDark ? '#fff' : '#000',
        bodyColor: isDark ? '#ccc' : '#333',
        borderColor: isDark ? '#3f3f46' : '#e5e7eb',
        borderWidth: 1
      },
      datalabels: {
        align: (ctx) => {
           // If negative change, put label below dot to avoid cluttering positive space
           const y = ctx.raw ? ctx.raw.y : 0
           return y < 0 ? 'bottom' : 'top'
        },
        anchor: (ctx) => {
           const y = ctx.raw ? ctx.raw.y : 0
           return y < 0 ? 'start' : 'end'
        },
        offset: 4,
        rotation: () => {
            // Optional: rotate slightly if very crowded? No, keep horizontal for readability
            return 0
        },
        color: textColor,
        font: { size: 10, weight: 'bold' },
        formatter: (value) => `${value.name}`,
        display: true // Force show all labels
      },
      annotation: {
        annotations: {
          zoneSwap: {
            type: 'box',
            xMin: 0.5,
            xMax: 1.3,
            yMin: -100,
            yMax: 100,
            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.05)', // Emerald
            borderWidth: 0,
            label: {
                content: '佈局 / 停損',
                position: 'start',
                color: isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.6)',
                font: { size: 24, weight: 'bold' },
                yAdjust: -50 // Push to top background
            }
          },
          zoneSupport: {
            type: 'box',
            xMin: 1.7,
            xMax: 2.3,
            yMin: -100,
            yMax: 100,
            backgroundColor: isDark ? 'rgba(6, 182, 212, 0.05)' : 'rgba(6, 182, 212, 0.05)', // Cyan
            borderWidth: 0,
            label: {
                content: '持有',
                position: 'center',
                color: isDark ? 'rgba(6, 182, 212, 0.3)' : 'rgba(6, 182, 212, 0.6)',
                font: { size: 30, weight: 'bold' }
            }
          },
          zoneShort: {
            type: 'box',
            xMin: 2.7,
            xMax: 3.7, // Extended to touch Wave zone
            yMin: -100,
            yMax: 100,
            backgroundColor: isDark ? 'rgba(245, 158, 11, 0.05)' : 'rgba(245, 158, 11, 0.05)', // Amber
            borderWidth: 0,
            label: {
                content: '獲利',
                position: 'center',
                color: isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.6)',
                font: { size: 30, weight: 'bold' }
            }
          },
          zoneWave: {
            type: 'box',
            xMin: 3.7,
            xMax: finalMaxX, // Dynamic max to prevent chart compression
            yMin: -100,
            yMax: 100,
            backgroundColor: isDark ? 'rgba(244, 63, 94, 0.05)' : 'rgba(244, 63, 94, 0.05)', // Rose
            borderWidth: 0,
            label: {
                content: '波段',
                position: 'end',
                color: isDark ? 'rgba(244, 63, 94, 0.3)' : 'rgba(244, 63, 94, 0.6)',
                font: { size: 24, weight: 'bold' }
            }
          }
        }
      }
    }
  }
})
</script>

<template>
  <div 
    class="w-full h-[450px] mb-8 rounded-xl border p-2 relative overflow-hidden transition-all"
    :class="isStealth ? 'bg-white border-gray-200' : 'bg-zinc-900 border-zinc-800'"
  >
    <Scatter :data="chartData" :options="chartOptions" />
  </div>
</template>