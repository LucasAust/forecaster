import argparse
import json
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

from forecast_engine import ForecastEngine
from statement_parser import parse_statement


def _parse_statement_arg(arg_value: str) -> Tuple[Path, str]:
    if ":" not in arg_value:
        raise argparse.ArgumentTypeError("Statements must be provided as '<path>:<statement_type>'")
    path_str, stmt_type = arg_value.split(":", 1)
    path = Path(path_str).expanduser().resolve()
    if not path.exists():
        raise argparse.ArgumentTypeError(f"Statement path does not exist: {path}")
    stmt_type_normalized = stmt_type.strip().lower()
    if stmt_type_normalized not in {"credit_card", "bank_account"}:
        raise argparse.ArgumentTypeError(
            f"Unsupported statement type '{stmt_type}'. Use 'credit_card' or 'bank_account'."
        )
    return path, stmt_type_normalized


def load_transactions(statements: List[Tuple[Path, str]], engine: ForecastEngine) -> List[Dict[str, object]]:
    combined: List[Dict[str, object]] = []
    for path, stmt_type in statements:
        with path.open("rb") as handle:
            parsed = parse_statement(handle, statement_type=stmt_type)
        combined.extend(parsed.get("transactions", []))

    sanitized = engine._sanitize_transactions(combined)
    sanitized.sort(key=lambda entry: entry.get("date", ""))
    return sanitized


def to_dataframe(transactions: List[Dict[str, object]]) -> pd.DataFrame:
    df = pd.DataFrame(transactions)
    if df.empty:
        return pd.DataFrame(columns=["date", "description", "amount", "category"])
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date", "amount"])
    df["amount"] = df["amount"].astype(float)
    if "category" not in df.columns:
        df["category"] = df["description"].apply(lambda desc: desc)
    return df.sort_values("date").reset_index(drop=True)


def generate_evaluation_dates(
    df: pd.DataFrame,
    horizon_days: int,
    min_history_days: int,
    step_days: int,
) -> List[pd.Timestamp]:
    if df.empty:
        return []

    min_date = df["date"].min()
    max_date = df["date"].max()
    horizon_delta = timedelta(days=horizon_days)
    candidates = sorted(df["date"].dt.normalize().unique())

    evaluation_dates: List[pd.Timestamp] = []
    last_selected: pd.Timestamp | None = None
    for candidate in candidates:
        candidate: pd.Timestamp
        if candidate - min_date < timedelta(days=min_history_days):
            continue
        if candidate + horizon_delta > max_date:
            continue
        if last_selected and (candidate - last_selected).days < step_days:
            continue
        evaluation_dates.append(candidate)
        last_selected = candidate

    return evaluation_dates


def _categorize(engine: ForecastEngine, description: str) -> str:
    return engine._categorize_transaction(description or "")


def _prepare_transaction_records(df: pd.DataFrame) -> List[Dict[str, object]]:
    if df.empty:
        return []
    records_df = df[["date", "description", "amount"]].copy()
    records_df["date"] = records_df["date"].dt.strftime("%Y-%m-%d")
    return records_df.to_dict(orient="records")


def backtest(
    engine: ForecastEngine,
    df: pd.DataFrame,
    evaluation_dates: List[pd.Timestamp],
    horizon_days: int,
    method: str,
    opening_balance: float,
) -> Tuple[List[Dict[str, object]], Dict[str, Dict[str, float]]]:
    results: List[Dict[str, object]] = []
    category_totals_actual: Dict[str, float] = defaultdict(float)
    category_totals_pred: Dict[str, float] = defaultdict(float)

    for start_date in evaluation_dates:
        history_mask = df["date"] < start_date
        future_mask = (df["date"] >= start_date) & (df["date"] < start_date + timedelta(days=horizon_days))

        history_df = df.loc[history_mask]
        future_df = df.loc[future_mask]
        if history_df.empty or future_df.empty:
            continue

        history_span_days = (history_df["date"].max() - history_df["date"].min()).days if not history_df.empty else 0
        history_records = _prepare_transaction_records(history_df)
        opening_balance_at_start = opening_balance + float(history_df["amount"].sum())

        forecast = engine.run_forecast(
            opening_balance=opening_balance_at_start,
            transactions=history_records,
            scheduled=[],
            horizon=horizon_days,
            method=method,
            as_of_date=start_date,
        )

        forecast_transactions = pd.DataFrame(forecast.get("transactions", []))
        if forecast_transactions.empty:
            continue
        forecast_transactions["date"] = pd.to_datetime(forecast_transactions["date"], errors="coerce")
        forecast_future = forecast_transactions[
            (forecast_transactions["date"] >= start_date)
            & (forecast_transactions["date"] < start_date + timedelta(days=horizon_days))
            & (forecast_transactions.get("type") == "forecast")
        ].copy()
        if forecast_future.empty:
            continue

        forecast_future["amount"] = forecast_future["amount"].astype(float)
        forecast_future["category"] = forecast_future.get("category", "other")

        future_df = future_df.copy()
        future_df["category"] = future_df["description"].apply(lambda desc: _categorize(engine, desc))

        window_range = pd.date_range(start=start_date, periods=horizon_days, freq="D")
        actual_daily = future_df.groupby("date")["amount"].sum().reindex(window_range, fill_value=0.0)
        predicted_daily = forecast_future.groupby("date")["amount"].sum().reindex(window_range, fill_value=0.0)

        daily_diff = predicted_daily - actual_daily
        mae = float(np.mean(np.abs(daily_diff)))
        rmse = float(np.sqrt(np.mean(daily_diff ** 2)))

        net_actual = float(future_df["amount"].sum())
        net_pred = float(predicted_daily.sum())

        income_actual = float(future_df[future_df["amount"] > 0]["amount"].sum())
        income_pred = float(forecast_future[forecast_future["amount"] > 0]["amount"].sum())
        expense_actual = float(-future_df[future_df["amount"] < 0]["amount"].sum())
        expense_pred = float(-forecast_future[forecast_future["amount"] < 0]["amount"].sum())

        final_balance_actual = opening_balance_at_start + net_actual
        final_balance_pred = float(forecast["summary"].get("final_balance", opening_balance_at_start + net_pred))

        actual_category_totals = future_df.groupby("category")["amount"].sum().to_dict()
        predicted_category_totals = forecast_future.groupby("category")["amount"].sum().to_dict()

        for category, value in actual_category_totals.items():
            category_totals_actual[category] += float(value)
        for category, value in predicted_category_totals.items():
            category_totals_pred[category] += float(value)

        result = {
            "start_date": start_date.strftime("%Y-%m-%d"),
            "horizon_days": horizon_days,
            "history_days": history_span_days,
            "history_transactions": len(history_records),
            "actual_transactions": int(len(future_df)),
            "predicted_transactions": int(len(forecast_future)),
            "net_actual": net_actual,
            "net_pred": net_pred,
            "net_error": net_pred - net_actual,
            "income_actual": income_actual,
            "income_pred": income_pred,
            "income_error": income_pred - income_actual,
            "expense_actual": expense_actual,
            "expense_pred": expense_pred,
            "expense_error": expense_pred - expense_actual,
            "final_balance_actual": final_balance_actual,
            "final_balance_pred": final_balance_pred,
            "balance_error": final_balance_pred - final_balance_actual,
            "daily_mae": mae,
            "daily_rmse": rmse,
            "category_actual": actual_category_totals,
            "category_pred": predicted_category_totals,
        }
        results.append(result)

    category_summary = {
        "actual": dict(category_totals_actual),
        "predicted": dict(category_totals_pred),
    }

    return results, category_summary


