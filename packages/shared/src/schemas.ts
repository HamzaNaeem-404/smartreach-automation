import { z } from "zod";
import {
  Channels,
  ContactMethodTypes,
  EmailActivityKinds,
  EnrollmentStatuses,
  LinkedInActivityKinds,
  WorkspaceRoles,
} from "./enums";

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(WorkspaceRoles).default("member"),
});

export const columnMappingSchema = z.record(z.string(), z.string().nullable());

export const confirmImportMappingSchema = z.object({
  batchId: z.string().uuid(),
  mapping: columnMappingSchema,
  saveAsTemplate: z.boolean().optional(),
  templateSourceKey: z.string().optional(),
});

export const createContactSchema = z.object({
  companyId: z.string().uuid().optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().max(100).optional(),
  fullName: z.string().min(1).max(200).optional(),
  title: z.string().max(200).optional(),
  email: z.string().email().optional(),
  linkedinUrl: z.string().url().optional(),
  notes: z.string().max(5000).optional(),
});

export const createCompanySchema = z.object({
  name: z.string().min(1).max(300),
  domain: z.string().max(255).optional(),
  website: z.string().url().optional(),
  notes: z.string().max(5000).optional(),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export const enrollContactsSchema = z.object({
  campaignId: z.string().uuid(),
  contactIds: z.array(z.string().uuid()).min(1).max(500),
});

export const recordActivitySchema = z.object({
  contactId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  enrollmentId: z.string().uuid().optional(),
  channel: z.enum(Channels),
  kind: z.union([z.enum(LinkedInActivityKinds), z.enum(EmailActivityKinds)]),
  subject: z.string().max(500).optional(),
  body: z.string().max(10000).optional(),
  occurredAt: z.string().datetime().optional(),
  idempotencyKey: z.string().max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateEnrollmentStatusSchema = z.object({
  enrollmentId: z.string().uuid(),
  status: z.enum(EnrollmentStatuses),
  reason: z.string().max(500).optional(),
});

export const createSenderIdentitySchema = z.object({
  channel: z.enum(Channels),
  displayName: z.string().min(1).max(200),
  persona: z.string().max(500).optional(),
  emailAddress: z.string().email().optional(),
  linkedinUrl: z.string().url().optional(),
});

export const createContactMethodSchema = z.object({
  contactId: z.string().uuid(),
  type: z.enum(ContactMethodTypes),
  value: z.string().min(1).max(500),
  isPrimary: z.boolean().optional(),
});
