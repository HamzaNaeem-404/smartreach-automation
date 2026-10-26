import { eq } from "drizzle-orm";
import { createDb } from "./client";
import {
  users,
  workspaces,
  workspaceMembers,
  companies,
  contacts,
  contactMethods,
  companyContactRelationships,
  campaigns,
  campaignSteps,
  campaignEnrollments,
  senderIdentities,
  jobPostings,
} from "./schema";
import {
  normalizeEmail,
  normalizeLinkedInUrl,
  normalizeName,
} from "@smartreach/shared";
import { randomBytes, scryptSync } from "node:crypto";

function hashPassword(password: string): string {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

async function main() {
  const db = createDb();

  const email = "demo@smartreach.local";
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existing) {
    console.log("Seed already applied (demo user exists). Skipping.");
    process.exit(0);
  }

  const passwordHash = hashPassword("demo1234");

  const [user] = await db
    .insert(users)
    .values({
      email,
      name: "Demo User",
      passwordHash,
    })
    .returning();

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: "Demo Workspace",
      slug: "demo",
    })
    .returning();

  if (!user || !workspace) {
    throw new Error("Failed to create seed user/workspace");
  }

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: user.id,
    role: "owner",
  });

  const [company] = await db
    .insert(companies)
    .values({
      workspaceId: workspace.id,
      name: "Acme Robotics",
      normalizedName: normalizeName("Acme Robotics"),
      domain: "acmerobotics.example",
      website: "https://acmerobotics.example",
    })
    .returning();

  if (!company) throw new Error("Failed to create company");

  await db.insert(jobPostings).values({
    workspaceId: workspace.id,
    companyId: company.id,
    title: "Senior Backend Engineer",
    source: "greenhouse",
    sourceUrl: "https://boards.example.com/acme/senior-backend",
    location: "Remote",
    discoveredAt: new Date(),
  });

  const [contact] = await db
    .insert(contacts)
    .values({
      workspaceId: workspace.id,
      firstName: "Jordan",
      lastName: "Lee",
      fullName: "Jordan Lee",
      title: "VP Engineering",
      ownerUserId: user.id,
    })
    .returning();

  if (!contact) throw new Error("Failed to create contact");

  await db.insert(contactMethods).values([
    {
      workspaceId: workspace.id,
      contactId: contact.id,
      type: "email",
      value: "jordan.lee@acmerobotics.example",
      normalizedValue: normalizeEmail("jordan.lee@acmerobotics.example"),
      isPrimary: true,
      provenance: "seed",
    },
    {
      workspaceId: workspace.id,
      contactId: contact.id,
      type: "linkedin",
      value: "https://www.linkedin.com/in/jordanlee",
      normalizedValue: normalizeLinkedInUrl(
        "https://www.linkedin.com/in/jordanlee",
      ),
      isPrimary: false,
      provenance: "seed",
    },
  ]);

  await db.insert(companyContactRelationships).values({
    workspaceId: workspace.id,
    companyId: company.id,
    contactId: contact.id,
    title: "VP Engineering",
    isPrimary: true,
  });

  const [campaign] = await db
    .insert(campaigns)
    .values({
      workspaceId: workspace.id,
      name: "Q1 Engineering Leads",
      description: "Outreach to eng leaders hiring backend talent",
      status: "active",
      ownerUserId: user.id,
    })
    .returning();

  if (!campaign) throw new Error("Failed to create campaign");

  await db.insert(campaignSteps).values([
    {
      workspaceId: workspace.id,
      campaignId: campaign.id,
      stepOrder: 1,
      channel: "linkedin",
      name: "LinkedIn connection",
      delayDays: 0,
    },
    {
      workspaceId: workspace.id,
      campaignId: campaign.id,
      stepOrder: 2,
      channel: "email",
      name: "Intro email",
      delayDays: 2,
      templateBody: "Hi {{firstName}}, noticed you're hiring...",
    },
  ]);

  await db.insert(campaignEnrollments).values({
    workspaceId: workspace.id,
    campaignId: campaign.id,
    contactId: contact.id,
    status: "active",
    assignedUserId: user.id,
  });

  await db.insert(senderIdentities).values([
    {
      workspaceId: workspace.id,
      ownerUserId: user.id,
      channel: "linkedin",
      displayName: "Alex Chen (Company Rep)",
      persona: "Company representative on LinkedIn",
      linkedinUrl: "https://www.linkedin.com/in/alexchen-rep",
      status: "connected",
    },
    {
      workspaceId: workspace.id,
      ownerUserId: user.id,
      channel: "email",
      displayName: "Dev Outreach",
      persona: "Developer email identity",
      emailAddress: "dev.outreach@smartreach.local",
      status: "pending",
    },
  ]);

  console.log("Seed complete.");
  console.log("  Email:    demo@smartreach.local");
  console.log("  Password: demo1234");
  console.log("  Workspace slug: demo");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
