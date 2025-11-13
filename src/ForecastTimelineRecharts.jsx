import React, { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, ReferenceLine, Area, ComposedChart
} from "recharts";

/**
 * Props:
 *  - apiUrl: base URL to your Flask API (e.g., "http://localhost:5000")
 *  - openingBalance: number (starting balance)
 *  - seedTransactions: [] (optional initial historical txns)
 *  - seedScheduled: [] (optional initial scheduled rules)
 */
export default function ForecastTimelineRecharts({
  apiUrl,
  openingBalance = 500,
  seedTransactions = [],
  seedScheduled = [],
  onForecastUpdate,
  horizon: externalHorizon
}) {
  const [horizon, setHorizon] = useState(externalHorizon || 30);
  const method = "prophet";
  const [transfer, setTransfer] = useState(0);    // what-if transfer
  const [delayDays, setDelayDays] = useState(0);  // when to apply the transfer
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [showTransactions, setShowTransactions] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [showConfidenceBands, setShowConfidenceBands] = useState(true);
  const [calendar, setCalendar] = useState([]);
  const [habits, setHabits] = useState([]);

  async function fetchForecast() {
    setLoading(true);
    setError(null);
    
    const payload = {
      opening_balance: openingBalance,
      transactions: seedTransactions,
      scheduled: [...seedScheduled],
      horizon_days: horizon,
  method
    };

    // what-if: apply a one-off transfer at T+delayDays
    if (transfer !== 0) {
      const dt = new Date(Date.now() + delayDays * 24 * 3600 * 1000)
        .toISOString()
        .split("T")[0];
      payload.scheduled.push({
        pattern: "oneoff",
        date: dt,
        amount: Number(transfer),
        description: "What-if scenario"
      });
    }

    try {
      const res = await fetch(`${apiUrl}/forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      
      const j = await res.json();

      // normalize for chart
      const rows = (j.forecast || []).map(r => ({
        date: (r.date || "").slice(0, 10),
        amount: Number(r.amount || 0),
        balance: Number(r.balance || 0)
      }));
      
      // Add confidence bands (±10% for variable spending uncertainty)
      const rowsWithConfidence = rows.map(r => {
        const variancePercent = 0.10; // 10% uncertainty
        const dailyVariance = Math.abs(r.amount) * variancePercent;
        
        return {
          ...r,
          balanceLower: r.balance - dailyVariance * 2,
          balanceUpper: r.balance + dailyVariance * 2
        };
      });
      
      setData(rowsWithConfidence);
      setSummary(j.summary);
      setTransactions(j.transactions || []);

      const rawCalendar = j.calendar || [];
      const calendarByDate = new Map(
        rawCalendar.map(entry => [String(entry.date).slice(0, 10), entry])
      );

      const fullCalendar = rowsWithConfidence.map(day => {
        const entry = calendarByDate.get(day.date) || {};
        const income = Number(entry.income || 0);
        const expenses = Number(entry.expenses || 0);
        const net = entry.net !== undefined && entry.net !== null
          ? Number(entry.net)
          : income + expenses;

        return {
          date: day.date,
          income,
          expenses,
          net,
          balance: Number(day.balance || 0),
          top_expenses: entry.top_expenses || [],
          details: entry.details || entry.items || []
        };
      });

      rawCalendar.forEach(entry => {
        const dateKey = String(entry.date).slice(0, 10);
        if (!fullCalendar.some(day => day.date === dateKey)) {
          fullCalendar.push({
            date: dateKey,
            income: Number(entry.income || 0),
            expenses: Number(entry.expenses || 0),
            net: entry.net !== undefined && entry.net !== null
              ? Number(entry.net)
              : Number(entry.income || 0) + Number(entry.expenses || 0),
            balance: Number(entry.balance || 0),
            top_expenses: entry.top_expenses || [],
            details: entry.details || entry.items || []
          });
        }
      });

      setCalendar(fullCalendar);
      setHabits(j.habits || []);
      
      // Notify parent component
      if (onForecastUpdate) {
        onForecastUpdate(rowsWithConfidence, j.summary);
      }
    } catch (err) {
      setError(err.message);
      console.error("Forecast error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchForecast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizon, transfer, delayDays, openingBalance, JSON.stringify(seedScheduled), JSON.stringify(seedTransactions)]);

  // Update internal horizon when external prop changes
  useEffect(() => {
    if (externalHorizon && externalHorizon !== horizon) {
      setHorizon(externalHorizon);
    }
  }, [externalHorizon]);

  // Check for low balance warnings
  const lowBalanceWarning = data.find(d => d.balance < 0);
  const minBalance = data.length > 0 ? Math.min(...data.map(d => d.balance)) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-cyan to-cyber-blue flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white">Balance Projection</h3>
            <p className="text-cyan-300 text-sm">AI-powered forecast analysis</p>
          </div>
        </div>
        <div className="text-sm text-cyan-400">
          {loading && "⟳ Calculating..."}
          {error && <span className="text-red-400">⚠ {error}</span>}
        </div>
      </div>

      {/* Warning banner */}
      {lowBalanceWarning && (
        <div className="mb-6 glass-card-light rounded-xl p-4 border-l-4 border-red-500">
          <div className="flex items-center">
            <span className="text-2xl mr-3">⚠️</span>
            <div>
              <div className="font-semibold text-red-400">Low Balance Alert</div>
              <div className="text-sm text-red-300">
                Balance may go negative around {lowBalanceWarning.date}. 
                Minimum: <span className="font-bold">${minBalance.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="glass-card-light rounded-xl p-4 mb-6">
        <div style={{ width: "100%", height: 400 }}>
          <ResponsiveContainer>
            <ComposedChart data={data}>
              <defs>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0.3}/>
                </linearGradient>
                <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => (d ? d.slice(5) : "")}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                stroke="rgba(255,255,255,0.2)"
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickFormatter={(val) => `$${val}`}
                stroke="rgba(255,255,255,0.2)"
              />
              <Tooltip
                formatter={(val, name) => {
                  if (name === "balance") return [`$${Number(val).toFixed(2)}`, "Expected Balance"];
                  if (name === "balanceUpper") return [`$${Number(val).toFixed(2)}`, "Best Case"];
                  if (name === "balanceLower") return [`$${Number(val).toFixed(2)}`, "Worst Case"];
                  return val;
                }}
                contentStyle={{ 
                  backgroundColor: 'rgba(15, 15, 30, 0.95)',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  borderRadius: '12px',
                  backdropFilter: 'blur(10px)',
                  color: '#fff'
                }}
                labelStyle={{ color: '#06b6d4' }}
              />
              {/* Zero reference */}
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={2} />
              
              {/* Confidence bands */}
              {showConfidenceBands && (
                <Area
                  type="monotone"
                  dataKey="balanceUpper"
                  stroke="none"
                  fill="url(#colorArea)"
                />
              )}
              {showConfidenceBands && (
                <Area
                  type="monotone"
                  dataKey="balanceLower"
                  stroke="none"
                  fill="url(#colorArea)"
                />
              )}
              
              {/* Main balance line with gradient */}
              <Line
                type="monotone"
                dataKey="balance"
                dot={false}
                stroke="url(#colorBalance)"
                strokeWidth={4}
                filter="url(#glow)"
              />
              
              {/* Confidence band borders */}
              {showConfidenceBands && (
                <>
                  <Line
                    type="monotone"
                    dataKey="balanceUpper"
                    dot={false}
                    stroke="rgba(6, 182, 212, 0.4)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <Line
                    type="monotone"
                    dataKey="balanceLower"
                    dot={false}
                    stroke="rgba(6, 182, 212, 0.4)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white border-opacity-10">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="confidenceBands"
              checked={showConfidenceBands}
              onChange={(e) => setShowConfidenceBands(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="confidenceBands" className="text-sm text-cyan-300 cursor-pointer">
              Show Confidence Bands
            </label>
          </div>
          <div className="text-xs text-cyan-400">
            Method: <span className="font-bold text-neon-cyan">Prophet AI</span>
          </div>
        </div>
      </div>

      {/* Summary Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="glass-card-light rounded-xl p-4">
          <div className="text-xs font-medium text-cyan-400 uppercase tracking-wider mb-2">Starting</div>
          {data[0] && (
            <>
              <div className="text-xs text-cyan-300 mb-1">{data[0].date}</div>
              <div className="text-2xl font-bold text-white">${data[0].balance.toFixed(2)}</div>
            </>
          )}
        </div>
        <div className="glass-card-light rounded-xl p-4">
          <div className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-2">Ending</div>
          {data.length > 0 && (
            <>
              <div className="text-xs text-purple-300 mb-1">{data[data.length - 1].date}</div>
              <div className="text-2xl font-bold text-white">${data[data.length - 1].balance.toFixed(2)}</div>
            </>
          )}
        </div>
        <div className="glass-card-light rounded-xl p-4">
          <div className="text-xs font-medium text-pink-400 uppercase tracking-wider mb-2">Minimum</div>
          <div className={`text-2xl font-bold ${minBalance < 0 ? 'text-red-400' : 'text-green-400'}`}>
            ${minBalance.toFixed(2)}
          </div>
        </div>
        <div className="glass-card-light rounded-xl p-4">
          <div className="text-xs font-medium text-cyan-400 uppercase tracking-wider mb-2">Net Change</div>
          {data.length > 0 && (
            <div className={`text-2xl font-bold ${(data[data.length - 1].balance - data[0].balance) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${(data[data.length - 1].balance - data[0].balance).toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {/* Income vs Expenses */}
      {summary && (
        <div className="glass-card-light rounded-xl p-6 mb-6">
          <h4 className="text-lg font-bold text-white mb-4">Financial Overview</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-green-400 mb-2">Total Income</div>
              <div className="text-3xl font-bold text-green-400">
                ${Math.abs(summary.total_income || 0).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-red-400 mb-2">Total Expenses</div>
              <div className="text-3xl font-bold text-red-400">
                ${Math.abs(summary.total_expenses || 0).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-cyan-400 mb-2">Net Flow</div>
              <div className={`text-3xl font-bold ${(summary.total_income + summary.total_expenses) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${(summary.total_income + summary.total_expenses).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calendar View */}
      {calendar.length > 0 && (
        <div className="glass-card-light rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyber-purple to-cyber-pink flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h4 className="text-lg font-bold text-white">Cash Flow Calendar</h4>
              <p className="text-xs text-purple-300">Daily balance projection with income and expenses</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto pr-2">
            {calendar
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
              .map(day => {
              const dateObj = new Date(day.date);
              const formatted = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
              const netClass = day.net >= 0 ? 'text-green-400' : 'text-red-400';
              const income = Number(day.income || 0);
              const expenses = Number(day.expenses || 0);
              return (
                <div key={day.date} className="glass-card rounded-lg p-4 border border-white border-opacity-10 hover:border-opacity-20 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-white">{formatted}</span>
                    <span className={`text-sm font-bold ${netClass}`}>
                      {day.net >= 0 ? '+' : ''}${Math.abs(day.net).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-3">
                    <span className="text-green-400">↑ ${Math.abs(income).toFixed(2)}</span>
                    <span className="text-red-400">↓ ${Math.abs(expenses).toFixed(2)}</span>
                  </div>
                  <div className="mb-3 rounded-lg bg-white/5 p-2 text-[11px] text-cyan-200">
                    Projected Balance: <span className="font-semibold text-white">${Number(day.balance || 0).toFixed(2)}</span>
                  </div>
                  {income === 0 && expenses === 0 && (!day.top_expenses || day.top_expenses.length === 0) && (
                    <div className="text-[11px] text-gray-400 italic">
                      No scheduled activity
                    </div>
                  )}
                  {day.top_expenses && day.top_expenses.length > 0 && (
                    <div className="text-xs border-t border-white border-opacity-10 pt-2">
                      <div className="font-semibold text-cyan-300 mb-2">Key Items</div>
                      <ul className="space-y-1">
                        {day.top_expenses.map((expense, idx) => (
                          <li key={`${day.date}-${idx}`} className="flex justify-between items-center">
                            <span className="text-gray-400 truncate pr-2 capitalize text-xs">
                              {(expense?.description || expense?.category || 'Expense').slice(0, 15)}
                            </span>
                            <span className="font-semibold text-red-400 text-xs">
                              ${Math.abs(expense?.amount || 0).toFixed(0)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-cyan-400 text-center">
            Scroll to explore the full forecast horizon
          </p>
        </div>
      )}

      {/* Habits */}
      {habits.length > 0 && (
        <div className="glass-card-light rounded-xl p-6 mb-6">
          <h4 className="text-lg font-bold text-white mb-4">Spending Patterns</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {habits.map((habit, idx) => {
              const badgeClass = habit.source === 'recurring' 
                ? 'bg-purple-500 bg-opacity-20 text-purple-300 border border-purple-500 border-opacity-30' 
                : 'bg-amber-500 bg-opacity-20 text-amber-300 border border-amber-500 border-opacity-30';
              const amountClass = habit.type === 'income' ? 'text-green-400' : 'text-red-400';
              return (
                <div key={`${habit.label}-${idx}`} className="glass-card rounded-lg p-4 border border-white border-opacity-10">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-sm font-semibold text-white">{habit.label}</div>
                      <div className="text-xs text-cyan-300 capitalize">{habit.category?.replace('_', ' ')}</div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${badgeClass}`}>
                      {habit.source === 'recurring' ? 'Recurring' : 'Pattern'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 mb-2">{habit.detail}</div>
                  <div className="text-sm">
                    <span className={`font-bold ${amountClass}`}>${Number(habit.average_amount || 0).toFixed(2)}</span>
                    <span className="text-gray-400"> avg per event</span>
                  </div>
                  {habit.next_date && (
                    <div className="text-xs text-purple-300 mt-2">
                      Next: {new Date(habit.next_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transaction Details Toggle */}
      <div className="glass-card-light rounded-xl p-4">
        <button
          onClick={() => setShowTransactions(!showTransactions)}
          className="metallic-button w-full p-3 rounded-lg font-medium text-white transition-all"
        >
          {showTransactions ? '▼' : '▶'} {showTransactions ? 'Hide' : 'Show'} Transaction Details ({transactions.length})
        </button>
        
        {showTransactions && transactions.length > 0 && (
          <div className="mt-4 max-h-96 overflow-y-auto rounded-lg border border-white border-opacity-10">
            <table className="w-full text-sm">
              <thead className="glass-card sticky top-0">
                <tr>
                  <th className="p-3 text-left text-cyan-400 font-semibold">Date</th>
                  <th className="p-3 text-left text-cyan-400 font-semibold">Description</th>
                  <th className="p-3 text-left text-cyan-400 font-semibold">Category</th>
                  <th className="p-3 text-right text-cyan-400 font-semibold">Amount</th>
                  <th className="p-3 text-right text-cyan-400 font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, idx) => (
                  <tr key={idx} className="border-t border-white border-opacity-5 hover:bg-white hover:bg-opacity-5">
                    <td className="p-3 text-gray-400">{tx.date?.slice(0, 10)}</td>
                    <td className="p-3 text-white">{tx.description}</td>
                    <td className="p-3">
                      <span className="px-2 py-1 bg-cyber-blue bg-opacity-20 text-cyan-300 rounded text-xs">
                        {tx.category?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className={`p-3 text-right font-medium ${tx.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${tx.amount?.toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-medium text-white">
                      ${tx.balance?.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
