import React, { useState } from "react";
import ForecastTimelineRecharts from "./ForecastTimelineRecharts";
import SpendingManager from "./SpendingManager";
import AlertsAndInsights from "./AlertsAndInsights";
import TimeRangeSelector from "./TimeRangeSelector";
import ScenarioManager from "./ScenarioManager";
import ExportTools from "./ExportTools";
import StatementImporter from "./StatementImporter";

export default function App() {
  // State management for user-editable data
  const [scheduled, setScheduled] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState(500);
  const [horizon, setHorizon] = useState(30);
  const apiUrl = import.meta.env.VITE_API_URL || "https://forecaster-gl2n.onrender.com";
  
  // State for forecast data to pass to alerts
  const [forecastData, setForecastData] = useState([]);
  const [forecastSummary, setForecastSummary] = useState(null);

  const handleForecastUpdate = (data, summary) => {
    setForecastData(data);
    setForecastSummary(summary);
  };

  const handleSaveScenario = (scenario) => {
    console.log('Scenario saved:', scenario);
    // Could save to localStorage here
  };

  const handleLoadScenario = (scenario) => {
    setOpeningBalance(scenario.openingBalance);
    setScheduled(scenario.scheduled);
    console.log('Scenario loaded:', scenario);
  };

  const handleDeleteScenario = (scenarioId) => {
    console.log('Scenario deleted:', scenarioId);
  };

  const handleTransactionsImported = (imported) => {
    if (!Array.isArray(imported) || imported.length === 0) {
      return;
    }

    const normalize = (tx) => {
      const rawDate = tx.date;
      let isoDate = rawDate;
      if (rawDate) {
        const parsed = new Date(rawDate);
        if (!Number.isNaN(parsed.getTime())) {
          isoDate = parsed.toISOString().split('T')[0];
        }
      }

      const amount = Number(tx.amount);

      return {
        date: isoDate,
        amount,
        description: tx.description || '',
        source: tx.source || 'statement',
        statement_type: tx.statement_type || null,
        source_file: tx.source_file || null,
      };
    };

    const makeKey = (tx) => {
      const typePart = tx.statement_type ? `${tx.statement_type}|` : '';
      const filePart = tx.source_file ? `${tx.source_file}|` : '';
      const descPart = (tx.description || '').trim().toLowerCase();
      return `${typePart}${filePart}${tx.date}|${Number(tx.amount).toFixed(2)}|${descPart}`;
    };

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            💰 Bank Account Forecaster
          </h1>
          <p className="text-gray-600">
            Predict your future balance with real expense tracking and AI-powered forecasting
          </p>
          <p className="mt-3 text-sm text-gray-500">
            Upload your real statements below or add recurring items to build your forecast.
          </p>
        </div>

        {/* Opening Balance Control */}
        <div className="bg-white rounded-2xl shadow-lg border p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-gray-800">Current Account Balance</h3>
              <p className="text-sm text-gray-600 mt-1">Set your starting balance</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-gray-700">$</span>
              <input
                type="number"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                className="w-40 p-3 text-2xl font-bold border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Alerts and Insights */}
        <AlertsAndInsights
          forecastData={forecastData}
          summary={forecastSummary}
          lowBalanceThreshold={lowBalanceThreshold}
          onThresholdChange={setLowBalanceThreshold}
        />

        {/* Time Range Selector */}
        <TimeRangeSelector
          horizon={horizon}
          onHorizonChange={setHorizon}
        />

        {/* Scenario Manager */}
        <ScenarioManager
          openingBalance={openingBalance}
          scheduled={scheduled}
          onSaveScenario={handleSaveScenario}
          onLoadScenario={handleLoadScenario}
          onDeleteScenario={handleDeleteScenario}
        />

        {/* Statement Importer */}
        <StatementImporter
          apiUrl={apiUrl}
          onTransactionsImported={handleTransactionsImported}
        />

        {/* Spending Manager */}
        <SpendingManager
          scheduled={scheduled}
          onScheduledChange={setScheduled}
          transactions={transactions}
          onTransactionsChange={setTransactions}
        />
        
        {/* Export Tools */}
        <ExportTools
          forecastData={forecastData}
          summary={forecastSummary}
          scheduled={scheduled}
          transactions={transactions}
          openingBalance={openingBalance}
        />

        {/* Forecast Timeline */}
        <ForecastTimelineRecharts
          apiUrl={apiUrl}
          openingBalance={openingBalance}
          seedTransactions={transactions}
          seedScheduled={scheduled}
          onForecastUpdate={handleForecastUpdate}
          horizon={horizon}
        />
        
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <div className="text-3xl mb-2">📊</div>
              <h3 className="font-semibold mb-2">Historical Analysis</h3>
              <p className="text-sm text-gray-600">
                Uses your past transactions to understand spending patterns
              </p>
            </div>
            <div>
              <div className="text-3xl mb-2">📅</div>
              <h3 className="font-semibold mb-2">Scheduled Events</h3>
              <p className="text-sm text-gray-600">
                Accounts for recurring bills, paychecks, and known expenses
              </p>
            </div>
            <div>
              <div className="text-3xl mb-2">🤖</div>
              <h3 className="font-semibold mb-2">AI Forecasting</h3>
              <p className="text-sm text-gray-600">
                Predicts variable spending using statistical models (ARIMA, Prophet, or Hybrid)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
