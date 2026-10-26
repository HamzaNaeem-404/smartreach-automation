import Link from "next/link";
import { listContacts } from "@smartreach/core";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateContactForm } from "./CreateContactForm";

export default async function ContactsPage() {
  const session = await requireSession();
  const contacts = await listContacts(db, session.workspaceId);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Contacts</h1>
          <p>
            Decision-makers. Matches only on email or LinkedIn URL — never name
            alone.
          </p>
        </div>
      </div>

      <div className="stack">
        <CreateContactForm />

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Company</th>
                <th>Methods</th>
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No contacts yet.
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/contacts/${c.id}`}>{c.fullName}</Link>
                    </td>
                    <td>{c.title ?? "—"}</td>
                    <td>
                      {c.relationships
                        ?.map((r) => r.company?.name)
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td>
                      {c.methods
                        ?.map((m) => `${m.type}: ${m.value}`)
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
