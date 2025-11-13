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
    <div>
      {/* Compact Threshold Setting */}
      <div className="glass-card-light rounded-lg p-2 mb-3">
        <label className="block text-xs text-cyan-400 mb-1">Alert Threshold</label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white">$</span>
          <input
            type="number"
            value={lowBalanceThreshold}
            onChange={(e) => onThresholdChange(parseFloat(e.target.value) || 0)}
            className="flex-1 metallic-input px-2 py-1 rounded text-xs text-white"
            step="100"
          />
        </div>
      </div>

      {/* Compact Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2 mb-3">
          {alerts.map((alert, index) => (
            <div
              key={index}
              className={`glass-card-light rounded-lg p-2 border-l-2 ${
                alert.type === 'critical' ? 'border-red-500' :
                alert.type === 'danger' ? 'border-orange-500' :
                alert.type === 'success' ? 'border-green-500' :
                'border-yellow-500'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-base flex-shrink-0 mt-0.5">{alert.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-semibold ${
                    alert.type === 'critical' ? 'text-red-400' :
                    alert.type === 'danger' ? 'text-orange-400' :
                    alert.type === 'success' ? 'text-green-400' :
                    'text-yellow-400'
                  }`}>
                    {alert.title}
                  </div>
                  <div className="text-xs text-white leading-snug mt-0.5">{alert.message}</div>
                  {alert.detail && (
                    <div className="text-xs text-gray-400 mt-0.5">{alert.detail}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Compact Recommendations */}
      {recommendations.length > 0 && (
        <div className="space-y-2 mb-3">
          <div className="text-xs font-semibold text-cyan-400 mb-1">💡 Suggestions</div>
          {recommendations.map((rec, index) => (
            <div
              key={index}
              className="glass-card-light rounded-lg p-2"
            >
              <div className="flex items-start gap-2">
                <span className="text-base flex-shrink-0 mt-0.5">{rec.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-white">{rec.title}</div>
                  <div className="text-xs text-gray-400 leading-snug mt-0.5">{rec.message}</div>
                  {rec.impact && (
                    <div className="text-xs text-cyan-300 mt-0.5">→ {rec.impact}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {alerts.length === 0 && recommendations.length === 0 && (
        <div className="glass-card-light rounded-lg p-3 text-center">
          <div className="text-2xl mb-1">✨</div>
          <div className="text-xs text-green-400 font-semibold">All Clear</div>
          <div className="text-xs text-gray-400 mt-1">No alerts</div>
        </div>
      )}
    </div>
  );
}
