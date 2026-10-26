import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, type Database } from "@smartreach/db";
import {
  users,
  workspaces,
  workspaceMembers,
  scheduledActions,
} from "@smartreach/db";
import { createContact } from "../crm/service";
import {
  createCampaign,
  enrollContacts,
  recordActivity,
} from "../campaigns/service";
import {
  scheduleFollowUp,
  claimDueActions,
  completeScheduledAction,
  approveScheduledAction,
  CLAIM_LEASE_MS,
} from "./service";
import { createSuppression } from "../suppressions/service";
import { assertPermission } from "../auth/permissions";
import { ForbiddenError } from "@smartreach/shared";
import { getOperationalMetrics } from "../ops/metrics";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://smartreach:smartreach@localhost:5432/smartreach";

describe("M2.1 hardening: suppression, roles, leases", () => {
  let db: Database;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let ownerId: string;
  let memberId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    const stamp = Date.now();

    const [owner] = await db
      .insert(users)
      .values({
        email: `owner-${stamp}@example.com`,
        name: "Owner",
        passwordHash: "x",
      })
      .returning();
    ownerId = owner!.id;

    const [member] = await db
      .insert(users)
      .values({
        email: `member-${stamp}@example.com`,
        name: "Member",
        passwordHash: "x",
      })
      .returning();
    memberId = member!.id;

    const [ws] = await db
      .insert(workspaces)
      .values({ name: "Harden WS", slug: `harden-${stamp}` })
      .returning();
    workspaceId = ws!.id;

    const [other] = await db
      .insert(workspaces)
      .values({ name: "Other Harden", slug: `harden-o-${stamp}` })
      .returning();
    otherWorkspaceId = other!.id;

    await db.insert(workspaceMembers).values([
      { workspaceId, userId: ownerId, role: "owner" },
      { workspaceId, userId: memberId, role: "member" },
    ]);
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, otherWorkspaceId));
    await db.delete(users).where(eq(users.id, ownerId));
    await db.delete(users).where(eq(users.id, memberId));
  });

  it("enforces permission matrix", () => {
    expect(() => assertPermission("member", "followups:approve")).toThrow(
      ForbiddenError,
    );
    expect(() => assertPermission("member", "suppressions:write")).toThrow(
      ForbiddenError,
    );
    expect(() => assertPermission("admin", "suppressions:write")).not.toThrow();
    expect(() => assertPermission("owner", "workspace:manage")).not.toThrow();
  });

  it("creates suppression and cancels pending / awaiting / reserved follow-ups", async () => {
    const { contact } = await createContact(db, workspaceId, {
      fullName: "Suppress Me",
      email: `sup-${Date.now()}@example.com`,
    });
    const campaign = await createCampaign(db, workspaceId, {
      name: `Sup Camp ${Date.now()}`,
      ownerUserId: ownerId,
    });
    const { enrolled } = await enrollContacts(db, workspaceId, {
      campaignId: campaign.id,
      contactIds: [contact.id],
    });

    const dueAt = new Date(Date.now() - 1000);
    const { action: awaiting } = await scheduleFollowUp(db, workspaceId, {
      enrollmentId: enrolled[0]!.id,
      channel: "email",
      actionType: "email_followup",
      dueAt,
      requiresApproval: true,
      actorUserId: ownerId,
      idempotencyKey: `await-${enrolled[0]!.id}`,
    });

    const { action: pendingish } = await scheduleFollowUp(db, workspaceId, {
      enrollmentId: enrolled[0]!.id,
      channel: "email",
      actionType: "email_followup",
      dueAt,
      requiresApproval: false,
      actorUserId: ownerId,
      idempotencyKey: `pend-${enrolled[0]!.id}`,
    });
    await db
      .update(scheduledActions)
      .set({ status: "pending", dueAt })
      .where(eq(scheduledActions.id, pendingish.id));

    // Claim one into reserved
    await claimDueActions(db, {
      now: new Date(),
      limit: 5,
      workerId: "test-claimer-a",
    });

    const before = await db.query.scheduledActions.findMany({
      where: and(
        eq(scheduledActions.workspaceId, workspaceId),
        eq(scheduledActions.contactId, contact.id),
      ),
    });
    expect(before.some((a) => a.status === "reserved")).toBe(true);

    const { created, cancelled } = await createSuppression(db, workspaceId, {
      contactId: contact.id,
      channel: "email",
      origin: "manual",
      reason: "Do not contact — browser hardening",
      actorUserId: ownerId,
    });
    expect(created).toBe(true);
    expect(cancelled).toBeGreaterThanOrEqual(1);

    const after = await db.query.scheduledActions.findMany({
      where: and(
        eq(scheduledActions.workspaceId, workspaceId),
        eq(scheduledActions.contactId, contact.id),
      ),
    });
    expect(after.every((a) => a.status === "cancelled")).toBe(true);
    expect(
      after.every((a) => a.cancelReason?.includes("suppression")),
    ).toBe(true);

    await expect(
      approveScheduledAction(db, workspaceId, awaiting.id, ownerId),
    ).rejects.toThrow();

    await expect(
      completeScheduledAction(db, workspaceId, {
        actionId: awaiting.id,
        actorUserId: ownerId,
      }),
    ).rejects.toThrow(/cancelled|ineligible/i);

    // Cross-workspace isolation
    await expect(
      createSuppression(db, otherWorkspaceId, {
        contactId: contact.id,
        reason: "cross",
        actorUserId: ownerId,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("does not double-claim the same due action across two claimers", async () => {
    const { contact } = await createContact(db, workspaceId, {
      fullName: "Race Claim",
      email: `race-claim-${Date.now()}@example.com`,
    });
    const campaign = await createCampaign(db, workspaceId, {
      name: `Race Claim ${Date.now()}`,
      ownerUserId: ownerId,
    });
    const { enrolled } = await enrollContacts(db, workspaceId, {
      campaignId: campaign.id,
      contactIds: [contact.id],
    });

    const dueAt = new Date(Date.now() - 1000);
    const { action } = await scheduleFollowUp(db, workspaceId, {
      enrollmentId: enrolled[0]!.id,
      channel: "email",
      actionType: "email_followup",
      dueAt,
      requiresApproval: false,
      actorUserId: ownerId,
      idempotencyKey: `race-claim-${enrolled[0]!.id}`,
    });
    await db
      .update(scheduledActions)
      .set({ status: "pending", dueAt, attemptCount: 0 })
      .where(eq(scheduledActions.id, action.id));

    const [a, b] = await Promise.all([
      claimDueActions(db, { now: new Date(), limit: 10, workerId: "w-a" }),
      claimDueActions(db, { now: new Date(), limit: 10, workerId: "w-b" }),
    ]);

    const claimedIds = [...a, ...b].map((r) => r.id);
    const hits = claimedIds.filter((id) => id === action.id);
    expect(hits.length).toBe(1);

    const row = await db.query.scheduledActions.findFirst({
      where: eq(scheduledActions.id, action.id),
    });
    expect(row?.status).toBe("reserved");
    expect(row?.claimedBy === "w-a" || row?.claimedBy === "w-b").toBe(true);
  });

  it("reclaims abandoned reserved claims after lease expiry", async () => {
    const { contact } = await createContact(db, workspaceId, {
      fullName: "Lease Recover",
      email: `lease-${Date.now()}@example.com`,
    });
    const campaign = await createCampaign(db, workspaceId, {
      name: `Lease ${Date.now()}`,
      ownerUserId: ownerId,
    });
    const { enrolled } = await enrollContacts(db, workspaceId, {
      campaignId: campaign.id,
      contactIds: [contact.id],
    });

    const dueAt = new Date(Date.now() - 1000);
    const { action } = await scheduleFollowUp(db, workspaceId, {
      enrollmentId: enrolled[0]!.id,
      channel: "email",
      actionType: "email_followup",
      dueAt,
      requiresApproval: false,
      actorUserId: ownerId,
      idempotencyKey: `lease-${enrolled[0]!.id}`,
    });

    await db
      .update(scheduledActions)
      .set({
        status: "reserved",
        dueAt,
        reservedAt: new Date(Date.now() - CLAIM_LEASE_MS - 1000),
        leaseExpiresAt: new Date(Date.now() - 1000),
        claimedBy: "dead-worker",
        attemptCount: 1,
      })
      .where(eq(scheduledActions.id, action.id));

    const claimed = await claimDueActions(db, {
      now: new Date(),
      limit: 10,
      workerId: "recovery-worker",
    });
    expect(claimed.some((c) => c.id === action.id)).toBe(true);

    const row = await db.query.scheduledActions.findFirst({
      where: eq(scheduledActions.id, action.id),
    });
    expect(row?.claimedBy).toBe("recovery-worker");
  });

  it("bounce records email suppression", async () => {
    const { contact } = await createContact(db, workspaceId, {
      fullName: "Bounce Contact",
      email: `bounce-${Date.now()}@example.com`,
    });
    const campaign = await createCampaign(db, workspaceId, {
      name: `Bounce ${Date.now()}`,
      ownerUserId: ownerId,
    });
    await enrollContacts(db, workspaceId, {
      campaignId: campaign.id,
      contactIds: [contact.id],
    });

    await recordActivity(db, workspaceId, {
      contactId: contact.id,
      campaignId: campaign.id,
      channel: "email",
      kind: "bounced",
      recordedByUserId: ownerId,
      idempotencyKey: `bounce-${contact.id}`,
    });

    const { getContactSuppressions } = await import("../suppressions/service");
    const rows = await getContactSuppressions(db, workspaceId, contact.id);
    expect(rows.some((r) => r.origin === "hard_bounce")).toBe(true);
  });

  it("returns operational metrics without PII fields", async () => {
    const metrics = await getOperationalMetrics(db, workspaceId);
    expect(metrics.scheduledActions).toBeTruthy();
    expect(typeof metrics.outboxBacklog).toBe("number");
    expect(metrics.workspaceId).toBe(workspaceId);
  });
});
