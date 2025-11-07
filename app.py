import json
from datetime import datetime

from flask import Flask, request, jsonify
from flask_cors import CORS
from forecast_engine import ForecastEngine
from statement_parser import parse_statement, StatementParseError

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend
engine = ForecastEngine()

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

@app.route("/forecast", methods=["POST"])
def forecast():
    payload = request.get_json()
    opening_balance = float(payload.get("opening_balance", 0.0))
    transactions = payload.get("transactions", [])
    scheduled = payload.get("scheduled", [])
    horizon_days = int(payload.get("horizon_days", 30))
    method = payload.get("method", "prophet")  # Currently only "prophet" is supported

    result = engine.run_forecast(opening_balance, transactions, scheduled, horizon_days, method)
    return jsonify(result)


@app.route("/import/statement", methods=["POST"])
def import_statement():
    files = request.files.getlist("files")
    if not files:
        single = request.files.get("file")
        if single:
            files = [single]

    if not files:
        return jsonify({"error": "Missing statement file"}), 400

    column_map_raw = request.form.get("column_map")
    delimiter = request.form.get("delimiter") or None

    try:
        column_map = json.loads(column_map_raw) if column_map_raw else None
    except json.JSONDecodeError:
        return jsonify({"error": "column_map must be valid JSON"}), 400

    statement_types_raw = request.form.get("statement_types")
    statement_types = None
    if statement_types_raw:
        try:
            parsed_types = json.loads(statement_types_raw)
            if isinstance(parsed_types, list):
                statement_types = parsed_types
        except json.JSONDecodeError:
            return jsonify({"error": "statement_types must be valid JSON"}), 400

    if not statement_types:
        list_types = request.form.getlist("statement_type")
        if list_types:
            statement_types = list_types

    default_type = request.form.get("statement_type", "credit_card")

    aggregated_transactions = []
    file_results = []

    for idx, file_storage in enumerate(files):
        if not file_storage or file_storage.filename == "":
            return jsonify({"error": "Uploaded file has no name"}), 400

        statement_type = default_type
        if statement_types and idx < len(statement_types) and statement_types[idx]:
            statement_type = statement_types[idx]

        try:
            parsed = parse_statement(
                file_storage,
                statement_type=statement_type,
                column_map=column_map,
                delimiter=delimiter,
            )
        except StatementParseError as exc:
            filename = getattr(file_storage, "filename", "uploaded statement")
            return jsonify({"error": f"{filename}: {exc}"}), 400
        except Exception:
            filename = getattr(file_storage, "filename", "uploaded statement")
            return jsonify({"error": f"Failed to parse {filename}"}), 500

        transactions = parsed.get("transactions", [])
        aggregated_transactions.extend(transactions)

        file_results.append({
            "filename": parsed.get("filename") or file_storage.filename,
            "statement_type": parsed.get("statement_type", statement_type),
            "summary": parsed.get("summary"),
            "preview": parsed.get("preview"),
            "columns": parsed.get("columns"),
            "transaction_count": len(transactions),
        })

    aggregated_transactions.sort(
        key=lambda tx: (
            tx.get("date") or "",
            tx.get("description") or "",
            float(tx.get("amount") or 0.0),
        )
    )

    aggregate_summary = None
    preview = []
    if aggregated_transactions:
        dates = []
        total_expenses = 0.0
        total_income = 0.0
        net_total = 0.0
        for tx in aggregated_transactions:
            date_str = tx.get("date")
            if date_str:
                try:
                    dates.append(datetime.strptime(date_str, "%Y-%m-%d"))
                except ValueError:
                    pass
            amount = float(tx.get("amount", 0.0) or 0.0)
            net_total += amount
            if amount < 0:
                total_expenses += abs(amount)
            elif amount > 0:
                total_income += amount

        aggregate_summary = {
            "count": len(aggregated_transactions),
            "start_date": min(dates).strftime("%Y-%m-%d") if dates else None,
            "end_date": max(dates).strftime("%Y-%m-%d") if dates else None,
            "total_charges": float(total_expenses),
            "total_payments": float(total_income),
            "net": float(net_total),
        }

        preview = aggregated_transactions[:10]

    response = {
        "transactions": aggregated_transactions,
        "summary": aggregate_summary,
        "preview": preview,
        "files": file_results,
    }

    return jsonify(response)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
