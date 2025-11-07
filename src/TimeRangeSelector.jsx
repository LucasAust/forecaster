import React, { useState } from "react";

export default function TimeRangeSelector({ horizon, onHorizonChange, onDateRangeSelect }) {
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const presets = [
    { 
      label: '7 Days', 
      days: 7, 
      icon: '📅',
      description: 'Next week'
    },
    { 
      label: '14 Days (Paycheck)', 
      days: 14, 
      icon: '💰',
      description: 'To next paycheck'
    },
    { 
      label: '30 Days', 
      days: 30, 
      icon: '📆',
      description: 'This month'
    },
    { 
      label: '60 Days', 
      days: 60, 
      icon: '📊',
      description: 'Two months'
    },
    { 
      label: '90 Days', 
      days: 90, 
      icon: '📈',
      description: 'One quarter'
    },
    { 
      label: '180 Days', 
      days: 180, 
      icon: '🎯',
      description: 'Six months'
    },
    { 
      label: '365 Days', 
      days: 365, 
      icon: '🗓️',
      description: 'Full year'
    }
  ];

  const handleCustomRange = () => {
    if (customStartDate && customEndDate) {
      const start = new Date(customStartDate);
      const end = new Date(customEndDate);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0 && diffDays <= 365) {
        onHorizonChange(diffDays);
        if (onDateRangeSelect) {
          onDateRangeSelect({ start: customStartDate, end: customEndDate, days: diffDays });
        }
        setShowCustom(false);
      } else {
        alert('Please select a valid date range (1-365 days)');
      }
    }
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <span>📅</span>
        <span>Forecast Time Range</span>
      </h3>
      
      {/* Quick Presets */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
        {presets.map((preset) => (
          <button
            key={preset.days}
            onClick={() => onHorizonChange(preset.days)}
            className={`p-3 rounded-lg border-2 transition-all ${
              horizon === preset.days
                ? 'bg-blue-500 text-white border-blue-600 shadow-md'
                : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-blue-300'
            }`}
          >
            <div className="text-2xl mb-1">{preset.icon}</div>
            <div className={`text-sm font-semibold ${horizon === preset.days ? 'text-white' : 'text-gray-800'}`}>
              {preset.label}
            </div>
            <div className={`text-xs mt-1 ${horizon === preset.days ? 'text-blue-100' : 'text-gray-500'}`}>
              {preset.description}
            </div>
          </button>
        ))}
      </div>

      {/* Custom Range Toggle */}
      <div className="border-t pt-4">
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 rounded-lg transition-all"
        >
          <span className="flex items-center gap-2 font-medium text-gray-800">
            <span className="text-xl">🎯</span>
            Custom Date Range
          </span>
          <span>{showCustom ? '▼' : '▶'}</span>
        </button>

        {showCustom && (
          <div className="mt-3 p-4 bg-gray-50 rounded-lg border">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min={customStartDate || new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleCustomRange}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Apply Range
                </button>
              </div>
            </div>
            {customStartDate && customEndDate && (
              <div className="mt-2 text-sm text-gray-600">
                📊 Forecast period: {Math.ceil((new Date(customEndDate) - new Date(customStartDate)) / (1000 * 60 * 60 * 24))} days
              </div>
            )}
          </div>
        )}
      </div>

      {/* Current Selection Info */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Current Range:</span>
          <span className="text-lg font-bold text-blue-600">{horizon} days</span>
        </div>
        <div className="mt-1 text-xs text-gray-600">
          From {new Date().toLocaleDateString()} to {new Date(Date.now() + horizon * 24 * 60 * 60 * 1000).toLocaleDateString()}
        </div>
      </div>

      {/* Slider for Fine-Tuning */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Fine-tune: {horizon} days
        </label>
        <input
          type="range"
          min="7"
          max="365"
          value={horizon}
          onChange={(e) => onHorizonChange(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>7 days</span>
          <span>365 days</span>
        </div>
      </div>
    </div>
  );
}
