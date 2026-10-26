"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateContactForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        title: title || undefined,
        email: email || undefined,
        linkedinUrl: linkedinUrl || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Failed");
      return;
    }
    setMessage(data.created ? "Contact created" : "Matched existing contact");
    setFullName("");
    setTitle("");
    setEmail("");
    setLinkedinUrl("");
    router.refresh();
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2 style={{ marginTop: 0 }}>Add contact</h2>
      <div className="row">
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Full name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>LinkedIn URL</label>
          <input
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://linkedin.com/in/..."
          />
        </div>
      </div>
      <button className="btn" type="submit">
        Save contact
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
