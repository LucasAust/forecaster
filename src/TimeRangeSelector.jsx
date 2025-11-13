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
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyber-cyan to-cyber-blue flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Forecast Period</h3>
        </div>
      </div>
      
      {/* Compact Preset Buttons */}
      <div className="grid grid-cols-3 gap-1 mb-3">
        {[
          { label: '7d', days: 7 },
          { label: '14d', days: 14 },
          { label: '30d', days: 30 },
          { label: '60d', days: 60 },
          { label: '90d', days: 90 },
          { label: '1y', days: 365 }
        ].map((preset) => (
          <button
            key={preset.days}
            onClick={() => onHorizonChange(preset.days)}
            className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
              horizon === preset.days
                ? 'bg-cyan-500 bg-opacity-40 text-cyan-300 border border-cyan-500'
                : 'bg-white bg-opacity-5 text-gray-400 border border-white border-opacity-10 hover:border-cyan-500 hover:border-opacity-50'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Current Selection */}
      <div className="glass-card-light rounded-lg p-2 text-center">
        <div className="text-xs text-cyan-300">Projecting</div>
        <div className="text-lg font-bold text-white">{horizon} days</div>
      </div>
    </div>
  );
}
