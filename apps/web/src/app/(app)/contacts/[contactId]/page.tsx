import Link from "next/link";
import {
  getContact,
  getContactTimeline,
  getContactSuppressions,
  listCampaigns,
} from "@smartreach/core";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { ContactActions } from "./ContactActions";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const session = await requirePermission("contacts:read");
  const { contactId } = await params;
  const [contact, timeline, campaigns, suppressions] = await Promise.all([
    getContact(db, session.workspaceId, contactId),
    getContactTimeline(db, session.workspaceId, contactId),
    listCampaigns(db, session.workspaceId),
    getContactSuppressions(db, session.workspaceId, contactId),
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
            {suppressions.length > 0 ? (
              <>
                {" "}
                · <span className="badge muted">suppressed</span>
              </>
            ) : null}
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

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Suppression status</h2>
          {suppressions.length === 0 ? (
            <p className="muted">Not suppressed.</p>
          ) : (
            <ul>
              {suppressions.map((s) => (
                <li key={s.id}>
                  <span className="badge">{s.channel}</span>{" "}
                  <span className="badge muted">{s.origin}</span> {s.reason}
                </li>
              ))}
            </ul>
          )}
          <Link href="/suppressions">Manage suppressions</Link>
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
                <div className="timeline-item" key={`${a.kind}-${a.id}`}>
                  <div className="row">
                    <span className="badge">{a.channel ?? "system"}</span>
                    <span className="badge muted">{a.kind}</span>
                    <strong>{a.activityKind}</strong>
                    {a.status ? (
                      <span className="badge muted">{a.status}</span>
                    ) : null}
                  </div>
                  {a.subject ? <div>{a.subject}</div> : null}
                  {a.body ? <div className="muted">{a.body}</div> : null}
                  <div className="meta">
                    {new Date(a.effectiveAt).toLocaleString()}
                    {a.recordedAt.getTime() !== a.effectiveAt.getTime() ? (
                      <span className="muted">
                        {" "}
                        · recorded {new Date(a.recordedAt).toLocaleString()}
                      </span>
                    ) : null}
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
