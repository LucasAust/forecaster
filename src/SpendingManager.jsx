import React, { useState } from "react";

export default function SpendingManager(props) {
  const { scheduled = [], onScheduledChange } = props;
  const [showScheduled, setShowScheduled] = useState(false);
  const [showOneTime, setShowOneTime] = useState(false);

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

  const weekdayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div>
      {/* Recurring Bills Section */}
      <div className="mb-4">
        <button
          onClick={() => setShowScheduled(!showScheduled)}
          className="w-full glass-card-light rounded-lg p-3 flex items-center justify-between hover:bg-white hover:bg-opacity-10 transition-all"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-sm font-semibold text-white">Recurring ({scheduled.filter(i => i.pattern !== 'oneoff').length})</span>
          </div>
          <span className="text-white">{showScheduled ? '▼' : '▶'}</span>
        </button>

        {showScheduled && (
          <div className="mt-4 space-y-4">
            {/* Add New Recurring Item */}
            <div className="glass-card-light rounded-lg border border-dashed border-white/20 p-4">
              <h4 className="text-sm font-semibold text-white mb-3">Add Recurring Item</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
                <select
                  className="metallic-input p-2 rounded-lg text-white focus:ring-2 focus:ring-cyan-400/40"
                  value={newScheduled.pattern}
                  onChange={(e) => setNewScheduled({ ...newScheduled, pattern: e.target.value })}
                >
                  <option value="monthly">Monthly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="weekly">Weekly</option>
                </select>

                {newScheduled.pattern === 'monthly' && (
                  <select
                    className="metallic-input p-2 rounded-lg text-white focus:ring-2 focus:ring-cyan-400/40"
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
                    className="metallic-input p-2 rounded-lg text-white focus:ring-2 focus:ring-cyan-400/40"
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
                  className="metallic-input p-2 rounded-lg text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400/40"
                  value={newScheduled.amount || ''}
                  onChange={(e) => setNewScheduled({ ...newScheduled, amount: e.target.value })}
                />

                <input
                  type="text"
                  placeholder="Description"
                  className="metallic-input p-2 rounded-lg text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400/40"
                  value={newScheduled.description}
                  onChange={(e) => setNewScheduled({ ...newScheduled, description: e.target.value })}
                />

                <button
                  onClick={addScheduledItem}
                  className="metallic-button px-4 py-2 rounded-lg text-xs font-semibold text-white"
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
                    <div key={index} className="glass-card-light rounded-lg border border-white/10 p-4 transition-all hover:shadow-lg">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
                        {/* Pattern Selector */}
                        <div>
                          <div className="mb-1 text-[11px] uppercase tracking-wide text-white/60">Pattern</div>
                          <select
                            className="w-full metallic-input p-2 rounded-lg font-medium text-white focus:ring-2 focus:ring-cyan-400/40"
                            value={item.pattern}
                            onChange={(e) => {
                              const updated = [...scheduled];
                              updated[originalIndex] = {
                                ...updated[originalIndex],
                                pattern: e.target.value,
                                ...(e.target.value === 'monthly' ? { day: 1 } : {}),
                                ...((e.target.value === 'weekly' || e.target.value === 'biweekly') ? { weekday: 4 } : {})
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
                          <div className="mb-1 text-[11px] uppercase tracking-wide text-white/60">
                            {item.pattern === 'monthly' ? 'Day of Month' : 'Day of Week'}
                          </div>
                          {item.pattern === 'monthly' ? (
                            <select
                              className="w-full metallic-input p-2 rounded-lg font-medium text-white focus:ring-2 focus:ring-cyan-400/40"
                              value={item.day || 1}
                              onChange={(e) => updateScheduledItem(originalIndex, 'day', parseInt(e.target.value, 10))}
                            >
                              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          ) : (
                            <select
                              className="w-full metallic-input p-2 rounded-lg font-medium text-white focus:ring-2 focus:ring-cyan-400/40"
                              value={item.weekday || 0}
                              onChange={(e) => updateScheduledItem(originalIndex, 'weekday', parseInt(e.target.value, 10))}
                            >
                              {weekdayLabels.map((day, idx) => (
                                <option key={idx} value={idx}>{day}</option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Description */}
                        <div className="lg:col-span-2">
                          <div className="mb-1 text-[11px] uppercase tracking-wide text-white/60">Description</div>
                          <input
                            type="text"
                            className="w-full metallic-input p-2 rounded-lg text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400/40"
                            value={item.description}
                            onChange={(e) => updateScheduledItem(originalIndex, 'description', e.target.value)}
                            placeholder="e.g., Rent, Paycheck, Netflix"
                          />
                        </div>

                        {/* Amount */}
                        <div>
                          <div className="mb-1 text-[11px] uppercase tracking-wide text-white/60">Amount ($)</div>
                          <input
                            type="number"
                            step="0.01"
                            className={`metallic-input w-full rounded-lg p-2 font-semibold focus:ring-2 focus:ring-cyan-400/40 ${
                              item.amount >= 0 ? 'border-green-400/50 text-green-200' : 'border-red-400/50 text-red-200'
                            }`}
                            value={item.amount}
                            onChange={(e) => updateScheduledItem(originalIndex, 'amount', e.target.value)}
                            placeholder="e.g., -1200 or 2400"
                          />
                          <div className="mt-1 text-xs text-gray-300">
                            {item.amount >= 0 ? '💰 Income' : '💸 Expense'}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-end">
                          <button
                            onClick={() => deleteScheduledItem(originalIndex)}
                            className="w-full rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition-all hover:bg-red-500/20"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>

                      {/* Summary Info */}
                      <div className="mt-3 border-t border-white/10 pt-3 text-xs text-gray-300">
                        <span className="font-medium text-white/80">
                          {item.pattern === 'monthly' && `Occurs on day ${item.day} of each month`}
                          {item.pattern === 'biweekly' && `Occurs every other ${weekdayLabels[item.weekday || 0]}`}
                          {item.pattern === 'weekly' && `Occurs every ${weekdayLabels[item.weekday || 0]}`}
                        </span>
                        {' • '}
                        <span className={item.amount >= 0 ? 'text-green-300' : 'text-red-300'}>
                          ${Math.abs(item.amount).toFixed(2)}/{item.pattern === 'biweekly' ? '2wks' : item.pattern === 'weekly' ? 'wk' : 'mo'}
                        </span>
                        {item.pattern !== 'weekly' && (
                          <>
                            {' ≈ '}
                            <span className="font-medium text-white/80">
                              {(Math.abs(item.amount) * (item.pattern === 'monthly' ? 1 : item.pattern === 'biweekly' ? 26/12 : 52/12)).toFixed(2)}/mo
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
      <div className="mb-4">
        <button
          onClick={() => setShowOneTime(!showOneTime)}
          className="w-full glass-card-light rounded-lg p-3 flex items-center justify-between hover:bg-white hover:bg-opacity-10 transition-all"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-semibold text-white">One-Time ({scheduled.filter(i => i.pattern === 'oneoff').length})</span>
          </div>
          <span className="text-white">{showOneTime ? '▼' : '▶'}</span>
        </button>

        {showOneTime && (
          <div className="mt-4 space-y-4">
            {/* Add One-Time Transaction */}
            <div className="glass-card-light rounded-lg border border-dashed border-white/20 p-4">
              <h4 className="text-sm font-semibold text-white mb-3">Add What-If Scenario</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <input
                  type="date"
                  className="metallic-input p-2 rounded-lg text-white focus:ring-2 focus:ring-cyan-400/40"
                  value={newOneTime.date}
                  onChange={(e) => setNewOneTime({ ...newOneTime, date: e.target.value })}
                />

                <input
                  type="number"
                  placeholder="Amount ($)"
                  className="metallic-input p-2 rounded-lg text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400/40"
                  value={newOneTime.amount || ''}
                  onChange={(e) => setNewOneTime({ ...newOneTime, amount: e.target.value })}
                />

                <input
                  type="text"
                  placeholder="Description"
                  className="metallic-input p-2 rounded-lg text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400/40"
                  value={newOneTime.description}
                  onChange={(e) => setNewOneTime({ ...newOneTime, description: e.target.value })}
                />

                <button
                  onClick={addOneTimeTransaction}
                  className="metallic-button px-4 py-2 rounded-lg text-xs font-semibold text-white"
                >
                  + Add Scenario
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-300">
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
                    <div key={index} className="glass-card-light rounded-lg border border-white/10 p-4 transition-all hover:shadow-lg">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                        {/* Date */}
                        <div>
                          <div className="mb-1 text-[11px] uppercase tracking-wide text-white/60">Date</div>
                          <input
                            type="date"
                            className="w-full metallic-input p-2 rounded-lg font-medium text-white focus:ring-2 focus:ring-cyan-400/40"
                            value={item.date}
                            onChange={(e) => updateScheduledItem(originalIndex, 'date', e.target.value)}
                          />
                        </div>

                        {/* Description */}
                        <div>
                          <div className="mb-1 text-[11px] uppercase tracking-wide text-white/60">Description</div>
                          <input
                            type="text"
                            className="w-full metallic-input p-2 rounded-lg text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400/40"
                            value={item.description}
                            onChange={(e) => updateScheduledItem(originalIndex, 'description', e.target.value)}
                            placeholder="e.g., Car repair, Bonus"
                          />
                        </div>

                        {/* Amount */}
                        <div>
                          <div className="mb-1 text-[11px] uppercase tracking-wide text-white/60">Amount ($)</div>
                          <input
                            type="number"
                            step="0.01"
                            className={`metallic-input w-full rounded-lg p-2 font-semibold focus:ring-2 focus:ring-cyan-400/40 ${
                              item.amount >= 0 ? 'border-green-400/50 text-green-200' : 'border-red-400/50 text-red-200'
                            }`}
                            value={item.amount}
                            onChange={(e) => updateScheduledItem(originalIndex, 'amount', e.target.value)}
                            placeholder="e.g., -500 or 1000"
                          />
                          <div className="mt-1 text-xs text-gray-300">
                            {item.amount >= 0 ? '💰 Income' : '💸 Expense'}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-end">
                          <button
                            onClick={() => deleteScheduledItem(originalIndex)}
                            className="w-full rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition-all hover:bg-red-500/20"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>

                      {/* Summary Info */}
                      <div className="mt-3 border-t border-white/10 pt-3 text-xs text-gray-300">
                        <span className="font-medium text-white/80">
                          Scheduled for {new Date(item.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                        {' • '}
                        <span className={item.amount >= 0 ? 'text-green-300 font-medium' : 'text-red-300 font-medium'}>
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
      <div className="glass-card-light rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">💡</span>
          <h4 className="text-xs font-semibold text-white">Quick Scenarios</h4>
        </div>
        <div className="grid grid-cols-2 gap-2">
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
            className="metallic-input p-2 rounded text-xs text-white hover:bg-opacity-20 transition-all"
          >
            🚨 -$500<br/>Emergency
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
            className="metallic-input p-2 rounded text-xs text-white hover:bg-opacity-20 transition-all"
          >
            🔥 +$1000<br/>Bonus
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
            className="metallic-input p-2 rounded text-xs text-white hover:bg-opacity-20 transition-all"
          >
            🚗 -$200<br/>Car Repair
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
            className="metallic-input p-2 rounded text-xs text-white hover:bg-opacity-20 transition-all"
          >
            📱 -$50/mo<br/>Subscription
          </button>
        </div>
        <div className="mt-2 text-xs leading-snug text-gray-300">
          <span className="text-cyan-400">💡 Tip:</span> All added items are fully editable. Click any field to modify!
        </div>
      </div>
    </div>
  );
}
