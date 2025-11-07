import csv
import io
import json
import re
import warnings
from datetime import datetime
from typing import Dict, List, Optional

import pandas as pd

DATE_CANDIDATES = [
    "date",
    "transaction date",
    "trans date",
    "posted date",
    "posting date",
    "post date",
    "processed date",
    "statement date",
]

DESCRIPTION_CANDIDATES = [
    "description",
    "transaction description",
    "merchant",
    "details",
    "memo",
    "payee",
    "narrative",
    "activity description",
]

AMOUNT_CANDIDATES = [
    "amount",
    "transaction amount",
    "amt",
    "usd",
    "value",
]

DEBIT_CANDIDATES = [
    "debit",
    "charge",
    "withdrawal",
    "purchase",
    "spend",
    "fees",
]

CREDIT_CANDIDATES = [
    "credit",
    "payment",
    "deposit",
    "refund",
    "received",
]

TYPE_CANDIDATES = [
    "type",
    "transaction type",
    "debit/credit",
    "dr/cr",
    "drcr",
    "tran type",
]


class StatementParseError(ValueError):
    """Raised when a statement cannot be parsed."""


def _coerce_numeric(series: pd.Series) -> pd.Series:
    cleaned = (
        series.astype(str)
        .str.strip()
        .str.replace(r"[\$,]", "", regex=True)
        .str.replace("(", "-", regex=False)
        .str.replace(")", "", regex=False)
        .str.replace(r"[^0-9\-\.]+", "", regex=True)
    )

    def _normalize_trailing_sign(value: str) -> str:
        if not value:
            return value
        if value.endswith("-") and not value.startswith("-"):
            return f"-{value[:-1]}"
        if value.endswith("+"):
            return value[:-1]
        return value

    cleaned = cleaned.apply(_normalize_trailing_sign)
    cleaned = cleaned.replace({"": pd.NA, "-": pd.NA})
    return pd.to_numeric(cleaned, errors="coerce")


def _find_column(columns: List[str], candidates: List[str], exclude: Optional[List[str]] = None) -> Optional[str]:
    exclude = exclude or []
    for candidate in candidates:
        for col in columns:
            if col in exclude:
                continue
            normalized = col.lower().strip()
            if candidate == normalized or candidate in normalized:
                return col
    return None


def _resolve_column(columns: List[str], name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    target = name.lower().strip()
    for col in columns:
        if col.lower().strip() == target:
            return col
    raise StatementParseError(f"Column '{name}' was not found in the uploaded statement")


def _realign_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.index, pd.RangeIndex):
        return df

    columns = list(df.columns)
    if not columns:
        return df

    try:
        sample_values = df[columns[0]].dropna().astype(str).head(5)
    except KeyError:
        sample_values = pd.Series(dtype=str)

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        sample_dates = pd.to_datetime(sample_values, errors="coerce") if not sample_values.empty else pd.Series(dtype="datetime64[ns]")
        index_values = pd.Series(df.index.astype(str)).head(5)
        index_dates = pd.to_datetime(index_values, errors="coerce") if not index_values.empty else pd.Series(dtype="datetime64[ns]")

    if sample_dates.notna().sum() >= index_dates.notna().sum():
        shifted = df.reset_index()
        aligned = pd.DataFrame()
        aligned[columns[0]] = shifted["index"]
        for idx in range(1, len(columns)):
            aligned[columns[idx]] = shifted[columns[idx - 1]]
        aligned = aligned.loc[:, ~aligned.columns.duplicated()]
        aligned = aligned.dropna(axis=1, how="all")
        return aligned

    return df.reset_index(drop=False)


def _parse_dates(series: pd.Series) -> pd.Series:
    raw = series.astype(str).str.strip()
    raw = raw.replace({"": pd.NA, "nan": pd.NA, "nat": pd.NA, "none": pd.NA})

    # Remove obvious placeholders like "pending" or "n/a"
    raw = raw.apply(lambda value: pd.NA if isinstance(value, str) and value.lower() in {"pending", "n/a", "na", "tbd"} else value)

    parsed = pd.to_datetime(raw, errors="coerce")
    if parsed.notna().any():
        return parsed

    # Manual format attempts for common bank exports
    candidate_formats = [
        "%m/%d/%Y",
        "%m/%d/%y",
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%b %d, %Y",
        "%b %d %Y",
        "%d %b %Y",
        "%d %b, %Y",
    ]

    for fmt in candidate_formats:
        parsed = pd.to_datetime(raw, format=fmt, errors="coerce")
        if parsed.notna().any():
            return parsed

    # Handle compact numeric formats such as 20241005 or 10052024
    def _parse_compact(value: str) -> Optional[datetime]:
        if not value:
            return None
        digits = re.sub(r"[^0-9]", "", value)
        if len(digits) == 8:
            for fmt in ("%Y%m%d", "%m%d%Y", "%d%m%Y"):
                try:
                    return datetime.strptime(digits, fmt)
                except ValueError:
                    continue
        return None

    compact_results = []
    compact_success = False
    for entry in raw:
        if pd.isna(entry):
            compact_results.append(pd.NaT)
            continue
        parsed_value = _parse_compact(str(entry))
        if parsed_value:
            compact_results.append(parsed_value)
            compact_success = True
        else:
            compact_results.append(pd.NaT)

    if compact_success:
        return pd.to_datetime(compact_results, errors="coerce")

    return pd.to_datetime(raw, errors="coerce")


