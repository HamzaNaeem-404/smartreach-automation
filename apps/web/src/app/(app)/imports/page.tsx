"use client";

import { useEffect, useState } from "react";

type Batch = {
  id: string;
  fileName: string;
  status: string;
  stats?: Record<string, number> | null;
  createdAt: string;
  columnMapping?: Record<string, string | null> | null;
};

type UploadResult = {
  batch: Batch;
  preview: Record<string, string>[];
  suggestedMapping: Record<string, string | null>;
};

const CANONICAL = [
  "companyName",
  "jobTitle",
  "jobUrl",
  "source",
  "location",
  "contactName",
  "contactEmail",
  "contactLinkedIn",
  "contactTitle",
  "discoveredAt",
];

export default function ImportsPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/imports");
    const data = await res.json();
    setBatches(data.batches ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("sourceKey", "default");
      const res = await fetch("/api/imports", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Upload failed");
        return;
      }
      setUpload(data);
      setMapping(data.suggestedMapping);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!upload) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/imports/${upload.batch.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapping,
          saveAsTemplate: true,
          templateSourceKey: "default",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Processing failed");
        return;
      }
      setMessage(
        `Import completed. Companies created: ${data.batch?.stats?.companiesCreated ?? 0}, matched: ${data.batch?.stats?.companiesMatched ?? 0}`,
      );
      setUpload(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>CSV Imports</h1>
          <p>
            Upload job opportunity CSVs, confirm column mapping, and normalize
            into companies and contacts.
          </p>
        </div>
        <label className="btn">
          {busy ? "Working…" : "Upload CSV"}
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            disabled={busy}
            onChange={onUpload}
          />
        </label>
      </div>

      {message ? <p className="card">{message}</p> : null}

      {upload ? (
        <div className="card stack" style={{ marginBottom: "1rem" }}>
          <h2 style={{ margin: 0 }}>Confirm mapping — {upload.batch.fileName}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CSV column</th>
                  <th>Maps to</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(mapping).map((header) => (
                  <tr key={header}>
                    <td>{header}</td>
                    <td>
                      <select
                        value={mapping[header] ?? ""}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            [header]: e.target.value || null,
                          }))
                        }
                      >
                        <option value="">— skip —</option>
                        {CANONICAL.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Preview (first rows)</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {Object.keys(upload.preview[0] ?? {}).map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {upload.preview.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => (
                        <td key={j}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => void confirm()}>
              Confirm & process
            </button>
            <button
              className="btn secondary"
              onClick={() => setUpload(null)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Status</th>
              <th>Stats</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No imports yet. Upload a sample CSV to get started.
                </td>
              </tr>
            ) : (
              batches.map((b) => (
                <tr key={b.id}>
                  <td>{b.fileName}</td>
                  <td>
                    <span className="badge">{b.status}</span>
                  </td>
                  <td>
                    <span className="muted">
                      rows {b.stats?.totalRows ?? 0} · companies +
                      {b.stats?.companiesCreated ?? 0} / matched{" "}
                      {b.stats?.companiesMatched ?? 0}
                    </span>
                  </td>
                  <td>{new Date(b.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
