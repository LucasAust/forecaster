# Bank Account Forecaster - Setup Guide

## 🎯 Overview

This is a working proof-of-concept for a predictive bank account forecasting tool. It combines:
- **Historical transaction analysis**
- **Scheduled recurring events** (paychecks, bills)
- **AI-powered statistical forecasting** (ARIMA, Prophet, or Hybrid)
- **What-if scenario planning**

## 🏗️ Architecture

### Backend (Python/Flask)
- `app.py` - Flask API server
- `forecast_engine.py` - Core forecasting logic
- Supports 3 forecast methods: Hybrid (simple), ARIMA, Prophet

### Frontend (React/Vite)
- Modern React app with Recharts for visualization
- Tailwind CSS for styling
- Interactive controls for horizon, method, and what-if scenarios

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- npm or pnpm

### Backend Setup

1. **Install Python dependencies:**
   ```powershell
   cd c:\code\forecaster
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. **Run the Flask API:**
   ```powershell
   python app.py
   ```
   
   Server runs on `http://localhost:5000`

### Frontend Setup

1. **Install Node dependencies:**
   ```powershell
   npm install
   ```

2. **Run the development server:**
   ```powershell
   npm run dev
   ```
   
   App runs on `http://localhost:3000`

## 📊 How It Works

### 1. Historical Transactions
The system takes past transaction data to understand spending patterns:
```javascript
[
  { date: "2025-10-01", amount: 2000, description: "paycheck" },
  { date: "2025-10-03", amount: -45.00, description: "groceries" }
]
```

### 2. Scheduled Events
Define recurring bills and income:
```javascript
[
  { pattern: "monthly", day: 1, amount: -1200, description: "Rent" },
  { pattern: "biweekly", weekday: 4, amount: 2000, description: "Paycheck" }
]
```

### 3. Forecast Methods

- **Hybrid** (default): Simple exponential smoothing with noise - fast and reliable
- **ARIMA**: Auto-regressive integrated moving average - good for trends
- **Prophet**: Facebook's time-series forecasting - best for complex patterns

### 4. What-If Scenarios
Test financial decisions before making them:
- Add a transfer or expense at a future date
- See how it impacts your projected balance
- Avoid overdrafts and plan better

## 🎨 Features

✅ **Visual Timeline** - See your balance over 7-365 days  
✅ **Low Balance Warnings** - Get alerts before going negative  
✅ **Multiple Forecast Methods** - Choose the best algorithm  
✅ **What-If Planning** - Test scenarios before acting  
✅ **Responsive Design** - Works on desktop and mobile  

## 🔧 API Endpoints

### GET /health
Check if API is running
```json
{ "status": "ok" }
```

### POST /forecast
Generate a balance forecast

**Request:**
```json
{
  "opening_balance": 2500,
  "transactions": [...],
  "scheduled": [...],
  "horizon_days": 30,
  "method": "hybrid"
}
```

**Response:**
```json
{
  "summary": {
    "method": "hybrid",
    "opening_balance": 2500,
    "final_balance": 2350.25
  },
  "forecast": [
    { "date": "2025-10-16", "amount": -45.00, "balance": 2455.00 },
    ...
  ]
}
```

## 🚢 Deployment Options

### Docker
```powershell
docker build -t forecaster-api .
docker run -p 5000:5000 forecaster-api
```

### Production Considerations
- Add authentication (OAuth, JWT)
- Use HTTPS
- Add rate limiting
- Implement data encryption
- Set up proper error handling and logging
- Use production WSGI server (gunicorn)

## 📈 Next Steps / Enhancements

1. **Bank Integration** - Connect to Plaid/TrueLayer for real transaction data
2. **User Accounts** - Multi-user support with saved forecasts
3. **Alerts** - Email/SMS notifications for low balance
4. **Bill Detection** - Auto-detect recurring transactions
5. **ML Improvements** - Train on user's actual data for better accuracy
6. **Mobile App** - Native iOS/Android apps
7. **Smart Recommendations** - Suggest bill payment dates, savings opportunities
8. **Multi-Account** - Forecast across checking, savings, credit cards

## 🔐 Security & Compliance

For production deployment, you'll need:
- **PCI DSS** compliance if handling payment data
- **GDPR/CCPA** compliance for data privacy
- **SOC 2** for service security
- **Encryption** at rest and in transit
- **Audit logs** for all data access
- **User consent** management

## 📚 Resources

- [Plaid API Docs](https://plaid.com/docs/)
- [Open Banking/PSD2](https://www.openbanking.org.uk/)
- [Prophet Forecasting](https://facebook.github.io/prophet/)
- [Statsmodels ARIMA](https://www.statsmodels.org/)

## 🤝 Contributing

This is a proof-of-concept demo. To improve it:
1. Test with real transaction data
2. Improve forecast accuracy
3. Add more visualization options
4. Implement user feedback loops

## 📝 License

This is a demo project for feasibility testing.

---

**Built with ❤️ using Flask, React, and AI forecasting**
