import React, { useMemo, useState } from "react";

const STATEMENT_OPTIONS = [
  { value: "credit_card", label: "Credit Card Payments" },
  { value: "bank_account", label: "Bank Account Transactions" },
];

const guessStatementType = (fileName) => {
  const lower = (fileName || "").toLowerCase();
  if (
    lower.includes("bank") ||
    lower.includes("checking") ||
    lower.includes("savings") ||
    lower.includes("account") ||
    lower.includes("deposit")
  ) {
    return "bank_account";
  }
  if (lower.includes("card") || lower.includes("amex") || lower.includes("visa")) {
    return "credit_card";
  }
  return "credit_card";
};

export default function StatementImporter({ apiUrl, onTransactionsImported }) {
  const [fileEntries, setFileEntries] = useState([]);
  const [parsedTransactions, setParsedTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [preview, setPreview] = useState([]);
  const [fileResults, setFileResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fileCount = fileEntries.length;
  const parseButtonLabel = loading
    ? "Analyzing…"
    : `Parse ${fileCount || ""} File${fileCount === 1 ? "" : "s"}`;

  const hasFiles = fileEntries.length > 0;

  const clearParsedData = () => {
    setParsedTransactions([]);
    setSummary(null);
    setPreview([]);
    setFileResults([]);
    setError("");
    setSuccess("");
  };

  const handleFileChange = (event) => {
    const selected = Array.from(event?.target?.files || []);
    if (!selected.length) {
      return;
    }

    setFileEntries((prev) => {
      const existingSignatures = new Set(
        prev.map((entry) => `${entry.file.name}-${entry.file.size}-${entry.file.lastModified}`)
      );

      const mapped = selected
        .filter((file) => !existingSignatures.has(`${file.name}-${file.size}-${file.lastModified}`))
        .map((file, idx) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${idx}`,
          file,
          type: guessStatementType(file.name),
        }));

      return [...prev, ...mapped];
    });

    clearParsedData();
    if (event?.target) {
      event.target.value = "";
    }
  };

  const handleTypeChange = (id, nextType) => {
    setFileEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, type: nextType } : entry))
    );
    setSuccess("");
  };

  const handleRemoveFile = (id) => {
    setFileEntries((prev) => prev.filter((entry) => entry.id !== id));
    clearParsedData();
  };

  const handleParse = async () => {
    if (!fileEntries.length) {
      setError("Select at least one statement file");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    const formData = new FormData();
    fileEntries.forEach((entry) => {
      formData.append("files", entry.file);
    });
    formData.append(
      "statement_types",
      JSON.stringify(fileEntries.map((entry) => entry.type))
    );

    try {
      const response = await fetch(`${apiUrl}/import/statement`, {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to parse statements");
      }

      const transactions = payload.transactions || [];
      setParsedTransactions(transactions);
      setSummary(payload.summary || null);
      setPreview((payload.preview || transactions).slice(0, 10));
      setFileResults(payload.files || []);

      if (!transactions.length) {
        setError("No transactions were detected in the uploaded files");
      }
    } catch (err) {
      clearParsedData();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!parsedTransactions.length) {
      setError("Parse statements before importing");
      return;
    }

    onTransactionsImported(parsedTransactions);
    const fileTotal = fileResults.length || fileEntries.length;
    setSuccess(
      `Imported ${parsedTransactions.length} transactions from ${fileTotal} file${fileTotal === 1 ? "" : "s"}`
    );
  };

  const fileSummary = useMemo(() => {
    if (!fileEntries.length) {
      return null;
    }
    return fileEntries.map((entry) => ({
      id: entry.id,
      name: entry.file.name,
      size: entry.file.size,
      type: entry.type,
    }));
  }, [fileEntries]);

  return (
    <div className="bg-white rounded-2xl shadow-lg border p-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-2xl font-semibold text-gray-800">
          📤 Import Bank & Card Statements
        </h3>
        {loading && <span className="text-sm text-gray-500">Parsing…</span>}
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Upload CSV exports from your bank or credit card provider. Mix and match multiple files and assign the correct statement type to each before parsing.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
        <div className="lg:col-span-6">
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Choose Statement Files
          </label>
          <input
            type="file"
            accept=".csv,.txt"
            multiple
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-700"
          />

          {fileSummary && fileSummary.length > 0 && (
            <div className="mt-3 space-y-3">
              {fileSummary.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3 bg-gray-50 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-800 truncate" title={entry.name}>
                      {entry.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {(entry.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={entry.type}
                      onChange={(event) => handleTypeChange(entry.id, event.target.value)}
                      className="p-2 border rounded-lg text-sm"
                    >
                      {STATEMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleRemoveFile(entry.id)}
                      className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-medium transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-3 flex items-end">
          <button
            onClick={handleParse}
            disabled={!hasFiles || loading}
            className={`w-full px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${
              !hasFiles || loading
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {parseButtonLabel}
          </button>
        </div>

        <div className="lg:col-span-3 flex items-end">
          <button
            onClick={handleApply}
            disabled={!parsedTransactions.length}
            className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              parsedTransactions.length
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            Add To Forecast
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-lg">
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-sm text-green-700 rounded-lg">
          ✅ {success}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm mb-4">
          <div className="p-3 bg-gray-50 rounded-lg border">
            <div className="text-gray-500 uppercase text-xs font-semibold">Transactions</div>
            <div className="text-xl font-bold text-gray-800">{summary.count}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg border">
            <div className="text-gray-500 uppercase text-xs font-semibold">Period</div>
            <div className="text-sm text-gray-700">
              {summary.start_date || "—"} → {summary.end_date || "—"}
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg border">
            <div className="text-gray-500 uppercase text-xs font-semibold">Charges</div>
            <div className="text-lg font-semibold text-red-600">${Math.abs(summary.total_charges || 0).toFixed(2)}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg border">
            <div className="text-gray-500 uppercase text-xs font-semibold">Income</div>
            <div className="text-lg font-semibold text-green-600">${Math.abs(summary.total_payments || 0).toFixed(2)}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg border">
            <div className="text-gray-500 uppercase text-xs font-semibold">Net Change</div>
            <div className={`text-lg font-semibold ${summary.net >= 0 ? "text-green-600" : "text-red-600"}`}>
              ${Number(summary.net || 0).toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {fileResults.length > 0 && (
        <div className="mb-4">
          <h4 className="font-semibold text-lg text-gray-800 mb-2">Imported Files</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fileResults.map((result) => {
              const label =
                STATEMENT_OPTIONS.find((option) => option.value === result.statement_type)?.label ||
                result.statement_type ||
                "Statement";
              const fileSummary = result.summary || {};
              return (
                <div
                  key={`${result.filename}-${result.statement_type}`}
                  className="p-3 bg-gray-50 border rounded-lg text-sm"
                >
                  <div className="font-semibold text-gray-700 mb-1 truncate" title={result.filename}>
                    {result.filename || "Statement"}
                  </div>
                  <div className="text-xs uppercase text-gray-500 mb-2">{label}</div>
                  <div className="space-y-1 text-xs text-gray-600">
                    <div>
                      Transactions: <span className="font-semibold text-gray-800">{result.transaction_count}</span>
                    </div>
                    {fileSummary?.start_date && fileSummary?.end_date && (
                      <div>
                        Period: <span className="font-semibold text-gray-800">{fileSummary.start_date} → {fileSummary.end_date}</span>
                      </div>
                    )}
                    <div>
                      Charges: <span className="font-semibold text-red-600">${Math.abs(fileSummary.total_charges || 0).toFixed(2)}</span>
                    </div>
                    <div>
                      Income: <span className="font-semibold text-green-600">${Math.abs(fileSummary.total_payments || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {preview.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-lg text-gray-800">
              Preview ({preview.length} of {parsedTransactions.length})
            </h4>
            <span className="text-xs text-gray-500">
              Verify dates, merchants, and amounts before importing
            </span>
          </div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-4 py-2 text-left">Statement</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, idx) => (
                  <tr
                    key={`${row.date || "undated"}-${idx}-${row.source_file || row.statement_type || "preview"}`}
                    className="odd:bg-white even:bg-gray-50"
                  >
                    <td className="px-4 py-2 whitespace-nowrap text-gray-700">{row.date || "—"}</td>
                    <td className="px-4 py-2 text-gray-700 max-w-xs truncate" title={row.description}>
                      {row.description || "—"}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {row.source_file ||
                        (STATEMENT_OPTIONS.find((option) => option.value === row.statement_type)?.label ??
                          row.statement_type ??
                          "—")}
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold ${row.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                      {row.amount < 0 ? "-" : "+"}${Math.abs(row.amount || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
