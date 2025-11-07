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


def load_transactions(
    statements: List[Tuple[Path, str]],
    engine: ForecastEngine,
) -> Tuple[List[Dict[str, object]], Dict[str, pd.DataFrame]]:
    combined_raw: List[Dict[str, object]] = []
    per_file_frames: Dict[str, pd.DataFrame] = {}

    for path, stmt_type in statements:
        with path.open("rb") as handle:
            parsed = parse_statement(handle, statement_type=stmt_type)

        transactions = parsed.get("transactions", []) or []
        combined_raw.extend(transactions)

        try:
            sanitized_file = engine._sanitize_transactions(list(transactions))
            per_file_frames[str(path)] = to_dataframe(sanitized_file)
        except Exception:
            per_file_frames[str(path)] = pd.DataFrame(columns=["date", "description", "amount", "category"])

    sanitized_all = engine._sanitize_transactions(combined_raw)
    sanitized_all.sort(key=lambda entry: entry.get("date", ""))
    return sanitized_all, per_file_frames


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
    parser.add_argument(
        "--debug-output-dir",
        type=Path,
        help="Directory to write per-window actual vs predicted CSV diagnostics",
    )

    args = parser.parse_args()

    engine = ForecastEngine()
    transactions, per_file_frames = load_transactions(args.statement, engine)

    for fname, frame in per_file_frames.items():
        if frame.empty:
            print(f"{fname}: no transactions after sanitization")
            continue
        sample_size = min(len(frame), 8)
        sample_values = frame["amount"].sample(n=sample_size, random_state=0).tolist()
        print(f"{fname} sample signs: {sample_values}")
        print(f"{fname} sum: {frame['amount'].sum()}")

    try:
        df_tmp = to_dataframe(transactions)
        category_aliases = engine._category_alias_map(df_tmp)
        print("=== Category aliases (sample) ===")
        for category, meta in category_aliases.items():
            print(f"{category}: display={meta.get('display')} total_spend={meta.get('total_spend')}")
        print("=== Top raw descriptions by abs total ===")
        top_raw = (
            df_tmp.assign(absamt=df_tmp["amount"].abs())
            .groupby("description")["absamt"]
            .sum()
            .sort_values(ascending=False)
            .head(20)
        )
        print(top_raw)
    except Exception as exc:
        print("Alias diagnostics failed:", exc)
        df_tmp = to_dataframe(transactions)

    df = df_tmp
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
        debug_output_dir=args.debug_output_dir,
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
    print(
        results_df[[
            "start_date",
            "history_days",
            "actual_transactions",
            "net_actual",
            "net_pred",
            "net_error",
            "daily_mae",
            "daily_rmse",
        ]].head()
    )
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
    parser.add_argument(
        "--debug-output-dir",
        type=Path,
        help="Directory to write per-window actual vs predicted CSV diagnostics",
    )
    parser.add_argument("--horizon", type=int, default=30, help="Forecast horizon in days (default: 30)")
    parser.add_argument(
        "--step",
        type=int,
    transactions, per_file_frames = load_transactions(args.statement, engine)

    for fname, frame in per_file_frames.items():
        if frame.empty:
            print(f"{fname}: no transactions after sanitization")
            continue
        sample_count = min(len(frame), 8)
        sample_values = frame['amount'].sample(n=sample_count, random_state=0).tolist()
        print(f"{fname} sample signs: {sample_values}")
        print(f"{fname} sum: {frame['amount'].sum()}")

    try:
        df_tmp = to_dataframe(transactions)
        category_aliases = engine._category_alias_map(df_tmp)
        print("=== Category aliases (sample) ===")
        for category, meta in category_aliases.items():
            print(f"{category}: display={meta.get('display')} total_spend={meta.get('total_spend')}")
        print("=== Top raw descriptions by abs total ===")
        top_raw = (
            df_tmp.assign(absamt=df_tmp['amount'].abs())
            .groupby('description')['absamt']
            .sum()
            .sort_values(ascending=False)
            .head(20)
        )
        print(top_raw)
    except Exception as exc:
        print("Alias diagnostics failed:", exc)
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
    parser.add_argument(
        "--debug-output-dir",
        type=Path,
        help="Directory to write per-window actual vs predicted CSV diagnostics",
    )
        evaluation_dates=evaluation_dates,
        horizon_days=args.horizon,
        method=args.method,
        opening_balance=args.opening_balance,
    transactions, per_file_frames = load_transactions(args.statement, engine)

    for fname, frame in per_file_frames.items():
        if frame.empty:
            print(f"{fname}: no transactions after sanitization")
            continue
        sample_count = min(len(frame), 8)
        sample_values = frame['amount'].sample(n=sample_count, random_state=0).tolist()
        print(f"{fname} sample signs: {sample_values}")
        print(f"{fname} sum: {frame['amount'].sum()}")

    try:
        df_tmp = to_dataframe(transactions)
        category_aliases = engine._category_alias_map(df_tmp)
        print("=== Category aliases (sample) ===")
        for category, meta in category_aliases.items():
            print(f"{category}: display={meta.get('display')} total_spend={meta.get('total_spend')}")
        print("=== Top raw descriptions by abs total ===")
        top_raw = (
            df_tmp.assign(absamt=df_tmp['amount'].abs())
            .groupby('description')['absamt']
            .sum()
            .sort_values(ascending=False)
            .head(20)
        )
        print(top_raw)
    except Exception as exc:
        print("Alias diagnostics failed:", exc)
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
