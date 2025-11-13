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
    <div>
      {/* Save Button */}
      <button
        onClick={() => setShowSaveDialog(true)}
        className="w-full metallic-button px-4 py-3 rounded-lg text-sm font-semibold text-white mb-3 flex items-center justify-center gap-2 hover:scale-105 transition-transform"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
        </svg>
        <span>Save as Scenario</span>
      </button>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="mb-4 rounded-lg border border-white/15 glass-card-light p-4">
          <h4 className="mb-3 text-sm font-semibold text-white">Save Current Scenario</h4>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-white/60">
                Scenario Name *
              </label>
              <input
                type="text"
                value={newScenarioName}
                onChange={(e) => setNewScenarioName(e.target.value)}
                placeholder="e.g., With Vacation, After Raise, Emergency Fund Goal"
                className="metallic-input w-full rounded-lg p-2 text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-white/60">
                Description (optional)
              </label>
              <textarea
                value={newScenarioDescription}
                onChange={(e) => setNewScenarioDescription(e.target.value)}
                placeholder="Brief description of what's different in this scenario"
                className="metallic-input w-full rounded-lg p-2 text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400/40"
                rows="2"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveScenario}
                className="flex-1 rounded-lg border border-green-400/40 bg-green-500/10 px-4 py-2 text-xs font-semibold text-green-200 transition-all hover:bg-green-500/20"
              >
                ✅ Save
              </button>
              <button
                onClick={() => {
                  setShowSaveDialog(false);
                  setNewScenarioName('');
                  setNewScenarioDescription('');
                }}
                className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-300 transition-all hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Current Scenario Display */}
      <div className="mb-3 rounded-lg glass-card-light p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Current Plan</h3>
          <span className="px-2 py-0.5 bg-cyan-500 bg-opacity-30 text-cyan-300 text-xs rounded-full">Default</span>
        </div>
        <p className="mb-2 text-xs text-gray-300">Your current financial setup</p>
        
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-cyan-400">🔥 Starting:</span>
            <span className="font-bold text-white">${openingBalance?.toFixed(2) || '0.00'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">📋 {scheduled?.length || 0} scheduled</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">🕒 {new Date().toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Comparison Mode */}
      {selectedForComparison.length > 1 && (
        <div className="mt-4 rounded-lg border border-purple-400/30 glass-card-light p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-white">Selected for Comparison</h4>
              <p className="text-xs text-purple-200">{selectedForComparison.length} scenarios selected</p>
            </div>
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="rounded-lg border border-purple-400/40 bg-purple-500/10 px-4 py-2 text-xs font-semibold text-purple-100 transition-all hover:bg-purple-500/20"
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
                  <div key={id} className="glass-card rounded-lg border border-white/10 p-3">
                    <h5 className="mb-2 text-sm font-semibold text-white">{scenario.name}</h5>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-300">Balance:</span>
                        <span className="font-medium text-white">${scenario.openingBalance.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Income:</span>
                        <span className="font-medium text-green-300">+${totalIncome.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Expenses:</span>
                        <span className="font-medium text-red-300">-${totalExpenses.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t border-white/10 pt-2">
                        <span className="text-gray-300">Net:</span>
                        <span className={`font-bold ${(totalIncome - totalExpenses) >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                          {(totalIncome - totalExpenses).toFixed(2)}
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
      <div className="mt-3 rounded-lg glass-card-light p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-base">💡</span>
          <h4 className="text-xs font-semibold text-white">Pro Tips:</h4>
        </div>
        <ul className="space-y-1 text-xs leading-snug text-gray-300">
          <li>• Save setup before big changes</li>
          <li>• Create scenarios for life events</li>
          <li>• Use comparison to pick best option</li>
          <li>• Update base scenario regularly</li>
        </ul>
      </div>
    </div>
  );
}
