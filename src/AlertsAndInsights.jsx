import React, { useState, useEffect } from "react";

export default function AlertsAndInsights({ 
  forecastData, 
  summary, 
  lowBalanceThreshold, 
  onThresholdChange 
}) {
  const [alerts, setAlerts] = useState([]);
  const [recommendations, setRecommendations] = useState([]);

  useEffect(() => {
    if (!forecastData || forecastData.length === 0) return;

    // Generate alerts
    const newAlerts = [];
    
    // Check for low balance
    const lowBalanceDays = forecastData.filter(d => d.balance < lowBalanceThreshold);
    if (lowBalanceDays.length > 0) {
      const firstLowDay = lowBalanceDays[0];
      const minBalance = Math.min(...forecastData.map(d => d.balance));
      
      newAlerts.push({
        type: 'critical',
        icon: '🚨',
        title: 'Low Balance Warning',
        message: `Your balance will drop below $${lowBalanceThreshold.toFixed(2)} on ${firstLowDay.date}`,
        detail: `Projected minimum: $${minBalance.toFixed(2)}`,
        action: 'Review upcoming expenses'
      });
    }

    // Check for negative balance
    const negativeDays = forecastData.filter(d => d.balance < 0);
    if (negativeDays.length > 0) {
      const firstNegativeDay = negativeDays[0];
      newAlerts.push({
        type: 'danger',
        icon: '⛔',
        title: 'Overdraft Risk',
        message: `Account may overdraft on ${firstNegativeDay.date}`,
        detail: `Balance: $${firstNegativeDay.balance.toFixed(2)}`,
        action: 'Add funds or delay expenses'
      });
    }

    // Check for healthy balance
    const allPositive = forecastData.every(d => d.balance > lowBalanceThreshold);
    if (allPositive && forecastData.length > 0) {
      const avgBalance = forecastData.reduce((sum, d) => sum + d.balance, 0) / forecastData.length;
      if (avgBalance > lowBalanceThreshold * 2) {
        newAlerts.push({
          type: 'success',
          icon: '✅',
          title: 'Healthy Balance',
          message: 'Your balance stays well above the minimum throughout the forecast period',
          detail: `Average balance: $${avgBalance.toFixed(2)}`,
          action: 'Consider moving excess to savings'
        });
      }
    }

    setAlerts(newAlerts);

    // Generate recommendations
    const newRecommendations = [];

    if (summary?.category_breakdown) {
      const expenses = Object.entries(summary.category_breakdown)
        .filter(([cat, amt]) => amt < 0)
        .sort(([, a], [, b]) => a - b);

      // Suggest subscription review if total subscriptions > $100
      const subscriptions = expenses.find(([cat]) => cat === 'subscriptions');
      if (subscriptions && Math.abs(subscriptions[1]) > 100) {
        newRecommendations.push({
          type: 'savings',
          icon: '💰',
          title: 'Review Subscriptions',
          message: `You're spending $${Math.abs(subscriptions[1]).toFixed(2)}/month on subscriptions`,
          impact: `Canceling unused subscriptions could save $20-50/month`,
          confidence: 'high'
        });
      }

      // Suggest savings if balance is consistently high
      const minBalance = Math.min(...forecastData.map(d => d.balance));
      const excessFunds = minBalance - lowBalanceThreshold;
      if (excessFunds > 500) {
        newRecommendations.push({
          type: 'savings',
          icon: '🏦',
          title: 'Savings Opportunity',
          message: `You have an excess of $${excessFunds.toFixed(2)} above your minimum`,
          impact: `Consider transferring $${Math.floor(excessFunds * 0.7)} to savings`,
          confidence: 'high'
        });
      }

      // Warn about high spending in a category
      const dining = expenses.find(([cat]) => cat === 'dining');
      if (dining && Math.abs(dining[1]) > 300) {
        newRecommendations.push({
          type: 'budget',
          icon: '🍽️',
          title: 'High Dining Expenses',
          message: `Dining out: $${Math.abs(dining[1]).toFixed(2)}/month`,
          impact: `Reducing by 25% could save $${(Math.abs(dining[1]) * 0.25).toFixed(2)}/month`,
          confidence: 'medium'
        });
      }
    }

    // Income vs expenses recommendation
    if (summary?.total_income && summary?.total_expenses) {
      const netChange = summary.total_income + summary.total_expenses;
      if (netChange < 0) {
        newRecommendations.push({
          type: 'warning',
          icon: '⚠️',
          title: 'Spending Exceeds Income',
          message: `You're spending $${Math.abs(netChange).toFixed(2)} more than you earn`,
          impact: 'Review and reduce expenses or increase income',
          confidence: 'high'
        });
      } else if (netChange > 1000) {
        newRecommendations.push({
          type: 'success',
          icon: '📈',
          title: 'Positive Cash Flow',
          message: `Saving $${netChange.toFixed(2)} in the forecast period`,
          impact: 'Great job! Consider setting up automatic savings',
          confidence: 'high'
        });
      }
    }

    setRecommendations(newRecommendations);
  }, [forecastData, summary, lowBalanceThreshold]);

  const alertStyles = {
    critical: 'bg-red-50 border-red-300 text-red-900',
    danger: 'bg-orange-50 border-orange-300 text-orange-900',
    success: 'bg-green-50 border-green-300 text-green-900',
    warning: 'bg-yellow-50 border-yellow-300 text-yellow-900'
  };

  const recommendationStyles = {
    savings: 'bg-blue-50 border-blue-200',
    budget: 'bg-purple-50 border-purple-200',
    warning: 'bg-orange-50 border-orange-200',
    success: 'bg-green-50 border-green-200'
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-orange-600 to-red-600 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🚨</span>
          <h2 className="text-2xl font-bold text-white">Alerts & Insights</h2>
        </div>
        <p className="text-orange-100 text-sm mt-1">
          Smart recommendations and balance warnings
        </p>
      </div>
      
      <div className="p-6">
        <div className="space-y-4">
          {/* Low Balance Threshold Setting */}
          <div className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">⚙️ Alert Threshold</h3>
                <p className="text-sm text-gray-600 mt-1">Warn when balance falls below</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-gray-700">$</span>
                <input
                  type="number"
                  value={lowBalanceThreshold}
                  onChange={(e) => onThresholdChange(parseFloat(e.target.value) || 0)}
                  className="w-28 p-2 text-lg font-bold border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  step="100"
                />
              </div>
            </div>
          </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>🔔</span>
            <span>Active Alerts</span>
          </h4>
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <div
                key={index}
                className={`p-4 border-2 rounded-lg ${alertStyles[alert.type]}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{alert.icon}</span>
                  <div className="flex-1">
                    <h4 className="font-semibold text-lg mb-1">{alert.title}</h4>
                    <p className="mb-1">{alert.message}</p>
                    <p className="text-sm opacity-80">{alert.detail}</p>
                    {alert.action && (
                      <div className="mt-2 text-sm font-medium opacity-90">
                        💡 {alert.action}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Smart Recommendations */}
      {recommendations.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>💡</span>
            <span>Smart Recommendations</span>
          </h4>
          <div className="space-y-3">
            {recommendations.map((rec, index) => (
              <div
                key={index}
                className={`p-4 border-2 rounded-lg ${recommendationStyles[rec.type]}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{rec.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-lg">{rec.title}</h4>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        rec.confidence === 'high' ? 'bg-green-200 text-green-800' :
                        rec.confidence === 'medium' ? 'bg-yellow-200 text-yellow-800' :
                        'bg-gray-200 text-gray-800'
                      }`}>
                        {rec.confidence} confidence
                      </span>
                    </div>
                    <p className="mb-1">{rec.message}</p>
                    <p className="text-sm font-medium opacity-90">
                      💰 Impact: {rec.impact}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
