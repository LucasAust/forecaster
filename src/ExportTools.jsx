import React from "react";

export default function ExportTools({ 
  forecastData, 
  summary, 
  scheduled, 
  transactions,
  openingBalance 
}) {
  
  const exportToCSV = () => {
    if (!forecastData || forecastData.length === 0) {
      alert('No forecast data to export');
      return;
    }

    // Create CSV content
    let csv = 'Date,Balance,Amount,Balance Lower,Balance Upper\n';
    
    forecastData.forEach(row => {
      csv += `${row.date},${row.balance.toFixed(2)},${row.amount.toFixed(2)},${(row.balanceLower || 0).toFixed(2)},${(row.balanceUpper || 0).toFixed(2)}\n`;
    });

    // Add summary section
    csv += '\n\nSummary\n';
    if (summary) {
      csv += `Opening Balance,${summary.opening_balance}\n`;
      csv += `Final Balance,${summary.final_balance}\n`;
      csv += `Total Income,${summary.total_income || 0}\n`;
      csv += `Total Expenses,${summary.total_expenses || 0}\n`;
      csv += `Method,${summary.method}\n`;
    }

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forecast_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportScheduledToCSV = () => {
    if (!scheduled || scheduled.length === 0) {
      alert('No scheduled items to export');
      return;
    }

    let csv = 'Pattern,Day/Weekday,Amount,Description\n';
    
    scheduled.forEach(item => {
      const dayInfo = item.pattern === 'monthly' ? item.day : 
                     item.pattern === 'oneoff' ? item.date :
                     ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][item.weekday || 0];
      csv += `${item.pattern},${dayInfo},${item.amount},${item.description}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scheduled_items_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToJSON = () => {
    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        version: '1.0'
      },
      openingBalance,
      scheduled,
      transactions,
      forecast: forecastData,
      summary
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forecast_data_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    if (!summary) {
      alert('No summary data available');
      return;
    }

    const text = `
💰 Financial Forecast Summary
Generated: ${new Date().toLocaleString()}

Opening Balance: $${openingBalance.toFixed(2)}
Final Balance: $${summary.final_balance.toFixed(2)}
Net Change: $${(summary.final_balance - openingBalance).toFixed(2)}

Income: +$${Math.abs(summary.total_income || 0).toFixed(2)}
Expenses: -$${Math.abs(summary.total_expenses || 0).toFixed(2)}

Forecast Method: ${summary.method}
Time Horizon: ${forecastData.length} days
    `.trim();

    navigator.clipboard.writeText(text).then(() => {
      alert('✅ Summary copied to clipboard!');
    }).catch(() => {
      alert('❌ Failed to copy to clipboard');
    });
  };

  const printForecast = () => {
    window.print();
  };

  return (
    <div>
      
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* Export Forecast CSV */}
        <button
          onClick={exportToCSV}
          className="glass-card-light p-3 rounded-lg hover:bg-white hover:bg-opacity-10 transition-all group"
        >
          <div className="text-2xl mb-1">📊</div>
          <div className="text-xs font-semibold text-white">Forecast CSV</div>
          <div className="text-xs text-cyan-300 mt-0.5">Daily balance</div>
        </button>

        {/* Export Scheduled CSV */}
        <button
          onClick={exportScheduledToCSV}
          className="glass-card-light p-3 rounded-lg hover:bg-white hover:bg-opacity-10 transition-all group"
        >
          <div className="text-2xl mb-1">📋</div>
          <div className="text-xs font-semibold text-white">Bills CSV</div>
          <div className="text-xs text-purple-300 mt-0.5">Recurring</div>
        </button>

        {/* Export Full JSON */}
        <button
          onClick={exportToJSON}
          className="glass-card-light p-3 rounded-lg hover:bg-white hover:bg-opacity-10 transition-all group"
        >
          <div className="text-2xl mb-1">💾</div>
          <div className="text-xs font-semibold text-white">Full Data</div>
          <div className="text-xs text-pink-300 mt-0.5">JSON backup</div>
        </button>

        {/* Copy Summary */}
        <button
          onClick={copyToClipboard}
          className="glass-card-light p-3 rounded-lg hover:bg-white hover:bg-opacity-10 transition-all group"
        >
          <div className="text-2xl mb-1">📋</div>
          <div className="text-xs font-semibold text-white">Copy</div>
          <div className="text-xs text-yellow-300 mt-0.5">Clipboard</div>
        </button>
      </div>

      {/* Print Button */}
      <button
        onClick={printForecast}
        className="w-full metallic-button px-4 py-3 rounded-lg text-sm font-semibold text-white mb-3 flex items-center justify-center gap-2 hover:scale-105 transition-transform"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        Print Report
      </button>

      {/* Tips */}
      <div className="glass-card-light rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">💡</span>
          <h4 className="font-semibold text-white text-xs">Export Tips:</h4>
        </div>
        <ul className="space-y-1 text-xs text-gray-400 leading-snug">
          <li><strong className="text-green-400">CSV</strong> opens in Excel/Sheets</li>
          <li><strong className="text-cyan-400">JSON</strong> full backup</li>
          <li><strong className="text-purple-400">Copy</strong> quick share</li>
          <li><strong className="text-pink-400">Print</strong> PDF report</li>
        </ul>
      </div>
    </div>
  );
}
