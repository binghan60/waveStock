import { getBacktestResult } from '../services/backtestService.js';

async function run() {
  console.log('=== Running Backtest Analysis ===');
  
  const strategies = ['nextOpen', 'support', 'swapRef'];
  for (const strategy of strategies) {
    const res = getBacktestResult({
      buyStrategy: strategy,
      maxHoldingDays: 60,
      sellStrategy: 'profitTarget',
      profitTarget: 20
    });
    console.log(`\nStrategy: ${strategy}`);
    console.log(`Recommendation Count: ${res.summary.recommendationCount}`);
    console.log(`Entered Count: ${res.summary.enteredCount}`);
    console.log(`Not Triggered Count: ${res.summary.notTriggeredCount}`);
    console.log(`Missing Data Count: ${res.summary.missingDataCount}`);
    console.log(`Win Rate: ${res.summary.winRate}%`);
    console.log(`Average Return: ${res.summary.averageReturnPct}%`);
    console.log(`Median Return: ${res.summary.medianReturnPct}%`);
    console.log(`Max Return: ${res.summary.maxReturnPct}%`);
    console.log(`Min Return: ${res.summary.minReturnPct}%`);
    console.log(`Average Holding Days: ${res.summary.averageHoldingDays} days`);
    console.log(`Target Hit Rate: ${res.summary.targetHitRate}%`);
    console.log(`Stop Loss Rate: ${res.summary.stopLossRate}%`);
  }
}

run().catch(console.error);
