import { getDashboardStats } from "@smartreach/core";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function DashboardPage() {
  const session = await requireSession();
  const stats = await getDashboardStats(db, session.workspaceId);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Overview</h1>
          <p>Pipeline and campaign status for your workspace.</p>
        </div>
      </div>

      <div className="grid-stats">
        {[
          ["Companies", stats.counts.companies],
          ["Contacts", stats.counts.contacts],
          ["Job postings", stats.counts.jobPostings],
          ["Campaigns", stats.counts.campaigns],
          ["Imports", stats.counts.imports],
          ["Activities", stats.counts.activities],
        ].map(([label, value]) => (
          <div className="stat" key={String(label)}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </div>
        ))}
      </div>

      <div className="stack">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Enrollment status</h2>
          <div className="row">
            {Object.keys(stats.enrollmentsByStatus).length === 0 ? (
              <span className="muted">No enrollments yet.</span>
            ) : (
              Object.entries(stats.enrollmentsByStatus).map(([status, n]) => (
                <span className="badge" key={status}>
                  {status}: {n}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Recent activity</h2>
          {stats.recentActivities.length === 0 ? (
            <p className="muted">No channel activity recorded yet.</p>
          ) : (
            <div className="timeline">
              {stats.recentActivities.map((a) => (
                <div className="timeline-item" key={a.id}>
                  <strong>
                    {a.channel} · {a.kind}
                  </strong>
                  <div className="meta">
                    {new Date(a.occurredAt).toLocaleString()}
                    {a.subject ? ` — ${a.subject}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Recent imports</h2>
          {stats.recentImports.length === 0 ? (
            <p className="muted">No imports yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Status</th>
                    <th>Rows</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentImports.map((b) => (
                    <tr key={b.id}>
                      <td>{b.fileName}</td>
                      <td>
                        <span className="badge">{b.status}</span>
                      </td>
                      <td>{b.stats?.totalRows ?? "—"}</td>
                      <td>{new Date(b.createdAt).toLocaleString()}</td>
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
