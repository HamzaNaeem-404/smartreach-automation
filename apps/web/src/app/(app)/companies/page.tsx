import Link from "next/link";
import { listCompanies } from "@smartreach/core";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function CompaniesPage() {
  const session = await requireSession();
  const companies = await listCompanies(db, session.workspaceId);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Companies</h1>
          <p>Canonical company records with linked job postings.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Domain</th>
              <th>Jobs</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No companies yet. Import a CSV or seed the database.
                </td>
              </tr>
            ) : (
              companies.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/companies/${c.id}`}>{c.name}</Link>
                  </td>
                  <td>{c.domain ?? "—"}</td>
                  <td>{c.jobPostings?.length ?? 0}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
