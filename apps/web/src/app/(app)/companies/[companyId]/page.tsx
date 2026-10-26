import Link from "next/link";
import { getCompany } from "@smartreach/core";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const session = await requireSession();
  const { companyId } = await params;
  const company = await getCompany(db, session.workspaceId, companyId);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{company.name}</h1>
          <p>
            {company.domain ?? "No domain"} · normalized as{" "}
            <code>{company.normalizedName}</code>
          </p>
        </div>
        <Link className="btn secondary" href="/companies">
          Back
        </Link>
      </div>

      <div className="stack">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Job postings</h2>
          {company.jobPostings.length === 0 ? (
            <p className="muted">No postings linked.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Source</th>
                    <th>Location</th>
                    <th>Discovered</th>
                  </tr>
                </thead>
                <tbody>
                  {company.jobPostings.map((j) => (
                    <tr key={j.id}>
                      <td>
                        {j.sourceUrl ? (
                          <a href={j.sourceUrl} target="_blank" rel="noreferrer">
                            {j.title}
                          </a>
                        ) : (
                          j.title
                        )}
                      </td>
                      <td>{j.source ?? "—"}</td>
                      <td>{j.location ?? "—"}</td>
                      <td>
                        {j.discoveredAt
                          ? new Date(j.discoveredAt).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Contacts</h2>
          {company.relationships.length === 0 ? (
            <p className="muted">No contacts linked.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Methods</th>
                  </tr>
                </thead>
                <tbody>
                  {company.relationships.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/contacts/${r.contact.id}`}>
                          {r.contact.fullName}
                        </Link>
                      </td>
                      <td>{r.title ?? r.contact.title ?? "—"}</td>
                      <td>
                        {r.contact.methods
                          ?.map((m) => `${m.type}: ${m.value}`)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
