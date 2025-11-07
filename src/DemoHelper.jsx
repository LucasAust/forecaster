import React from "react";

export default function DemoHelper({ onLoadDemo }) {
  const demoScenarios = [
    {
      id: 'paycheck-to-paycheck',
      name: '💰 Paycheck to Paycheck',
      description: 'Living paycheck to paycheck with tight margins',
      icon: '💸',
      openingBalance: 800,
      scheduled: [
        { pattern: "biweekly", weekday: 4, amount: 1800, description: "Paycheck" },
        { pattern: "monthly", day: 1, amount: -1200, description: "Rent" },
        { pattern: "monthly", day: 5, amount: -150, description: "Utilities" },
        { pattern: "monthly", day: 15, amount: -80, description: "Internet" },
        { pattern: "monthly", day: 10, amount: -60, description: "Phone" },
        { pattern: "monthly", day: 13, amount: -15.99, description: "Netflix" },
      ]
    },
    {
      id: 'comfortable',
      name: '😊 Comfortable Budget',
      description: 'Healthy balance with room for savings',
      icon: '✨',
      openingBalance: 5000,
      scheduled: [
        { pattern: "biweekly", weekday: 4, amount: 3500, description: "Salary" },
        { pattern: "monthly", day: 1, amount: -1800, description: "Rent" },
        { pattern: "monthly", day: 5, amount: -200, description: "Utilities" },
        { pattern: "monthly", day: 15, amount: -100, description: "Internet + Phone" },
        { pattern: "monthly", day: 20, amount: -250, description: "Car Insurance" },
        { pattern: "monthly", day: 25, amount: -500, description: "Auto-Save to Savings" },
      ]
    },
    {
      id: 'emergency',
      name: '🚨 Emergency Scenario',
      description: 'Unexpected expense with low balance',
      icon: '⚠️',
      openingBalance: 1200,
      scheduled: [
        { pattern: "biweekly", weekday: 4, amount: 2200, description: "Paycheck" },
        { pattern: "monthly", day: 1, amount: -1400, description: "Rent" },
        { pattern: "monthly", day: 5, amount: -180, description: "Utilities" },
        { pattern: "oneoff", date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], amount: -800, description: "Car Repair Emergency" },
      ]
    },
    {
      id: 'vacation-planning',
      name: '🏖️ Vacation Planning',
      description: 'Saving for a big vacation',
      icon: '✈️',
      openingBalance: 3500,
      scheduled: [
        { pattern: "monthly", day: 15, amount: 4000, description: "Monthly Salary" },
        { pattern: "monthly", day: 1, amount: -1500, description: "Rent" },
        { pattern: "monthly", day: 5, amount: -200, description: "Utilities" },
        { pattern: "monthly", day: 10, amount: -400, description: "Groceries Budget" },
        { pattern: "oneoff", date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], amount: -3000, description: "Vacation to Hawaii" },
      ]
    },
    {
      id: 'raise',
      name: '📈 After Salary Raise',
      description: 'Impact of $10k annual raise',
      icon: '💵',
      openingBalance: 2500,
      scheduled: [
        { pattern: "biweekly", weekday: 4, amount: 2785, description: "New Higher Paycheck" },
        { pattern: "monthly", day: 1, amount: -1200, description: "Rent" },
        { pattern: "monthly", day: 5, amount: -165, description: "Utilities" },
        { pattern: "monthly", day: 15, amount: -75, description: "Internet" },
        { pattern: "monthly", day: 20, amount: -200, description: "Car Insurance" },
      ]
    }
  ];

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl shadow-lg border-2 border-indigo-200 p-6">
      <div className="text-center mb-4">
        <h3 className="text-2xl font-bold text-gray-800 mb-2">🎬 Quick Demo Scenarios</h3>
        <p className="text-gray-600">Load pre-configured examples to showcase features</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {demoScenarios.map((demo) => (
          <button
            key={demo.id}
            onClick={() => onLoadDemo(demo)}
            className="p-4 bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-indigo-400 rounded-xl transition-all text-left group"
          >
            <div className="flex items-start gap-3">
              <div className="text-4xl group-hover:scale-110 transition-transform">
                {demo.icon}
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-800 mb-1">{demo.name}</h4>
                <p className="text-xs text-gray-600 mb-2">{demo.description}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded">
                    ${demo.openingBalance}
                  </span>
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                    {demo.scheduled.length} items
                  </span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-4 p-3 bg-white/50 rounded-lg text-sm text-center">
        <span className="font-medium">💡 Tip:</span> Click any scenario to instantly load it and explore features
      </div>
    </div>
  );
}
