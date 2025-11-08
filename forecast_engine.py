import calendar
import math
import re
import warnings

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pandas.tseries.offsets import DateOffset

Prophet = None
_prophet_import_error = None
try:
    from prophet import Prophet  # type: ignore
except Exception as e:  # capture ImportError, RuntimeError, and others
    Prophet = None
    # store a short and long message so callers can display helpful diagnostics
    try:
        import traceback

        tb = ''.join(traceback.format_exception(type(e), e, e.__traceback__))
    except Exception:
        tb = str(e)
    _prophet_import_error = {
        "type": type(e).__name__,
        "message": str(e),
        "traceback": tb,
    }
class ForecastEngine:
    def __init__(self):
        # Common expense categories and their typical frequency patterns
        self.expense_categories = {
            'rent': {'frequency': 'monthly', 'variance': 0.0},
            'mortgage': {'frequency': 'monthly', 'variance': 0.0},
            'utilities': {'frequency': 'monthly', 'variance': 0.15},
            'internet': {'frequency': 'monthly', 'variance': 0.0},
            'phone': {'frequency': 'monthly', 'variance': 0.0},
            'insurance': {'frequency': 'monthly', 'variance': 0.0},
            'car_payment': {'frequency': 'monthly', 'variance': 0.0},
            'subscriptions': {'frequency': 'monthly', 'variance': 0.0},
            'credit_card_fee': {'frequency': 'monthly', 'variance': 0.0},
            'bank_fee': {'frequency': 'monthly', 'variance': 0.05},
            'groceries': {'frequency': 'weekly', 'variance': 0.20},
            'gas': {'frequency': 'weekly', 'variance': 0.15},
            'dining': {'frequency': 'weekly', 'variance': 0.35},
            'entertainment': {'frequency': 'weekly', 'variance': 0.40},
            'shopping': {'frequency': 'weekly', 'variance': 0.50},
            'healthcare': {'frequency': 'irregular', 'variance': 0.60},
            'gifts': {'frequency': 'seasonal', 'variance': 0.70},
            'travel': {'frequency': 'seasonal', 'variance': 0.75},
            'other': {'frequency': 'irregular', 'variance': 0.50}
        }

        # Guardrails for data-driven models
        self.min_history_points = 21
        self.min_nonzero_points = 4
        self.min_total_amount = 80.0

        # Statistical forecasting limits
        self.statistical_seasonal_period = 7
        self.statistical_max_history_days = 365
        self.statistical_recent_window_days = 180
        self.statistical_recent_total_days = 120
        self.statistical_min_recent_total = 100.0
        self.statistical_min_recent_nonzero = 4
        self.statistical_max_growth_ratio = 1.65
        self.statistical_total_growth_ratio = 1.35
        self.statistical_floor_ratio = 0.18
        self.statistical_skip_categories = {'other', 'healthcare', 'travel', 'gifts'}
        self.max_statistical_categories = 16

        # Recurring detection tuning
        self.recurring_recent_window_days = 180
        self.recurring_max_inactive_days = 120
        self.recurring_min_recency_hits = 2
        self.recurring_min_recent_occurrences = 2
        self.recurring_min_monthly_occurrences = 3
        self.recurring_min_interval_match_ratio = 0.6
        self.recurring_min_quarterly_occurrences = 3
        self.recurring_min_yearly_occurrences = 3
        self.recurring_minimum_interval = 5
        self.recurring_staleness_multiplier = 1.4

        # Behavior spending heuristics
        self.behavior_recent_days = 120
        self.behavior_max_history_days = 365
        self.behavior_min_support = 3
        self.behavior_income_min_support = 2
        self.behavior_max_events_per_week = 3
        self.behavior_spike_std_multiplier = 1.6
        self.behavior_income_spike_multiplier = 3.25
        self.behavior_low_support_categories = {
            'rent',
            'mortgage',
            'insurance',
            'internet',
            'phone',
            'utilities',
            'income',
        }
        self.behavior_extended_history_categories = {
            'rent',
            'mortgage',
            'insurance',
            'internet',
            'phone',
            'utilities',
            'income',
        }
        self.behavior_skip_categories = {'other', 'healthcare', 'travel', 'gifts'}
        self.behavior_recent_total_days = 120
        self.behavior_min_recent_total = 90.0
        self.behavior_min_recent_nonzero = 3
        self.behavior_total_growth_ratio = 1.35
        self.alias_stopwords = {
            'web', 'id', 'ppd', 'ppd', 'ppd', 'ppd', 'ppd', 'transaction', 'online', 'transfer',
            'payment', 'manual', 'autopay', 'account', 'memo', 'credit', 'debit', 'visa',
            'mastercard', 'purchase', 'sale', 'card', 'inst', 'xfer', 'to', 'from', 'llc',
            'inc', 'company', 'corp', 'co', 'pllc', 'llp', 'aba', 'ach', 'ppd', 'plc', 'na'
        }

        self.transfer_regexes = (
            r'\btransfer\b',
            r'\bxfer\b',
            r'\bach\b',
            r'\bautopay\b',
            r'\bonline\s+transfer\b',
            r'\bonline\s+payment\b',
            r'\bdeposit\s+to\b',
            r'\bdeposit\s+from\b',
            r'\bpayment\s+to\b',
            r'\bpayment\s+from\b',
        )
        self.transfer_whitelist = {
            'payroll',
            'paycheck',
            'salary',
            'bonus',
            'reimbursement',
            'refund',
            'interest',
            'dividend',
            'royalty',
            'direct deposit',
            'mobile deposit',
            'remote deposit'
        }
        self.transfer_blacklist = {
            'account transfer',
            'internal transfer',
            'payment thank you',
            'loan payment',
            'manual db',
            'bank to bank'
        }

        self.reconciliation_categories = {
            'income': {
                'polarity': 'positive',
                'min_abs': 200.0,
                'satisfied_ratio': 0.93,
                'only_increase': True,
                'max_scale': 4.0,
                'interval_days': 14,
                'max_events': 3,
            },
            'rent': {
                'polarity': 'negative',
                'min_abs': 400.0,
                'satisfied_ratio': 0.85,
                'only_increase': True,
                'max_scale': 3.5,
                'interval_days': 30,
                'max_events': 2,
            },
            'groceries': {
                'polarity': 'negative',
                'min_abs': 60.0,
                'satisfied_ratio': 0.55,
                'max_scale': 1.8,
                'interval_days': 7,
                'max_events': 4,
            },
            'dining': {
                'polarity': 'negative',
                'min_abs': 40.0,
                'satisfied_ratio': 0.50,
                'max_scale': 1.9,
                'interval_days': 7,
                'max_events': 4,
            },
            'bank_fee': {
                'polarity': 'negative',
                'min_abs': 20.0,
                'satisfied_ratio': 0.50,
                'max_scale': 3.0,
                'interval_days': 30,
                'max_events': 1,
            },
            'gas': {
                'polarity': 'negative',
                'min_abs': 40.0,
                'satisfied_ratio': 0.60,
                'max_scale': 1.7,
                'interval_days': 14,
                'max_events': 3,
            },
            'shopping': {
                'polarity': 'negative',
                'min_abs': 60.0,
                'satisfied_ratio': 0.50,
                'max_scale': 1.7,
                'interval_days': 14,
                'max_events': 3,
            },
            'subscriptions': {
                'polarity': 'negative',
                'min_abs': 40.0,
                'satisfied_ratio': 0.70,
                'max_scale': 2.6,
                'interval_days': 30,
                'max_events': 2,
            },
            'healthcare': {
                'polarity': 'negative',
                'min_abs': 80.0,
                'satisfied_ratio': 0.45,
                'max_scale': 2.2,
                'interval_days': 30,
                'max_events': 2,
            },
            'other': {
                'polarity': 'any',
                'min_abs': 80.0,
                'satisfied_ratio': 0.55,
                'max_scale': 2.4,
                'interval_days': 14,
                'max_events': 4,
            },
        }

        # Reconciliation injection cap multiplier to prevent implausibly large adjustments
        self.reconciliation_max_injection_multiplier = 2.0

        self._alias_cache = {}

        # Prophet tuning defaults
        self.prophet_interval_width = 0.85
        self.prophet_base_changepoint_scale = 0.08
        self.prophet_high_variance_changepoint_scale = 0.18
        self.prophet_seasonality_prior_scale = 10.0
        self.prophet_monthly_fourier = 5
        self.prophet_quarterly_fourier = 4

    def _normalize_description(self, description):
        """Normalize transaction descriptions for grouping."""
        if not description:
            return ""
        desc = description.lower()
        for token in ["payment", "purchase", "transaction", "pos", "debit", "credit"]:
            desc = desc.replace(token, "")
        cleaned = ''.join(ch if ch.isalnum() or ch.isspace() else ' ' for ch in desc)
        return " ".join(cleaned.split())

    @staticmethod
    def _to_naive_timestamp(value):
        if value is None or value is pd.NaT:
            return pd.NaT
        ts = pd.Timestamp(value)
        if pd.isna(ts):
            return pd.NaT
        if ts.tzinfo is not None:
            return ts.tz_convert(None)
        return ts

    @staticmethod
    def _advance_month_same_day(reference_ts, months, target_day):
        ts = ForecastEngine._to_naive_timestamp(reference_ts)
        if pd.isna(ts):
            return pd.NaT
        if target_day is None:
            target_day = ts.day

        total_months = (ts.year * 12 + (ts.month - 1)) + months
        year = total_months // 12
        month = (total_months % 12) + 1
        day = min(target_day, calendar.monthrange(year, month)[1])
        return pd.Timestamp(year=year, month=month, day=day)

    def _is_internal_transfer(self, description):
        """Identify intra-account movements that should not influence forecasts."""
        if not description:
            return False

        lowered = str(description).lower()
        normalized = re.sub(r'[^a-z0-9\s]', ' ', lowered)
        normalized = re.sub(r'\s+', ' ', normalized).strip()

        if any(phrase in normalized for phrase in self.transfer_blacklist):
            return True

        for pattern in self.transfer_regexes:
            if re.search(pattern, normalized):
                if any(phrase in normalized for phrase in self.transfer_whitelist):
                    return False
                return True

        return False

    def _sanitize_transactions(self, transactions):
        """Remove internal transfers, duplicates, and coercion issues."""
        cleaned = []
        seen = set()

        for entry in transactions or []:
            if not isinstance(entry, dict):
                continue

            description = str(entry.get('description', '') or '').strip()
            if self._is_internal_transfer(description):
                continue

            date_value = entry.get('date')
            amount_value = entry.get('amount', 0)
            try:
                amount_float = float(amount_value)
            except (TypeError, ValueError):
                continue

            normalized_date = self._to_naive_timestamp(date_value)
            if pd.isna(normalized_date):
                date_key = None
            else:
                date_key = normalized_date.strftime('%Y-%m-%d')

            normalized_desc = self._normalize_description(description)
            desc_key = normalized_desc or description.lower()

            key = (date_key, round(amount_float, 2), desc_key)
            if key in seen:
                continue
            seen.add(key)

            normalized_entry = dict(entry)
            normalized_entry['description'] = description
            normalized_entry['amount'] = amount_float

            if normalized_desc and normalized_desc in self._alias_cache:
                category = self._alias_cache[normalized_desc]
            else:
                category = self._categorize_transaction(description, amount_float)

            if normalized_desc and category and category != 'other':
                self._alias_cache[normalized_desc] = category

            normalized_entry['category'] = category if category else 'other'
            cleaned.append(normalized_entry)

        return cleaned

    def _format_alias_label(self, normalized, sample):
        base = (normalized or '').strip()
        sample_text = (sample or '').strip()
        tokens = [token for token in base.split() if token]
        filtered = []
        for token in tokens:
            lower = token.lower()
            if lower in self.alias_stopwords:
                continue
            if lower.isdigit() or lower.replace('.', '').isdigit():
                continue
            if any(ch.isdigit() for ch in lower):
                continue
            filtered.append(lower)

        if not filtered and sample_text:
            sample_clean = re.sub(r"[^a-zA-Z\s]", " ", sample_text).lower()
            for token in sample_clean.split():
                if token in self.alias_stopwords:
                    continue
                if token.isdigit():
                    continue
                if any(ch.isdigit() for ch in token):
                    continue
                filtered.append(token)

        if not filtered:
            filtered = tokens[:3]

        label = " ".join(filtered[:4]).strip()
        if not label:
            label = sample_text or base or "Other"

        return " ".join(word.capitalize() for word in label.split())

    def _category_alias_map(self, history_df):
        aliases = {}
        if history_df.empty or 'description' not in history_df.columns:
            return aliases

        working = history_df[['category', 'description', 'amount']].copy()
        working['normalized_description'] = working['description'].apply(self._normalize_description)
        working = working[working['normalized_description'].astype(bool)]
        working = working[working['amount'] < 0]
        if working.empty:
            return aliases

        grouped = (
            working.groupby(['category', 'normalized_description'])
            .agg(total=('amount', lambda values: float(np.abs(values).sum())), sample=('description', 'last'))
            .reset_index()
        )

        for category, group in grouped.groupby('category'):
            total_spend = float(group['total'].sum())
            if total_spend <= 0:
                continue

            entries = []
            for _, row in group.sort_values('total', ascending=False).iterrows():
                share = float(row['total'] / total_spend) if total_spend else 0.0
                label = self._format_alias_label(row['normalized_description'], row['sample'])
                entries.append({
                    'label': label,
                    'normalized': row['normalized_description'],
                    'raw_description': row['sample'],
                    'share': share,
                    'total': float(row['total'])
                })

            if not entries:
                continue

            primary = entries[0]
            category_title = category.replace('_', ' ').title()
            if category == 'other' or primary['share'] >= 0.35:
                display = primary['label']
            else:
                display = f"{category_title} - {primary['label']}"

            aliases[category] = {
                'display': display,
                'category_title': category_title,
                'primary': primary,
                'entries': entries[:5],
                'total_spend': total_spend
            }

        return aliases

    def _expand_scheduled(self, scheduled, start_date, horizon):
        """Generate future scheduled events (paydays, bills)."""
        start_ts = self._to_naive_timestamp(start_date)
        if pd.isna(start_ts):
            return pd.DataFrame(columns=["date", "amount", "description"])

        horizon_end = start_ts + timedelta(days=horizon)
        events = []

        for s in scheduled or []:
            pattern = str(s.get("pattern", "monthly") or "monthly").lower()
            try:
                amount = float(s.get("amount", 0))
            except (TypeError, ValueError):
                continue
            desc = str(s.get("description", "") or "").strip()

            weekday = s.get("weekday")
            if weekday is not None and str(weekday).strip().lstrip('-').isdigit():
                weekday = int(weekday) % 7
            else:
                weekday = None

            day_raw = s.get("day", 1)
            use_last_day = False
            day_value = 1
            if isinstance(day_raw, str):
                day_str = day_raw.strip().lower()
                if day_str in {"last", "end"}:
                    use_last_day = True
                elif day_str.isdigit():
                    day_value = max(int(day_str), 1)
            elif isinstance(day_raw, (int, float)):
                if isinstance(day_raw, float) and math.isnan(day_raw):
                    pass
                else:
                    day_int = int(day_raw)
                    if day_int <= 0:
                        use_last_day = True
                    else:
                        day_value = day_int

            anchor_raw = s.get("date") or s.get("last_date")
            anchor_ts = self._to_naive_timestamp(anchor_raw) if anchor_raw else start_ts
            if pd.isna(anchor_ts):
                anchor_ts = start_ts

            if pattern == "weekly" and weekday is not None:
                first_offset = (weekday - start_ts.weekday()) % 7
                current = start_ts + timedelta(days=first_offset)
                while current <= horizon_end:
                    events.append({"date": current.to_pydatetime(), "amount": amount, "description": desc})
                    current += timedelta(days=7)
            elif pattern == "biweekly" and weekday is not None:
                first_offset = (weekday - start_ts.weekday()) % 7
                current = start_ts + timedelta(days=first_offset)
                while current <= horizon_end:
                    events.append({"date": current.to_pydatetime(), "amount": amount, "description": desc})
                    current += timedelta(days=14)
            elif pattern == "monthly":
                current = anchor_ts
                if current < start_ts:
                    while current < start_ts:
                        next_candidate = self._to_naive_timestamp(current + pd.DateOffset(months=1))
                        if pd.isna(next_candidate) or next_candidate <= current:
                            break
                        current = next_candidate
                while current <= horizon_end:
                    month_last_day = calendar.monthrange(current.year, current.month)[1]
                    month_day = month_last_day if use_last_day else min(day_value, month_last_day)
                    event_date = current.replace(day=month_day)
                    if start_ts <= event_date <= horizon_end:
                        events.append({"date": event_date.to_pydatetime(), "amount": amount, "description": desc})
                    next_candidate = self._to_naive_timestamp(current + pd.DateOffset(months=1))
                    if pd.isna(next_candidate) or next_candidate <= current:
                        break
                    current = next_candidate
            elif pattern == "oneoff":
                oneoff_date = self._to_naive_timestamp(s.get("date"))
                if not pd.isna(oneoff_date) and start_ts <= oneoff_date <= horizon_end:
                    events.append({"date": oneoff_date.to_pydatetime(), "amount": amount, "description": desc})

        if events:
            return pd.DataFrame(events)
        return pd.DataFrame(columns=["date", "amount", "description"])

    def _categorize_transaction(self, description, amount=None):
        """Categorize a transaction based on description and amount sign."""
        desc = str(description or '').strip()
        if not desc:
            return 'other'

        amount_value = None
        if amount is not None:
            try:
                amount_value = float(amount)
            except (TypeError, ValueError):
                amount_value = None

        is_income_amount = amount_value is not None and amount_value > 1e-6
        is_expense_amount = amount_value is not None and amount_value < -1e-6

        desc_lower = desc.lower()
        desc_clean = re.sub(r'[^a-z0-9\s]', ' ', desc_lower)
        desc_clean = re.sub(r'\s+', ' ', desc_clean).strip()
        desc_tokens = desc_clean.split()
        normalized = self._normalize_description(desc)
        cached_category = self._alias_cache.get(normalized)
        if cached_category and not (is_income_amount and cached_category != 'income'):
            return cached_category

        def contains_any(keywords):
            for keyword in keywords:
                kw_clean = re.sub(r'[^a-z0-9\s]', ' ', str(keyword).lower()).strip()
                if not kw_clean:
                    continue
                kw_tokens = kw_clean.split()
                if len(kw_tokens) == 1:
                    token = kw_tokens[0]
                    if token in desc_tokens or any(token in existing for existing in desc_tokens):
                        return True
                else:
                    if kw_clean in desc_clean:
                        return True
            return False

        income_keywords = (
            'paycheck', 'salary', 'deposit', 'income', 'direct deposit', 'dir dep', 'payroll', 'cashout',
            'zelle payment from', 'remote online deposit', 'venmo cashout', 'cash app transfer from', 'payout',
            'refund', 'reimbursement', 'royalty', 'interest payment', 'interest credit', 'dividend', 'paypal transfer',
            'cash rewards', 'ach credit', 'bank interest'
        )
        if contains_any(income_keywords) and 'security deposit' not in desc_lower:
            if not is_expense_amount:
                return 'income'

        if is_income_amount and not contains_any({'payment to', 'transfer to'}):
            return 'income'

        rent_keywords = ('rent', 'lease', 'bilt rent', 'bilt payment', 'property management')
        if contains_any(rent_keywords):
            return 'rent'

        mortgage_keywords = ('mortgage', 'home loan', 'loan payment', 'lendinghome')
        if contains_any(mortgage_keywords):
            return 'mortgage'

        utilities_keywords = (
            'electric', 'electricity', 'water', 'sewer', 'trash', 'utility', 'utilities', 'power', 'gas bill',
            'ladwp', 'socalgas', 'coned', 'con ed', 'nyseg', 'pge', 'pg&e', 'sdge', 'dte energy', 'dominion energy',
            'national grid', 'duke energy', 'xcel energy'
        )
        if contains_any(utilities_keywords):
            return 'utilities'

        internet_keywords = (
            'internet', 'wifi', 'broadband', 'spectrum', 'xfinity', 'comcast', 'cox internet', 'cox communications',
            'verizon fios', 'fios', 'fiber', 'starlink', 'at&t internet', 'att internet', 'frontier', 'google fiber'
        )
        if contains_any(internet_keywords):
            return 'internet'

        phone_keywords = (
            'phone', 'mobile', 'cellular', 'wireless', 'verizon', 't-mobile', 'tmobile', 'at&t', 'att ', 'sprint',
            'mint mobile', 'visible', 'cricket wireless', 'boost mobile', 'google fi', 'metro pcs'
        )
        if contains_any(phone_keywords):
            return 'phone'

        insurance_keywords = (
            'insurance', 'geico', 'state farm', 'progressive', 'allstate', 'nationwide', 'usaa', 'liberty mutual',
            'anthem', 'blue cross', 'blue shield', 'aetna', 'metlife', 'guardian', 'humana', 'policy premium'
        )
        if contains_any(insurance_keywords):
            return 'insurance'

        car_payment_keywords = (
            'car payment', 'auto loan', 'vehicle loan', 'auto finance', 'car note', 'ford credit', 'toyota financial',
            'honda financial', 'ally auto', 'capital one auto', 'gm financial'
        )
        if contains_any(car_payment_keywords):
            return 'car_payment'

        subscription_keywords = (
            'netflix', 'spotify', 'subscription', 'hulu', 'disney', 'digitalocean', 'supabase', 'openai', 'chatgpt',
            'creem', 'max.com', 'max streaming', 'apple.com/bill', 'apple.com bill', 'apple media', 'youtube premium',
            'yt premium', 'google storage', 'google *', 'microsoft 365', 'adobe', 'canva', 'notion', 'dropbox',
            'icloud', 'patreon', 'onlyfans', 'substack', 'calm.com', 'headspace'
        )
        if contains_any(subscription_keywords):
            return 'subscriptions'

        gas_keywords = (
            'gas station', 'fuel', 'shell', 'chevron', 'exxon', 'bp ', 'bp-', 'bp\'', 'texaco', 'arco', 'sunoco',
            '76 station', '76 gas', 'mobil', 'costco gas', 'speedway', 'valero', 'conoco', 'marathon', 'circle k',
            'racetrac', 'race trac', 'pilot travel', 'loves travel', "love's", 'quiktrip', 'qt ', 'citgo',
            'caseys', 'sheetz', 'kum & go', 'fuel center', 'gasoline'
        )
        if contains_any(gas_keywords) or desc_lower.endswith(' gas') or ' fuel ' in desc_lower:
            return 'gas'

        grocery_keywords = (
            'grocery', 'grocer', 'supermarket', 'market', 'whole foods', 'wholefoods', 'trader joe', "trader joe's",
            'aldi', 'heb', 'h-e-b', 'sprouts', 'wegmans', 'meijer', 'winco', 'food lion', 'fresh market',
            'fresh thyme', 'grocery outlet', '99 ranch', 'hmart', 'h-mart', 'piggly wiggly', 'save mart',
            'smart & final', 'shoprite', 'stop & shop', 'stop and shop', 'giant food', 'giant eagle', 'ralphs',
            'publix', 'vons', 'costco', 'bjs wholesale', "bj's", 'sams club', "sam's club", 'metro market',
            'kroger', "king soopers", "fry's food", 'dillons', 'new seasons', 'market basket', 'fairway market',
            'food 4 less', 'sprouts farmers market', 'wholefoods market'
        )
        if contains_any(grocery_keywords):
            return 'groceries'

        dining_keywords = (
            'restaurant', 'dining', 'cafe', 'coffee', 'starbucks', 'mcdonald', 'chipotle', 'burger', 'pizza', 'grill',
            'kitchen', 'bar & grill', 'pub', 'brew', 'ubereats', 'uber eats', 'doordash', 'door dash', 'grubhub',
            'postmates', 'seamless', 'caviar', 'panera', 'sweetgreen', 'shake shack', 'in-n-out', 'taco', 'sushi',
            'ramen', 'chick-fil', 'popeyes', 'wendys', 'dunkin', 'five guys', 'panda express', 'coffee bean',
            'peets', 'jersey mike', 'jimmy john', 'del taco', 'raising cane', 'pret a manger', 'wingstop', 'bojangles'
        )
        if contains_any(dining_keywords):
            return 'dining'

        entertainment_keywords = (
            'movie', 'cinema', 'concert', 'entertainment', 'theater', 'amc', 'regal', 'ticketmaster', 'fandango',
            'game stop', 'gamestop', 'spotify live', 'eventbrite'
        )
        if contains_any(entertainment_keywords):
            return 'entertainment'

        gift_keywords = ('gift', 'present', 'christmas', 'holiday', 'flowers.com', '1-800-flowers', 'ftd.com')
        if contains_any(gift_keywords):
            return 'gifts'

        travel_keywords = (
            'travel', 'airline', 'hotel', 'flight', 'vacation', 'airbnb', 'lyft', 'uber', 'delta', 'united',
            'american airlines', 'southwest', 'spirit air', 'jetblue', 'alaska airlines', 'amtrak', 'greyhound',
            'marriott', 'hilton', 'hyatt', 'ihg', 'hampton inn', 'holiday inn', 'best western', 'enterprise rent',
            'hertz', 'avis', 'budget car', 'turo', 'lyft ride', 'uber trip', 'ride share', 'rideshare'
        )
        if contains_any(travel_keywords):
            return 'travel'

        shopping_keywords = (
            'amazon', 'store', 'shopping', 'mall', 'target', 'walmart', 'best buy', 'ikea', 'apple store',
            'apple.com', 'lowes', 'home depot', 'costco.com', 'ulta', 'sephora', 'nordstrom', 'macys', 'foot locker',
            'nike', 'adidas', 'lululemon', 'rei', 'guitar center', 'micro center', 'staples', 'office depot', 'wayfair',
            'etsy', 'ebay', 'poshmark', 'fiverr', 'shein', 'temu', 'currys', 'bloomingdale', 'uniqlo'
        )
        if contains_any(shopping_keywords):
            return 'shopping'

        bank_fee_keywords = (
            'fee', 'interest', 'finance charge', 'overdraft', 'nsf', 'service charge', 'maintenance fee', 'atm fee',
            'monthly service', 'wire fee', 'chargeback', 'returned item fee', 'insufficient funds', 'late fee',
            'foreign transaction fee'
        )
        if contains_any(bank_fee_keywords):
            if is_income_amount:
                return 'income'
            if 'credit' in desc_lower or 'card' in desc_lower:
                return 'credit_card_fee'
            return 'bank_fee'

        healthcare_keywords = (
            'doctor', 'hospital', 'pharmacy', 'medical', 'health', 'clinic', 'urgent care', 'dental', 'dentist',
            'orthodont', 'vision', 'optomet', 'optical', 'labcorp', 'quest diagnostics', 'cvs pharmacy', 'walgreens',
            'rite aid', 'goodrx', 'optum', 'kaiser', 'sutter health', 'cleveland clinic'
        )
        if contains_any(healthcare_keywords):
            return 'healthcare'

        if is_income_amount:
            return 'income'

        if is_expense_amount and any(keyword in desc_lower for keyword in ('payment', 'transfer to', 'withdrawal')):
            return 'other'

        return 'other'

    def _analyze_spending_patterns(self, transactions):
        """Analyze historical spending patterns by category."""
        if not transactions:
            return {}
        
        df = pd.DataFrame(transactions)
        df["date"] = pd.to_datetime(df["date"])
        df["amount"] = df["amount"].astype(float)
        df["category"] = df["description"].apply(self._categorize_transaction)
        
        # Only analyze expenses (negative amounts)
        expenses = df[df["amount"] < 0].copy()
        expenses["amount_abs"] = expenses["amount"].abs()
        
        # Calculate average spending by category
        category_stats = {}
        for category in expenses["category"].unique():
            cat_data = expenses[expenses["category"] == category]["amount_abs"]
            category_stats[category] = {
                'avg': cat_data.mean(),
                'std': cat_data.std() if len(cat_data) > 1 else cat_data.mean() * 0.2,
                'count': len(cat_data),
                'total': cat_data.sum()
            }
        
        return category_stats

    def _generate_baseline(self, opening_balance, transactions):
        """Prepare baseline transaction history."""
        if not transactions:
            return pd.DataFrame(columns=["date", "amount", "balance", "category"])
        df = pd.DataFrame(transactions)
        df["date"] = pd.to_datetime(df["date"])
        df["amount"] = df["amount"].astype(float)
        if "category" in df.columns:
            df["category"] = df["category"].fillna("other")
        else:
            df["category"] = df.apply(
                lambda row: self._categorize_transaction(row.get("description", ""), row.get("amount")),
                axis=1
            )
        df = df.sort_values("date")
        df["balance"] = opening_balance + df["amount"].cumsum()
        return df

    def _determine_pattern(self, intervals):
        """Infer recurrence pattern from observed intervals."""
        if len(intervals) == 0:
            return None, {}

        median_interval = float(np.median(intervals))

        if median_interval <= 8:
            return 'weekly', {'step_days': 7}
        if median_interval <= 16:
            return 'biweekly', {'step_days': 14}
        if median_interval <= 35:
            return 'monthly', {'offset': DateOffset(months=1)}
        if median_interval <= 95:
            return 'quarterly', {'offset': DateOffset(months=3)}
        if median_interval <= 400:
            return 'yearly', {'offset': DateOffset(years=1)}

        return None, {}

    def _detect_recurring_transactions(self, df):
        """Detect recurring debits/credits from historical data."""
        recurring = []
        if df.empty:
            return recurring

        df = df.copy()
        if 'date' not in df.columns:
            return recurring
        df['date'] = pd.to_datetime(df['date'])
        df['normalized_description'] = df['description'].apply(self._normalize_description)

        history_end = df['date'].max()
        if pd.isna(history_end):
            history_end_dt = datetime.today()
        else:
            history_end_dt = pd.to_datetime(history_end).to_pydatetime()
        recent_start = history_end_dt - timedelta(days=self.recurring_recent_window_days)

        for desc_key, group in df.groupby('normalized_description'):
            if not desc_key:
                continue

            group = group.sort_values('date')
            count = len(group)
            if count < 2:
                continue

            unique_day_count = group['date'].dt.normalize().nunique()
            if unique_day_count < 2:
                continue

            intervals = group['date'].diff().dropna().dt.days.values
            pattern, _ = self._determine_pattern(intervals)
            if not pattern:
                continue

            if pattern in ('weekly', 'biweekly') and count < 3:
                continue
            if pattern == 'monthly' and count < self.recurring_min_monthly_occurrences:
                continue
            if pattern == 'quarterly' and count < self.recurring_min_quarterly_occurrences:
                continue
            if pattern == 'yearly' and count < self.recurring_min_yearly_occurrences:
                continue

            median_interval_value = None
            if intervals.size > 0:
                median_interval_value = float(np.median(intervals))
                if median_interval_value < self.recurring_minimum_interval:
                    continue
                if median_interval_value <= 8:
                    tolerance = 1
                elif median_interval_value <= 16:
                    tolerance = 2
                elif median_interval_value <= 35:
                    tolerance = 5
                else:
                    tolerance = 10
                match_ratio = float((np.abs(intervals - median_interval_value) <= tolerance).sum()) / len(intervals)
                if match_ratio < self.recurring_min_interval_match_ratio:
                    continue

            avg_amount = group['amount'].mean()
            if abs(avg_amount) < 1:
                continue

            std_amount = float(group['amount'].std() or 0)
            if std_amount and abs(std_amount) > abs(avg_amount) * 0.75:
                continue

            category = 'income' if avg_amount > 0 else (
                group['category'].mode().iloc[0] if not group['category'].mode().empty else 'other'
            )
            if category in getattr(self, 'behavior_skip_categories', set()) and avg_amount < 0:
                continue
            weekday_mode = int(group['date'].dt.weekday.mode().iloc[0])
            day_mode = int(group['date'].dt.day.mode().iloc[0])
            last_date_ts = group['date'].max()
            try:
                last_date_dt = last_date_ts.to_pydatetime()
            except AttributeError:
                last_date_dt = pd.to_datetime(last_date_ts).to_pydatetime()

            inactive_days = (history_end_dt - last_date_dt).days
            if inactive_days > self.recurring_max_inactive_days:
                continue

            if median_interval_value:
                staleness_limit = max(self.recurring_minimum_interval, median_interval_value * self.recurring_staleness_multiplier)
                if inactive_days > staleness_limit:
                    continue

            recent_count = int((group['date'] >= recent_start).sum())
            if recent_count < self.recurring_min_recency_hits:
                continue

            recurring.append({
                'description': group['description'].iloc[-1],
                'normalized_description': desc_key,
                'amount': float(avg_amount),
                'last_amount': float(group['amount'].iloc[-1]),
                'category': category,
                'pattern': pattern,
                'weekday': weekday_mode,
                'day': day_mode,
                'last_date': last_date_dt,
                'std_amount': std_amount,
                'type': 'income' if avg_amount > 0 else 'expense'
            })

        return recurring

    def _seasonality_factors(self, df):
        """Compute per-category monthly adjustment factors."""
        factors = {}
        if df.empty:
            return factors

        df = df.copy()
        df['month'] = df['date'].dt.month

        for category, cat_group in df.groupby('category'):
            base_avg = cat_group['amount'].abs().mean()
            if not base_avg or np.isnan(base_avg):
                continue

            for month, month_group in cat_group.groupby('month'):
                month_avg = month_group['amount'].abs().mean()
                if month_avg and not np.isnan(month_avg):
                    factors[(category, month)] = float(month_avg / base_avg)

        return factors

    def _seasonal_adjust(self, amount, category, target_date, seasonality):
        if amount == 0:
            return 0.0
        month = target_date.month
        factor = seasonality.get((category, month), 1.0)
        if category in self.behavior_extended_history_categories:
            factor = 1.0
        else:
            if amount < 0:
                if factor > 1.5:
                    factor = 1.5
                if factor < 0.65:
                    factor = 0.65
            else:
                if factor < 0.7:
                    factor = 0.7
                if factor > 1.8:
                    factor = 1.8
        return float(amount * factor)

    def _compute_expected_total(self, history_df, category, horizon, polarity='any'):
        if history_df.empty or 'date' not in history_df.columns:
            return None

        cat_df = history_df[history_df['category'] == category]
        if cat_df.empty:
            return None

        if polarity == 'positive':
            cat_df = cat_df[cat_df['amount'] > 1e-6]
        elif polarity == 'negative':
            cat_df = cat_df[cat_df['amount'] < -1e-6]
        else:
            cat_df = cat_df[cat_df['amount'].abs() > 1e-6]

        if cat_df.empty:
            return None

        cat_df = cat_df.copy()
        cat_df['date'] = pd.to_datetime(cat_df['date'], errors='coerce')
        cat_df = cat_df.dropna(subset=['date'])
        if cat_df.empty:
            return None

        cat_series = cat_df.set_index('date')['amount'].sort_index()
        if cat_series.empty:
            return None

        monthly_totals = cat_series.resample('MS').sum()
        monthly_totals = monthly_totals[monthly_totals.abs() > 1e-6]
        monthly_baseline = None
        if not monthly_totals.empty:
            window = monthly_totals.tail(min(len(monthly_totals), 6))
            if not window.empty:
                monthly_baseline = float(window.median())

        if monthly_baseline is None:
            aggregate_total = float(cat_series.sum())
            months = max(len(cat_series) / 4.0, 1.0)
            monthly_baseline = aggregate_total / months if months else aggregate_total

        horizon_scale = max(horizon / 30.0, 0.5)
        monthly_projection = monthly_baseline * horizon_scale

        candidates = [monthly_projection]

        lookback_days = max(90, horizon * 2)
        recent_cutoff = cat_series.index.max() - pd.Timedelta(days=lookback_days)
        recent_series = cat_series[cat_series.index >= recent_cutoff]
        if not recent_series.empty:
            recent_span = max((recent_series.index.max() - recent_series.index.min()).days + 1, 1)
            recent_daily = float(recent_series.sum()) / recent_span
            candidates.append(recent_daily * horizon)

            diffs = recent_series.index.to_series().diff().dt.days.dropna()
            if not diffs.empty:
                median_gap = max(float(np.median(diffs)), 1.0)
                projected_events = max(int(math.ceil(horizon / median_gap)), 1)
                median_amount = float(np.median(recent_series.values))
                candidates.append(median_amount * projected_events)

        total_span = max((cat_series.index.max() - cat_series.index.min()).days + 1, 1)
        if total_span > 0:
            daily_avg = float(cat_series.sum()) / total_span
            candidates.append(daily_avg * horizon)

        candidates = [value for value in candidates if not math.isnan(value) and abs(value) > 1e-6]
        if not candidates:
            return None

        baseline = float(np.median(candidates)) if len(candidates) > 1 else float(candidates[0])

        if polarity == 'positive':
            percentile_value = float(np.percentile(candidates, 70)) if len(candidates) > 1 else baseline
            baseline = max(baseline, percentile_value)
        elif polarity == 'negative':
            percentile_value = float(np.percentile(candidates, 30)) if len(candidates) > 1 else baseline
            baseline = min(baseline, percentile_value)

        return baseline

    def _apply_category_targets(self, combined_df, history_df, start_date, horizon):
        if combined_df.empty or 'type' not in combined_df.columns:
            return combined_df

        forecast_mask = (combined_df['type'] == 'forecast') & (combined_df['date'] >= start_date)
        if not forecast_mask.any():
            return combined_df

        if history_df.empty or not getattr(self, 'reconciliation_categories', None):
            return combined_df

        combined_df = combined_df.copy()
        injected_rows = []

        def _compute_capped_event_amount(category_name, total_amount, events_count):
            if events_count <= 0:
                return 0.0

            recent_total_abs = 0.0
            recent_cat_hist = history_df[history_df['category'] == category_name]
            if not recent_cat_hist.empty:
                recent_cutoff = start_date - timedelta(days=120)
                recent_window = recent_cat_hist[
                    (recent_cat_hist['date'] >= recent_cutoff) & (recent_cat_hist['date'] < start_date)
                ]
                if not recent_window.empty:
                    recent_total_abs = float(recent_window['amount'].abs().sum())

            raw_event_amount = total_amount / events_count
            cap_basis = max(abs(total_amount), recent_total_abs, 1.0)
            max_allowed = cap_basis * self.reconciliation_max_injection_multiplier

            if total_amount == 0.0:
                capped_event_amount = 0.0
            else:
                sign = -1.0 if total_amount < 0 else 1.0
                capped_event_amount = sign * min(abs(raw_event_amount), max_allowed)

            if abs(raw_event_amount) > abs(capped_event_amount) + 1e-9:
                warnings.warn(
                    (
                        f"Reconciliation injection for category '{category_name}' capped from {raw_event_amount:.2f} to "
                        f"{capped_event_amount:.2f} (limit {max_allowed:.2f})."
                    )
                )

            return float(capped_event_amount)

        for category, config in self.reconciliation_categories.items():
            polarity = config.get('polarity', 'any')
            target_total = self._compute_expected_total(history_df, category, horizon, polarity=polarity)

            if target_total is None and category == 'other':
                other_hist = history_df[history_df['category'] == 'other']
                if not other_hist.empty:
                    recent_cutoff = start_date - timedelta(days=120)
                    recent_window = other_hist[(other_hist['date'] >= recent_cutoff) & (other_hist['date'] < start_date)]
                    if not recent_window.empty:
                        recent_means = recent_window.set_index('date')['amount'].resample('MS').mean()
                        if not recent_means.empty:
                            target_total = float(recent_means.tail(min(len(recent_means), 3)).mean()) * max(horizon / 30.0, 0.5) * 0.5

            if target_total is None:
                continue

            min_abs = config.get('min_abs')
            if min_abs is not None and abs(target_total) < min_abs:
                continue

            cat_mask = forecast_mask & (combined_df['category'] == category)
            predicted_total = float(combined_df.loc[cat_mask, 'amount'].sum()) if cat_mask.any() else 0.0

            if cat_mask.any() and predicted_total * target_total < 0:
                combined_df.loc[cat_mask, 'amount'] = 0.0
                predicted_total = 0.0

            satisfied_ratio = config.get('satisfied_ratio')
            required_magnitude = abs(target_total) * (satisfied_ratio if satisfied_ratio is not None else 1.0)
            if predicted_total * target_total > 0 and abs(predicted_total) >= required_magnitude:
                continue

            if abs(predicted_total) < 1e-6:
                if cat_mask.any():
                    per_entry = target_total / max(int(cat_mask.sum()), 1)
                    combined_df.loc[cat_mask, 'amount'] = per_entry
                else:
                    interval_days = max(int(config.get('interval_days', 7)), 1)
                    max_events = max(int(config.get('max_events', 4)), 1)
                    estimated_events = math.ceil(horizon / interval_days) if interval_days else horizon
                    if estimated_events <= 0:
                        estimated_events = 1
                    num_events = max(1, min(max_events, estimated_events))
                    event_amount = _compute_capped_event_amount(category, target_total, num_events)
                    for idx in range(num_events):
                        day_offset = min(idx * interval_days, max(horizon - 1, 0))
                        event_date = start_date + timedelta(days=day_offset)
                        injected_rows.append({
                            'date': event_date,
                            'amount': float(event_amount),
                            'category': category,
                            'description': f"{category.replace('_', ' ').title()} baseline adjustment",
                            'type': 'forecast',
                            'projection_source': 'reconciliation'
                        })
                continue

            scale = target_total / predicted_total if abs(predicted_total) > 1e-6 else 1.0

            if config.get('only_increase', False):
                adjusted_total = predicted_total * scale
                if abs(adjusted_total) + 1e-6 < abs(predicted_total):
                    continue

            max_scale = config.get('max_scale')
            if max_scale is not None:
                if scale > 0:
                    scale = min(scale, max_scale)
                else:
                    scale = max(scale, -max_scale)

            min_scale = config.get('min_scale')
            if min_scale is not None:
                if scale > 0:
                    scale = max(scale, min_scale)
                else:
                    scale = min(scale, -min_scale)

            combined_df.loc[cat_mask, 'amount'] = combined_df.loc[cat_mask, 'amount'] * scale

            adjusted_total = float(combined_df.loc[cat_mask, 'amount'].sum()) if cat_mask.any() else 0.0
            meets_requirement = (
                adjusted_total * target_total > 0
                and abs(adjusted_total) >= required_magnitude
            )

            if meets_requirement:
                continue

            residual = target_total - adjusted_total
            if abs(residual) < 1e-6:
                continue

            if config.get('only_increase', False) and residual * target_total <= 0:
                continue

            interval_days = max(int(config.get('interval_days', 7)), 1)
            max_events = max(int(config.get('max_events', 4)), 1)
            estimated_events = math.ceil(horizon / interval_days) if interval_days else horizon
            if estimated_events <= 0:
                estimated_events = 1
            num_events = max(1, min(max_events, estimated_events))
            per_event = _compute_capped_event_amount(category, residual, num_events)

            for idx in range(num_events):
                day_offset = min(idx * interval_days, max(horizon - 1, 0))
                event_date = start_date + timedelta(days=day_offset)
                injected_rows.append({
                    'date': event_date,
                    'amount': float(per_event),
                    'category': category,
                    'description': f"{category.replace('_', ' ').title()} reconciliation",
                    'type': 'forecast',
                    'projection_source': 'reconciliation'
                })

        if injected_rows:
            combined_df = pd.concat([combined_df, pd.DataFrame(injected_rows)], ignore_index=True)

        return combined_df

    def _build_daily_category_series(self, history_df):
        """Aggregate historical data into dense daily series per category."""
        series_map = {}
        if history_df.empty:
            return series_map

        if 'date' not in history_df.columns or 'amount' not in history_df.columns:
            return series_map

        df = history_df[['date', 'amount', 'category']].copy()
        df['category'] = df['category'].fillna('other')
        df = df.dropna(subset=['date'])
        if df.empty:
            return series_map

        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values('date')

        for category, group in df.groupby('category'):
            try:
                series = (
                    group.set_index('date')['amount']
                    .sort_index()
                    .resample('D')
                    .sum()
                    .astype(float)
                )
            except Exception:
                continue

            if series.empty:
                continue

            full_index = pd.date_range(series.index.min(), series.index.max(), freq='D')
            series = series.reindex(full_index, fill_value=0.0)

            if len(series) > self.statistical_max_history_days:
                series = series.iloc[-self.statistical_max_history_days:]

            non_zero_points = int((series.abs() > 1e-6).sum())
            if len(series) < self.min_history_points:
                continue
            if non_zero_points < self.min_nonzero_points:
                continue

            total_abs = float(series.abs().sum())
            if total_abs < self.min_total_amount:
                continue

            series_map[category] = series

        return series_map

    def _forecast_with_prophet(self, series, start_date, horizon):
        """Forecast daily values using Prophet for the provided category series."""
        if Prophet is None or horizon <= 0:
            return None

        history_index = pd.to_datetime(series.index)
        if getattr(history_index, 'tz', None) is not None:
            history_index = history_index.tz_convert(None)
        history = pd.DataFrame({'ds': history_index, 'y': series.values.astype(float)})

        if history.empty:
            return None

        last_history_date = history['ds'].max()
        start_ts = self._to_naive_timestamp(start_date)
        if pd.isna(start_ts):
            start_ts = last_history_date + pd.Timedelta(days=1)
        history_span_days = max(1, (last_history_date - history['ds'].min()).days + 1)

        neg_mass = abs(float(history.loc[history['y'] < 0, 'y'].sum()))
        pos_mass = float(history.loc[history['y'] > 0, 'y'].sum())
        is_expense = neg_mass >= max(pos_mass, 1.0)

        if history['y'].abs().sum() < 1e-6:
            return None

        gap_days = max(0, (start_ts - (last_history_date + pd.Timedelta(days=1))).days)
        total_periods = horizon + gap_days
        if total_periods <= 0:
            return None

        rolling_window = min(30, len(history))
        rolling_std = float(history['y'].rolling(window=rolling_window, min_periods=1).std().median() or 0.0)
        rolling_mean = float(history['y'].rolling(window=rolling_window, min_periods=1).mean().median() or 0.0)
        variance_ratio = abs(rolling_std) / max(abs(rolling_mean), 1.0)

        changepoint_scale = self.prophet_base_changepoint_scale
        if variance_ratio > 1.2 or history_span_days < 120:
            changepoint_scale = self.prophet_high_variance_changepoint_scale

        try:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore")
                model = Prophet(
                    growth='flat',
                    daily_seasonality=False,
                    weekly_seasonality=True,
                    yearly_seasonality=True,
                    seasonality_mode='multiplicative',
                    changepoint_prior_scale=changepoint_scale,
                    seasonality_prior_scale=self.prophet_seasonality_prior_scale,
                    interval_width=self.prophet_interval_width,
                )
                model.add_seasonality('monthly', period=30.5, fourier_order=self.prophet_monthly_fourier)
                if history_span_days > 200:
                    model.add_seasonality('quarterly', period=91.25, fourier_order=self.prophet_quarterly_fourier)
                model.add_seasonality('biweekly', period=14.0, fourier_order=3)
                model.fit(history)
                future = model.make_future_dataframe(
                    periods=total_periods,
                    freq='D',
                    include_history=False
                )
                forecast = model.predict(future)
        except Exception:
            return None

        if forecast.empty:
            return None

        future_series = forecast.set_index('ds')['yhat']
        future_series.index = pd.to_datetime(future_series.index)
        if getattr(future_series.index, 'tz', None) is not None:
            future_series.index = future_series.index.tz_convert(None)

        if is_expense:
            future_series = -future_series.abs()
        else:
            future_series = future_series.clip(lower=0.0)

        desired_index = pd.date_range(start=start_ts, periods=horizon, freq='D')
        aligned = future_series.reindex(desired_index)
        if aligned.isnull().all():
            return None

        aligned = aligned.ffill().bfill().fillna(0.0)

        if is_expense:
            aligned = -aligned.abs()
        else:
            aligned = aligned.clip(lower=0.0)

        aligned.index = pd.to_datetime(aligned.index)
        return aligned

    def _snap_category_events(self, events, preferred_dom, preferred_weekday, start_date, horizon):
        snapped = []
        if not events:
            return snapped

        if preferred_dom is None and preferred_weekday is None:
            return events

        start_ts = self._to_naive_timestamp(start_date)
        if pd.isna(start_ts):
            return events
        end_ts = start_ts + pd.Timedelta(days=horizon)
        used_dates = set()

        for evt in events:
            original = self._to_naive_timestamp(evt.get('date'))
            if pd.isna(original):
                continue
            candidate = original

            if preferred_dom is not None:
                dom = min(preferred_dom, calendar.monthrange(candidate.year, candidate.month)[1])
                candidate = candidate.replace(day=dom)

            if preferred_weekday is not None:
                weekday_diff = (preferred_weekday - candidate.weekday()) % 7
                if weekday_diff <= 3:
                    candidate = candidate + pd.Timedelta(days=weekday_diff)
                else:
                    candidate = candidate - pd.Timedelta(days=7 - weekday_diff)

            if candidate < start_ts:
                candidate = start_ts
            if candidate > end_ts:
                candidate = end_ts

            candidate_key = candidate.normalize()
            while candidate_key in used_dates and candidate <= end_ts:
                candidate = candidate + pd.Timedelta(days=1)
                candidate_key = candidate.normalize()

            used_dates.add(candidate_key)
            snapped_evt = dict(evt)
            snapped_evt['date'] = candidate.to_pydatetime()
            snapped.append(snapped_evt)

        return snapped

    def _generate_statistical_forecast(self, history_df, recurring_categories, start_date, horizon, seasonality, category_aliases=None):
        """Project category trends using the Prophet time-series model."""
        events = []
        insights = []
        if history_df.empty or horizon <= 0 or Prophet is None:
            return pd.DataFrame(columns=['date', 'amount', 'category', 'description']), insights

        series_map = self._build_daily_category_series(history_df)
        if not series_map:
            return pd.DataFrame(columns=['date', 'amount', 'category', 'description']), insights

        recurring_categories = set(recurring_categories or [])
        ranked = sorted(series_map.items(), key=lambda item: item[1].abs().sum(), reverse=True)
        if self.max_statistical_categories:
            ranked = ranked[:self.max_statistical_categories]

        seasonality = seasonality or {}
        category_aliases = category_aliases or {}

        for category, series in ranked:
            if category in recurring_categories:
                continue
            if self.statistical_skip_categories and category in self.statistical_skip_categories:
                continue

            history_window = series
            if self.statistical_recent_window_days and len(series) > self.statistical_recent_window_days:
                history_window = series.iloc[-self.statistical_recent_window_days:]

            if float(history_window.abs().sum()) < self.min_total_amount:
                continue

            recent_window = history_window
            if self.statistical_recent_total_days and len(history_window) > self.statistical_recent_total_days:
                recent_window = history_window.iloc[-self.statistical_recent_total_days:]

            recent_nonzero = int((recent_window.abs() > 1e-6).sum())
            if recent_nonzero < self.statistical_min_recent_nonzero:
                continue

            recent_negative = recent_window[recent_window < 0]
            if recent_negative.empty:
                continue

            recent_span_days = max((recent_negative.index.max() - recent_negative.index.min()).days + 1, 1)
            recent_abs_sum = float(recent_negative.abs().sum())
            recent_daily_abs = recent_abs_sum / recent_span_days
            recent_total_abs = recent_daily_abs * max(horizon, 1)

            if recent_total_abs < self.statistical_min_recent_total:
                continue

            forecast_series = self._forecast_with_prophet(series, start_date, horizon)
            if forecast_series is None or forecast_series.empty:
                continue

            net_amount = float(history_window.sum())
            if net_amount >= -1.0:
                # Skip categories without meaningful net outflow
                continue

            forecast_series = forecast_series.where(forecast_series <= 0, -forecast_series.abs())

            history_abs = history_window.abs()
            finite_abs = history_abs[history_abs > 0]
            if finite_abs.empty:
                continue

            percentile_95 = float(np.nan_to_num(np.percentile(finite_abs, 95), nan=0.0))
            trimmed_abs = finite_abs[finite_abs <= percentile_95] if percentile_95 > 0 else finite_abs
            if trimmed_abs.empty:
                trimmed_abs = finite_abs

            median_abs = float(np.nan_to_num(trimmed_abs.median(), nan=0.0))
            mean_abs = float(np.nan_to_num(trimmed_abs.mean(), nan=0.0))
            percentile_90 = float(np.nan_to_num(np.percentile(trimmed_abs, 90), nan=0.0))

            threshold = max(0.5, median_abs * 0.15, mean_abs * 0.1)

            baseline_scale = max(median_abs, mean_abs, 1.0)
            growth_cap = baseline_scale * self.statistical_max_growth_ratio
            clamp_limit = max(baseline_scale, min(percentile_90, growth_cap))
            floor_limit = max(0.5, median_abs * self.statistical_floor_ratio)

            category_events = []
            alias_info = category_aliases.get(category) if category_aliases else None
            display_name = alias_info.get('display') if alias_info else category.replace('_', ' ').title()
            for date, value in forecast_series.items():
                adjusted_value = self._seasonal_adjust(value, category, date, seasonality) if seasonality else value
                if abs(adjusted_value) < threshold:
                    continue
                magnitude = min(abs(adjusted_value), clamp_limit)
                if magnitude < floor_limit:
                    continue
                adjusted = magnitude if adjusted_value > 0 else -magnitude
                category_events.append({
                    'date': date,
                    'amount': float(adjusted),
                    'category': category,
                    'description': f'{display_name} trend forecast',
                    'source': 'prophet'
                })

            if category_events:
                predicted_total = sum(abs(evt['amount']) for evt in category_events)
                baseline_total = baseline_scale * max(min(len(category_events), horizon), 1)
                cap_basis = max(recent_total_abs, baseline_total, 1.0)
                total_cap = cap_basis * self.statistical_total_growth_ratio

                if predicted_total > total_cap:
                    shrink_factor = total_cap / predicted_total if predicted_total else 1.0
                    if shrink_factor < 0.35:
                        continue
                    for evt in category_events:
                        evt['amount'] = float(evt['amount'] * shrink_factor)

                history_dates = history_window.index
                preferred_dom = None
                preferred_weekday = None
                if len(history_dates) >= 3:
                    dom_counts = history_dates.day.value_counts()
                    if not dom_counts.empty:
                        preferred_dom = int(dom_counts.idxmax())
                    weekday_counts = history_dates.weekday.value_counts()
                    if not weekday_counts.empty:
                        preferred_weekday = int(weekday_counts.idxmax())
                category_events = self._snap_category_events(
                    category_events,
                    preferred_dom,
                    preferred_weekday,
                    start_date,
                    horizon,
                )

            if not category_events:
                continue

            events.extend(category_events)

            horizon_total = sum(evt['amount'] for evt in category_events)
            first_date = min(evt['date'] for evt in category_events)
            insight_type = 'expense'
            average_amount = float(abs(horizon_total) / max(len(category_events), 1))
            alias_meta = None
            if alias_info:
                alias_meta = {
                    'primary': alias_info.get('primary'),
                    'examples': alias_info.get('entries'),
                    'total_spend': alias_info.get('total_spend')
                }
            insights.append({
                'label': f'{display_name} trend',
                'category': category,
                'type': insight_type,
                'pattern': 'prophet',
                'average_amount': round(average_amount, 2),
                'average_horizon_total': round(abs(horizon_total), 2),
                'next_date': first_date.strftime('%Y-%m-%d'),
                'source': 'prophet',
                'detail': f'Prophet projection for {display_name} • approx ${average_amount:.2f} per active day',
                'meta': {
                    'model': 'prophet',
                    'history_days': int(len(series)),
                    'non_zero_days': int((series.abs() > 1e-6).sum()),
                    'alias': alias_meta
                }
            })

        if not events:
            return pd.DataFrame(columns=['date', 'amount', 'category', 'description']), insights

        events_df = pd.DataFrame(events)
        events_df['date'] = pd.to_datetime(events_df['date'])
        events_df = events_df.sort_values('date')
        return events_df, insights

    def _sanitize_for_json(self, value):
        """Ensure all numbers are finite and dates are ISO strings for safe JSON."""
        if isinstance(value, dict):
            return {k: self._sanitize_for_json(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self._sanitize_for_json(v) for v in value]
        if value is pd.NaT:
            return None
        if isinstance(value, pd.Timestamp):
            if pd.isna(value):
                return None
            return value.strftime('%Y-%m-%d')
        if isinstance(value, datetime):
            return value.strftime('%Y-%m-%d')
        if isinstance(value, np.datetime64):
            if np.isnat(value):
                return None
            return pd.Timestamp(value).strftime('%Y-%m-%d')
        if isinstance(value, np.integer):
            return int(value)
        if isinstance(value, np.floating):
            if not np.isfinite(value):
                return 0.0
            return float(value)
        if isinstance(value, float):
            if math.isnan(value) or math.isinf(value):
                return 0.0
            return value
        return value

    def _build_recurring_insight(self, template, next_event_date):
        amount = abs(template['amount'])
        pattern = template['pattern']
        weekday_idx = template.get('weekday')
        weekday_name = calendar.day_name[int(weekday_idx) % 7] if weekday_idx is not None else None

        if pattern == 'weekly':
            frequency = 'Every week'
            timing = f'on {weekday_name}s' if weekday_name else ''
        elif pattern == 'biweekly':
            frequency = 'Every other week'
            timing = f'on {weekday_name}s' if weekday_name else ''
        elif pattern == 'monthly':
            frequency = 'Monthly'
            timing = f'around day {template.get("day", 1)}'
        elif pattern == 'quarterly':
            frequency = 'Quarterly'
            timing = f'around day {template.get("day", 1)}'
        elif pattern == 'yearly':
            frequency = 'Annually'
            month_name = calendar.month_name[next_event_date.month] if next_event_date else calendar.month_name[template['last_date'].month]
            timing = f'in {month_name}'
        else:
            frequency = pattern.title()
            timing = ''

        pieces = [frequency]
        if timing:
            pieces.append(timing)
        descriptor = ' '.join(pieces).strip()

        return {
            'label': template['description'],
            'category': template['category'],
            'type': template['type'],
            'pattern': pattern,
            'average_amount': round(amount, 2),
            'next_date': next_event_date.strftime('%Y-%m-%d') if next_event_date else None,
            'source': 'recurring',
            'variance': round(float(template.get('std_amount', 0.0)), 2),
            'detail': f"{descriptor} • approx ${amount:.2f}",
            'meta': {
                'weekday': weekday_idx,
                'day': template.get('day')
            }
        }

    def _generate_recurring_events(self, templates, start_date, horizon, seasonality, scheduled):
        events = []
        insights = []
        if not templates:
            return pd.DataFrame(columns=['date', 'amount', 'category', 'description']), insights

        rent_categories = {"rent"}
        subscription_categories = {"subscriptions", "subscription"}

        scheduled_norm = {
            self._normalize_description(item.get('description', ''))
            for item in (scheduled or []) if item.get('description')
        }

        scheduled_signatures = set()
        for item in (scheduled or []):
            raw_amount = item.get('amount', 0)
            try:
                amount = float(raw_amount)
            except (TypeError, ValueError):
                amount = 0.0
            polarity = 1 if amount > 0 else -1 if amount < 0 else 0
            category = self._categorize_transaction(item.get('description', ''))
            scheduled_signatures.add((category, polarity))

        start_ts = self._to_naive_timestamp(start_date)
        if pd.isna(start_ts):
            return pd.DataFrame(columns=['date', 'amount', 'category', 'description']), insights
        end_date = start_ts + timedelta(days=horizon)

        for template in templates:
            template_events = []
            if template['normalized_description'] in scheduled_norm:
                continue

            polarity = 1 if template['amount'] > 0 else -1
            if (template['category'], polarity) in scheduled_signatures:
                continue

            pattern = str(template.get('pattern', '') or '').lower()
            if not pattern:
                continue
            amount = template['amount']
            category_key = str(template.get('category', '') or '').lower()
            current = self._to_naive_timestamp(template.get('last_date'))
            if pd.isna(current):
                continue

            if pattern in ('weekly', 'biweekly'):
                step_days = 7 if pattern == 'weekly' else 14
                current += timedelta(days=step_days)
                while current < start_ts:
                    current += timedelta(days=step_days)

                while current <= end_date:
                    event_date = current.to_pydatetime()
                    adjusted_amount = self._seasonal_adjust(amount, template['category'], event_date, seasonality)
                    template_events.append({
                        'date': event_date,
                        'amount': adjusted_amount,
                        'category': template['category'],
                        'description': template['description'] + ' (projected)',
                        'source': 'recurring'
                    })
                    current += timedelta(days=step_days)

            elif pattern in ('monthly', 'quarterly', 'yearly'):
                offset = template.get('offset')
                if not offset:
                    offset = DateOffset(months=1) if pattern == 'monthly' else (
                        DateOffset(months=3) if pattern == 'quarterly' else DateOffset(years=1)
                    )

                if pattern == 'monthly' and category_key in (rent_categories | subscription_categories):
                    base_ts = current
                    target_day = template.get('day') or (base_ts.day if not pd.isna(base_ts) else None)
                    if target_day is None:
                        continue
                    base_amount = template.get('last_amount', amount)
                    next_date = self._advance_month_same_day(base_ts, 1, target_day)
                    if pd.isna(next_date):
                        continue

                    while next_date < start_ts:
                        next_date = self._advance_month_same_day(next_date, 1, target_day)
                        if pd.isna(next_date):
                            break
                    while not pd.isna(next_date) and next_date <= end_date:
                        event_date = next_date.to_pydatetime()
                        months_since = (event_date.year - base_ts.year) * 12 + (event_date.month - base_ts.month)
                        months_since = max(months_since, 0)
                        if category_key in rent_categories:
                            years_since = months_since // 12
                            projected_amount = float(round(base_amount * ((1.03) ** years_since), 2))
                        else:
                            projected_amount = float(round(base_amount, 2))
                        template_events.append({
                            'date': event_date,
                            'amount': projected_amount,
                            'category': template['category'],
                            'description': template['description'] + ' (projected)',
                            'source': 'recurring'
                        })
                        next_date = self._advance_month_same_day(next_date, 1, target_day)
                        if pd.isna(next_date):
                            break
                else:
                    next_date = self._to_naive_timestamp(current + offset)
                    if pd.isna(next_date):
                        continue

                    while next_date < start_ts:
                        candidate = self._to_naive_timestamp(next_date + offset)
                        if pd.isna(candidate) or candidate <= next_date:
                            break
                        next_date = candidate

                    while next_date <= end_date:
                        event_date = next_date.to_pydatetime()
                        adjusted_amount = self._seasonal_adjust(amount, template['category'], event_date, seasonality)
                        template_events.append({
                            'date': event_date,
                            'amount': adjusted_amount,
                            'category': template['category'],
                            'description': template['description'] + ' (projected)',
                            'source': 'recurring'
                        })
                        candidate = self._to_naive_timestamp(next_date + offset)
                        if pd.isna(candidate) or candidate <= next_date:
                            break
                        next_date = candidate

            if template_events:
                events.extend(template_events)
                next_event_date = min(item['date'] for item in template_events)
                insights.append(self._build_recurring_insight(template, next_event_date))

        if not events:
            return pd.DataFrame(columns=['date', 'amount', 'category', 'description']), insights

        events_df = pd.DataFrame(events)
        events_df['date'] = pd.to_datetime(events_df['date'])
        return events_df, insights

    def _generate_variable_spending(self, history_df, templates, start_date, horizon, seasonality, category_aliases=None):
        if history_df.empty:
            return pd.DataFrame(columns=['date', 'amount', 'category', 'description']), []

        history_df = history_df.copy()
        history_df['date'] = pd.to_datetime(history_df['date'], errors='coerce')
        history_df = history_df.dropna(subset=['date'])
        if history_df.empty:
            return pd.DataFrame(columns=['date', 'amount', 'category', 'description']), []

        if self.behavior_max_history_days:
            history_cutoff = start_date - timedelta(days=self.behavior_max_history_days)
            history_df = history_df[history_df['date'] >= history_cutoff]
        if history_df.empty:
            return pd.DataFrame(columns=['date', 'amount', 'category', 'description']), []

        recent_total_window_days = self.behavior_recent_total_days or 90
        recent_total_cutoff = start_date - timedelta(days=recent_total_window_days)
        recent_history = history_df[history_df['date'] >= recent_total_cutoff]
        recent_expense_totals = (
            recent_history[recent_history['amount'] < -1e-6]
            .groupby('category')['amount']
            .sum()
            .abs()
        ) if not recent_history.empty else pd.Series(dtype=float)
        recent_expense_counts = (
            recent_history[recent_history['amount'] < -1e-6]
            .groupby('category')['amount']
            .count()
        ) if not recent_history.empty else pd.Series(dtype=float)

        recurring_categories = {t['category'] for t in templates}
        variable_rows = []
        insights = []
        end_date = start_date + timedelta(days=horizon)

        recent_cutoff = start_date - timedelta(days=self.behavior_recent_days)
        recent_mask = history_df['date'] >= recent_cutoff
        recent_groups = {
            category: group.sort_values('date')
            for category, group in history_df[recent_mask].groupby('category')
        }
        full_groups = {
            category: group.sort_values('date')
            for category, group in history_df.groupby('category')
        }

        category_aliases = category_aliases or {}

        def _support_threshold(category, is_income):
            base = self.behavior_income_min_support if is_income else self.behavior_min_support
            if category in self.behavior_low_support_categories:
                return min(base, 2)
            return base

        def _variance_within_limits(avg_value, std_value, is_income):
            if not std_value:
                return True
            multiplier = self.behavior_income_spike_multiplier if is_income else self.behavior_spike_std_multiplier
            return abs(std_value) <= abs(avg_value) * multiplier if avg_value else False

        staleness_limit_days = max(self.behavior_recent_days * 2, 240)

        for category, full_group in full_groups.items():
            if category in recurring_categories:
                continue
            if self.behavior_skip_categories and category in self.behavior_skip_categories:
                continue
            if full_group.empty:
                continue

            last_event_ts = pd.to_datetime(full_group['date'].max())
            if pd.isna(last_event_ts):
                continue

            if (start_date - last_event_ts.to_pydatetime()).days > staleness_limit_days:
                continue

            has_recent = category in recent_groups and not recent_groups[category].empty
            if not has_recent and category not in self.behavior_extended_history_categories:
                continue

            alias_info = category_aliases.get(category) if category_aliases else None
            display_name = alias_info.get('display') if alias_info else category.replace('_', ' ').title()
            alias_meta = None
            if alias_info:
                alias_meta = {
                    'primary': alias_info.get('primary'),
                    'examples': alias_info.get('entries'),
                    'total_spend': alias_info.get('total_spend')
                }

            recent_group = recent_groups.get(category)
            if recent_group is None:
                recent_group = full_group.iloc[0:0]

            for is_income, selector in ((False, -1), (True, 1)):
                if selector < 0:
                    sign_recent = recent_group[recent_group['amount'] < -1e-6]
                    sign_full = full_group[full_group['amount'] < -1e-6]
                else:
                    sign_recent = recent_group[recent_group['amount'] > 1e-6]
                    sign_full = full_group[full_group['amount'] > 1e-6]

                if category == 'income' and not is_income:
                    continue

                if sign_recent.empty and sign_full.empty:
                    continue

                support_needed = _support_threshold(category, is_income)

                sign_full = sign_full.sort_values('date')
                if not sign_full.empty:
                    max_window = max(support_needed * 4, 12)
                    sign_full = sign_full.tail(max_window)

                working_df = sign_recent.sort_values('date') if not sign_recent.empty else sign_full

                if working_df.empty or len(working_df) < support_needed:
                    if (category in self.behavior_extended_history_categories) or is_income:
                        working_df = sign_full

                if working_df.empty or len(working_df) < support_needed:
                    continue

                avg_amount = working_df['amount'].median()
                if not avg_amount:
                    continue

                if is_income and avg_amount <= 0:
                    continue
                if not is_income and avg_amount >= 0:
                    continue

                std_amount = working_df['amount'].std()
                if not _variance_within_limits(avg_amount, std_amount, is_income):
                    continue

                weekday_counts = working_df['date'].dt.weekday.value_counts().sort_values(ascending=False)
                preferred_weekday = int(weekday_counts.index[0]) if not weekday_counts.empty else start_date.weekday()

                intervals = working_df['date'].diff().dropna().dt.days
                median_interval = float(intervals.median()) if not intervals.empty else None
                expected_frequency = (self.expense_categories.get(category) or {}).get('frequency')

                frequency_type = 'weekly'
                if median_interval is not None:
                    if median_interval >= 21:
                        frequency_type = 'monthly'
                    elif median_interval >= 11:
                        frequency_type = 'biweekly'
                if expected_frequency == 'monthly' and frequency_type == 'weekly':
                    frequency_type = 'monthly'
                elif expected_frequency == 'weekly':
                    frequency_type = 'weekly'

                total_days = max((working_df['date'].max() - working_df['date'].min()).days, 1)
                weeks_observed = max(total_days / 7.0, 1)
                raw_events_per_week = len(working_df) / weeks_observed if weeks_observed else 0.0

                category_events = []

                def _append_event(event_date):
                    adjusted_amount = self._seasonal_adjust(avg_amount, category, event_date, seasonality)
                    variable_rows.append({
                        'date': event_date,
                        'amount': adjusted_amount,
                        'category': category,
                        'description': f'{display_name} pattern (projected)',
                        'source': 'behavior'
                    })
                    category_events.append(event_date)

                if frequency_type == 'weekly':
                    if raw_events_per_week < 0.3:
                        continue
                    events_per_week = max(1, min(self.behavior_max_events_per_week, int(math.ceil(raw_events_per_week))))
                    weekdays_order = list(weekday_counts.index) if not weekday_counts.empty else [start_date.weekday()]

                    current_week_start = start_date
                    while current_week_start <= end_date:
                        for occurrence in range(events_per_week):
                            weekday = weekdays_order[occurrence % len(weekdays_order)]
                            day_offset = (weekday - current_week_start.weekday()) % 7
                            event_date = current_week_start + timedelta(days=day_offset)
                            if event_date > end_date:
                                break
                            _append_event(event_date)
                        current_week_start += timedelta(days=7)

                    if category_events:
                        preferred_indices = weekdays_order[:max(1, min(len(weekdays_order), events_per_week))]
                        if not preferred_indices:
                            preferred_indices = [start_date.weekday()]
                        weekday_names = [calendar.day_name[int(day) % 7] for day in preferred_indices]
                        frequency_text = 'about once per week' if events_per_week == 1 else f'about {events_per_week} times per week'
                        meta_payload = {
                            'events_per_week': events_per_week,
                            'preferred_days': weekday_names
                        }
                        if alias_meta:
                            meta_payload['alias'] = alias_meta
                        label_suffix = 'income' if is_income else 'spending'
                        average_weekly = abs(avg_amount) * events_per_week
                        insights.append({
                            'label': f'{display_name} {label_suffix}',
                            'category': category,
                            'type': 'income' if is_income else 'expense',
                            'pattern': 'behavior',
                            'average_amount': round(abs(avg_amount), 2),
                            'average_weekly_spend': round(average_weekly, 2),
                            'next_date': min(category_events).strftime('%Y-%m-%d') if category_events else None,
                            'source': 'behavior',
                            'detail': f"{frequency_text.title()} on {', '.join(weekday_names)} • approx ${abs(avg_amount):.2f} each time",
                            'meta': meta_payload
                        })

                elif frequency_type == 'biweekly':
                    interval_days = max(14, int(round(median_interval or 14)))
                    next_event = working_df['date'].max().to_pydatetime()
                    safety = 0
                    while safety < 26:
                        safety += 1
                        next_event = next_event + timedelta(days=interval_days)
                        if next_event < start_date:
                            continue
                        aligned_event = next_event
                        if aligned_event.weekday() != preferred_weekday:
                            delta = (preferred_weekday - aligned_event.weekday()) % 7
                            aligned_event = aligned_event + timedelta(days=delta)
                        if aligned_event > end_date:
                            break
                        _append_event(aligned_event)
                        next_event = aligned_event

                    if category_events:
                        weekday_name = calendar.day_name[int(preferred_weekday) % 7]
                        weekly_equivalent = abs(avg_amount) * (7.0 / interval_days)
                        meta_payload = {
                            'frequency': 'biweekly',
                            'preferred_day': weekday_name,
                            'interval_days': interval_days
                        }
                        if alias_meta:
                            meta_payload['alias'] = alias_meta
                        label_suffix = 'income' if is_income else 'spending'
                        insights.append({
                            'label': f'{display_name} {label_suffix}',
                            'category': category,
                            'type': 'income' if is_income else 'expense',
                            'pattern': 'behavior',
                            'average_amount': round(abs(avg_amount), 2),
                            'average_weekly_spend': round(weekly_equivalent, 2),
                            'next_date': min(category_events).strftime('%Y-%m-%d'),
                            'source': 'behavior',
                            'detail': f"Every other week on {weekday_name} • approx ${abs(avg_amount):.2f} each time",
                            'meta': meta_payload
                        })

                else:
                    preferred_day = int(working_df['date'].dt.day.mode().iloc[0]) if not working_df['date'].dt.day.mode().empty else start_date.day
                    last_timestamp = pd.Timestamp(working_df['date'].max())
                    month_offset = 1
                    safety = 0
                    while safety < 18:
                        safety += 1
                        candidate = last_timestamp + DateOffset(months=month_offset)
                        month_offset += 1
                        year = candidate.year
                        month = candidate.month
                        day = min(preferred_day, calendar.monthrange(year, month)[1])
                        event_date = datetime(year, month, day)
                        if event_date < start_date:
                            continue
                        if event_date > end_date:
                            break
                        _append_event(event_date)

                    if category_events:
                        weekday_name = calendar.day_name[int(category_events[0].weekday())]
                        avg_interval = median_interval if median_interval else 30.0
                        weekly_equivalent = abs(avg_amount) * (7.0 / max(avg_interval, 1.0))
                        meta_payload = {
                            'frequency': 'monthly',
                            'preferred_day': preferred_day,
                            'preferred_weekday': weekday_name
                        }
                        if alias_meta:
                            meta_payload['alias'] = alias_meta
                        label_suffix = 'income' if is_income else 'spending'
                        insights.append({
                            'label': f'{display_name} {label_suffix}',
                            'category': category,
                            'type': 'income' if is_income else 'expense',
                            'pattern': 'behavior',
                            'average_amount': round(abs(avg_amount), 2),
                            'average_weekly_spend': round(weekly_equivalent, 2),
                            'next_date': min(category_events).strftime('%Y-%m-%d'),
                            'source': 'behavior',
                            'detail': f"Monthly around day {preferred_day} • approx ${abs(avg_amount):.2f} each time",
                            'meta': meta_payload
                        })

        if not variable_rows:
            return pd.DataFrame(columns=['date', 'amount', 'category', 'description']), insights

        variable_df = pd.DataFrame(variable_rows)
        variable_df['date'] = pd.to_datetime(variable_df['date'])

        adjusted_frames = []
        kept_categories = set()
        for category, group in variable_df.groupby('category'):
            group = group.copy()
            expense_mask = group['amount'] < 0

            if expense_mask.any():
                recent_total_abs = float(recent_expense_totals.get(category, 0.0)) if not recent_expense_totals.empty else 0.0
                recent_count = int(recent_expense_counts.get(category, 0)) if not recent_expense_counts.empty else 0

                if recent_total_abs > 0:
                    recent_category_history = recent_history[(recent_history['category'] == category) & (recent_history['amount'] < -1e-6)]
                    if not recent_category_history.empty:
                        span_days = max((recent_category_history['date'].max() - recent_category_history['date'].min()).days + 1, 1)
                        recent_daily = float(recent_category_history['amount'].abs().sum()) / span_days
                        recent_total_abs = recent_daily * max(horizon, 1)

                if recent_count < self.behavior_min_recent_nonzero or recent_total_abs < self.behavior_min_recent_total:
                    group = group.loc[~expense_mask]
                else:
                    predicted_total = float(abs(group.loc[expense_mask, 'amount'].sum()))
                    median_amount = float(abs(group.loc[expense_mask, 'amount']).median() or 0.0)
                    baseline_total = median_amount * max(min(expense_mask.sum(), horizon), 1)
                    cap_basis = max(recent_total_abs, baseline_total, 1.0)
                    total_cap = cap_basis * self.behavior_total_growth_ratio
                    if predicted_total > total_cap:
                        scale = total_cap / predicted_total if predicted_total else 1.0
                        if scale < 0.35:
                            group = group.loc[~expense_mask]
                        else:
                            group.loc[expense_mask, 'amount'] = group.loc[expense_mask, 'amount'] * scale

            if group.empty:
                continue

            adjusted_frames.append(group)
            kept_categories.add(category)

        if not adjusted_frames:
            return pd.DataFrame(columns=['date', 'amount', 'category', 'description']), []

        filtered_insights = [ins for ins in insights if ins.get('category') in kept_categories]
        merged_df = pd.concat(adjusted_frames, ignore_index=True)
        merged_df['date'] = pd.to_datetime(merged_df['date'])
        return merged_df, filtered_insights

    def _augment_recurring_templates(self, history_df, templates, start_date, category_aliases=None):
        if history_df.empty:
            return list(templates)

        category_aliases = category_aliases or {}
        augmented = list(templates)
        existing_categories = {item['category'] for item in augmented}
        existing_norms = {item.get('normalized_description') for item in augmented}
        staleness_limit_days = max(self.behavior_recent_days * 2, 240)

        fallback_categories = self.behavior_extended_history_categories

        for category in fallback_categories:
            if category in existing_categories:
                continue

            cat_df = history_df[history_df['category'] == category].copy()
            if cat_df.empty:
                continue

            if category == 'income':
                target_df = cat_df[cat_df['amount'] > 1e-6]
            else:
                target_df = cat_df[cat_df['amount'] < -1e-6]

            if target_df.empty or len(target_df) < 2:
                continue

            target_df = target_df.sort_values('date')

            last_event_ts = pd.to_datetime(target_df['date'].max())
            if pd.isna(last_event_ts):
                continue

            if (start_date - last_event_ts.to_pydatetime()).days > staleness_limit_days:
                continue

            alias_info = category_aliases.get(category)
            category_is_income = category == 'income'

            if category_is_income:
                monthly_totals = (
                    target_df.set_index('date')['amount']
                    .resample('MS')
                    .sum()
                )
                monthly_totals = monthly_totals[monthly_totals > 0]
                if monthly_totals.empty:
                    continue

                recent_totals = monthly_totals.tail(min(3, len(monthly_totals)))
                avg_amount = float(recent_totals.median())
                if avg_amount <= 0:
                    continue

                std_amount = float(recent_totals.std() or 0.0)
                pattern = 'monthly'
                pattern_meta = {'offset': DateOffset(months=1)}
            else:
                pattern = 'monthly'
                pattern_meta = {'offset': DateOffset(months=1)}
                recent_window = last_event_ts - pd.Timedelta(days=max(self.behavior_recent_days, 120))
                recent_values = target_df[target_df['date'] >= recent_window]
                if recent_values.empty:
                    recent_values = target_df

                avg_amount = float(recent_values['amount'].min())
                if avg_amount >= -1e-6:
                    continue

                std_amount = float(recent_values['amount'].std() or 0.0)

            weekday_mode_series = target_df['date'].dt.weekday.mode()
            weekday_mode = int(weekday_mode_series.iloc[0]) if not weekday_mode_series.empty else int(last_event_ts.weekday())
            day_mode_series = target_df['date'].dt.day.mode()
            day_mode = int(day_mode_series.iloc[0]) if not day_mode_series.empty else int(last_event_ts.day)

            display_name = alias_info.get('display') if alias_info else category.replace('_', ' ').title()

            normalized_key = f'__category__::{category}'
            if normalized_key in existing_norms:
                continue

            description = f'{display_name} (inferred)' if alias_info else display_name

            template = {
                'description': description,
                'normalized_description': normalized_key,
                'amount': avg_amount,
                'category': category,
                'pattern': pattern,
                'weekday': weekday_mode,
                'day': day_mode,
                'last_date': last_event_ts.to_pydatetime(),
                'std_amount': std_amount,
                'type': 'income' if avg_amount > 0 else 'expense'
            }

            pattern_meta = pattern_meta or {}
            if 'offset' in pattern_meta:
                template['offset'] = pattern_meta['offset']

            augmented.append(template)
            existing_categories.add(category)
            existing_norms.add(normalized_key)

        return augmented

    def run_forecast(self, opening_balance, transactions, scheduled, horizon, method="prophet", as_of_date=None):
        mode_map = {
            "prophet": "prophet",
            "statistical": "prophet",
            "behavior": "behavior",
            "recurring": "recurring",
            "baseline": "baseline",
            "hybrid": "hybrid",
        }
        normalized_mode = mode_map.get((method or "prophet").lower(), "prophet")

        if as_of_date is not None:
            if isinstance(as_of_date, str):
                try:
                    anchor = pd.to_datetime(as_of_date)
                except Exception:
                    anchor = datetime.today()
            elif isinstance(as_of_date, (datetime, pd.Timestamp)):
                anchor = pd.to_datetime(as_of_date)
            else:
                anchor = datetime.today()
        else:
            anchor = datetime.today()

        today = pd.to_datetime(anchor).to_pydatetime().replace(hour=0, minute=0, second=0, microsecond=0)
        start_date = today

        transactions = self._sanitize_transactions(transactions)

        if transactions:
            try:
                history_dates = pd.to_datetime([t['date'] for t in transactions if t.get('date')])
                if len(history_dates) > 0:
                    last_hist = history_dates.max()
                    candidate_start = (last_hist + pd.Timedelta(days=1)).to_pydatetime()
                    candidate_start = candidate_start.replace(hour=0, minute=0, second=0, microsecond=0)
                    start_date = max(today, candidate_start)
            except Exception:
                start_date = today

        # Generate baseline from historical transactions
        tx_df = self._generate_baseline(opening_balance, transactions)

        history_df = tx_df[tx_df['date'] < start_date] if not tx_df.empty else pd.DataFrame(columns=tx_df.columns)

        # Expand scheduled events (rent, bills, paychecks)
        sched_df = self._expand_scheduled(scheduled, start_date, horizon)

        allow_recurring = normalized_mode in {"prophet", "behavior", "recurring", "hybrid"}
        allow_behavior = normalized_mode in {"behavior", "hybrid"}
        allow_prophet = normalized_mode in {"prophet", "hybrid"}

        if allow_prophet and Prophet is None:
            base_msg = "Prophet forecasting requested but the 'prophet' package is not available."
            if _prophet_import_error:
                base_msg += (
                    f" Import error: {_prophet_import_error['type']}: "
                    f"{_prophet_import_error['message']}"
                )
            guidance = (
                " Install prophet (pip install prophet) and ensure CmdStan build "
                "toolchain prerequisites are met."
            )
            if normalized_mode == "hybrid":
                warnings.warn(
                    base_msg + guidance + " Falling back to behavior/recurring only.",
                    RuntimeWarning,
                )
                allow_prophet = False
            else:
                raise RuntimeError(base_msg + guidance)

        empty_projection = pd.DataFrame(columns=['date', 'amount', 'category', 'description'])
        recurring_templates = []
        recurring_categories = set()
        seasonality = self._seasonality_factors(history_df[history_df['amount'] < 0]) if not history_df.empty else {}
        category_aliases = self._category_alias_map(history_df) if not history_df.empty else {}

        if allow_recurring:
            recurring_templates = self._detect_recurring_transactions(history_df)
            recurring_templates = self._augment_recurring_templates(history_df, recurring_templates, start_date, category_aliases)
            recurring_df, recurring_insights = self._generate_recurring_events(recurring_templates, start_date, horizon, seasonality, scheduled)
            if not recurring_df.empty:
                recurring_categories = set(recurring_df['category'].unique())
            else:
                recurring_categories = set()
        else:
            recurring_df, recurring_insights = empty_projection, []
            recurring_categories = set()

        if allow_behavior:
            variable_df, variable_insights = self._generate_variable_spending(history_df, recurring_templates, start_date, horizon, seasonality, category_aliases)
        else:
            variable_df, variable_insights = empty_projection, []

        if allow_prophet:
            prophet_df, prophet_insights = self._generate_statistical_forecast(history_df, recurring_categories, start_date, horizon, seasonality, category_aliases)
        else:
            prophet_df, prophet_insights = empty_projection, []

        if allow_behavior and allow_prophet and not prophet_df.empty and not variable_df.empty:
            stat_categories = set(prophet_df['category'].unique())
            variable_df = variable_df[~variable_df['category'].isin(stat_categories)]
            if variable_insights:
                variable_insights = [ins for ins in variable_insights if ins.get('category') not in stat_categories]

        habit_insights = recurring_insights + variable_insights + prophet_insights

        # Combine everything: historical + scheduled + variable forecast
        all_transactions = []

        # Add historical transactions
        if not tx_df.empty:
            for _, row in tx_df.iterrows():
                all_transactions.append({
                    'date': row['date'],
                    'amount': row['amount'],
                    'category': row.get('category', 'other'),
                    'description': row.get('description', 'Historical transaction'),
                    'type': 'historical'
                })

        # Add scheduled events
        if not sched_df.empty:
            for _, row in sched_df.iterrows():
                all_transactions.append({
                    'date': row['date'],
                    'amount': row['amount'],
                    'category': self._categorize_transaction(row.get('description', ''), row.get('amount')),
                    'description': row.get('description', 'Scheduled'),
                    'type': 'scheduled'
                })

        # Add recurring projections
        if not recurring_df.empty:
            for _, row in recurring_df.iterrows():
                all_transactions.append({
                    'date': row['date'],
                    'amount': row['amount'],
                    'category': row.get('category', 'other'),
                    'description': row.get('description', 'Recurring projection'),
                    'type': 'forecast',
                    'projection_source': row.get('source', 'recurring')
                })

        # Add variable spending forecast
        if not variable_df.empty:
            for _, row in variable_df.iterrows():
                all_transactions.append({
                    'date': row['date'],
                    'amount': row['amount'],
                    'category': row.get('category', 'other'),
                    'description': row.get('description', 'Behavior projection'),
                    'type': 'forecast',
                    'projection_source': row.get('source', 'behavior')
                })

        # Add Prophet trend forecast
        if not prophet_df.empty:
            for _, row in prophet_df.iterrows():
                all_transactions.append({
                    'date': row['date'],
                    'amount': row['amount'],
                    'category': row.get('category', 'other'),
                    'description': row.get('description', 'Trend projection'),
                    'type': 'forecast',
                    'projection_source': row.get('source', 'prophet')
                })

        # Create combined dataframe
        if all_transactions:
            combined_df = pd.DataFrame(all_transactions)
            combined_df['date'] = pd.to_datetime(combined_df['date'])
            combined_df = combined_df.sort_values('date')

            combined_df = self._apply_category_targets(combined_df, history_df, start_date, horizon)
            combined_df = combined_df.sort_values('date').reset_index(drop=True)

            # Calculate running balance
            combined_df['balance'] = opening_balance + combined_df['amount'].cumsum()

            # Group by date for daily summary
            daily_summary = combined_df.groupby('date').agg({
                'amount': 'sum',
                'balance': 'last'
            }).reset_index()
        else:
            daily_summary = pd.DataFrame([
                {
                    'date': start_date,
                    'amount': 0.0,
                    'balance': opening_balance
                }
            ])
            combined_df = daily_summary.copy()

        if 'category' not in combined_df.columns:
            combined_df['category'] = 'other'
        if 'description' not in combined_df.columns:
            combined_df['description'] = 'Balance projection'
        if 'type' not in combined_df.columns:
            combined_df['type'] = 'forecast'

        # Calculate category breakdown for the forecast period
        future_transactions = combined_df[combined_df['date'] >= start_date]
        if 'category' not in future_transactions.columns:
            future_transactions = future_transactions.assign(category='other')
        category_breakdown = {}
        expense_breakdown = {}
        income_breakdown = {}
        if not future_transactions.empty:
            for category, group in future_transactions.groupby('category'):
                cat_total = float(group['amount'].sum())
                category_breakdown[category] = cat_total
                if cat_total < 0:
                    expense_breakdown[category] = abs(cat_total)
                elif cat_total > 0:
                    income_breakdown[category] = cat_total

        # Build calendar view for the next 30 days regardless of horizon
        calendar_horizon = 30
        calendar_end = start_date + timedelta(days=calendar_horizon)
        calendar_df = combined_df[(combined_df['date'] >= start_date) & (combined_df['date'] <= calendar_end)]
        calendar_summary = []
        if not calendar_df.empty:
            for date, group in calendar_df.groupby('date'):
                calendar_summary.append({
                    'date': date.strftime('%Y-%m-%d'),
                    'net': float(group['amount'].sum()),
                    'income': float(group[group['amount'] > 0]['amount'].sum()),
                    'expenses': float(group[group['amount'] < 0]['amount'].sum()),
                    'balance': float(group['balance'].iloc[-1]) if 'balance' in group else None,
                    'top_expenses': group[group['amount'] < 0]
                        .sort_values('amount')
                        .head(3)
                        .apply(lambda r: {
                            'description': r.get('description'),
                            'amount': float(r['amount']),
                            'category': r.get('category')
                        }, axis=1)
                        .tolist()
                })

            calendar_summary.sort(key=lambda entry: entry['date'])

        future_daily = daily_summary[daily_summary['date'] >= start_date] if not daily_summary.empty else daily_summary
        final_balance = float(daily_summary['balance'].iloc[-1]) if len(daily_summary) > 0 else opening_balance
        min_balance = float(future_daily['balance'].min()) if not future_daily.empty else final_balance
        min_balance_idx = future_daily['balance'].idxmin() if not future_daily.empty else None
        min_balance_date = future_daily.loc[min_balance_idx, 'date'] if min_balance_idx is not None else None
        zero_crossings = future_daily[future_daily['balance'] <= 0]
        zero_date = zero_crossings['date'].iloc[0] if not zero_crossings.empty else None
        days_to_min = None
        days_to_zero = None
        if min_balance_date is not None:
            days_to_min = max(0, (pd.to_datetime(min_balance_date) - start_date).days)
        if zero_date is not None:
            days_to_zero = max(0, (pd.to_datetime(zero_date) - start_date).days)

        response = {
            "summary": {
                "method": normalized_mode,
                "opening_balance": opening_balance,
                "final_balance": final_balance,
                "net_change": final_balance - opening_balance,
                "total_income": float(future_transactions[future_transactions['amount'] > 0]['amount'].sum()) if not future_transactions.empty else 0,
                "total_expenses": float(future_transactions[future_transactions['amount'] < 0]['amount'].sum()) if not future_transactions.empty else 0,
                "category_breakdown": category_breakdown,
                "expense_breakdown": expense_breakdown,
                "income_breakdown": income_breakdown,
                "minimum_balance": min_balance,
                "minimum_balance_date": pd.to_datetime(min_balance_date).strftime('%Y-%m-%d') if min_balance_date is not None else None,
                "days_to_min": days_to_min,
                "days_to_zero": days_to_zero
            },
            "forecast": daily_summary.to_dict(orient="records"),
            "transactions": combined_df.to_dict(orient="records"),
            "calendar": calendar_summary,
            "habits": habit_insights
        }
        return self._sanitize_for_json(response)
