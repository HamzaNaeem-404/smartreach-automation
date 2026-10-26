import { eq } from "drizzle-orm";
import { senderIdentities } from "@smartreach/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateSenderForm } from "./CreateSenderForm";

export default async function SendersPage() {
  const session = await requireSession();
  const identities = await db.query.senderIdentities.findMany({
    where: eq(senderIdentities.workspaceId, session.workspaceId),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Sender identities</h1>
          <p>
            LinkedIn company-rep personas and developer email identities are
            separate. OAuth connect is Milestone 3 — identities here are
            registry only.
          </p>
        </div>
      </div>
      <div className="stack">
        <CreateSenderForm />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Display name</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Address / URL</th>
              </tr>
            </thead>
            <tbody>
              {identities.map((i) => (
                <tr key={i.id}>
                  <td>{i.displayName}</td>
                  <td>
                    <span className="badge">{i.channel}</span>
                  </td>
                  <td>
                    <span className="badge muted">{i.status}</span>
                  </td>
                  <td>{i.emailAddress ?? i.linkedinUrl ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
