import Link from "next/link";
import { listFollowUpQueue } from "@smartreach/core";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function FollowUpsPage() {
  const session = await requireSession();
  const queue = await listFollowUpQueue(db, session.workspaceId);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Follow-up queue</h1>
          <p>
            Active enrollments awaiting the next permitted action. Automated
            dispatch arrives in Milestone 2.
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contact</th>
              <th>Campaign</th>
              <th>Next action</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  Queue empty.
                </td>
              </tr>
            ) : (
              queue.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/contacts/${item.contact.id}`}>
                      {item.contact.fullName}
                    </Link>
                  </td>
                  <td>{item.campaign?.name ?? "—"}</td>
                  <td>{item.nextPermittedAction ?? "—"}</td>
                  <td>
                    {item.followUpDueAt
                      ? new Date(item.followUpDueAt).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
