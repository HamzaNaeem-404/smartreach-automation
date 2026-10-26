export const ScheduledActionStatuses = [
  "pending",
  "awaiting_approval",
  "reserved",
  "blocked",
  "cancelled",
  "completed",
  "failed",
] as const;
export type ScheduledActionStatus = (typeof ScheduledActionStatuses)[number];

export const FollowUpQueueBuckets = [
  "due_today",
  "overdue",
  "upcoming",
  "awaiting_approval",
  "blocked",
  "cancelled",
  "completed",
  "failed",
] as const;
export type FollowUpQueueBucket = (typeof FollowUpQueueBuckets)[number];

export const ELIGIBILITY_POLICY_VERSION = "eligibility.v1";

export const EligibilityBlockReasons = [
  "global_do_not_contact",
  "channel_suppression",
  "campaign_inactive",
  "enrollment_not_active",
  "enrollment_replied",
  "enrollment_do_not_contact",
  "email_replied",
  "email_bounced",
  "linkedin_declined",
  "sender_identity_disabled",
  "outside_schedule_window",
  "retry_limit_exceeded",
  "campaign_paused",
  "action_already_terminal",
  "requires_human_approval",
  "cross_channel_policy",
] as const;
export type EligibilityBlockReason = (typeof EligibilityBlockReasons)[number];
