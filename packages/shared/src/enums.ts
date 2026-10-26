export const WorkspaceRoles = ["owner", "admin", "member"] as const;
export type WorkspaceRole = (typeof WorkspaceRoles)[number];

export const ImportBatchStatuses = [
  "pending",
  "mapping",
  "processing",
  "completed",
  "failed",
] as const;
export type ImportBatchStatus = (typeof ImportBatchStatuses)[number];

export const Channels = ["linkedin", "email"] as const;
export type Channel = (typeof Channels)[number];

export const ContactMethodTypes = ["email", "linkedin", "phone"] as const;
export type ContactMethodType = (typeof ContactMethodTypes)[number];

export const EnrollmentStatuses = [
  "active",
  "paused",
  "replied",
  "interested",
  "not_interested",
  "meeting_booked",
  "do_not_contact",
  "completed",
  "stopped",
] as const;
export type EnrollmentStatus = (typeof EnrollmentStatuses)[number];

export const LinkedInActivityKinds = [
  "invitation_pending",
  "invitation_sent",
  "invitation_accepted",
  "invitation_declined",
  "invitation_unknown",
  "message_sent",
  "reply_received",
  "manual_note",
] as const;
export type LinkedInActivityKind = (typeof LinkedInActivityKinds)[number];

export const EmailActivityKinds = [
  "draft",
  "approved",
  "sent",
  "replied",
  "bounced",
  "failed",
  "manual_note",
] as const;
export type EmailActivityKind = (typeof EmailActivityKinds)[number];

export const ActivityKinds = [
  ...LinkedInActivityKinds,
  ...EmailActivityKinds,
] as const;
export type ActivityKind = (typeof ActivityKinds)[number];

export const SenderIdentityStatuses = [
  "pending",
  "connected",
  "disconnected",
  "disabled",
] as const;
export type SenderIdentityStatus = (typeof SenderIdentityStatuses)[number];

export const SuppressionScopes = ["global", "campaign"] as const;
export type SuppressionScope = (typeof SuppressionScopes)[number];

/** Familiar CSV column aliases → canonical fields */
export const CSV_COLUMN_ALIASES: Record<string, string[]> = {
  companyName: [
    "company",
    "company_name",
    "company name",
    "organization",
    "org",
    "employer",
  ],
  jobTitle: [
    "title",
    "job_title",
    "job title",
    "role",
    "position",
    "job",
  ],
  jobUrl: [
    "url",
    "job_url",
    "job url",
    "link",
    "posting_url",
    "posting url",
    "source_url",
  ],
  source: ["source", "board", "job_board", "job board", "origin"],
  location: ["location", "city", "region", "geo"],
  contactName: [
    "contact",
    "contact_name",
    "contact name",
    "name",
    "full_name",
    "full name",
    "decision_maker",
  ],
  contactEmail: ["email", "contact_email", "contact email", "e-mail"],
  contactLinkedIn: [
    "linkedin",
    "linkedin_url",
    "linkedin url",
    "profile",
    "profile_url",
  ],
  contactTitle: [
    "contact_title",
    "contact title",
    "contact_role",
    "dm_title",
  ],
  discoveredAt: [
    "discovered_at",
    "discovered",
    "date",
    "posted_at",
    "posted",
  ],
};

export const CANONICAL_CSV_FIELDS = [
  "companyName",
  "jobTitle",
  "jobUrl",
  "source",
  "location",
  "contactName",
  "contactEmail",
  "contactLinkedIn",
  "contactTitle",
  "discoveredAt",
] as const;
export type CanonicalCsvField = (typeof CANONICAL_CSV_FIELDS)[number];
