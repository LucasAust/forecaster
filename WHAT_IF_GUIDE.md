# 🎯 What-If Calculator Feature Guide

## Overview

The forecaster now includes a **full-featured spending manager** that lets users:

1. ✅ Edit their opening balance
2. ✅ Add/edit/delete recurring bills and income
3. ✅ Create one-time what-if scenarios
4. ✅ Use quick preset scenarios
5. ✅ See real-time updates to the forecast

---

## Features

### 1. **Opening Balance Control**

At the top of the app, users can instantly adjust their current account balance:
- Click the input field
- Type any amount
- Forecast updates automatically

### 2. **Recurring Bills & Income Manager**

Manage all recurring transactions:

#### Add New Recurring Items:
- **Pattern:** Monthly, Bi-weekly, or Weekly
- **Day/Weekday:** When it occurs
- **Amount:** Positive for income, negative for expenses
- **Description:** What it is

**Examples:**
- Monthly rent on the 1st: `-$1200`
- Bi-weekly paycheck on Friday: `+$2400`
- Weekly groceries on Sunday: `-$85`

#### Edit Existing Items:
- Click on any field to edit
- Changes apply instantly
- Delete unwanted items with one click

### 3. **One-Time What-If Scenarios**

Test specific financial decisions:

#### Add Scenarios:
- Pick a **future date**
- Enter the **amount** (+ or -)
- Describe what it is
- Watch the forecast update in real-time

**Use Cases:**
- "What if I have a $500 car repair next week?"
- "What if I get a $1000 bonus in 2 weeks?"
- "What if I buy a $2000 laptop next month?"
- "What if I transfer $500 to savings tomorrow?"

### 4. **Quick Preset Scenarios**

One-click common scenarios:
- 🚨 **-$500 Emergency** (in 7 days)
- 💰 **+$1000 Bonus** (in 14 days)
- 🔧 **-$200 Car Repair** (in 3 days)
- 📱 **-$50/mo New Subscription**

---

## How to Use

### Scenario 1: "Can I afford a vacation?"

1. Add a one-time expense: `-$2000` on your planned travel date
2. Watch the forecast line update
3. Check if your balance goes negative
4. If yes, adjust:
   - Move the date
   - Reduce the amount
   - Add extra income
   - Cancel a subscription

### Scenario 2: "Should I upgrade my car insurance?"

1. Find your current car insurance in recurring bills
2. Change the amount from `-$200` to `-$250`
3. See how $50/month affects your long-term balance
4. Decide if it's worth it

### Scenario 3: "What if I lose my job?"

1. Delete or pause your paycheck entries
2. Add a one-time unemployment benefit
3. See how long your current balance lasts
4. Plan accordingly

### Scenario 4: "Can I afford a new subscription?"

1. Click "New Subscription" quick preset
2. Customize the amount and description
3. Set the start day of month
4. See the recurring impact on your balance

---

## Visual Feedback

### Real-Time Updates
Every change triggers an instant forecast recalculation:
- Balance line updates immediately
- Category breakdown refreshes
- Low balance warnings appear/disappear
- Income vs expenses recalculates

### Color Coding
- **Green** = Income/deposits
- **Red** = Expenses/withdrawals
- **Gray** = Historical data
- **Purple** = Scheduled recurring items
- **Green badges** = Forecasted variable spending

### Warnings
- Red alert banner when balance goes negative
- Shows the date and minimum balance
- Helps you avoid overdrafts before they happen

---

## Pro Tips

### 💡 Tip 1: Start with accurate recurring bills
Add ALL your monthly bills first:
- Rent/mortgage
- Utilities
- Insurance
- Phone
- Internet
- Subscriptions (Netflix, Spotify, gym, etc.)
- Loan payments

### 💡 Tip 2: Include income sources
Don't forget to add:
- Paycheck (set correct bi-weekly or monthly pattern)
- Side gig income
- Investment dividends
- Regular gifts/allowances

### 💡 Tip 3: Test multiple scenarios
Create several what-if scenarios:
- Best case (bonus, extra income)
- Worst case (job loss, emergency)
- Expected case (normal spending)

### 💡 Tip 4: Use realistic amounts
Base your numbers on:
- Past bank statements
- Actual bills
- Historical spending patterns

### 💡 Tip 5: Plan ahead
- Look 90-180 days out
- Account for annual bills (insurance, taxes)
- Consider seasonal expenses (holidays, summer vacation)

---

## Example Workflows

### Workflow 1: Monthly Bill Audit

1. Set opening balance to current account balance
2. Add all recurring monthly bills
3. Add bi-weekly paycheck
4. Check if balance stays positive all month
5. If negative, identify which bill to reduce or when to pay

### Workflow 2: Emergency Fund Planning

1. Add a $3000 emergency expense scenario
2. Set it 30 days out
3. See if you can handle it
4. If not, identify how much to save weekly

### Workflow 3: Subscription Cleanup

1. Add all current subscriptions
2. See total monthly cost in category breakdown
3. Delete ones you don't use
4. Watch your forecast improve

### Workflow 4: Salary Negotiation

1. Update paycheck amount to desired salary
2. See long-term balance improvement
3. Calculate annual difference
4. Use in negotiation conversations

---

## Technical Details

### State Management
- All changes stored in React state
- Instant propagation to forecast engine
- No page refresh needed

### Data Persistence
- Currently session-based (resets on refresh)
- Future: localStorage or database
- Export/import coming soon

### Validation
- Prevents empty descriptions
- Validates number inputs
- Checks for required fields

---

## Keyboard Shortcuts (Future Feature)

Coming soon:
- `Ctrl+N` - New recurring item
- `Ctrl+O` - New one-time scenario
- `Enter` - Save current edit
- `Esc` - Cancel edit
- `Delete` - Remove selected item

---

## Mobile Experience

The spending manager is fully responsive:
- Touch-friendly buttons
- Swipe to delete (coming soon)
- Collapsible sections save screen space
- Large tap targets for easy editing

---

## What Makes This Powerful

### Traditional Budget Apps:
- Show what you've spent ✅
- Track categories ✅
- Set budgets ✅

### This Forecaster:
- Shows what you've spent ✅
- Track categories ✅
- Set budgets ✅
- **Predicts future balance** ⭐
- **Tests what-if scenarios** ⭐
- **Warns before overdrafts** ⭐
- **Shows impact of decisions** ⭐

---

## Common Questions

**Q: Why do I still see variable spending in the forecast?**
A: The AI predicts variable expenses (groceries, gas, dining) based on your historical patterns, even after you add scheduled bills.

**Q: Can I delete historical transactions?**
A: Not yet - they're used to calculate spending patterns. Future version will allow historical editing.

**Q: How accurate is the forecast?**
A: Scheduled items are 100% accurate. Variable spending is estimated based on your past behavior. The further out you look, the less accurate it becomes.

**Q: Can I save multiple scenarios?**
A: Not yet - coming in a future version. For now, take screenshots or note down different configurations.

**Q: Will my data be saved?**
A: Currently session-based. Refreshing resets to defaults. Persistence coming soon.

---

**This tool is now a full what-if calculator!** 🎉

Experiment freely - every change is reversible and updates instantly.