def format_currency(value: float) -> str:
    return f"${value:,.2f}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Backtest the ForecastEngine across historical windows.")
    parser.add_argument(
        "--statement",
        action="append",
        type=_parse_statement_arg,
        required=True,
        help="Statement source in the form '<path>:<statement_type>'. Repeat for multiple files.",
    )
    parser.add_argument(
        "--method",
        default="prophet",
        help="Forecast method to evaluate (default: prophet). Currently only 'prophet' is available.",
    )
    parser.add_argument("--horizon", type=int, default=30, help="Forecast horizon in days (default: 30)")
    parser.add_argument(
        "--step",
        type=int,
        default=30,
        help="Spacing between evaluation windows in days (default: 30)",
    )
    parser.add_argument(
        "--min-history-days",
        type=int,
        default=120,
        help="Minimum amount of history required before an evaluation window (default: 120)",
    )
    parser.add_argument(
        "--opening-balance",
        type=float,
        default=0.0,
        help="Balance prior to the earliest transaction in the dataset (default: 0)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path to write detailed backtest results as CSV",
    )

    args = parser.parse_args()

    engine = ForecastEngine()
    transactions = load_transactions(args.statement, engine)
    df = to_dataframe(transactions)
    if df.empty:
        print("No transactions loaded. Aborting backtest.")
        return

    evaluation_dates = generate_evaluation_dates(
        df=df,
        horizon_days=args.horizon,
        min_history_days=args.min_history_days,
        step_days=args.step,
    )
    if not evaluation_dates:
        print("No evaluation windows satisfied the criteria. Adjust your parameters.")
        return

    results, category_summary = backtest(
        engine=engine,
        df=df,
        evaluation_dates=evaluation_dates,
        horizon_days=args.horizon,
        method=args.method,
        opening_balance=args.opening_balance,
    )

    if not results:
        print("Backtest produced no results. Check history depth and horizon settings.")
        return

    results_df = pd.DataFrame(
        [
            {
                key: (json.dumps(value) if isinstance(value, dict) else value)
                for key, value in result.items()
            }
            for result in results
        ]
    )

    print(f"Evaluated {len(results)} windows using method '{args.method}' with horizon {args.horizon} days.")
    print()
    print("Per-window metrics (first few rows):")
    print(results_df[[
        "start_date",
        "history_days",
        "actual_transactions",
        "net_actual",
        "net_pred",
        "net_error",
        "daily_mae",
        "daily_rmse",
    ]].head())
    print()

    net_error_mean = float(results_df["net_error"].mean())
    net_error_median = float(results_df["net_error"].median())
    mae_mean = float(results_df["daily_mae"].mean())
    rmse_mean = float(results_df["daily_rmse"].mean())

    print("Aggregate performance:")
    print(f"  Mean net error: {format_currency(net_error_mean)}")
    print(f"  Median net error: {format_currency(net_error_median)}")
    print(f"  Mean daily MAE: {format_currency(mae_mean)}")
    print(f"  Mean daily RMSE: {format_currency(rmse_mean)}")
    print()

    actual_totals = category_summary["actual"]
    predicted_totals = category_summary["predicted"]
    all_categories = sorted(set(actual_totals) | set(predicted_totals))
    print("Category totals across all windows:")
    for category in all_categories:
        actual_value = actual_totals.get(category, 0.0)
        predicted_value = predicted_totals.get(category, 0.0)
        diff = predicted_value - actual_value
        print(
            f"  {category:15s} actual {format_currency(actual_value):>12s} | "
            f"pred {format_currency(predicted_value):>12s} | diff {format_currency(diff):>12s}"
        )
    print()

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        results_df.to_csv(args.output, index=False)
        print(f"Detailed results written to {args.output}")


if __name__ == "__main__":
    main()
