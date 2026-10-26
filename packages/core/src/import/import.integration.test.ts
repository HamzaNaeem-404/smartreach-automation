import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { createDb, type Database } from "@smartreach/db";
import {
  users,
  workspaces,
  workspaceMembers,
  companies,
  importRows,
  channelActivities,
} from "@smartreach/db";
import {
  createImportBatch,
  confirmMappingAndProcess,
} from "./service";
import { recordActivity, createCampaign, enrollContacts } from "../campaigns/service.js";
import { createContact } from "../crm/service.js";
import { autoMapColumns } from "./mapping";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://smartreach:smartreach@localhost:5432/smartreach";

describe("import + activity integration", () => {
  let db: Database;
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL);

    const [user] = await db
      .insert(users)
      .values({
        email: `test-${Date.now()}@example.com`,
        name: "Test User",
        passwordHash: "x",
      })
      .returning();
    userId = user!.id;

    const [ws] = await db
      .insert(workspaces)
      .values({
        name: "Test WS",
        slug: `test-${Date.now()}`,
      })
      .returning();
    workspaceId = ws!.id;

    await db.insert(workspaceMembers).values({
      workspaceId,
      userId,
      role: "owner",
    });
  });

  afterAll(async () => {
    // best-effort cleanup via cascade from workspace
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("imports CSV into companies/jobs/contacts and preserves provenance on dedup", async () => {
    const csvPath = resolve(
      process.cwd(),
      "../../samples/jobs-greenhouse.csv",
    );
    const content = readFileSync(csvPath, "utf8");

    const { batch, suggestedMapping } = await createImportBatch(db, {
      workspaceId,
      userId,
      fileName: "jobs-greenhouse.csv",
      content,
    });

    expect(batch.status).toBe("mapping");
    expect(suggestedMapping["Company Name"]).toBe("companyName");

    const completed = await confirmMappingAndProcess(db, {
      workspaceId,
      batchId: batch.id,
      mapping: suggestedMapping,
    });

    expect(completed?.status).toBe("completed");
    expect((completed?.stats?.companiesCreated ?? 0) + (completed?.stats?.companiesMatched ?? 0)).toBeGreaterThan(0);

    // Acme Robotics + Acme Robotics Inc should normalize to same company
    const acme = await db.query.companies.findMany({
      where: and(
        eq(companies.workspaceId, workspaceId),
        eq(companies.normalizedName, "acme robotics"),
      ),
    });
    expect(acme.length).toBe(1);

    const rows = await db.query.importRows.findMany({
      where: eq(importRows.batchId, batch.id),
    });
    expect(rows.length).toBe(5);
    expect(rows.every((r) => r.rawPayload != null)).toBe(true);

    // Re-import same file — provenance rows created again, companies matched
    const second = await createImportBatch(db, {
      workspaceId,
      userId,
      fileName: "jobs-greenhouse-again.csv",
      content,
    });
    const secondDone = await confirmMappingAndProcess(db, {
      workspaceId,
      batchId: second.batch.id,
      mapping: autoMapColumns(Object.keys(second.preview[0] ?? {})),
    });
    expect((secondDone?.stats?.companiesMatched ?? 0)).toBeGreaterThan(0);

    const acmeAfter = await db.query.companies.findMany({
      where: and(
        eq(companies.workspaceId, workspaceId),
        eq(companies.normalizedName, "acme robotics"),
      ),
    });
    expect(acmeAfter.length).toBe(1);
  });

  it("records linkedin + email activities on unified timeline and updates enrollment", async () => {
    const { contact } = await createContact(db, workspaceId, {
      fullName: "Pat Example",
      email: `pat-${Date.now()}@example.com`,
      linkedinUrl: `https://www.linkedin.com/in/pat-${Date.now()}`,
    });

    const campaign = await createCampaign(db, workspaceId, {
      name: `Camp ${Date.now()}`,
      ownerUserId: userId,
    });

    await enrollContacts(db, workspaceId, {
      campaignId: campaign.id,
      contactIds: [contact.id],
      assignedUserId: userId,
    });

    await recordActivity(db, workspaceId, {
      contactId: contact.id,
      campaignId: campaign.id,
      channel: "linkedin",
      kind: "invitation_sent",
      subject: "Connection request",
      recordedByUserId: userId,
      idempotencyKey: `test-li-${contact.id}`,
    });

    await recordActivity(db, workspaceId, {
      contactId: contact.id,
      campaignId: campaign.id,
      channel: "email",
      kind: "sent",
      subject: "Intro",
      body: "Hello",
      recordedByUserId: userId,
      idempotencyKey: `test-em-${contact.id}`,
    });

    // idempotent replay
    const replay = await recordActivity(db, workspaceId, {
      contactId: contact.id,
      campaignId: campaign.id,
      channel: "email",
      kind: "sent",
      subject: "Intro",
      recordedByUserId: userId,
      idempotencyKey: `test-em-${contact.id}`,
    });
    expect(replay.duplicate).toBe(true);

    const activities = await db.query.channelActivities.findMany({
      where: and(
        eq(channelActivities.workspaceId, workspaceId),
        eq(channelActivities.contactId, contact.id),
      ),
    });
    expect(activities.length).toBe(2);
    expect(activities.map((a) => a.channel).sort()).toEqual(["email", "linkedin"]);

    const reply = await recordActivity(db, workspaceId, {
      contactId: contact.id,
      campaignId: campaign.id,
      channel: "email",
      kind: "replied",
      recordedByUserId: userId,
      idempotencyKey: `test-reply-${contact.id}`,
    });
    expect(reply.duplicate).toBe(false);

    const enrollment = await db.query.campaignEnrollments.findFirst({
      where: (e, { and: a, eq: e2 }) =>
        a(e2(e.campaignId, campaign.id), e2(e.contactId, contact.id)),
    });
    expect(enrollment?.status).toBe("replied");
  });

  it("enforces workspace isolation for import batches", async () => {
    const [otherWs] = await db
      .insert(workspaces)
      .values({ name: "Other", slug: `other-${Date.now()}` })
      .returning();

    const csv =
      "Company Name,Job Title\nIsolation Co,Engineer\n";
    const { batch } = await createImportBatch(db, {
      workspaceId,
      userId,
      fileName: "iso.csv",
      content: csv,
    });

    await expect(
      confirmMappingAndProcess(db, {
        workspaceId: otherWs!.id,
        batchId: batch.id,
        mapping: { "Company Name": "companyName", "Job Title": "jobTitle" },
      }),
    ).rejects.toThrow(/not found/i);

    await db.delete(workspaces).where(eq(workspaces.id, otherWs!.id));
  });
});
