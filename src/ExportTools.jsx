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
    <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📤</span>
          <h2 className="text-xl font-bold text-white">Export</h2>
        </div>
        <p className="text-teal-100 text-xs mt-1">
          Share your forecast
        </p>
      </div>
      <div className="p-6">
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Export Forecast CSV */}
        <button
          onClick={exportToCSV}
          className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 border-2 border-green-200 hover:border-green-300 rounded-lg transition-all group"
        >
          <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">📊</div>
          <div className="font-semibold text-gray-800">Forecast CSV</div>
          <div className="text-xs text-gray-600 mt-1">Daily balance data</div>
        </button>

        {/* Export Scheduled CSV */}
        <button
          onClick={exportScheduledToCSV}
          className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-2 border-blue-200 hover:border-blue-300 rounded-lg transition-all group"
        >
          <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">📋</div>
          <div className="font-semibold text-gray-800">Bills CSV</div>
          <div className="text-xs text-gray-600 mt-1">Recurring items</div>
        </button>

        {/* Export Full JSON */}
        <button
          onClick={exportToJSON}
          className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 border-2 border-purple-200 hover:border-purple-300 rounded-lg transition-all group"
        >
          <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">💾</div>
          <div className="font-semibold text-gray-800">Full Data</div>
          <div className="text-xs text-gray-600 mt-1">JSON backup</div>
        </button>

        {/* Copy Summary */}
        <button
          onClick={copyToClipboard}
          className="p-4 bg-gradient-to-br from-orange-50 to-yellow-50 hover:from-orange-100 hover:to-yellow-100 border-2 border-orange-200 hover:border-orange-300 rounded-lg transition-all group"
        >
          <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">📋</div>
          <div className="font-semibold text-gray-800">Copy Summary</div>
          <div className="text-xs text-gray-600 mt-1">To clipboard</div>
        </button>
      </div>

      {/* Print Button */}
      <div className="mt-4 pt-4 border-t">
        <button
          onClick={printForecast}
          className="w-full p-3 bg-gray-100 hover:bg-gray-200 border-2 border-gray-300 rounded-lg font-medium text-gray-800 transition-all flex items-center justify-center gap-2"
        >
          <span className="text-xl">🖨️</span>
          Print Forecast Report
        </button>
      </div>

      {/* Tips */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
        <div className="font-medium mb-1">💡 Export Tips:</div>
        <ul className="text-gray-700 space-y-1 ml-4 list-disc text-xs">
          <li><strong>CSV files</strong> can be opened in Excel or Google Sheets</li>
          <li><strong>JSON backup</strong> includes all data for re-importing later</li>
          <li><strong>Copy summary</strong> for quick sharing via email/text</li>
          <li><strong>Print</strong> creates a PDF-ready report (use "Save as PDF")</li>
        </ul>
      </div>
      </div>
    </div>
  );
}
