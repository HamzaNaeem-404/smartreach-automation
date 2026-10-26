import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Database } from "@smartreach/db";
import {
  companies,
  contacts,
  contactMethods,
  companyContactRelationships,
  jobPostings,
  channelActivities,
} from "@smartreach/db";
import {
  normalizeContactMethodValue,
  normalizeName,
  NotFoundError,
  splitFullName,
  type ContactMethodType,
} from "@smartreach/shared";

export async function listCompanies(
  db: Database,
  workspaceId: string,
  opts?: { search?: string; limit?: number; offset?: number },
) {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const conditions = [
    eq(companies.workspaceId, workspaceId),
    sql`${companies.deletedAt} IS NULL`,
  ];
  if (opts?.search) {
    conditions.push(ilike(companies.name, `%${opts.search}%`));
  }

  return db.query.companies.findMany({
    where: and(...conditions),
    orderBy: [desc(companies.createdAt)],
    limit,
    offset,
    with: {
      jobPostings: true,
    },
  });
}

export async function getCompany(
  db: Database,
  workspaceId: string,
  companyId: string,
) {
  const company = await db.query.companies.findFirst({
    where: and(
      eq(companies.id, companyId),
      eq(companies.workspaceId, workspaceId),
    ),
    with: {
      jobPostings: true,
      relationships: {
        with: { contact: { with: { methods: true } } },
      },
    },
  });
  if (!company) throw new NotFoundError("Company");
  return company;
}

export async function createCompany(
  db: Database,
  workspaceId: string,
  input: { name: string; domain?: string; website?: string; notes?: string },
) {
  const [company] = await db
    .insert(companies)
    .values({
      workspaceId,
      name: input.name,
      normalizedName: normalizeName(input.name),
      domain: input.domain,
      website: input.website,
      notes: input.notes,
    })
    .onConflictDoNothing()
    .returning();

  if (company) return company;

  const existing = await db.query.companies.findFirst({
    where: and(
      eq(companies.workspaceId, workspaceId),
      eq(companies.normalizedName, normalizeName(input.name)),
    ),
  });
  if (!existing) throw new Error("Failed to create company");
  return existing;
}

export async function listContacts(
  db: Database,
  workspaceId: string,
  opts?: { search?: string; limit?: number; offset?: number },
) {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const conditions = [
    eq(contacts.workspaceId, workspaceId),
    sql`${contacts.deletedAt} IS NULL`,
  ];
  if (opts?.search) {
    conditions.push(
      or(
        ilike(contacts.fullName, `%${opts.search}%`),
        ilike(contacts.title, `%${opts.search}%`),
      )!,
    );
  }

  return db.query.contacts.findMany({
    where: and(...conditions),
    orderBy: [desc(contacts.createdAt)],
    limit,
    offset,
    with: {
      methods: true,
      relationships: { with: { company: true } },
    },
  });
}

export async function getContact(
  db: Database,
  workspaceId: string,
  contactId: string,
) {
  const contact = await db.query.contacts.findFirst({
    where: and(
      eq(contacts.id, contactId),
      eq(contacts.workspaceId, workspaceId),
    ),
    with: {
      methods: true,
      relationships: { with: { company: true } },
    },
  });
  if (!contact) throw new NotFoundError("Contact");
  return contact;
}

export async function createContact(
  db: Database,
  workspaceId: string,
  input: {
    companyId?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    title?: string;
    email?: string;
    linkedinUrl?: string;
    notes?: string;
    ownerUserId?: string;
  },
) {
  // Exact match via email or LinkedIn only — never name alone
  if (input.email) {
    const existing = await db.query.contactMethods.findFirst({
      where: and(
        eq(contactMethods.workspaceId, workspaceId),
        eq(contactMethods.type, "email"),
        eq(
          contactMethods.normalizedValue,
          normalizeContactMethodValue("email", input.email),
        ),
      ),
    });
    if (existing) {
      const contact = await getContact(db, workspaceId, existing.contactId);
      if (input.companyId) {
        await linkContactToCompany(db, workspaceId, contact.id, input.companyId, input.title);
      }
      return { contact, created: false };
    }
  }

  if (input.linkedinUrl) {
    const existing = await db.query.contactMethods.findFirst({
      where: and(
        eq(contactMethods.workspaceId, workspaceId),
        eq(contactMethods.type, "linkedin"),
        eq(
          contactMethods.normalizedValue,
          normalizeContactMethodValue("linkedin", input.linkedinUrl),
        ),
      ),
    });
    if (existing) {
      const contact = await getContact(db, workspaceId, existing.contactId);
      if (input.companyId) {
        await linkContactToCompany(db, workspaceId, contact.id, input.companyId, input.title);
      }
      return { contact, created: false };
    }
  }

  const fullName =
    input.fullName ??
    ([input.firstName, input.lastName].filter(Boolean).join(" ") || "Unknown");
  const names = splitFullName(fullName);

  const [contact] = await db
    .insert(contacts)
    .values({
      workspaceId,
      firstName: input.firstName ?? names.firstName,
      lastName: input.lastName ?? names.lastName,
      fullName,
      title: input.title,
      notes: input.notes,
      ownerUserId: input.ownerUserId,
    })
    .returning();

  if (!contact) throw new Error("Failed to create contact");

  if (input.email) {
    await addContactMethod(db, workspaceId, {
      contactId: contact.id,
      type: "email",
      value: input.email,
      isPrimary: true,
    });
  }

  if (input.linkedinUrl) {
    await addContactMethod(db, workspaceId, {
      contactId: contact.id,
      type: "linkedin",
      value: input.linkedinUrl,
      isPrimary: !input.email,
    });
  }

  if (input.companyId) {
    await linkContactToCompany(
      db,
      workspaceId,
      contact.id,
      input.companyId,
      input.title,
    );
  }

  return {
    contact: await getContact(db, workspaceId, contact.id),
    created: true,
  };
}

export async function addContactMethod(
  db: Database,
  workspaceId: string,
  input: {
    contactId: string;
    type: ContactMethodType;
    value: string;
    isPrimary?: boolean;
  },
) {
  await getContact(db, workspaceId, input.contactId);
  const [method] = await db
    .insert(contactMethods)
    .values({
      workspaceId,
      contactId: input.contactId,
      type: input.type,
      value: input.value,
      normalizedValue: normalizeContactMethodValue(input.type, input.value),
      isPrimary: input.isPrimary ?? false,
      provenance: "manual",
    })
    .onConflictDoNothing()
    .returning();
  return method;
}

export async function linkContactToCompany(
  db: Database,
  workspaceId: string,
  contactId: string,
  companyId: string,
  title?: string,
) {
  await getCompany(db, workspaceId, companyId);
  await getContact(db, workspaceId, contactId);
  await db
    .insert(companyContactRelationships)
    .values({
      workspaceId,
      companyId,
      contactId,
      title,
      isPrimary: true,
    })
    .onConflictDoNothing();
}

export async function getContactTimeline(
  db: Database,
  workspaceId: string,
  contactId: string,
) {
  await getContact(db, workspaceId, contactId);
  return db.query.channelActivities.findMany({
    where: and(
      eq(channelActivities.workspaceId, workspaceId),
      eq(channelActivities.contactId, contactId),
    ),
    orderBy: [desc(channelActivities.occurredAt)],
  });
}

export async function listJobPostings(db: Database, workspaceId: string) {
  return db.query.jobPostings.findMany({
    where: eq(jobPostings.workspaceId, workspaceId),
    orderBy: [desc(jobPostings.createdAt)],
    with: { company: true },
    limit: 100,
  });
}
