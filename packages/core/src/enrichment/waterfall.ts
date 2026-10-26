import type {
  ContactDiscoveryProvider,
  EmailVerificationProvider,
  EnrichmentBudget,
  PersonCompanyQuery,
  WaterfallResult,
} from "./types";

/** No-op providers — live enrichment deferred; no paid APIs without config. */
export const noopDiscoveryProvider: ContactDiscoveryProvider = {
  id: "noop",
  async findEmail() {
    return null;
  },
};

export const noopVerificationProvider: EmailVerificationProvider = {
  id: "noop",
  async verify() {
    return { status: "unknown", provider: "noop" };
  },
};

/**
 * Provider-agnostic enrichment waterfall. Stops at first verified candidate.
 * Respects budget caps; does not call providers when disabled/unconfigured.
 */
export async function runEnrichmentWaterfall(
  query: PersonCompanyQuery,
  opts?: {
    discoveryProviders?: ContactDiscoveryProvider[];
    verification?: EmailVerificationProvider;
    budget?: EnrichmentBudget;
    enabled?: boolean;
  },
): Promise<WaterfallResult> {
  if (opts?.enabled !== true) {
    return {
      email: null,
      status: "unknown",
      provider: null,
      attempts: [],
      skippedReason: "enrichment_disabled",
    };
  }

  const budget = opts.budget ?? {
    maxCalls: 0,
    maxCostUsd: 0,
    callsUsed: 0,
    costUsedUsd: 0,
  };

  if (budget.maxCalls <= 0 || budget.callsUsed >= budget.maxCalls) {
    return {
      email: null,
      status: "unknown",
      provider: null,
      attempts: [],
      skippedReason: "budget_exhausted",
    };
  }

  const discovery = opts.discoveryProviders ?? [noopDiscoveryProvider];
  const verification = opts.verification ?? noopVerificationProvider;
  const attempts: WaterfallResult["attempts"] = [];

  for (const provider of discovery) {
    if (budget.callsUsed >= budget.maxCalls) break;
    const candidate = await provider.findEmail?.(query, budget);
    budget.callsUsed += 1;
    if (!candidate?.email) {
      attempts.push({ provider: provider.id, outcome: "no_result" });
      continue;
    }

    const verified = await verification.verify?.(candidate.email, budget);
    budget.callsUsed += 1;
    const status = verified?.status ?? candidate.status;

    if (status === "verified") {
      attempts.push({ provider: provider.id, outcome: "verified" });
      return {
        email: candidate.email,
        status,
        provider: candidate.provider ?? provider.id,
        attempts,
      };
    }

    attempts.push({
      provider: provider.id,
      outcome: status ?? "unverified",
    });
  }

  return {
    email: null,
    status: "unknown",
    provider: null,
    attempts,
  };
}
