"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SuppressionForm() {
  const router = useRouter();
  const [contactId, setContactId] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<"all" | "email" | "linkedin">("all");
  const [origin, setOrigin] = useState<
    "manual" | "unsubscribe" | "hard_bounce"
  >("manual");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await fetch("/api/suppressions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: contactId || undefined,
        email: email || undefined,
        channel,
        origin,
        reason,
        scope: "global",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Failed");
      return;
    }
    setMessage(
      data.created
        ? `Created (cancelled ${data.cancelled ?? 0} follow-ups)`
        : "Already suppressed",
    );
    setContactId("");
    setEmail("");
    setReason("");
    router.refresh();
  }

  return (
    <form className="card stack" onSubmit={(e) => void onSubmit(e)}>
      <h2 style={{ margin: 0 }}>Add suppression</h2>
      <div className="row">
        <div className="field">
          <label>Contact ID (optional)</label>
          <input
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            placeholder="uuid"
          />
        </div>
        <div className="field">
          <label>Email (optional)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Channel</label>
          <select
            value={channel}
            onChange={(e) =>
              setChannel(e.target.value as "all" | "email" | "linkedin")
            }
          >
            <option value="all">All channels</option>
            <option value="email">Email</option>
            <option value="linkedin">LinkedIn</option>
          </select>
        </div>
        <div className="field">
          <label>Origin</label>
          <select
            value={origin}
            onChange={(e) =>
              setOrigin(
                e.target.value as "manual" | "unsubscribe" | "hard_bounce",
              )
            }
          >
            <option value="manual">Manual</option>
            <option value="unsubscribe">Unsubscribe</option>
            <option value="hard_bounce">Hard bounce</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Reason</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
      </div>
      <button className="btn" type="submit">
        Create suppression
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}

export function SuppressionRemoveButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "remove",
          suppressionId: id,
          reason: "operator_removed",
        }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="btn secondary"
      type="button"
      disabled={busy}
      onClick={() => void remove()}
    >
      Remove
    </button>
  );
}
