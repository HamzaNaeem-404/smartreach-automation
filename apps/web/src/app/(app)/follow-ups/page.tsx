import Link from "next/link";
import { listFollowUpActions } from "@smartreach/core";
import { FollowUpQueueBuckets } from "@smartreach/shared";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { FollowUpActions } from "./FollowUpActions";

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const bucketParam = params.bucket;
  const bucket =
    bucketParam &&
    (FollowUpQueueBuckets as readonly string[]).includes(bucketParam)
      ? (bucketParam as (typeof FollowUpQueueBuckets)[number])
      : undefined;

  const queue = await listFollowUpActions(db, session.workspaceId, {
    bucket,
    limit: 100,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Follow-up queue</h1>
          <p>
            Durable scheduled actions with eligibility checks. Email send stays
            disabled; LinkedIn tasks are human-executed.
          </p>
        </div>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <Link
          className={`btn secondary${!bucket ? " active" : ""}`}
          href="/follow-ups"
        >
          All open
        </Link>
        {FollowUpQueueBuckets.map((b) => (
          <Link
            key={b}
            className={`btn secondary${bucket === b ? " active" : ""}`}
            href={`/follow-ups?bucket=${b}`}
          >
            {b.replaceAll("_", " ")}
          </Link>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contact</th>
              <th>Company</th>
              <th>Campaign</th>
              <th>Channel</th>
              <th>Step / action</th>
              <th>Due</th>
              <th>Status</th>
              <th>Eligibility</th>
              <th>Recent activity</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <tr>
                <td colSpan={10} className="muted">
                  Queue empty for this filter.
                </td>
              </tr>
            ) : (
              queue.map((item) => {
                const companyName =
                  item.contact?.relationships?.[0]?.company?.name ?? "—";
                return (
                  <tr key={item.id}>
                    <td>
                      {item.contact ? (
                        <Link href={`/contacts/${item.contact.id}`}>
                          {item.contact.fullName}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{companyName}</td>
                    <td>{item.campaign?.name ?? "—"}</td>
                    <td>
                      <span className="badge">{item.channel ?? "—"}</span>
                    </td>
                    <td>
                      {(item.payload as { stepName?: string } | null)?.stepName ??
                        item.actionType}
                    </td>
                    <td>{new Date(item.dueAt).toLocaleString()}</td>
                    <td>
                      <span className="badge muted">{item.status}</span>
                    </td>
                    <td>
                      {item.eligibility?.eligible ? (
                        <span className="badge">eligible</span>
                      ) : (
                        <span className="badge muted">
                          {item.eligibility?.blockingReasons?.join(", ") ||
                            item.blockedReasons?.join(", ") ||
                            "blocked"}
                        </span>
                      )}
                    </td>
                    <td className="muted">
                      {item.recentActivity
                        ? `${item.recentActivity.channel}:${item.recentActivity.kind}`
                        : "—"}
                    </td>
                    <td>
                      <FollowUpActions
                        actionId={item.id}
                        status={item.status}
                        eligible={item.eligibility?.eligible ?? false}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
