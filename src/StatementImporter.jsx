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
    <div>
      {/* Compact File Input */}
      <div className="metallic-input rounded-lg p-3 border border-dashed border-cyan-500 border-opacity-30 hover:border-opacity-60 transition-all cursor-pointer mb-3">
        <input
          type="file"
          accept=".csv,.txt"
          multiple
          onChange={handleFileChange}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload" className="cursor-pointer">
          <div className="flex items-center gap-2 text-center">
            <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <div className="flex-1">
              <div className="text-white text-sm font-semibold">Upload Files</div>
              <div className="text-cyan-300 text-xs">CSV from bank/card</div>
            </div>
          </div>
        </label>
      </div>

      {/* Compact File List */}
      {fileSummary && fileSummary.length > 0 && (
        <div className="space-y-2 mb-3">
          {fileSummary.map((entry) => {
            const formatFileName = (name) => {
              if (name.length <= 30) return name;
              const start = name.substring(0, 15);
              const end = name.substring(name.length - 10);
              return `${start}...${end}`;
            };
            
            return (
              <div key={entry.id} className="glass-card-light rounded-lg p-2">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white" title={entry.name}>
                      {formatFileName(entry.name)}
                    </div>
                    <div className="text-xs text-cyan-300">
                      {(entry.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveFile(entry.id)}
                    className="px-2 py-1 bg-red-500 bg-opacity-20 hover:bg-opacity-40 text-red-400 rounded text-xs font-medium transition-all"
                  >
                    ×
                  </button>
                </div>
                <select
                  value={entry.type}
                  onChange={(event) => handleTypeChange(entry.id, event.target.value)}
                  className="w-full metallic-input p-1 rounded text-xs text-white"
                >
                  {STATEMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} className="bg-dark-surface">
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={handleParse}
          disabled={!hasFiles || loading}
          className={`metallic-button px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
            !hasFiles || loading
              ? "opacity-50 cursor-not-allowed"
              : "text-white hover:scale-105"
          }`}
        >
          {parseButtonLabel}
        </button>

        <button
          onClick={handleApply}
          disabled={!parsedTransactions.length}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
            parsedTransactions.length
              ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:scale-105"
              : "bg-gray-600 bg-opacity-30 text-gray-500 cursor-not-allowed"
          }`}
        >
          Apply
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="glass-card-light rounded-lg p-2 border-l-2 border-red-500 mb-3">
          <div className="flex items-center gap-2 text-red-400 text-xs">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="glass-card-light rounded-lg p-2 border-l-2 border-green-500 mb-3">
          <div className="flex items-center gap-2 text-green-400 text-xs">
            <span>✓</span>
            <span>{success}</span>
          </div>
        </div>
      )}

      {/* Compact Summary */}
      {summary && (
        <div className="glass-card-light rounded-lg p-2 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-cyan-400">Transactions:</span>
            <span className="text-white font-bold">{summary.count}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-red-400">Charges:</span>
            <span className="text-red-400 font-bold">${Math.abs(summary.total_charges || 0).toFixed(0)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-green-400">Income:</span>
            <span className="text-green-400 font-bold">${Math.abs(summary.total_payments || 0).toFixed(0)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
