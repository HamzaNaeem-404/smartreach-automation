import Link from "next/link";
import { getCampaign } from "@smartreach/core";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const session = await requireSession();
  const { campaignId } = await params;
  const campaign = await getCampaign(db, session.workspaceId, campaignId);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{campaign.name}</h1>
          <p>{campaign.description ?? "No description"}</p>
        </div>
        <Link className="btn secondary" href="/campaigns">
          Back
        </Link>
      </div>

      <div className="stack">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Sequence</h2>
          <ol>
            {campaign.steps
              .slice()
              .sort((a, b) => a.stepOrder - b.stepOrder)
              .map((s) => (
                <li key={s.id}>
                  <span className="badge">{s.channel}</span> {s.name}{" "}
                  <span className="muted">(+{s.delayDays}d)</span>
                </li>
              ))}
          </ol>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Enrollments</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Next action</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {campaign.enrollments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No enrollments. Open a contact to enroll them.
                    </td>
                  </tr>
                ) : (
                  campaign.enrollments.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Link href={`/contacts/${e.contact.id}`}>
                          {e.contact.fullName}
                        </Link>
                      </td>
                      <td>
                        <span className="badge">{e.status}</span>
                      </td>
                      <td>{e.nextPermittedAction ?? "—"}</td>
                      <td>
                        {e.lastActivityAt
                          ? new Date(e.lastActivityAt).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