def parse_statement(
    file_obj,
    statement_type: str = "credit_card",
    column_map: Optional[Dict[str, str]] = None,
    delimiter: Optional[str] = None,
) -> Dict[str, object]:
    normalized_type = (statement_type or "credit_card").lower().strip()
    if normalized_type not in {"credit_card", "bank_account"}:
        raise StatementParseError(
            f"Unsupported statement type '{statement_type}'. Supported types: credit_card, bank_account"
        )

    raw = file_obj.read()
    filename = getattr(file_obj, "filename", None) or getattr(file_obj, "name", None)
    if hasattr(file_obj, "seek"):
        file_obj.seek(0)
    elif hasattr(file_obj, "stream") and hasattr(file_obj.stream, "seek"):
        file_obj.stream.seek(0)
    if not raw:
        raise StatementParseError("Uploaded statement is empty")

    decoded = None
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            decoded = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue

    if decoded is None:
        raise StatementParseError("Unable to decode statement. Please export as a UTF-8 CSV file")

    buffer = io.StringIO(decoded)
    read_kwargs = {"dtype": str}
    detected_sep = None
    if delimiter:
        read_kwargs["sep"] = delimiter
        detected_sep = delimiter
    else:
        first_line = decoded.splitlines()[0] if decoded.splitlines() else ""
        for candidate in ("\t", ";", "|", "~"):
            if candidate in first_line:
                read_kwargs["sep"] = candidate
                detected_sep = candidate
                break
        else:
            try:
                sample = decoded[:4096]
                dialect = csv.Sniffer().sniff(sample)
                read_kwargs["sep"] = dialect.delimiter
                detected_sep = dialect.delimiter
            except csv.Error:
                detected_sep = None

    df = pd.read_csv(buffer, **read_kwargs)

    if len(df.columns) == 1:
        single_header = str(df.columns[0])
        fallback_candidates = [",", "\t", ";", "|", "~"]
        for candidate in fallback_candidates:
            if candidate == detected_sep:
                continue
            if candidate in single_header:
                buffer.seek(0)
                df = pd.read_csv(buffer, sep=candidate, dtype=str)
                df = _realign_dataframe(df)
                detected_sep = candidate
                break

    if df.empty or len(df.columns) == 0:
        raise StatementParseError("Statement file does not contain transaction rows")

    df = _realign_dataframe(df)
    df.columns = [str(col).strip() for col in df.columns]
    columns = list(df.columns)

    column_map = column_map or {}
    if isinstance(column_map, str):
        try:
            column_map = json.loads(column_map)
        except json.JSONDecodeError as exc:
            raise StatementParseError(f"Invalid column_map JSON: {exc}")

    date_col = _resolve_column(columns, column_map.get("date")) if column_map else None
    if not date_col:
        date_col = _find_column(columns, DATE_CANDIDATES)
    if not date_col:
        raise StatementParseError("Could not detect a date column. Provide a column_map['date'] value")

    description_col = _resolve_column(columns, column_map.get("description")) if column_map else None
    if not description_col:
        description_col = _find_column(columns, DESCRIPTION_CANDIDATES, exclude=[date_col])
    if not description_col:
        raise StatementParseError("Could not detect a description column. Provide a column_map['description'] value")

    amount_col = _resolve_column(columns, column_map.get("amount")) if column_map else None
    debit_col = _resolve_column(columns, column_map.get("debit")) if column_map else None
    credit_col = _resolve_column(columns, column_map.get("credit")) if column_map else None
    type_col = _resolve_column(columns, column_map.get("type")) if column_map else None

    if not amount_col:
        amount_col = _find_column(columns, AMOUNT_CANDIDATES, exclude=[date_col, description_col])
    if not debit_col:
        debit_col = _find_column(columns, DEBIT_CANDIDATES, exclude=[date_col, description_col, amount_col])
    if not credit_col:
        credit_col = _find_column(columns, CREDIT_CANDIDATES, exclude=[date_col, description_col, amount_col, debit_col])
    if not type_col:
        type_col = _find_column(columns, TYPE_CANDIDATES, exclude=[date_col, description_col, amount_col, debit_col, credit_col])

    amounts = None
    if amount_col:
        amounts = _coerce_numeric(df[amount_col])

    if credit_col or debit_col:
        credit_series = _coerce_numeric(df[credit_col]) if credit_col else pd.Series([0] * len(df))
        debit_series = _coerce_numeric(df[debit_col]) if debit_col else pd.Series([0] * len(df))
        combined = credit_series.fillna(0) - debit_series.fillna(0)
        if amounts is None:
            amounts = combined
        else:
            amounts = amounts.fillna(combined)

    if amounts is None:
        raise StatementParseError("Could not locate an amount, debit, or credit column in the statement")

    amounts = amounts.astype(float)

    if type_col:
        type_series = df[type_col].astype(str).str.lower()
        charges_mask = type_series.str.contains("debit|charge|purchase|withdraw", na=False)
        credits_mask = type_series.str.contains("credit|payment|refund|deposit", na=False)
        if charges_mask.any():
            amounts.loc[charges_mask] = -amounts.loc[charges_mask].abs()
        if credits_mask.any():
            amounts.loc[credits_mask] = amounts.loc[credits_mask].abs()
    elif normalized_type == "credit_card":
        positive_sum = amounts[amounts > 0].sum()
        negative_sum = amounts[amounts < 0].sum()
        if positive_sum and abs(positive_sum) > abs(negative_sum):
            amounts = amounts.apply(lambda value: -abs(value) if value >= 0 else abs(value))

    parsed = pd.DataFrame({
        "date": _parse_dates(df[date_col]),
        "description": df[description_col].fillna(""),
        "amount": amounts,
    })

    total_rows = int(len(parsed))
    valid_dates = int(parsed["date"].notna().sum())
    valid_amounts = int(parsed["amount"].notna().sum())

    parsed = parsed.dropna(subset=["date", "amount"])
    parsed = parsed[parsed["amount"].notna()]
    parsed = parsed[parsed["date"].notna()]
    parsed = parsed.sort_values("date")
    if parsed.empty:
        debug_message = (
            "No valid transactions found after parsing the statement. "
            f"Detected rows={total_rows}, valid_dates={valid_dates}, valid_amounts={valid_amounts}. "
            "If your bank export includes a header or summary before the transaction table, "
            "try removing those lines or provide a column_map."
        )
        raise StatementParseError(debug_message)

    parsed["description"] = parsed["description"].astype(str).str.replace(r"\s+", " ", regex=True).str.strip()
    parsed["amount"] = parsed["amount"].round(2)

    parsed = parsed.drop_duplicates(subset=["date", "description", "amount"], keep="first")

    transactions = [
        {
            "date": row.date.strftime("%Y-%m-%d"),
            "description": row.description,
            "amount": float(row.amount),
            "source": "statement",
            "statement_type": normalized_type,
            "source_file": filename,
        }
        for row in parsed.itertuples()
    ]

    expenses_total = parsed.loc[parsed["amount"] < 0, "amount"].sum()
    income_total = parsed.loc[parsed["amount"] > 0, "amount"].sum()

    summary = {
        "count": int(len(parsed)),
        "start_date": parsed["date"].min().strftime("%Y-%m-%d"),
        "end_date": parsed["date"].max().strftime("%Y-%m-%d"),
        "total_charges": float(abs(expenses_total)),
        "total_payments": float(income_total),
        "net": float(parsed["amount"].sum()),
        "statement_type": normalized_type,
        "filename": filename,
    }

    preview = transactions[:10]

    detected_columns = {
        "date": date_col,
        "description": description_col,
        "amount": amount_col,
        "debit": debit_col,
        "credit": credit_col,
        "type": type_col,
    }

    return {
        "transactions": transactions,
        "summary": summary,
        "preview": preview,
        "columns": detected_columns,
        "statement_type": normalized_type,
        "filename": filename,
    }


def parse_credit_card_statement(
    file_obj,
    column_map: Optional[Dict[str, str]] = None,
    delimiter: Optional[str] = None,
) -> Dict[str, object]:
    return parse_statement(
        file_obj=file_obj,
        statement_type="credit_card",
        column_map=column_map,
        delimiter=delimiter,
    )


def parse_bank_statement(
    file_obj,
    column_map: Optional[Dict[str, str]] = None,
    delimiter: Optional[str] = None,
) -> Dict[str, object]:
    return parse_statement(
        file_obj=file_obj,
        statement_type="bank_account",
        column_map=column_map,
        delimiter=delimiter,
    )
