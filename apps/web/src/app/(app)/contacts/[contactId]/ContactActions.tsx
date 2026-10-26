"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const LINKEDIN_KINDS = [
  "invitation_pending",
  "invitation_sent",
  "invitation_accepted",
  "invitation_declined",
  "invitation_unknown",
  "message_sent",
  "reply_received",
  "manual_note",
];

const EMAIL_KINDS = [
  "draft",
  "approved",
  "sent",
  "replied",
  "bounced",
  "failed",
  "manual_note",
];

export function ContactActions({
  contactId,
  campaigns,
}: {
  contactId: string;
  campaigns: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin");
  const [kind, setKind] = useState("invitation_sent");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function enroll() {
    if (!campaignId) return;
    setMessage(null);
    const res = await fetch("/api/campaigns/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, contactIds: [contactId] }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Enroll failed");
      return;
    }
    setMessage(
      data.enrolled?.length
        ? "Enrolled in campaign"
        : "Already enrolled (skipped)",
    );
    router.refresh();
  }

  async function record() {
    setMessage(null);
    const res = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId,
        campaignId: campaignId || undefined,
        channel,
        kind,
        subject: subject || undefined,
        body: body || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Failed to record");
      return;
    }
    setMessage(data.duplicate ? "Duplicate activity ignored" : "Activity recorded");
    setSubject("");
    setBody("");
    router.refresh();
  }

  const kinds = channel === "linkedin" ? LINKEDIN_KINDS : EMAIL_KINDS;

  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>Actions</h2>
      <div className="row">
        <div className="field">
          <label>Campaign</label>
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            <option value="">— none —</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn secondary" type="button" onClick={() => void enroll()}>
          Enroll in campaign
        </button>
      </div>

      <div className="row">
        <div className="field">
          <label>Channel</label>
          <select
            value={channel}
            onChange={(e) => {
              const next = e.target.value as "linkedin" | "email";
              setChannel(next);
              setKind(next === "linkedin" ? "invitation_sent" : "sent");
            }}
          >
            <option value="linkedin">LinkedIn</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div className="field">
          <label>Status / kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Subject / note title</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="field">
        <label>Details</label>
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <button className="btn" type="button" onClick={() => void record()}>
        Record activity
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
