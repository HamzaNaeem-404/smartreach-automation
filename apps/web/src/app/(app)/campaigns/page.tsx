import Link from "next/link";
import { listCampaigns } from "@smartreach/core";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateCampaignForm } from "./CreateCampaignForm";

export default async function CampaignsPage() {
  const session = await requireSession();
  const campaigns = await listCampaigns(db, session.workspaceId);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Campaigns</h1>
          <p>Enroll contacts and track per-channel outreach status.</p>
        </div>
      </div>

      <div className="stack">
        <CreateCampaignForm />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Enrollments</th>
                <th>Steps</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/campaigns/${c.id}`}>{c.name}</Link>
                  </td>
                  <td>
                    <span className="badge">{c.status}</span>
                  </td>
                  <td>{c.enrollments?.length ?? 0}</td>
                  <td>{c.steps?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
