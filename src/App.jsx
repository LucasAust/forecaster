import React, { useState, useEffect } from "react";
import StatementImporter from "./StatementImporter";
import ForecastTimelineRecharts from "./ForecastTimelineRecharts";
import SpendingManager from "./SpendingManager";
import AlertsAndInsights from "./AlertsAndInsights";
import TimeRangeSelector from "./TimeRangeSelector";
import ScenarioManager from "./ScenarioManager";
import ExportTools from "./ExportTools";

export default function App() {
  const [apiUrl] = useState("http://127.0.0.1:5000");
  const [openingBalance, setOpeningBalance] = useState(5000);
  const [scheduled, setScheduled] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [horizon, setHorizon] = useState(30);
  const [forecastData, setForecastData] = useState([]);
  const [forecastSummary, setForecastSummary] = useState(null);
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState(500);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return localStorage.getItem("arc_is_authenticated") === "true";
  });
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (isAuthenticated) {
      localStorage.setItem("arc_is_authenticated", "true");
    } else {
      localStorage.removeItem("arc_is_authenticated");
    }
  }, [isAuthenticated]);

  const handleForecastUpdate = (data, summary) => {
    setForecastData(data);
    setForecastSummary(summary);
  };

  const handleSaveScenario = (name) => {
    const scenarios = JSON.parse(localStorage.getItem("arc_scenarios") || "{}");
    scenarios[name] = {
      openingBalance,
      scheduled,
      transactions,
      horizon,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem("arc_scenarios", JSON.stringify(scenarios));
  };

  const handleLoadScenario = (name) => {
    const scenarios = JSON.parse(localStorage.getItem("arc_scenarios") || "{}");
    const scenario = scenarios[name];
    if (scenario) {
      setOpeningBalance(scenario.openingBalance);
      setScheduled(scenario.scheduled);
      setTransactions(scenario.transactions);
      setHorizon(scenario.horizon);
    }
  };

  const handleDeleteScenario = (name) => {
    const scenarios = JSON.parse(localStorage.getItem("arc_scenarios") || "{}");
    delete scenarios[name];
    localStorage.setItem("arc_scenarios", JSON.stringify(scenarios));
  };

  const handleTransactionsImported = (imported) => {
    const normalize = (raw) => {
      let dateStr = raw.date;
      if (typeof dateStr === "string") {
        dateStr = dateStr.trim().replace(/\s+/g, " ");
      }

      return {
        date: dateStr || "",
        description: (raw.description || "").toString().trim(),
        amount: parseFloat(raw.amount) || 0,
      };
    };

    const makeKey = (tx) => `${tx.date}|${tx.description}|${tx.amount.toFixed(2)}`;

    setTransactions((prev) => {
      const existing = prev.map((tx) => ({ ...tx }));
      const seen = new Set(existing.map(makeKey));
      const merged = [...existing];

      imported.forEach((raw) => {
        if (!raw?.date || typeof raw.amount === 'undefined' || raw.amount === null) {
          return;
        }

        const normalized = normalize(raw);
        if (!normalized.date || Number.isNaN(normalized.amount)) {
          return;
        }
        const key = makeKey(normalized);
        if (!seen.has(key)) {
          merged.push(normalized);
          seen.add(key);
        }
      });

      merged.sort((a, b) => new Date(a.date) - new Date(b.date));
      return merged;
    });
  };

  const handleDemoLogin = (event) => {
    event.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("Please enter an email and password to continue.");
      return;
    }
    setLoginError("");
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-dark-bg via-dark-surface to-dark-bg flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -left-20 w-72 h-72 bg-cyber-cyan opacity-20 blur-3xl"></div>
          <div className="absolute -bottom-32 -right-10 w-96 h-96 bg-cyber-purple opacity-10 blur-3xl"></div>
        </div>
        <div className="relative z-10 max-w-md w-full glass-card rounded-2xl p-8 shadow-2xl border border-white/10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyber-cyan to-cyber-purple mb-4">
              <span className="text-3xl font-bold text-white">A</span>
            </div>
            <h1 className="text-4xl font-black text-gradient-cyan tracking-tight">ARC</h1>
            <p className="text-sm text-cyan-200 mt-2">Forecast your finances with confidence</p>
          </div>
          <form onSubmit={handleDemoLogin} className="space-y-4">
            <div>
              <label htmlFor="loginEmail" className="block text-xs font-semibold uppercase tracking-wide text-white/60 mb-2">
                Email
              </label>
              <input
                id="loginEmail"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full metallic-input rounded-lg px-4 py-3 text-sm text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400/50"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="loginPassword" className="block text-xs font-semibold uppercase tracking-wide text-white/60 mb-2">
                Password
              </label>
              <input
                id="loginPassword"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full metallic-input rounded-lg px-4 py-3 text-sm text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400/50"
                placeholder="Enter any password"
              />
            </div>
            {loginError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
                {loginError}
              </div>
            )}
            <button
              type="submit"
              className="w-full metallic-button rounded-lg px-4 py-3 text-sm font-semibold text-white hover:scale-[1.02] transition-transform"
            >
              Enter Dashboard
            </button>
          </form>
          <div className="mt-6 text-xs text-center text-gray-400 leading-relaxed">
            <p>Use any email and password to explore the ARC forecasting experience.</p>
            <p className="mt-2">Authentication is simulated for design preview.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsAuthenticated(true)}
            className="mt-6 w-full text-[11px] text-cyan-300 underline underline-offset-4 hover:text-cyan-100"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-bg via-dark-surface to-dark-bg p-4">
      {/* Floating Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-64 h-64 bg-cyber-cyan opacity-5 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-cyber-purple opacity-5 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-cyber-pink opacity-5 rounded-full blur-3xl animate-float" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="max-w-[1400px] mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-5xl font-black text-gradient-cyan mb-1 tracking-tight">ARC</h1>
          <p className="text-cyan-300 text-xs font-medium tracking-wide">Financial Forecasting System</p>
        </div>

        {/* Main Layout - Two Column */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
          
          {/* LEFT SIDEBAR - Input & Controls */}
          <div className="lg:col-span-1 space-y-4">
            
            {/* Balance Input */}
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-sm font-bold text-white">Current Balance</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-cyan-400">$</span>
                <input
                  type="number"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                  className="flex-1 min-w-0 metallic-input text-3xl font-black text-white p-3 rounded-lg"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Time Range */}
            <div className="glass-card rounded-xl p-4">
              <TimeRangeSelector
                horizon={horizon}
                onHorizonChange={setHorizon}
              />
            </div>

            {/* Import */}
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <h3 className="text-sm font-bold text-white">Import</h3>
              </div>
              <StatementImporter
                apiUrl={apiUrl}
                onTransactionsImported={handleTransactionsImported}
              />
            </div>

            {/* Alerts */}
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-sm font-bold text-white">Alerts</h3>
              </div>
              <AlertsAndInsights
                forecastData={forecastData}
                summary={forecastSummary}
                lowBalanceThreshold={lowBalanceThreshold}
                onThresholdChange={setLowBalanceThreshold}
              />
            </div>

          </div>

          {/* RIGHT MAIN AREA - Forecast */}
          <div className="space-y-4">
            {/* Forecast Chart */}
            <div className="glass-card rounded-xl p-5">
              <div className="mb-4 flex items-center gap-2">
                <svg className="h-6 w-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                <h3 className="text-lg font-bold text-white">Balance Forecast</h3>
                <div className="ml-auto flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-cyan-400">Items:</span>
                    <span className="font-bold text-white">{scheduled.length}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-cyan-400">Transactions:</span>
                    <span className="font-bold text-white">{transactions.length}</span>
                  </div>
                </div>
              </div>
              <ForecastTimelineRecharts
                apiUrl={apiUrl}
                openingBalance={openingBalance}
                seedTransactions={transactions}
                seedScheduled={scheduled}
                onForecastUpdate={handleForecastUpdate}
                horizon={horizon}
              />
            </div>
          </div>

          {/* Workspace Tools */}
          <div className="space-y-4 lg:col-span-2">
            <div className="glass-card rounded-xl p-5">
              <div className="mb-4 flex items-center gap-2">
                <svg className="h-5 w-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-white">Spending Planner</h3>
                  <p className="text-[11px] text-white/60">Build recurring schedules and what-if events</p>
                </div>
              </div>
              <SpendingManager
                scheduled={scheduled}
                onScheduledChange={setScheduled}
                transactions={transactions}
                onTransactionsChange={setTransactions}
              />
            </div>

            <div className="glass-card rounded-xl p-5">
              <div className="mb-4 flex items-center gap-2">
                <svg className="h-5 w-5 text-pink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-white">Scenario Vault</h3>
                  <p className="text-[11px] text-white/60">Save, compare, and reset strategic plans</p>
                </div>
              </div>
              <ScenarioManager
                openingBalance={openingBalance}
                scheduled={scheduled}
                onSaveScenario={handleSaveScenario}
                onLoadScenario={handleLoadScenario}
                onDeleteScenario={handleDeleteScenario}
              />
            </div>

            <div className="glass-card rounded-xl p-5">
              <div className="mb-4 flex items-center gap-2">
                <svg className="h-5 w-5 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-white">Export & Share</h3>
                  <p className="text-[11px] text-white/60">Download reports or share quick snapshots</p>
                </div>
              </div>
              <ExportTools
                forecastData={forecastData}
                summary={forecastSummary}
                openingBalance={openingBalance}
                scheduled={scheduled}
                transactions={transactions}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
