import Link from "next/link";
import { listSuppressions } from "@smartreach/core";
import { roleHasPermission } from "@smartreach/shared";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { SuppressionForm, SuppressionRemoveButton } from "./SuppressionForm";

export default async function SuppressionsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; channel?: string }>;
}) {
  const session = await requirePermission("suppressions:read");
  const params = await searchParams;
  const channel = params.channel as "all" | "email" | "linkedin" | undefined;

  const rows = await listSuppressions(db, session.workspaceId, {
    search: params.search,
    channel: channel && channel !== "all" ? channel : undefined,
    limit: 100,
  });

  const canWrite = roleHasPermission(session.role, "suppressions:write");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Suppressions</h1>
          <p>
            Global and channel do-not-contact entries. Creating a suppression
            cancels ineligible follow-ups immediately.
          </p>
        </div>
      </div>

      {canWrite ? <SuppressionForm /> : null}

      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Link className="btn secondary" href="/suppressions">
          All
        </Link>
        <Link className="btn secondary" href="/suppressions?channel=email">
          Email
        </Link>
        <Link className="btn secondary" href="/suppressions?channel=linkedin">
          LinkedIn
        </Link>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Scope</th>
              <th>Origin</th>
              <th>Contact / email</th>
              <th>Reason</th>
              <th>Created</th>
              {canWrite ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 7 : 6} className="muted">
                  No suppressions.
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="badge">{s.channel}</span>
                  </td>
                  <td>{s.scope}</td>
                  <td>
                    <span className="badge muted">{s.origin}</span>
                  </td>
                  <td>
                    {s.contactId ? (
                      <Link href={`/contacts/${s.contactId}`}>Contact</Link>
                    ) : null}{" "}
                    <span className="muted">
                      {s.email ?? s.linkedinUrl ?? "—"}
                    </span>
                  </td>
                  <td>{s.reason}</td>
                  <td>{new Date(s.createdAt).toLocaleString()}</td>
                  {canWrite ? (
                    <td>
                      <SuppressionRemoveButton id={s.id} />
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
