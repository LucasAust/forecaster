import React, { useState } from "react";

export default function ScenarioManager({ 
  currentScenario,
  onScenarioChange,
  openingBalance,
  scheduled,
  onSaveScenario,
  onLoadScenario,
  onDeleteScenario
}) {
  const [scenarios, setScenarios] = useState([
    {
      id: 'base',
      name: 'Current Plan',
      description: 'Your current financial setup',
      openingBalance: openingBalance,
      scheduled: scheduled,
      isDefault: true,
      createdAt: new Date().toISOString()
    }
  ]);
  
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [newScenarioDescription, setNewScenarioDescription] = useState('');
  const [selectedForComparison, setSelectedForComparison] = useState([]);
  const [showComparison, setShowComparison] = useState(false);

  const handleSaveScenario = () => {
    if (!newScenarioName.trim()) {
      alert('Please enter a scenario name');
      return;
    }

    const newScenario = {
      id: Date.now().toString(),
      name: newScenarioName,
      description: newScenarioDescription,
      openingBalance: openingBalance,
      scheduled: [...scheduled],
      isDefault: false,
      createdAt: new Date().toISOString()
    };

    setScenarios([...scenarios, newScenario]);
    if (onSaveScenario) {
      onSaveScenario(newScenario);
    }

    setNewScenarioName('');
    setNewScenarioDescription('');
    setShowSaveDialog(false);
  };

  const handleLoadScenario = (scenario) => {
    if (onLoadScenario) {
      onLoadScenario(scenario);
    }
  };

  const handleDeleteScenario = (scenarioId) => {
    if (window.confirm('Are you sure you want to delete this scenario?')) {
      setScenarios(scenarios.filter(s => s.id !== scenarioId));
      if (onDeleteScenario) {
        onDeleteScenario(scenarioId);
      }
    }
  };

  const toggleComparisonSelection = (scenarioId) => {
    if (selectedForComparison.includes(scenarioId)) {
      setSelectedForComparison(selectedForComparison.filter(id => id !== scenarioId));
    } else if (selectedForComparison.length < 3) {
      setSelectedForComparison([...selectedForComparison, scenarioId]);
    } else {
      alert('You can compare up to 3 scenarios at once');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">�</span>
          <h2 className="text-xl font-bold text-white">Scenarios</h2>
        </div>
        <p className="text-purple-100 text-xs mt-1">
          Save & compare plans
        </p>
      </div>
      <div className="p-6">

      {/* Save Button */}
      <button
        onClick={() => setShowSaveDialog(true)}
        className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-medium transition-colors mb-4 flex items-center justify-center gap-2"
      >
        <span className="text-xl">💾</span>
        <span>Save Current as New Scenario</span>
      </button>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="mb-4 p-4 bg-blue-50 rounded-lg border-2 border-blue-300">
          <h4 className="font-semibold mb-3">Save Current Scenario</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Scenario Name *
              </label>
              <input
                type="text"
                value={newScenarioName}
                onChange={(e) => setNewScenarioName(e.target.value)}
                placeholder="e.g., 'With Vacation', 'After Raise', 'Emergency Fund Goal'"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <textarea
                value={newScenarioDescription}
                onChange={(e) => setNewScenarioDescription(e.target.value)}
                placeholder="Brief description of what's different in this scenario"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows="2"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveScenario}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                ✅ Save
              </button>
              <button
                onClick={() => {
                  setShowSaveDialog(false);
                  setNewScenarioName('');
                  setNewScenarioDescription('');
                }}
                className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scenarios List */}
      <div className="space-y-2">
        {scenarios.map((scenario) => (
          <div
            key={scenario.id}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedForComparison.includes(scenario.id)
                ? 'bg-purple-50 border-purple-400'
                : 'bg-gray-50 border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-lg">{scenario.name}</h4>
                  {scenario.isDefault && (
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                      Default
                    </span>
                  )}
                </div>
                {scenario.description && (
                  <p className="text-sm text-gray-600 mb-2">{scenario.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>💰 Starting: ${scenario.openingBalance.toFixed(2)}</span>
                  <span>📋 {scenario.scheduled.length} scheduled items</span>
                  <span>🕒 {new Date(scenario.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleLoadScenario(scenario)}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                >
                  Load
                </button>
                {!scenario.isDefault && (
                  <>
                    <button
                      onClick={() => toggleComparisonSelection(scenario.id)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        selectedForComparison.includes(scenario.id)
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                      }`}
                    >
                      {selectedForComparison.includes(scenario.id) ? '✓ Compare' : 'Compare'}
                    </button>
                    <button
                      onClick={() => handleDeleteScenario(scenario.id)}
                      className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm font-medium transition-colors"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comparison Mode */}
      {selectedForComparison.length > 1 && (
        <div className="mt-4 p-4 bg-purple-50 rounded-lg border-2 border-purple-300">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="font-semibold">Selected for Comparison</h4>
              <p className="text-sm text-gray-600">{selectedForComparison.length} scenarios selected</p>
            </div>
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
            >
              {showComparison ? 'Hide' : 'Show'} Comparison
            </button>
          </div>
          
          {showComparison && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {selectedForComparison.map(id => {
                const scenario = scenarios.find(s => s.id === id);
                if (!scenario) return null;
                
                const totalIncome = scenario.scheduled
                  .filter(s => s.amount > 0)
                  .reduce((sum, s) => sum + s.amount, 0);
                const totalExpenses = scenario.scheduled
                  .filter(s => s.amount < 0)
                  .reduce((sum, s) => sum + Math.abs(s.amount), 0);
                
                return (
                  <div key={id} className="p-3 bg-white rounded-lg border">
                    <h5 className="font-semibold mb-2">{scenario.name}</h5>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Balance:</span>
                        <span className="font-medium">${scenario.openingBalance.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Income:</span>
                        <span className="font-medium text-green-600">+${totalIncome.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Expenses:</span>
                        <span className="font-medium text-red-600">-${totalExpenses.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span className="text-gray-600">Net:</span>
                        <span className={`font-bold ${(totalIncome - totalExpenses) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${(totalIncome - totalExpenses).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tips */}
      <div className="mt-4 p-3 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg text-sm">
        <span className="font-medium">💡 Pro Tips:</span>
        <ul className="mt-2 space-y-1 text-gray-700 ml-4 list-disc">
          <li>Save your current setup before making big changes</li>
          <li>Create scenarios for different life events (job change, moving, etc.)</li>
          <li>Use comparison mode to see which option is best</li>
          <li>Keep your base scenario updated as things change</li>
        </ul>
      </div>
      </div>
    </div>
  );
}
