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
  setCalendar(j.calendar || []);
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
    <div className="bg-white rounded-2xl shadow-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-2xl font-semibold text-gray-800">📈 Projected Balance</h3>
        <div className="text-sm text-gray-500">
          {loading && "🔄 Loading…"}
          {error && <span className="text-red-600">⚠️ {error}</span>}
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-2">Forecast Method</label>
          <div className="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600">
            Prophet (AI)
          </div>
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 p-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showConfidenceBands}
              onChange={(e) => setShowConfidenceBands(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm font-medium">Show Confidence Bands</span>
          </label>
        </div>
      </div>

      {/* Warning banner */}
      {lowBalanceWarning && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <span className="text-2xl mr-2">⚠️</span>
            <div>
              <div className="font-semibold text-red-800">Low Balance Warning</div>
              <div className="text-sm text-red-600">
                Your balance may go negative around {lowBalanceWarning.date}. 
                Minimum projected balance: ${minBalance.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div style={{ width: "100%", height: 360 }} className="mb-4">
        <ResponsiveContainer>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => (d ? d.slice(5) : "")}
              tick={{ fontSize: 11, fill: '#6b7280' }}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={(val) => `$${val}`}
            />
            <Tooltip
              formatter={(val, name) => {
                if (name === "balance") return [`$${Number(val).toFixed(2)}`, "Expected Balance"];
                if (name === "balanceUpper") return [`$${Number(val).toFixed(2)}`, "Best Case"];
                if (name === "balanceLower") return [`$${Number(val).toFixed(2)}`, "Worst Case"];
                return val;
              }}
              contentStyle={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '8px'
              }}
            />
            {/* Zero reference to spot overdrafts */}
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={2} label="Zero" />
            
            {/* Confidence bands */}
            {showConfidenceBands && (
              <Area
                type="monotone"
                dataKey="balanceUpper"
                stroke="none"
                fill="#3b82f6"
                fillOpacity={0.1}
              />
            )}
            {showConfidenceBands && (
              <Area
                type="monotone"
                dataKey="balanceLower"
                stroke="none"
                fill="#3b82f6"
                fillOpacity={0.1}
              />
            )}
            
            {/* Main balance line */}
            <Line
              type="monotone"
              dataKey="balance"
              dot={false}
              stroke="#3b82f6"
              strokeWidth={3}
            />
            
            {/* Confidence band borders */}
            {showConfidenceBands && (
              <>
                <Line
                  type="monotone"
                  dataKey="balanceUpper"
                  dot={false}
                  stroke="#93c5fd"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <Line
                  type="monotone"
                  dataKey="balanceLower"
                  dot={false}
                  stroke="#93c5fd"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      
      {/* Confidence Band Legend */}
      {showConfidenceBands && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-blue-600"></div>
              <span className="font-medium">Expected Balance</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 border border-dashed border-blue-300"></div>
              <span className="text-gray-600">Confidence Range (±10%)</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-600">
            💡 The shaded area shows the likely range of your balance based on spending variability
          </p>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase">Starting</div>
          {data[0] && (
            <div className="mt-1">
              <div className="text-xs text-gray-600">{data[0].date}</div>
              <div className="text-lg font-semibold">${data[0].balance.toFixed(2)}</div>
            </div>
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase">Ending</div>
          {data.length > 0 && (
            <div className="mt-1">
              <div className="text-xs text-gray-600">{data[data.length - 1].date}</div>
              <div className="text-lg font-semibold">${data[data.length - 1].balance.toFixed(2)}</div>
            </div>
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase">Minimum</div>
          <div className="mt-1">
            <div className={`text-lg font-semibold ${minBalance < 0 ? 'text-red-600' : 'text-green-600'}`}>
              ${minBalance.toFixed(2)}
            </div>
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase">Method</div>
          <div className="mt-1">
            <div className="text-lg font-semibold capitalize">{summary?.method || method}</div>
          </div>
        </div>
      </div>

      {/* Income vs Expenses Summary */}
      {summary && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <div className="text-sm font-medium text-gray-600">Total Income (Forecast Period)</div>
            <div className="text-2xl font-bold text-green-600">
              ${Math.abs(summary.total_income || 0).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-600">Total Expenses (Forecast Period)</div>
            <div className="text-2xl font-bold text-red-600">
              ${Math.abs(summary.total_expenses || 0).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-600">Net Change</div>
            <div className={`text-2xl font-bold ${(summary.total_income + summary.total_expenses) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${(summary.total_income + summary.total_expenses).toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {summary?.category_breakdown && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold text-lg">Spending by Category (Forecast Period)</h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(summary.category_breakdown)
              .filter(([cat, amt]) => amt < 0) // Only show expenses
              .sort(([, a], [, b]) => a - b) // Sort by amount
              .map(([category, amount]) => (
                <div key={category} className="p-3 bg-gray-50 rounded-lg border">
                  <div className="text-xs text-gray-600 capitalize mb-1">
                    {category.replace('_', ' ')}
                  </div>
                  <div className="text-lg font-semibold text-red-600">
                    ${Math.abs(amount).toFixed(2)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {calendar.length > 0 && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-semibold text-lg">30-Day Cash Flow Calendar</h4>
            <span className="text-xs text-gray-500">Projected inflows, fees, and high-impact spending</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {calendar.slice(0, 15).map(day => {
              const dateObj = new Date(day.date);
              const formatted = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
              const netClass = day.net >= 0 ? 'text-green-600' : 'text-red-600';
              const income = Number(day.income || 0);
              const expenses = Number(day.expenses || 0);
              return (
                <div key={day.date} className="p-4 bg-gray-50 border border-gray-200 rounded-lg shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-700">{formatted}</span>
                    <span className={`text-sm font-bold ${netClass}`}>
                      {day.net >= 0 ? '+' : ''}${Math.abs(day.net).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                    <span>Income: <span className="font-semibold text-green-600">${Math.abs(income).toFixed(2)}</span></span>
                    <span>Spend: <span className="font-semibold text-red-600">${Math.abs(expenses).toFixed(2)}</span></span>
                  </div>
                  {day.top_expenses && day.top_expenses.length > 0 && (
                    <div className="text-xs text-gray-600">
                      <div className="font-semibold text-gray-700 mb-1">Watchlist</div>
                      <ul className="space-y-1">
                        {day.top_expenses.map((expense, idx) => (
                          <li key={`${day.date}-${idx}`} className="flex justify-between">
                            <span className="capitalize truncate pr-2">{expense?.description || expense?.category || 'Expense'}</span>
                            <span className="font-semibold text-red-600">${Math.abs(expense?.amount || 0).toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {calendar.length > 15 && (
            <p className="mt-2 text-xs text-gray-500">Showing the first 15 forecasted days. Export the forecast to see the full calendar.</p>
          )}
        </div>
      )}

      {habits.length > 0 && (
        <div className="mt-6">
          <h4 className="font-semibold text-lg mb-3">Spending & Income Habits</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {habits.map((habit, idx) => {
              const badgeClass = habit.source === 'recurring' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-800';
              const amountClass = habit.type === 'income' ? 'text-green-600' : 'text-red-600';
              return (
                <div key={`${habit.label}-${idx}`} className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{habit.label}</div>
                      <div className="text-xs text-gray-500 capitalize">{habit.category?.replace('_', ' ')}</div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${badgeClass}`}>
                      {habit.source === 'recurring' ? 'Recurring' : 'Pattern'}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-gray-700">{habit.detail}</div>
                  <div className="mt-2 text-sm">
                    <span className={`font-semibold ${amountClass}`}>${Number(habit.average_amount || 0).toFixed(2)}</span>
                    <span className="text-gray-500"> average per event</span>
                  </div>
                  {habit.average_weekly_spend && (
                    <div className="text-xs text-gray-500 mt-1">
                      Weekly impact: ${Number(habit.average_weekly_spend).toFixed(2)}
                    </div>
                  )}
                  {habit.next_date && (
                    <div className="text-xs text-gray-500 mt-1">
                      Next up: {new Date(habit.next_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transaction Details Toggle */}
      <div className="mt-6">
        <button
          onClick={() => setShowTransactions(!showTransactions)}
          className="w-full p-3 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-gray-700 transition-colors"
        >
          {showTransactions ? '▼' : '▶'} {showTransactions ? 'Hide' : 'Show'} Transaction Details ({transactions.length})
        </button>
        
        {showTransactions && transactions.length > 0 && (
          <div className="mt-4 max-h-96 overflow-y-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-left">Category</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="p-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, idx) => (
                  <tr key={idx} className="border-t hover:bg-gray-50">
                    <td className="p-2">{tx.date?.slice(0, 10)}</td>
                    <td className="p-2 text-gray-700">{tx.description}</td>
                    <td className="p-2 capitalize text-xs">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                        {tx.category?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-2 capitalize text-xs">
                      <span className={`px-2 py-1 rounded ${
                        tx.type === 'historical' ? 'bg-gray-200 text-gray-700' :
                        tx.type === 'scheduled' ? 'bg-purple-100 text-purple-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className={`p-2 text-right font-medium ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${tx.amount?.toFixed(2)}
                    </td>
                    <td className="p-2 text-right font-medium">
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
