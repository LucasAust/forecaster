import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

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


def to_dataframe(transactions: Sequence[Dict[str, object]]) -> pd.DataFrame:
    if not transactions:
        return pd.DataFrame(columns=["date", "description", "amount", "category", "type"])

    df = pd.DataFrame(list(transactions)).copy()
    df["date"] = pd.to_datetime(df.get("date"), errors="coerce")
    df = df.dropna(subset=["date"])
    if df.empty:
        return pd.DataFrame(columns=["date", "description", "amount", "category", "type"])

    df["amount"] = pd.to_numeric(df.get("amount"), errors="coerce").fillna(0.0)
    df["description"] = df.get("description", "").fillna("").astype(str)
    df["category"] = df.get("category", "other").fillna("other").astype(str)
    if "type" not in df.columns:
        df["type"] = "historical"
    df = df.sort_values("date").reset_index(drop=True)
    return df


def load_transactions(
    statements: Iterable[Tuple[Path, str]],
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


def generate_evaluation_dates(
    df: pd.DataFrame,
    horizon_days: int,
    min_history_days: int,
    step_days: int,
) -> List[datetime]:
    if df.empty:
        return []

    df = df.sort_values("date").reset_index(drop=True)
    min_date = df["date"].min()
    max_date = df["date"].max()
    start_date = min_date + timedelta(days=min_history_days)
    last_start = max_date - timedelta(days=horizon_days - 1)
    if start_date > last_start:
        return []

    evaluation_dates: List[datetime] = []
    cursor = start_date
    step = timedelta(days=max(step_days, 1))
    while cursor <= last_start:
        history_df = df[df["date"] < cursor]
        future_df = df[(df["date"] >= cursor) & (df["date"] <= cursor + timedelta(days=horizon_days - 1))]
        if not history_df.empty and not future_df.empty:
            evaluation_dates.append(cursor)
        cursor += step

    return evaluation_dates


def _serialize_transactions(df: pd.DataFrame) -> List[Dict[str, object]]:
    records: List[Dict[str, object]] = []
    for _, row in df.iterrows():
        records.append(
            {
                "date": row["date"].strftime("%Y-%m-%d"),
                "amount": float(row["amount"]),
                "description": row.get("description", ""),
                "category": row.get("category", "other"),
            }
        )
    return records


def backtest(
    engine: ForecastEngine,
    df: pd.DataFrame,
    evaluation_dates: Sequence[datetime],
    horizon_days: int,
    method: str,
    opening_balance: float,
    debug_output_dir: Path | None,
) -> Tuple[List[Dict[str, object]], Dict[str, Dict[str, float]], Dict[str, int]]:
    results: List[Dict[str, object]] = []
    category_totals_actual: Dict[str, float] = defaultdict(float)
    category_totals_pred: Dict[str, float] = defaultdict(float)
    projection_totals: Counter[str] = Counter()

    debug_dir = Path(debug_output_dir) if debug_output_dir else None
    if debug_dir:
        debug_dir.mkdir(parents=True, exist_ok=True)

    for window_index, start_date in enumerate(evaluation_dates, start=1):
        window_end = start_date + timedelta(days=horizon_days - 1)
        history_df = df[df["date"] < start_date]
        future_df = df[(df["date"] >= start_date) & (df["date"] <= window_end)]

        if history_df.empty or future_df.empty:
            continue

        history_transactions = _serialize_transactions(history_df)
        try:
            forecast_result = engine.run_forecast(
                opening_balance=opening_balance,
                transactions=history_transactions,
                scheduled=[],
                horizon=horizon_days,
                method=method,
                as_of_date=start_date.strftime("%Y-%m-%d"),
            )
        except Exception as exc:
            print(f"Forecast failed for window starting {start_date.date()}: {exc}")
            continue

        forecast_records = forecast_result.get("forecast", []) or []
        forecast_df = pd.DataFrame(forecast_records)
        if not forecast_df.empty:
            forecast_df["date"] = pd.to_datetime(forecast_df["date"], errors="coerce")
            forecast_df = forecast_df.dropna(subset=["date"])
        else:
            forecast_df = pd.DataFrame(columns=["date", "amount", "balance"])

        transactions_records = forecast_result.get("transactions", []) or []
        transactions_df = pd.DataFrame(transactions_records)
        if not transactions_df.empty:
            transactions_df["date"] = pd.to_datetime(transactions_df["date"], errors="coerce")
            transactions_df = transactions_df.dropna(subset=["date"])
        else:
            transactions_df = pd.DataFrame(columns=["date", "amount", "category", "type", "projection_source"])

        future_transactions_df = transactions_df[
            (transactions_df["date"] >= start_date)
            & (transactions_df["date"] <= window_end)
            & (transactions_df.get("type", "historical") != "historical")
        ].copy()

        window_forecast_df = forecast_df[
            (forecast_df["date"] >= start_date)
            & (forecast_df["date"] <= window_end)
        ].copy()

        date_range = pd.date_range(start=start_date, end=window_end, freq="D")
        actual_daily = future_df.groupby("date")["amount"].sum().reindex(date_range, fill_value=0.0)
        predicted_daily = window_forecast_df.groupby("date")["amount"].sum().reindex(date_range, fill_value=0.0)
        predicted_balance = window_forecast_df.set_index("date")["balance"].reindex(date_range, method="ffill")

        net_actual = float(actual_daily.sum())
        net_pred = float(predicted_daily.sum())
        income_actual = float(future_df[future_df["amount"] > 0]["amount"].sum())
        income_pred = float(future_transactions_df[future_transactions_df["amount"] > 0]["amount"].sum())
        expense_actual = float(future_df[future_df["amount"] < 0]["amount"].sum())
        expense_pred = float(future_transactions_df[future_transactions_df["amount"] < 0]["amount"].sum())

        history_balance = opening_balance + float(history_df["amount"].sum())
        final_balance_actual = history_balance + net_actual
        final_balance_pred = float(predicted_balance.iloc[-1]) if not predicted_balance.empty else history_balance

        errors = predicted_daily - actual_daily
        mae = float(np.abs(errors).mean())
        rmse = float(np.sqrt((errors ** 2).mean()))

        actual_category_totals = (
            future_df.groupby("category")["amount"].sum().to_dict() if not future_df.empty else {}
        )
        predicted_category_totals = (
            future_transactions_df.groupby("category")["amount"].sum().to_dict() if not future_transactions_df.empty else {}
        )

        for category, total in actual_category_totals.items():
            category_totals_actual[category] += float(total)
        for category, total in predicted_category_totals.items():
            category_totals_pred[category] += float(total)

        projection_counts = Counter(
            future_transactions_df.loc[
                future_transactions_df.get("type", "forecast") == "forecast",
                "projection_source",
            ].dropna().astype(str)
        )
        projection_totals.update(projection_counts)

        if debug_dir:
            debug_df = pd.DataFrame(
                {
                    "date": date_range,
                    "actual_amount": actual_daily.values,
                    "predicted_amount": predicted_daily.values,
                    "predicted_balance": predicted_balance.values if not predicted_balance.empty else np.nan,
                }
            )
            debug_path = debug_dir / f"window_{window_index:03d}_{start_date.strftime('%Y%m%d')}.csv"
            debug_df.to_csv(debug_path, index=False)

        result = {
            "window_index": window_index,
            "start_date": start_date.strftime("%Y-%m-%d"),
            "end_date": window_end.strftime("%Y-%m-%d"),
            "history_start": history_df["date"].min().strftime("%Y-%m-%d"),
            "history_end": history_df["date"].max().strftime("%Y-%m-%d"),
            "history_days": int((history_df["date"].max() - history_df["date"].min()).days + 1),
            "actual_transactions": int(len(future_df)),
            "predicted_transactions": int(len(future_transactions_df)),
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
            "category_actual": {k: float(v) for k, v in actual_category_totals.items()},
            "category_pred": {k: float(v) for k, v in predicted_category_totals.items()},
            "projection_sources": dict(projection_counts),
        }
        results.append(result)

    category_summary = {
        "actual": dict(category_totals_actual),
        "predicted": dict(category_totals_pred),
    }

    return results, category_summary, dict(projection_totals)


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
        for category, meta in list(category_aliases.items())[:20]:
            print(
                f"{category}: display={meta.get('display')} total_spend={meta.get('total_spend')}"
            )
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

    results, category_summary, projection_summary = backtest(
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

    print(
        f"Evaluated {len(results)} windows using method '{args.method}' with horizon {args.horizon} days."
    )
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

    if projection_summary:
        print("Projection source counts across all windows:")
        for source, count in projection_summary.items():
            print(f"  {source or 'unknown'}: {count}")
        print()

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        results_df.to_csv(args.output, index=False)
        print(f"Detailed results written to {args.output}")


if __name__ == "__main__":
    main()import argparseimport argparse

import jsonimport json

from collections import Counter, defaultdictfrom collections import defaultdict

from datetime import datetime, timedeltafrom datetime import datetime, timedelta

from pathlib import Pathfrom pathlib import Path

from typing import Dict, Iterable, List, Sequence, Tuplefrom typing import Dict, List, Tuple



import numpy as npimport numpy as np

import pandas as pdimport pandas as pd



from forecast_engine import ForecastEnginefrom forecast_engine import ForecastEngine

from statement_parser import parse_statementfrom statement_parser import parse_statement





def _parse_statement_arg(arg_value: str) -> Tuple[Path, str]:def _parse_statement_arg(arg_value: str) -> Tuple[Path, str]:

    if ":" not in arg_value:    if ":" not in arg_value:

        raise argparse.ArgumentTypeError("Statements must be provided as '<path>:<statement_type>'")        raise argparse.ArgumentTypeError("Statements must be provided as '<path>:<statement_type>'")

    path_str, stmt_type = arg_value.split(":", 1)    path_str, stmt_type = arg_value.split(":", 1)

    path = Path(path_str).expanduser().resolve()    path = Path(path_str).expanduser().resolve()

    if not path.exists():    if not path.exists():

        raise argparse.ArgumentTypeError(f"Statement path does not exist: {path}")        raise argparse.ArgumentTypeError(f"Statement path does not exist: {path}")

    stmt_type_normalized = stmt_type.strip().lower()    stmt_type_normalized = stmt_type.strip().lower()

    if stmt_type_normalized not in {"credit_card", "bank_account"}:    if stmt_type_normalized not in {"credit_card", "bank_account"}:

        raise argparse.ArgumentTypeError(        raise argparse.ArgumentTypeError(

            f"Unsupported statement type '{stmt_type}'. Use 'credit_card' or 'bank_account'."            f"Unsupported statement type '{stmt_type}'. Use 'credit_card' or 'bank_account'."

        )        )

    return path, stmt_type_normalized    return path, stmt_type_normalized





def to_dataframe(transactions: Sequence[Dict[str, object]]) -> pd.DataFrame:def load_transactions(

    if not transactions:    statements: List[Tuple[Path, str]],

        return pd.DataFrame(columns=["date", "description", "amount", "category", "type"])    engine: ForecastEngine,

) -> Tuple[List[Dict[str, object]], Dict[str, pd.DataFrame]]:

    df = pd.DataFrame(list(transactions)).copy()    combined_raw: List[Dict[str, object]] = []

    df["date"] = pd.to_datetime(df.get("date"), errors="coerce")    per_file_frames: Dict[str, pd.DataFrame] = {}

    df = df.dropna(subset=["date"])

    if df.empty:    for path, stmt_type in statements:

        return pd.DataFrame(columns=["date", "description", "amount", "category", "type"])        with path.open("rb") as handle:

            parsed = parse_statement(handle, statement_type=stmt_type)

    df["amount"] = pd.to_numeric(df.get("amount"), errors="coerce").fillna(0.0)

    df["description"] = df.get("description", "").fillna("").astype(str)        transactions = parsed.get("transactions", []) or []

    df["category"] = df.get("category", "other").fillna("other").astype(str)        combined_raw.extend(transactions)

    if "type" not in df.columns:

        df["type"] = "historical"        try:

    df = df.sort_values("date").reset_index(drop=True)            sanitized_file = engine._sanitize_transactions(list(transactions))

    return df            per_file_frames[str(path)] = to_dataframe(sanitized_file)

        except Exception:

            per_file_frames[str(path)] = pd.DataFrame(columns=["date", "description", "amount", "category"])

def load_transactions(

    statements: Iterable[Tuple[Path, str]],    sanitized_all = engine._sanitize_transactions(combined_raw)

    engine: ForecastEngine,    sanitized_all.sort(key=lambda entry: entry.get("date", ""))

) -> Tuple[List[Dict[str, object]], Dict[str, pd.DataFrame]]:    return sanitized_all, per_file_frames

    combined_raw: List[Dict[str, object]] = []

    per_file_frames: Dict[str, pd.DataFrame] = {}

def main() -> None:

    for path, stmt_type in statements:    parser = argparse.ArgumentParser(description="Backtest the ForecastEngine across historical windows.")

        with path.open("rb") as handle:    parser.add_argument(

            parsed = parse_statement(handle, statement_type=stmt_type)        "--statement",

        action="append",

        transactions = parsed.get("transactions", []) or []        type=_parse_statement_arg,

        combined_raw.extend(transactions)        required=True,

        help="Statement source in the form '<path>:<statement_type>'. Repeat for multiple files.",

        try:    )

            sanitized_file = engine._sanitize_transactions(list(transactions))    parser.add_argument(

            per_file_frames[str(path)] = to_dataframe(sanitized_file)        "--method",

        except Exception:        default="prophet",

            per_file_frames[str(path)] = pd.DataFrame(columns=["date", "description", "amount", "category"])        help="Forecast method to evaluate (default: prophet). Currently only 'prophet' is available.",

    )

    sanitized_all = engine._sanitize_transactions(combined_raw)    parser.add_argument("--horizon", type=int, default=30, help="Forecast horizon in days (default: 30)")

    sanitized_all.sort(key=lambda entry: entry.get("date", ""))    parser.add_argument(

    return sanitized_all, per_file_frames        "--step",

        type=int,

        default=30,

def generate_evaluation_dates(        help="Spacing between evaluation windows in days (default: 30)",

    df: pd.DataFrame,    )

    horizon_days: int,    parser.add_argument(

    min_history_days: int,        "--min-history-days",

    step_days: int,        type=int,

) -> List[datetime]:        default=120,

    if df.empty:        help="Minimum amount of history required before an evaluation window (default: 120)",

        return []    )

    parser.add_argument(

    df = df.sort_values("date").reset_index(drop=True)        "--opening-balance",

    min_date = df["date"].min()        type=float,

    max_date = df["date"].max()        default=0.0,

    start_date = min_date + timedelta(days=min_history_days)        help="Balance prior to the earliest transaction in the dataset (default: 0)",

    last_start = max_date - timedelta(days=horizon_days - 1)    )

    if start_date > last_start:    parser.add_argument(

        return []        "--output",

        type=Path,

    evaluation_dates: List[datetime] = []        help="Optional path to write detailed backtest results as CSV",

    cursor = start_date    )

    step = timedelta(days=max(step_days, 1))    parser.add_argument(

    while cursor <= last_start:        "--debug-output-dir",

        history_df = df[df["date"] < cursor]        type=Path,

        future_df = df[(df["date"] >= cursor) & (df["date"] <= cursor + timedelta(days=horizon_days - 1))]        help="Directory to write per-window actual vs predicted CSV diagnostics",

        if not history_df.empty and not future_df.empty:    )

            evaluation_dates.append(cursor)

        cursor += step    args = parser.parse_args()



    return evaluation_dates    engine = ForecastEngine()

    transactions, per_file_frames = load_transactions(args.statement, engine)



def _serialize_transactions(df: pd.DataFrame) -> List[Dict[str, object]]:    for fname, frame in per_file_frames.items():

    records: List[Dict[str, object]] = []        if frame.empty:

    for _, row in df.iterrows():            print(f"{fname}: no transactions after sanitization")

        records.append(            continue

            {        sample_size = min(len(frame), 8)

                "date": row["date"].strftime("%Y-%m-%d"),        sample_values = frame["amount"].sample(n=sample_size, random_state=0).tolist()

                "amount": float(row["amount"]),        print(f"{fname} sample signs: {sample_values}")

                "description": row.get("description", ""),        print(f"{fname} sum: {frame['amount'].sum()}")

                "category": row.get("category", "other"),

            }    try:

        )        df_tmp = to_dataframe(transactions)

    return records        category_aliases = engine._category_alias_map(df_tmp)

        print("=== Category aliases (sample) ===")

        for category, meta in category_aliases.items():

def backtest(            print(f"{category}: display={meta.get('display')} total_spend={meta.get('total_spend')}")

    engine: ForecastEngine,        print("=== Top raw descriptions by abs total ===")

    df: pd.DataFrame,        top_raw = (

    evaluation_dates: Sequence[datetime],            df_tmp.assign(absamt=df_tmp["amount"].abs())

    horizon_days: int,            .groupby("description")["absamt"]

    method: str,            .sum()

    opening_balance: float,            .sort_values(ascending=False)

    debug_output_dir: Path | None,            .head(20)

) -> Tuple[List[Dict[str, object]], Dict[str, Dict[str, float]], Dict[str, int]]:        )

    results: List[Dict[str, object]] = []        print(top_raw)

    category_totals_actual: Dict[str, float] = defaultdict(float)    except Exception as exc:

    category_totals_pred: Dict[str, float] = defaultdict(float)        print("Alias diagnostics failed:", exc)

    projection_totals: Counter[str] = Counter()        df_tmp = to_dataframe(transactions)



    debug_dir = Path(debug_output_dir) if debug_output_dir else None    df = df_tmp

    if debug_dir:    if df.empty:

        debug_dir.mkdir(parents=True, exist_ok=True)        print("No transactions loaded. Aborting backtest.")

        return

    for window_index, start_date in enumerate(evaluation_dates, start=1):

        window_end = start_date + timedelta(days=horizon_days - 1)    evaluation_dates = generate_evaluation_dates(

        history_df = df[df["date"] < start_date]        df=df,

        future_df = df[(df["date"] >= start_date) & (df["date"] <= window_end)]        horizon_days=args.horizon,

        min_history_days=args.min_history_days,

        if history_df.empty or future_df.empty:        step_days=args.step,

            continue    )

    if not evaluation_dates:

        history_transactions = _serialize_transactions(history_df)        print("No evaluation windows satisfied the criteria. Adjust your parameters.")

        try:        return

            forecast_result = engine.run_forecast(

                opening_balance=opening_balance,    results, category_summary = backtest(

                transactions=history_transactions,        engine=engine,

                scheduled=[],        df=df,

                horizon=horizon_days,        evaluation_dates=evaluation_dates,

                method=method,        horizon_days=args.horizon,

                as_of_date=start_date.strftime("%Y-%m-%d"),        method=args.method,

            )        opening_balance=args.opening_balance,

        except Exception as exc:        debug_output_dir=args.debug_output_dir,

            print(f"Forecast failed for window starting {start_date.date()}: {exc}")    )

            continue

    if not results:

        forecast_records = forecast_result.get("forecast", []) or []        print("Backtest produced no results. Check history depth and horizon settings.")

        forecast_df = pd.DataFrame(forecast_records)        return

        if not forecast_df.empty:

            forecast_df["date"] = pd.to_datetime(forecast_df["date"], errors="coerce")    results_df = pd.DataFrame(

            forecast_df = forecast_df.dropna(subset=["date"])        [

        else:            {

            forecast_df = pd.DataFrame(columns=["date", "amount", "balance"])                key: (json.dumps(value) if isinstance(value, dict) else value)

                for key, value in result.items()

        transactions_records = forecast_result.get("transactions", []) or []            }

        transactions_df = pd.DataFrame(transactions_records)            for result in results

        if not transactions_df.empty:        ]

            transactions_df["date"] = pd.to_datetime(transactions_df["date"], errors="coerce")    )

            transactions_df = transactions_df.dropna(subset=["date"])

        else:    print(f"Evaluated {len(results)} windows using method '{args.method}' with horizon {args.horizon} days.")

            transactions_df = pd.DataFrame(columns=["date", "amount", "category", "type", "projection_source"])    print()

    print("Per-window metrics (first few rows):")

        future_transactions_df = transactions_df[    print(

            (transactions_df["date"] >= start_date)        results_df[[

            & (transactions_df["date"] <= window_end)            "start_date",

            & (transactions_df.get("type", "historical") != "historical")            "history_days",

        ].copy()            "actual_transactions",

            "net_actual",

        window_forecast_df = forecast_df[            "net_pred",

            (forecast_df["date"] >= start_date)            "net_error",

            & (forecast_df["date"] <= window_end)            "daily_mae",

        ].copy()            "daily_rmse",

        ]].head()

        date_range = pd.date_range(start=start_date, end=window_end, freq="D")    )

        actual_daily = future_df.groupby("date")["amount"].sum().reindex(date_range, fill_value=0.0)    print()

        predicted_daily = window_forecast_df.groupby("date")["amount"].sum().reindex(date_range, fill_value=0.0)

        predicted_balance = window_forecast_df.set_index("date")["balance"].reindex(date_range, method="ffill")    net_error_mean = float(results_df["net_error"].mean())

    net_error_median = float(results_df["net_error"].median())

        net_actual = float(actual_daily.sum())    mae_mean = float(results_df["daily_mae"].mean())

        net_pred = float(predicted_daily.sum())    rmse_mean = float(results_df["daily_rmse"].mean())

        income_actual = float(future_df[future_df["amount"] > 0]["amount"].sum())

        income_pred = float(future_transactions_df[future_transactions_df["amount"] > 0]["amount"].sum())    print("Aggregate performance:")

        expense_actual = float(future_df[future_df["amount"] < 0]["amount"].sum())    print(f"  Mean net error: {format_currency(net_error_mean)}")

        expense_pred = float(future_transactions_df[future_transactions_df["amount"] < 0]["amount"].sum())    print(f"  Median net error: {format_currency(net_error_median)}")

    print(f"  Mean daily MAE: {format_currency(mae_mean)}")

        history_balance = opening_balance + float(history_df["amount"].sum())    print(f"  Mean daily RMSE: {format_currency(rmse_mean)}")

        final_balance_actual = history_balance + net_actual    print()

        final_balance_pred = float(predicted_balance.iloc[-1]) if not predicted_balance.empty else history_balance

    actual_totals = category_summary["actual"]

        errors = predicted_daily - actual_daily    predicted_totals = category_summary["predicted"]

        mae = float(np.abs(errors).mean())    all_categories = sorted(set(actual_totals) | set(predicted_totals))

        rmse = float(np.sqrt((errors ** 2).mean()))    print("Category totals across all windows:")

    for category in all_categories:

        actual_category_totals = (        actual_value = actual_totals.get(category, 0.0)

            future_df.groupby("category")["amount"].sum().to_dict() if not future_df.empty else {}        predicted_value = predicted_totals.get(category, 0.0)

        )        diff = predicted_value - actual_value

        predicted_category_totals = (        print(

            future_transactions_df.groupby("category")["amount"].sum().to_dict() if not future_transactions_df.empty else {}            f"  {category:15s} actual {format_currency(actual_value):>12s} | "

        )            f"pred {format_currency(predicted_value):>12s} | diff {format_currency(diff):>12s}"

        )

        for category, total in actual_category_totals.items():    print()

            category_totals_actual[category] += float(total)

        for category, total in predicted_category_totals.items():    if args.output:

            category_totals_pred[category] += float(total)        args.output.parent.mkdir(parents=True, exist_ok=True)

        results_df.to_csv(args.output, index=False)

        projection_counts = Counter(        print(f"Detailed results written to {args.output}")

            future_transactions_df.loc[

                future_transactions_df.get("type", "forecast") == "forecast",

                "projection_source",if __name__ == "__main__":

            ].dropna().astype(str)    main()

        )            "net_pred": net_pred,

        projection_totals.update(projection_counts)            "net_error": net_pred - net_actual,

            "income_actual": income_actual,

        if debug_dir:            "income_pred": income_pred,

            debug_df = pd.DataFrame(            "income_error": income_pred - income_actual,

                {            "expense_actual": expense_actual,

                    "date": date_range,            "expense_pred": expense_pred,

                    "actual_amount": actual_daily.values,            "expense_error": expense_pred - expense_actual,

                    "predicted_amount": predicted_daily.values,            "final_balance_actual": final_balance_actual,

                    "predicted_balance": predicted_balance.values if not predicted_balance.empty else np.nan,            "final_balance_pred": final_balance_pred,

                }            "balance_error": final_balance_pred - final_balance_actual,

            )            "daily_mae": mae,

            debug_path = debug_dir / f"window_{window_index:03d}_{start_date.strftime('%Y%m%d')}.csv"            "daily_rmse": rmse,

            debug_df.to_csv(debug_path, index=False)            "category_actual": actual_category_totals,

            "category_pred": predicted_category_totals,

        result = {        }

            "window_index": window_index,        results.append(result)

            "start_date": start_date.strftime("%Y-%m-%d"),

            "end_date": window_end.strftime("%Y-%m-%d"),    category_summary = {

            "history_start": history_df["date"].min().strftime("%Y-%m-%d"),        "actual": dict(category_totals_actual),

            "history_end": history_df["date"].max().strftime("%Y-%m-%d"),        "predicted": dict(category_totals_pred),

            "history_days": int((history_df["date"].max() - history_df["date"].min()).days + 1),    }

            "actual_transactions": int(len(future_df)),

            "predicted_transactions": int(len(future_transactions_df)),    return results, category_summary

            "net_actual": net_actual,

            "net_pred": net_pred,

            "net_error": net_pred - net_actual,def format_currency(value: float) -> str:

            "income_actual": income_actual,    return f"${value:,.2f}"

            "income_pred": income_pred,

            "income_error": income_pred - income_actual,

            "expense_actual": expense_actual,def main() -> None:

            "expense_pred": expense_pred,    parser = argparse.ArgumentParser(description="Backtest the ForecastEngine across historical windows.")

            "expense_error": expense_pred - expense_actual,    parser.add_argument(

            "final_balance_actual": final_balance_actual,        "--statement",

            "final_balance_pred": final_balance_pred,        action="append",

            "balance_error": final_balance_pred - final_balance_actual,        type=_parse_statement_arg,

            "daily_mae": mae,        required=True,

            "daily_rmse": rmse,        help="Statement source in the form '<path>:<statement_type>'. Repeat for multiple files.",

            "category_actual": {k: float(v) for k, v in actual_category_totals.items()},    )

            "category_pred": {k: float(v) for k, v in predicted_category_totals.items()},    parser.add_argument(

            "projection_sources": dict(projection_counts),        "--method",

        }        default="prophet",

        results.append(result)        help="Forecast method to evaluate (default: prophet). Currently only 'prophet' is available.",

    )

    category_summary = {    parser.add_argument(

        "actual": dict(category_totals_actual),        "--debug-output-dir",

        "predicted": dict(category_totals_pred),        type=Path,

    }        help="Directory to write per-window actual vs predicted CSV diagnostics",

    )

    return results, category_summary, dict(projection_totals)    parser.add_argument("--horizon", type=int, default=30, help="Forecast horizon in days (default: 30)")

    parser.add_argument(

        "--step",

def format_currency(value: float) -> str:        type=int,

    return f"${value:,.2f}"    transactions, per_file_frames = load_transactions(args.statement, engine)



    for fname, frame in per_file_frames.items():

def main() -> None:        if frame.empty:

    parser = argparse.ArgumentParser(description="Backtest the ForecastEngine across historical windows.")            print(f"{fname}: no transactions after sanitization")

    parser.add_argument(            continue

        "--statement",        sample_count = min(len(frame), 8)

        action="append",        sample_values = frame['amount'].sample(n=sample_count, random_state=0).tolist()

        type=_parse_statement_arg,        print(f"{fname} sample signs: {sample_values}")

        required=True,        print(f"{fname} sum: {frame['amount'].sum()}")

        help="Statement source in the form '<path>:<statement_type>'. Repeat for multiple files.",

    )    try:

    parser.add_argument(        df_tmp = to_dataframe(transactions)

        "--method",        category_aliases = engine._category_alias_map(df_tmp)

        default="prophet",        print("=== Category aliases (sample) ===")

        help="Forecast method to evaluate (default: prophet). Currently only 'prophet' is available.",        for category, meta in category_aliases.items():

    )            print(f"{category}: display={meta.get('display')} total_spend={meta.get('total_spend')}")

    parser.add_argument("--horizon", type=int, default=30, help="Forecast horizon in days (default: 30)")        print("=== Top raw descriptions by abs total ===")

    parser.add_argument(        top_raw = (

        "--step",            df_tmp.assign(absamt=df_tmp['amount'].abs())

        type=int,            .groupby('description')['absamt']

        default=30,            .sum()

        help="Spacing between evaluation windows in days (default: 30)",            .sort_values(ascending=False)

    )            .head(20)

    parser.add_argument(        )

        "--min-history-days",        print(top_raw)

        type=int,    except Exception as exc:

        default=120,        print("Alias diagnostics failed:", exc)

        help="Minimum amount of history required before an evaluation window (default: 120)",        help="Spacing between evaluation windows in days (default: 30)",

    )    )

    parser.add_argument(    parser.add_argument(

        "--opening-balance",        "--min-history-days",

        type=float,        type=int,

        default=0.0,        default=120,

        help="Balance prior to the earliest transaction in the dataset (default: 0)",        help="Minimum amount of history required before an evaluation window (default: 120)",

    )    )

    parser.add_argument(    parser.add_argument(

        "--output",        "--opening-balance",

        type=Path,        type=float,

        help="Optional path to write detailed backtest results as CSV",        default=0.0,

    )        help="Balance prior to the earliest transaction in the dataset (default: 0)",

    parser.add_argument(    )

        "--debug-output-dir",

        type=Path,    args = parser.parse_args()

        help="Directory to write per-window actual vs predicted CSV diagnostics",

    )    engine = ForecastEngine()

    transactions = load_transactions(args.statement, engine)

    args = parser.parse_args()    df = to_dataframe(transactions)

    if df.empty:

    engine = ForecastEngine()        print("No transactions loaded. Aborting backtest.")

    transactions, per_file_frames = load_transactions(args.statement, engine)        return



    for fname, frame in per_file_frames.items():    evaluation_dates = generate_evaluation_dates(

        if frame.empty:        df=df,

            print(f"{fname}: no transactions after sanitization")        horizon_days=args.horizon,

            continue        min_history_days=args.min_history_days,

        sample_size = min(len(frame), 8)        step_days=args.step,

        sample_values = frame["amount"].sample(n=sample_size, random_state=0).tolist()    )

        print(f"{fname} sample signs: {sample_values}")    if not evaluation_dates:

        print(f"{fname} sum: {frame['amount'].sum()}")        print("No evaluation windows satisfied the criteria. Adjust your parameters.")

        return

    try:

        df_tmp = to_dataframe(transactions)    results, category_summary = backtest(

        category_aliases = engine._category_alias_map(df_tmp)        engine=engine,

        print("=== Category aliases (sample) ===")        df=df,

        for category, meta in list(category_aliases.items())[:20]:    parser.add_argument(

            print(        "--debug-output-dir",

                f"{category}: display={meta.get('display')} total_spend={meta.get('total_spend')}"        type=Path,

            )        help="Directory to write per-window actual vs predicted CSV diagnostics",

        print("=== Top raw descriptions by abs total ===")    )

        top_raw = (        evaluation_dates=evaluation_dates,

            df_tmp.assign(absamt=df_tmp["amount"].abs())        horizon_days=args.horizon,

            .groupby("description")["absamt"]        method=args.method,

            .sum()        opening_balance=args.opening_balance,

            .sort_values(ascending=False)    transactions, per_file_frames = load_transactions(args.statement, engine)

            .head(20)

        )    for fname, frame in per_file_frames.items():

        print(top_raw)        if frame.empty:

    except Exception as exc:            print(f"{fname}: no transactions after sanitization")

        print("Alias diagnostics failed:", exc)            continue

        df_tmp = to_dataframe(transactions)        sample_count = min(len(frame), 8)

        sample_values = frame['amount'].sample(n=sample_count, random_state=0).tolist()

    df = df_tmp        print(f"{fname} sample signs: {sample_values}")

    if df.empty:        print(f"{fname} sum: {frame['amount'].sum()}")

        print("No transactions loaded. Aborting backtest.")

        return    try:

        df_tmp = to_dataframe(transactions)

    evaluation_dates = generate_evaluation_dates(        category_aliases = engine._category_alias_map(df_tmp)

        df=df,        print("=== Category aliases (sample) ===")

        horizon_days=args.horizon,        for category, meta in category_aliases.items():

        min_history_days=args.min_history_days,            print(f"{category}: display={meta.get('display')} total_spend={meta.get('total_spend')}")

        step_days=args.step,        print("=== Top raw descriptions by abs total ===")

    )        top_raw = (

    if not evaluation_dates:            df_tmp.assign(absamt=df_tmp['amount'].abs())

        print("No evaluation windows satisfied the criteria. Adjust your parameters.")            .groupby('description')['absamt']

        return            .sum()

            .sort_values(ascending=False)

    results, category_summary, projection_summary = backtest(            .head(20)

        engine=engine,        )

        df=df,        print(top_raw)

        evaluation_dates=evaluation_dates,    except Exception as exc:

        horizon_days=args.horizon,        print("Alias diagnostics failed:", exc)

        method=args.method,    )

        opening_balance=args.opening_balance,

        debug_output_dir=args.debug_output_dir,    if not results:

    )        print("Backtest produced no results. Check history depth and horizon settings.")

        return

    if not results:

        print("Backtest produced no results. Check history depth and horizon settings.")    results_df = pd.DataFrame(

        return        [

            {

    results_df = pd.DataFrame(                key: (json.dumps(value) if isinstance(value, dict) else value)

        [                for key, value in result.items()

            {            }

                key: (json.dumps(value) if isinstance(value, dict) else value)            for result in results

                for key, value in result.items()        ]

            }    )

            for result in results

        ]    print(f"Evaluated {len(results)} windows using method '{args.method}' with horizon {args.horizon} days.")

    )    print()

    print("Per-window metrics (first few rows):")

    print(    print(results_df[[

        f"Evaluated {len(results)} windows using method '{args.method}' with horizon {args.horizon} days."        "start_date",

    )        "history_days",

    print()        "actual_transactions",

    print("Per-window metrics (first few rows):")        "net_actual",

    print(        "net_pred",

        results_df[[        "net_error",

            "start_date",        "daily_mae",

            "history_days",        "daily_rmse",

            "actual_transactions",    ]].head())

            "net_actual",    print()

            "net_pred",

            "net_error",    net_error_mean = float(results_df["net_error"].mean())

            "daily_mae",    net_error_median = float(results_df["net_error"].median())

            "daily_rmse",    mae_mean = float(results_df["daily_mae"].mean())

        ]].head()    rmse_mean = float(results_df["daily_rmse"].mean())

    )

    print()    print("Aggregate performance:")

    print(f"  Mean net error: {format_currency(net_error_mean)}")

    net_error_mean = float(results_df["net_error"].mean())    print(f"  Median net error: {format_currency(net_error_median)}")

    net_error_median = float(results_df["net_error"].median())    print(f"  Mean daily MAE: {format_currency(mae_mean)}")

    mae_mean = float(results_df["daily_mae"].mean())    print(f"  Mean daily RMSE: {format_currency(rmse_mean)}")

    rmse_mean = float(results_df["daily_rmse"].mean())    print()



    print("Aggregate performance:")    actual_totals = category_summary["actual"]

    print(f"  Mean net error: {format_currency(net_error_mean)}")    predicted_totals = category_summary["predicted"]

    print(f"  Median net error: {format_currency(net_error_median)}")    all_categories = sorted(set(actual_totals) | set(predicted_totals))

    print(f"  Mean daily MAE: {format_currency(mae_mean)}")    print("Category totals across all windows:")

    print(f"  Mean daily RMSE: {format_currency(rmse_mean)}")    for category in all_categories:

    print()        actual_value = actual_totals.get(category, 0.0)

        predicted_value = predicted_totals.get(category, 0.0)

    actual_totals = category_summary["actual"]        diff = predicted_value - actual_value

    predicted_totals = category_summary["predicted"]        print(

    all_categories = sorted(set(actual_totals) | set(predicted_totals))            f"  {category:15s} actual {format_currency(actual_value):>12s} | "

    print("Category totals across all windows:")            f"pred {format_currency(predicted_value):>12s} | diff {format_currency(diff):>12s}"

    for category in all_categories:        )

        actual_value = actual_totals.get(category, 0.0)    print()

        predicted_value = predicted_totals.get(category, 0.0)

        diff = predicted_value - actual_value    if args.output:

        print(        args.output.parent.mkdir(parents=True, exist_ok=True)

            f"  {category:15s} actual {format_currency(actual_value):>12s} | "        results_df.to_csv(args.output, index=False)

            f"pred {format_currency(predicted_value):>12s} | diff {format_currency(diff):>12s}"        print(f"Detailed results written to {args.output}")

        )

    print()

if __name__ == "__main__":

    if projection_summary:    main()

        print("Projection source counts across all windows:")
        for source, count in projection_summary.items():
            print(f"  {source or 'unknown'}: {count}")
        print()

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        results_df.to_csv(args.output, index=False)
        print(f"Detailed results written to {args.output}")


if __name__ == "__main__":
    main()
