export type EmailVerificationStatus =
  | "verified"
  | "unverified"
  | "risky"
  | "unknown";

export type PersonCompanyQuery = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  companyName?: string | null;
  companyDomain?: string | null;
};

export type DiscoveryCandidate = {
  email: string;
  provider: string;
  status: EmailVerificationStatus;
  raw?: Record<string, unknown>;
};

export type EnrichmentBudget = {
  maxCalls: number;
  maxCostUsd: number;
  callsUsed: number;
  costUsedUsd: number;
};

export interface ContactDiscoveryProvider {
  readonly id: string;
  findEmail(
    query: PersonCompanyQuery,
    budget: EnrichmentBudget,
  ): Promise<DiscoveryCandidate | null>;
}

export interface EmailVerificationProvider {
  readonly id: string;
  verify(
    email: string,
    budget: EnrichmentBudget,
  ): Promise<{ status: EmailVerificationStatus; provider: string }>;
}

export type WaterfallResult = {
  email: string | null;
  status: EmailVerificationStatus;
  provider: string | null;
  attempts: { provider: string; outcome: string }[];
  skippedReason?: string;
};
