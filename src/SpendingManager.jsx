import React, { useState } from "react";

export default function SpendingManager({ scheduled, onScheduledChange, transactions, onTransactionsChange }) {
  const [showScheduled, setShowScheduled] = useState(false);
  const [showOneTime, setShowOneTime] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  // Form state for new items
  const [newScheduled, setNewScheduled] = useState({
    pattern: 'monthly',
    day: 1,
    weekday: 4,
    amount: 0,
    description: ''
  });
  
  const [newOneTime, setNewOneTime] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    description: ''
  });

  const addScheduledItem = () => {
    if (!newScheduled.description || newScheduled.amount === 0) {
      alert('Please fill in description and amount');
      return;
    }
    
    const item = {
      pattern: newScheduled.pattern,
      amount: parseFloat(newScheduled.amount),
      description: newScheduled.description
    };
    
    if (newScheduled.pattern === 'monthly') {
      item.day = parseInt(newScheduled.day);
    } else if (newScheduled.pattern === 'biweekly' || newScheduled.pattern === 'weekly') {
      item.weekday = parseInt(newScheduled.weekday);
    }
    
    onScheduledChange([...scheduled, item]);
    
    // Reset form
    setNewScheduled({
      pattern: 'monthly',
      day: 1,
      weekday: 4,
      amount: 0,
      description: ''
    });
  };

  const addOneTimeTransaction = () => {
    if (!newOneTime.description || newOneTime.amount === 0) {
      alert('Please fill in description and amount');
      return;
    }
    
    onScheduledChange([...scheduled, {
      pattern: 'oneoff',
      date: newOneTime.date,
      amount: parseFloat(newOneTime.amount),
      description: newOneTime.description
    }]);
    
    // Reset form
    setNewOneTime({
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      description: ''
    });
  };

  const deleteScheduledItem = (index) => {
    onScheduledChange(scheduled.filter((_, i) => i !== index));
  };

  const updateScheduledItem = (index, field, value) => {
    const updated = [...scheduled];
    updated[index] = { ...updated[index], [field]: parseFloat(value) || value };
    onScheduledChange(updated);
  };

  const patternLabels = {
    'monthly': 'Monthly',
    'biweekly': 'Bi-weekly',
    'weekly': 'Weekly',
    'oneoff': 'One-time'
  };

  const weekdayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="bg-white rounded-2xl shadow-lg border p-6 mb-6">
      <h3 className="text-2xl font-semibold text-gray-800 mb-4">💳 Manage Your Spending</h3>
      
      {/* Recurring Bills Section */}
      <div className="mb-6">
        <button
          onClick={() => setShowScheduled(!showScheduled)}
          className="w-full flex justify-between items-center p-4 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 rounded-lg font-medium text-gray-800 transition-all"
        >
          <span className="flex items-center">
            <span className="text-2xl mr-3">🔄</span>
            <span>Recurring Bills & Income ({scheduled.filter(s => s.pattern !== 'oneoff').length})</span>
          </span>
          <span>{showScheduled ? '▼' : '▶'}</span>
        </button>

        {showScheduled && (
          <div className="mt-4 space-y-4">
            {/* Add New Recurring Item */}
            <div className="p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <h4 className="font-semibold mb-3">Add Recurring Item</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <select
                  className="p-2 border rounded-lg"
                  value={newScheduled.pattern}
                  onChange={(e) => setNewScheduled({ ...newScheduled, pattern: e.target.value })}
                >
                  <option value="monthly">Monthly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="weekly">Weekly</option>
                </select>

                {newScheduled.pattern === 'monthly' && (
                  <select
                    className="p-2 border rounded-lg"
                    value={newScheduled.day}
                    onChange={(e) => setNewScheduled({ ...newScheduled, day: e.target.value })}
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>Day {d}</option>
                    ))}
                  </select>
                )}

                {(newScheduled.pattern === 'weekly' || newScheduled.pattern === 'biweekly') && (
                  <select
                    className="p-2 border rounded-lg"
                    value={newScheduled.weekday}
                    onChange={(e) => setNewScheduled({ ...newScheduled, weekday: e.target.value })}
                  >
                    {weekdayLabels.map((day, idx) => (
                      <option key={idx} value={idx}>{day}</option>
                    ))}
                  </select>
                )}

                <input
                  type="number"
                  placeholder="Amount ($)"
                  className="p-2 border rounded-lg"
                  value={newScheduled.amount || ''}
                  onChange={(e) => setNewScheduled({ ...newScheduled, amount: e.target.value })}
                />

                <input
                  type="text"
                  placeholder="Description"
                  className="p-2 border rounded-lg"
                  value={newScheduled.description}
                  onChange={(e) => setNewScheduled({ ...newScheduled, description: e.target.value })}
                />

                <button
                  onClick={addScheduledItem}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  + Add
                </button>
              </div>
            </div>

            {/* List of Recurring Items */}
            <div className="space-y-2">
              {scheduled
                .filter(item => item.pattern !== 'oneoff')
                .map((item, index) => {
                  const originalIndex = scheduled.findIndex(s => s === item);
                  return (
                    <div key={index} className="p-4 bg-white border-2 rounded-lg hover:shadow-md transition-shadow">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                        {/* Pattern Selector */}
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Pattern</div>
                          <select
                            className="w-full p-2 border rounded-lg font-medium"
                            value={item.pattern}
                            onChange={(e) => {
                              const updated = [...scheduled];
                              updated[originalIndex] = { 
                                ...updated[originalIndex], 
                                pattern: e.target.value,
                                // Set default day/weekday based on pattern
                                ...(e.target.value === 'monthly' ? { day: 1 } : {}),
                                ...(e.target.value === 'weekly' || e.target.value === 'biweekly' ? { weekday: 4 } : {})
                              };
                              onScheduledChange(updated);
                            }}
                          >
                            <option value="monthly">Monthly</option>
                            <option value="biweekly">Bi-weekly</option>
                            <option value="weekly">Weekly</option>
                          </select>
                        </div>

                        {/* Day/Weekday Selector */}
                        <div>
                          <div className="text-xs text-gray-500 mb-1">
                            {item.pattern === 'monthly' ? 'Day of Month' : 'Day of Week'}
                          </div>
                          {item.pattern === 'monthly' ? (
                            <select
                              className="w-full p-2 border rounded-lg font-medium"
                              value={item.day || 1}
                              onChange={(e) => updateScheduledItem(originalIndex, 'day', parseInt(e.target.value))}
                            >
                              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          ) : (
                            <select
                              className="w-full p-2 border rounded-lg font-medium"
                              value={item.weekday || 0}
                              onChange={(e) => updateScheduledItem(originalIndex, 'weekday', parseInt(e.target.value))}
                            >
                              {weekdayLabels.map((day, idx) => (
                                <option key={idx} value={idx}>{day}</option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Description */}
                        <div className="lg:col-span-2">
                          <div className="text-xs text-gray-500 mb-1">Description</div>
                          <input
                            type="text"
                            className="w-full p-2 border rounded-lg"
                            value={item.description}
                            onChange={(e) => updateScheduledItem(originalIndex, 'description', e.target.value)}
                            placeholder="e.g., Rent, Paycheck, Netflix"
                          />
                        </div>

                        {/* Amount */}
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Amount ($)</div>
                          <input
                            type="number"
                            step="0.01"
                            className={`w-full p-2 border-2 rounded-lg font-semibold ${
                              item.amount >= 0 ? 'text-green-600 border-green-300' : 'text-red-600 border-red-300'
                            }`}
                            value={item.amount}
                            onChange={(e) => updateScheduledItem(originalIndex, 'amount', e.target.value)}
                            placeholder="e.g., -1200 or 2400"
                          />
                          <div className="text-xs text-gray-500 mt-1">
                            {item.amount >= 0 ? '💰 Income' : '💸 Expense'}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-end">
                          <button
                            onClick={() => deleteScheduledItem(originalIndex)}
                            className="w-full px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>

                      {/* Summary Info */}
                      <div className="mt-2 pt-2 border-t text-xs text-gray-600">
                        <span className="font-medium">
                          {item.pattern === 'monthly' && `Occurs on day ${item.day} of each month`}
                          {item.pattern === 'biweekly' && `Occurs every other ${weekdayLabels[item.weekday || 0]}`}
                          {item.pattern === 'weekly' && `Occurs every ${weekdayLabels[item.weekday || 0]}`}
                        </span>
                        {' • '}
                        <span className={item.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                          ${Math.abs(item.amount).toFixed(2)}/{item.pattern === 'biweekly' ? '2wks' : item.pattern === 'weekly' ? 'wk' : 'mo'}
                        </span>
                        {item.pattern !== 'weekly' && (
                          <>
                            {' ≈ '}
                            <span className="text-gray-700 font-medium">
                              ${(Math.abs(item.amount) * (item.pattern === 'monthly' ? 1 : item.pattern === 'biweekly' ? 26/12 : 52/12)).toFixed(2)}/mo
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* One-Time Transactions Section */}
      <div>
        <button
          onClick={() => setShowOneTime(!showOneTime)}
          className="w-full flex justify-between items-center p-4 bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 rounded-lg font-medium text-gray-800 transition-all"
        >
          <span className="flex items-center">
            <span className="text-2xl mr-3">📅</span>
            <span>One-Time What-If Scenarios ({scheduled.filter(s => s.pattern === 'oneoff').length})</span>
          </span>
          <span>{showOneTime ? '▼' : '▶'}</span>
        </button>

        {showOneTime && (
          <div className="mt-4 space-y-4">
            {/* Add One-Time Transaction */}
            <div className="p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <h4 className="font-semibold mb-3">Add What-If Scenario</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  type="date"
                  className="p-2 border rounded-lg"
                  value={newOneTime.date}
                  onChange={(e) => setNewOneTime({ ...newOneTime, date: e.target.value })}
                />

                <input
                  type="number"
                  placeholder="Amount ($)"
                  className="p-2 border rounded-lg"
                  value={newOneTime.amount || ''}
                  onChange={(e) => setNewOneTime({ ...newOneTime, amount: e.target.value })}
                />

                <input
                  type="text"
                  placeholder="Description"
                  className="p-2 border rounded-lg"
                  value={newOneTime.description}
                  onChange={(e) => setNewOneTime({ ...newOneTime, description: e.target.value })}
                />

                <button
                  onClick={addOneTimeTransaction}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                >
                  + Add Scenario
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                💡 Use positive amounts for income/deposits, negative for expenses
              </p>
            </div>

            {/* List of One-Time Items */}
            <div className="space-y-2">
              {scheduled
                .filter(item => item.pattern === 'oneoff')
                .map((item, index) => {
                  const originalIndex = scheduled.findIndex(s => s === item);
                  return (
                    <div key={index} className="p-4 bg-white border-2 rounded-lg hover:shadow-md transition-shadow">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {/* Date */}
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Date</div>
                          <input
                            type="date"
                            className="w-full p-2 border rounded-lg font-medium"
                            value={item.date}
                            onChange={(e) => updateScheduledItem(originalIndex, 'date', e.target.value)}
                          />
                        </div>

                        {/* Description */}
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Description</div>
                          <input
                            type="text"
                            className="w-full p-2 border rounded-lg"
                            value={item.description}
                            onChange={(e) => updateScheduledItem(originalIndex, 'description', e.target.value)}
                            placeholder="e.g., Car repair, Bonus"
                          />
                        </div>

                        {/* Amount */}
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Amount ($)</div>
                          <input
                            type="number"
                            step="0.01"
                            className={`w-full p-2 border-2 rounded-lg font-semibold ${
                              item.amount >= 0 ? 'text-green-600 border-green-300' : 'text-red-600 border-red-300'
                            }`}
                            value={item.amount}
                            onChange={(e) => updateScheduledItem(originalIndex, 'amount', e.target.value)}
                            placeholder="e.g., -500 or 1000"
                          />
                          <div className="text-xs text-gray-500 mt-1">
                            {item.amount >= 0 ? '💰 Income' : '💸 Expense'}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-end">
                          <button
                            onClick={() => deleteScheduledItem(originalIndex)}
                            className="w-full px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>

                      {/* Summary Info */}
                      <div className="mt-2 pt-2 border-t text-xs text-gray-600">
                        <span className="font-medium">Scheduled for {new Date(item.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        {' • '}
                        <span className={item.amount >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                          ${Math.abs(item.amount).toFixed(2)} {item.amount >= 0 ? 'income' : 'expense'}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Quick Presets */}
      <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border">
        <h4 className="font-semibold mb-3 text-gray-800 flex items-center">
          <span className="text-2xl mr-2">💡</span>
          Quick What-If Scenarios
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <button
            onClick={() => {
              const date = new Date();
              date.setDate(date.getDate() + 7);
              onScheduledChange([...scheduled, {
                pattern: 'oneoff',
                date: date.toISOString().split('T')[0],
                amount: -500,
                description: 'Emergency expense'
              }]);
            }}
            className="p-3 bg-white hover:bg-red-50 rounded-lg text-sm border-2 border-transparent hover:border-red-200 transition-all font-medium"
          >
            🚨 -$500 Emergency
          </button>
          <button
            onClick={() => {
              const date = new Date();
              date.setDate(date.getDate() + 14);
              onScheduledChange([...scheduled, {
                pattern: 'oneoff',
                date: date.toISOString().split('T')[0],
                amount: 1000,
                description: 'Bonus payment'
              }]);
            }}
            className="p-3 bg-white hover:bg-green-50 rounded-lg text-sm border-2 border-transparent hover:border-green-200 transition-all font-medium"
          >
            💰 +$1000 Bonus
          </button>
          <button
            onClick={() => {
              const date = new Date();
              date.setDate(date.getDate() + 3);
              onScheduledChange([...scheduled, {
                pattern: 'oneoff',
                date: date.toISOString().split('T')[0],
                amount: -200,
                description: 'Car repair'
              }]);
            }}
            className="p-3 bg-white hover:bg-orange-50 rounded-lg text-sm border-2 border-transparent hover:border-orange-200 transition-all font-medium"
          >
            🔧 -$200 Car Repair
          </button>
          <button
            onClick={() => {
              onScheduledChange([...scheduled, {
                pattern: 'monthly',
                day: 15,
                amount: -50,
                description: 'New subscription'
              }]);
            }}
            className="p-3 bg-white hover:bg-blue-50 rounded-lg text-sm border-2 border-transparent hover:border-blue-200 transition-all font-medium"
          >
            📱 -$50/mo Subscription
          </button>
        </div>
        <div className="text-xs text-gray-600 bg-white bg-opacity-50 p-2 rounded">
          💡 <strong>Tip:</strong> All added items are fully editable. Click any field to modify the amount, date, or description!
        </div>
      </div>
    </div>
  );
}
