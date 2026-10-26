import { and, count, eq, sql } from "drizzle-orm";
import type { Database } from "@smartreach/db";
import {
  campaigns,
  campaignEnrollments,
  companies,
  contacts,
  importBatches,
  channelActivities,
  jobPostings,
} from "@smartreach/db";

export async function getDashboardStats(db: Database, workspaceId: string) {
  const [companyCount] = await db
    .select({ value: count() })
    .from(companies)
    .where(
      and(
        eq(companies.workspaceId, workspaceId),
        sql`${companies.deletedAt} IS NULL`,
      ),
    );

  const [contactCount] = await db
    .select({ value: count() })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        sql`${contacts.deletedAt} IS NULL`,
      ),
    );

  const [jobCount] = await db
    .select({ value: count() })
    .from(jobPostings)
    .where(eq(jobPostings.workspaceId, workspaceId));

  const [campaignCount] = await db
    .select({ value: count() })
    .from(campaigns)
    .where(eq(campaigns.workspaceId, workspaceId));

  const [importCount] = await db
    .select({ value: count() })
    .from(importBatches)
    .where(eq(importBatches.workspaceId, workspaceId));

  const [activityCount] = await db
    .select({ value: count() })
    .from(channelActivities)
    .where(eq(channelActivities.workspaceId, workspaceId));

  const enrollmentsByStatus = await db
    .select({
      status: campaignEnrollments.status,
      value: count(),
    })
    .from(campaignEnrollments)
    .where(eq(campaignEnrollments.workspaceId, workspaceId))
    .groupBy(campaignEnrollments.status);

  const recentActivities = await db.query.channelActivities.findMany({
    where: eq(channelActivities.workspaceId, workspaceId),
    orderBy: (t, { desc }) => [desc(t.occurredAt)],
    limit: 10,
  });

  const recentImports = await db.query.importBatches.findMany({
    where: eq(importBatches.workspaceId, workspaceId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 5,
  });

  return {
    counts: {
      companies: companyCount?.value ?? 0,
      contacts: contactCount?.value ?? 0,
      jobPostings: jobCount?.value ?? 0,
      campaigns: campaignCount?.value ?? 0,
      imports: importCount?.value ?? 0,
      activities: activityCount?.value ?? 0,
    },
    enrollmentsByStatus: Object.fromEntries(
      enrollmentsByStatus.map((r) => [r.status, r.value]),
    ),
    recentActivities,
    recentImports,
  };
}
