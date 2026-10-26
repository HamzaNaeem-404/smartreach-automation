"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateSenderForm() {
  const router = useRouter();
  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin");
  const [displayName, setDisplayName] = useState("");
  const [persona, setPersona] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/senders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        displayName,
        persona: persona || undefined,
        emailAddress: emailAddress || undefined,
        linkedinUrl: linkedinUrl || undefined,
      }),
    });
    setDisplayName("");
    setPersona("");
    setEmailAddress("");
    setLinkedinUrl("");
    router.refresh();
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2 style={{ marginTop: 0 }}>Add identity</h2>
      <div className="row">
        <div className="field">
          <label>Channel</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as "linkedin" | "email")}
          >
            <option value="linkedin">LinkedIn</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Persona</label>
          <input value={persona} onChange={(e) => setPersona(e.target.value)} />
        </div>
      </div>
      {channel === "email" ? (
        <div className="field">
          <label>Email address</label>
          <input
            type="email"
            value={emailAddress}
            onChange={(e) => setEmailAddress(e.target.value)}
          />
        </div>
      ) : (
        <div className="field">
          <label>LinkedIn URL</label>
          <input
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
          />
        </div>
      )}
      <button className="btn" type="submit">
        Create
      </button>
    </form>
  );
}
