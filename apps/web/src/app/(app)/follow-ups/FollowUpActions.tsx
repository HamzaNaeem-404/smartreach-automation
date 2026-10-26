"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FollowUpActions({
  actionId,
  status,
  eligible,
  blockingReasons,
  recentActivity,
  canApprove,
  canCancel,
}: {
  actionId: string;
  status: string;
  eligible: boolean;
  blockingReasons?: string[];
  recentActivity?: { channel: string; kind: string } | null;
  canApprove?: boolean;
  canCancel?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function run(op: string, extra?: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, actionId, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Failed");
        return;
      }
      setMessage("OK");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const terminal = ["cancelled", "completed", "failed"].includes(status);

  return (
    <div className="stack" style={{ gap: 4 }}>
      <button
        className="btn secondary"
        type="button"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Hide detail" : "Inspect"}
      </button>
      {expanded ? (
        <div className="muted" style={{ fontSize: "0.85rem" }}>
          <div>
            Eligibility:{" "}
            {eligible
              ? "eligible"
              : (blockingReasons ?? []).join(", ") || "blocked"}
          </div>
          <div>
            Recent:{" "}
            {recentActivity
              ? `${recentActivity.channel}:${recentActivity.kind}`
              : "—"}
          </div>
        </div>
      ) : null}
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        {canApprove &&
        (status === "awaiting_approval" || status === "blocked") ? (
          <button
            className="btn secondary"
            type="button"
            disabled={busy || !eligible}
            onClick={() => void run("approve")}
          >
            Approve
          </button>
        ) : null}
        {!terminal ? (
          <button
            className="btn"
            type="button"
            disabled={busy || (!eligible && status !== "awaiting_approval")}
            onClick={() => void run("complete", { note: "Manual complete" })}
          >
            Complete
          </button>
        ) : null}
        {canApprove && !terminal ? (
          <button
            className="btn secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              const dueAt = new Date(
                Date.now() + 24 * 60 * 60 * 1000,
              ).toISOString();
              void run("defer", { dueAt });
            }}
          >
            Defer 1d
          </button>
        ) : null}
        {canCancel && !terminal ? (
          <>
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() =>
                void run("reject", { reason: "operator_rejected" })
              }
            >
              Reject
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() =>
                void run("cancel", { reason: "operator_cancelled" })
              }
            >
              Cancel
            </button>
          </>
        ) : null}
      </div>
      {message ? <span className="muted">{message}</span> : null}
    </div>
  );
}
