import Link from "next/link";
import { getContact, getContactTimeline, listCampaigns } from "@smartreach/core";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ContactActions } from "./ContactActions";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const session = await requireSession();
  const { contactId } = await params;
  const [contact, timeline, campaigns] = await Promise.all([
    getContact(db, session.workspaceId, contactId),
    getContactTimeline(db, session.workspaceId, contactId),
    listCampaigns(db, session.workspaceId),
  ]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{contact.fullName}</h1>
          <p>
            {contact.title ?? "No title"}
            {contact.relationships?.[0]?.company
              ? ` · ${contact.relationships[0].company.name}`
              : ""}
          </p>
        </div>
        <Link className="btn secondary" href="/contacts">
          Back
        </Link>
      </div>

      <div className="stack">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Contact methods</h2>
          <ul>
            {contact.methods.map((m) => (
              <li key={m.id}>
                <span className="badge muted">{m.type}</span> {m.value}
              </li>
            ))}
          </ul>
        </div>

        <ContactActions
          contactId={contact.id}
          campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
        />

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Unified timeline</h2>
          {timeline.length === 0 ? (
            <p className="muted">No LinkedIn or email activity yet.</p>
          ) : (
            <div className="timeline">
              {timeline.map((a) => (
                <div className="timeline-item" key={a.id}>
                  <div className="row">
                    <span className="badge">{a.channel}</span>
                    <strong>{a.kind}</strong>
                  </div>
                  {a.subject ? <div>{a.subject}</div> : null}
                  {a.body ? <div className="muted">{a.body}</div> : null}
                  <div className="meta">
                    {new Date(a.occurredAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
