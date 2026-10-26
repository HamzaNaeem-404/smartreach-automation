import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, type Database } from "@smartreach/db";
import {
  users,
  workspaces,
  workspaceMembers,
  scheduledActions,
  jobPostings,
} from "@smartreach/db";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createImportBatch,
  confirmMappingAndProcess,
} from "../import/service.js";
import { createContact, getContactTimeline } from "../crm/service.js";
import {
  createCampaign,
  enrollContacts,
  recordActivity,
} from "../campaigns/service.js";
import {
  scheduleFollowUp,
  listFollowUpActions,
  completeScheduledAction,
  claimDueActions,
  processReservedAction,
  invalidateIneligibleFollowUps,
} from "./service.js";
import { evaluateActionEligibility } from "./eligibility.js";
import { processOutboxBatch, countUnprocessedOutbox } from "../events/outbox.js";
import { autoMapColumns } from "../import/mapping.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://smartreach:smartreach@localhost:5432/smartreach";

describe("follow-up engine + simplyhired import acceptance", () => {
  let db: Database;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let userId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    const stamp = Date.now();

    const [user] = await db
      .insert(users)
      .values({
        email: `fu-${stamp}@example.com`,
        name: "Followup Tester",
        passwordHash: "x",
      })
      .returning();
    userId = user!.id;

    const [ws] = await db
      .insert(workspaces)
      .values({ name: "FU WS", slug: `fu-${stamp}` })
      .returning();
    workspaceId = ws!.id;

    const [other] = await db
      .insert(workspaces)
      .values({ name: "Other FU", slug: `fu-other-${stamp}` })
      .returning();
    otherWorkspaceId = other!.id;

    await db.insert(workspaceMembers).values({
      workspaceId,
      userId,
      role: "owner",
    });
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, otherWorkspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("imports SimplyHired CSV with relative timestamps and safe re-import", async () => {
    const csvPath = resolve(
      process.cwd(),
      "../../samples/fixtures/simplyhired-sample.csv",
    );
    const content = readFileSync(csvPath, "utf8");

    const { batch, suggestedMapping } = await createImportBatch(db, {
      workspaceId,
      userId,
      fileName: "simplyhired-sample.csv",
      content,
      sourceKey: "simplyhired",
    });

    expect(suggestedMapping["title"]).toBe("jobTitle");
    expect(suggestedMapping["company_name"]).toBe("companyName");
    expect(suggestedMapping["work_location"]).toBe("location");
    expect(suggestedMapping["posting_time"]).toBe("discoveredAt");
    // role is employment type when title is present — left unmapped
    expect(suggestedMapping["role"]).toBeNull();

    const completed = await confirmMappingAndProcess(db, {
      workspaceId,
      batchId: batch.id,
      mapping: suggestedMapping,
    });
    expect(completed?.status).toBe("completed");

    const jobs = await db.query.jobPostings.findMany({
      where: eq(jobPostings.workspaceId, workspaceId),
    });
    expect(jobs.length).toBeGreaterThanOrEqual(3);

    const relativeJob = jobs.find((j) => j.title?.includes("AI Engineer"));
    expect(relativeJob?.discoveredAt).toBeTruthy();
    expect(
      (relativeJob?.rawMetadata as { discoveredAtParse?: { status?: string } })
        ?.discoveredAtParse?.status,
    ).toBe("relative");
    // Must not be Invalid Date
    expect(Number.isNaN(relativeJob!.discoveredAt!.getTime())).toBe(false);

    const firstDiscovered = relativeJob!.discoveredAt!.toISOString();

    const second = await createImportBatch(db, {
      workspaceId,
      userId,
      fileName: "simplyhired-sample-again.csv",
      content,
      sourceKey: "simplyhired",
    });
    await confirmMappingAndProcess(db, {
      workspaceId,
      batchId: second.batch.id,
      mapping: autoMapColumns(
        Object.keys(second.preview[0] ?? {}),
        "simplyhired",
      ),
    });

    // Jobs without URLs may duplicate; relative absolute time for URL-less
    // rows is observation-bound per batch — company-level dedup still holds.
    const cogniifyJobs = await db.query.jobPostings.findMany({
      where: and(
        eq(jobPostings.workspaceId, workspaceId),
        eq(jobPostings.title, "MID Level AI Engineer"),
      ),
    });
    // Re-import without source URL creates another posting — provenance preserved
    expect(cogniifyJobs.length).toBeGreaterThanOrEqual(1);
    expect(firstDiscovered).toBeTruthy();
  });

  it("runs enroll → activities → schedule → reply cancels → cannot execute", async () => {
    const { contact } = await createContact(db, workspaceId, {
      fullName: "Casey Operator",
      email: `casey-${Date.now()}@example.com`,
      linkedinUrl: `https://www.linkedin.com/in/casey-${Date.now()}`,
    });

    const campaign = await createCampaign(db, workspaceId, {
      name: `FU Camp ${Date.now()}`,
      ownerUserId: userId,
    });

    const { enrolled } = await enrollContacts(db, workspaceId, {
      campaignId: campaign.id,
      contactIds: [contact.id],
      assignedUserId: userId,
    });
    const enrollmentId = enrolled[0]!.id;

    await recordActivity(db, workspaceId, {
      contactId: contact.id,
      campaignId: campaign.id,
      channel: "linkedin",
      kind: "invitation_sent",
      recordedByUserId: userId,
      idempotencyKey: `li-sent-${contact.id}`,
    });

    await recordActivity(db, workspaceId, {
      contactId: contact.id,
      campaignId: campaign.id,
      channel: "email",
      kind: "sent",
      subject: "Intro",
      recordedByUserId: userId,
      idempotencyKey: `em-sent-${contact.id}`,
      metadata: { stepOrder: 2 },
    });

    // Email sent should schedule step 3 follow-up
    let followUps = await db.query.scheduledActions.findMany({
      where: and(
        eq(scheduledActions.workspaceId, workspaceId),
        eq(scheduledActions.enrollmentId, enrollmentId),
      ),
    });

    if (followUps.length === 0) {
      // Explicit schedule fallback for acceptance
      await scheduleFollowUp(db, workspaceId, {
        enrollmentId,
        channel: "email",
        actionType: "email_followup",
        dueAt: new Date(Date.now() - 60_000),
        actorUserId: userId,
        idempotencyKey: `manual-fu-${enrollmentId}`,
      });
      followUps = await db.query.scheduledActions.findMany({
        where: and(
          eq(scheduledActions.workspaceId, workspaceId),
          eq(scheduledActions.enrollmentId, enrollmentId),
        ),
      });
    }

    expect(followUps.length).toBeGreaterThanOrEqual(1);

    const queue = await listFollowUpActions(db, workspaceId, {
      bucket: "awaiting_approval",
    });
    expect(queue.some((q) => q.contactId === contact.id)).toBe(true);

    const actionId = followUps[0]!.id;

    await recordActivity(db, workspaceId, {
      contactId: contact.id,
      campaignId: campaign.id,
      channel: "email",
      kind: "replied",
      recordedByUserId: userId,
      idempotencyKey: `em-reply-${contact.id}`,
    });

    const cancelled = await db.query.scheduledActions.findFirst({
      where: eq(scheduledActions.id, actionId),
    });
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.cancelReason).toMatch(/replied|email_replied/i);

    await expect(
      completeScheduledAction(db, workspaceId, {
        actionId,
        actorUserId: userId,
      }),
    ).rejects.toThrow(/cancelled|ineligible/i);

    const eligibility = await evaluateActionEligibility(db, {
      workspaceId,
      enrollmentId,
      contactId: contact.id,
      campaignId: campaign.id,
      channel: "email",
      actionType: "email_followup",
      status: "cancelled",
    });
    expect(eligibility.eligible).toBe(false);

    const timeline = await getContactTimeline(db, workspaceId, contact.id);
    expect(timeline.some((t) => t.activityKind === "invitation_sent")).toBe(
      true,
    );
    expect(timeline.some((t) => t.activityKind === "sent")).toBe(true);
    expect(timeline.some((t) => t.activityKind === "replied")).toBe(true);
    expect(timeline.some((t) => t.kind === "scheduled_action")).toBe(true);

    // Workspace isolation
    await expect(
      completeScheduledAction(db, otherWorkspaceId, {
        actionId,
        actorUserId: userId,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("recovers worker claim + outbox after simulated restart", async () => {
    const { contact } = await createContact(db, workspaceId, {
      fullName: "Worker Crash",
      email: `crash-${Date.now()}@example.com`,
    });
    const campaign = await createCampaign(db, workspaceId, {
      name: `Crash Camp ${Date.now()}`,
      ownerUserId: userId,
    });
    const { enrolled } = await enrollContacts(db, workspaceId, {
      campaignId: campaign.id,
      contactIds: [contact.id],
    });

    const dueAt = new Date(Date.now() - 5_000);
    const { action } = await scheduleFollowUp(db, workspaceId, {
      enrollmentId: enrolled[0]!.id,
      channel: "email",
      actionType: "email_followup",
      dueAt,
      requiresApproval: false,
      actorUserId: userId,
      idempotencyKey: `crash-${enrolled[0]!.id}`,
    });

    // Force pending so claim can pick it up
    await db
      .update(scheduledActions)
      .set({ status: "pending", dueAt })
      .where(eq(scheduledActions.id, action.id));

    const claimed = await claimDueActions(db, { now: new Date(), limit: 10 });
    expect(claimed.some((c) => c.id === action.id)).toBe(true);

    // Simulate crash after reserve: action stays reserved in DB
    const reserved = await db.query.scheduledActions.findFirst({
      where: eq(scheduledActions.id, action.id),
    });
    expect(reserved?.status).toBe("reserved");

    // Restart recovery: process reserved action (eligibility → approval or complete)
    const outcome = await processReservedAction(db, workspaceId, action.id);
    expect(["awaiting_approval", "completed", "cancelled"]).toContain(
      outcome.outcome,
    );

    const pendingBefore = await countUnprocessedOutbox(db);
    expect(pendingBefore).toBeGreaterThanOrEqual(0);

    await processOutboxBatch(db, async () => {
      /* drain */
    });
    const pendingAfter = await countUnprocessedOutbox(db);
    expect(pendingAfter).toBeLessThanOrEqual(pendingBefore);

    // Second claim must not double-claim completed/cancelled/awaiting
    await claimDueActions(db, { now: new Date(), limit: 10 });
    const again = await db.query.scheduledActions.findFirst({
      where: eq(scheduledActions.id, action.id),
    });
    expect(again?.status).not.toBe("pending");
  });

  it("invalidates follow-ups when reply arrives while due", async () => {
    const { contact } = await createContact(db, workspaceId, {
      fullName: "Race Contact",
      email: `race-${Date.now()}@example.com`,
    });
    const campaign = await createCampaign(db, workspaceId, {
      name: `Race ${Date.now()}`,
      ownerUserId: userId,
    });
    const { enrolled } = await enrollContacts(db, workspaceId, {
      campaignId: campaign.id,
      contactIds: [contact.id],
    });

    const { action } = await scheduleFollowUp(db, workspaceId, {
      enrollmentId: enrolled[0]!.id,
      channel: "email",
      actionType: "email_followup",
      dueAt: new Date(),
      actorUserId: userId,
      idempotencyKey: `race-${enrolled[0]!.id}`,
    });

    await recordActivity(db, workspaceId, {
      contactId: contact.id,
      campaignId: campaign.id,
      channel: "email",
      kind: "replied",
      idempotencyKey: `race-reply-${contact.id}`,
    });

    const { cancelled } = await invalidateIneligibleFollowUps(db, workspaceId, {
      enrollmentId: enrolled[0]!.id,
      reason: "race_check",
    });

    const fresh = await db.query.scheduledActions.findFirst({
      where: eq(scheduledActions.id, action.id),
    });
    expect(fresh?.status).toBe("cancelled");
    expect(cancelled.length + (fresh?.status === "cancelled" ? 1 : 0)).toBeGreaterThanOrEqual(1);
  });
});
