import {
  DEFAULT_SCORING_CONFIG,
  type ScoringConfig,
} from "./config";

export type ScoreInput = {
  title: string;
  description?: string | null;
  skills?: string[];
  budgetAmount?: number | null;
  budgetFloor?: number | null;
  clientQualityScore?: number | null; // 0..1 when known
  postedAt?: Date | null;
  now?: Date;
};

export type ScoreBreakdown = {
  skillMatch: number;
  budget: number;
  clientQuality: number;
  freshness: number;
  redFlagPenalty: number;
  matchedFilter: string | null;
  keywordRatio: number;
  missing: string[];
};

export type ScoreResult = {
  score: number;
  qualified: boolean;
  hot: boolean;
  discardReason: string | null;
  breakdown: ScoreBreakdown;
  configVersion: string;
};

function bestFilter(
  text: string,
  filters: ScoringConfig["keywordFilters"],
) {
  let best: (typeof filters)[number] | null = null;
  let bestRatio = 0;
  for (const f of filters) {
    if (!f.keywords?.length) continue;
    const hits = f.keywords.filter((kw) => {
      const needle = kw.toLowerCase();
      // Word-boundary-ish match to avoid "api" inside "associate"
      const re = new RegExp(
        `(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`,
        "i",
      );
      return re.test(text);
    }).length;
    const ratio = hits / f.keywords.length;
    if (ratio > bestRatio) {
      best = f;
      bestRatio = ratio;
    }
  }
  return { filter: best, ratio: bestRatio };
}

function freshnessPoints(
  postedAt: Date | null | undefined,
  maxHours: number,
  cap: number,
  now: Date,
  missing: string[],
) {
  if (!postedAt) {
    missing.push("postedAt");
    return cap * 0.5;
  }
  const ageHours = (now.getTime() - postedAt.getTime()) / 3_600_000;
  if (ageHours <= maxHours) return cap;
  if (ageHours >= maxHours * 2) return 0;
  return cap * (1 - (ageHours - maxHours) / maxHours);
}

/**
 * Deterministic, explainable job scoring. No LLM.
 */
export function scoreJobPosting(
  input: ScoreInput,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoreResult {
  const now = input.now ?? new Date();
  const text = [
    input.title,
    input.description ?? "",
    ...(input.skills ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const missing: string[] = [];
  const { filter, ratio } = bestFilter(text, config.keywordFilters);

  if (!filter || ratio === 0) {
    return {
      score: 0,
      qualified: false,
      hot: false,
      discardReason: "no_filter_match",
      breakdown: {
        skillMatch: 0,
        budget: 0,
        clientQuality: 0,
        freshness: 0,
        redFlagPenalty: 0,
        matchedFilter: null,
        keywordRatio: 0,
        missing,
      },
      configVersion: config.version,
    };
  }

  if (
    filter.excludeKeywords?.some((term) => {
      const needle = term.toLowerCase();
      return text.includes(needle);
    })
  ) {
    return {
      score: 0,
      qualified: false,
      hot: false,
      discardReason: "matched_exclude_keyword",
      breakdown: {
        skillMatch: 0,
        budget: 0,
        clientQuality: 0,
        freshness: 0,
        redFlagPenalty: 0,
        matchedFilter: filter.name,
        keywordRatio: ratio,
        missing,
      },
      configVersion: config.version,
    };
  }

  const skillPoints = ratio * config.weights.skillMatch;

  let budgetPoints: number;
  if (input.budgetAmount == null) {
    missing.push("budgetAmount");
    budgetPoints = config.weights.budget * 0.5;
  } else if (input.budgetFloor != null && input.budgetAmount < input.budgetFloor) {
    budgetPoints = 0;
  } else {
    budgetPoints = config.weights.budget;
  }

  let clientPoints: number;
  if (input.clientQualityScore == null) {
    missing.push("clientQualityScore");
    clientPoints = config.weights.clientQuality * 0.5;
  } else {
    clientPoints = config.weights.clientQuality * Math.min(1, Math.max(0, input.clientQualityScore));
  }

  const freshness = freshnessPoints(
    input.postedAt,
    config.postingAgeMaxHours,
    config.weights.freshness,
    now,
    missing,
  );

  const redFlagHit = config.redFlagTerms.some((term) =>
    text.includes(term.toLowerCase()),
  );
  const penalty = redFlagHit ? config.redFlagPenalty : 0;

  const raw =
    skillPoints + budgetPoints + clientPoints + freshness - penalty;
  const score = Math.max(0, Math.min(100, raw));

  return {
    score,
    qualified: score >= config.thresholdQualify,
    hot: score >= config.thresholdHot,
    discardReason:
      score >= config.thresholdQualify ? null : "below_qualify_threshold",
    breakdown: {
      skillMatch: skillPoints,
      budget: budgetPoints,
      clientQuality: clientPoints,
      freshness,
      redFlagPenalty: penalty,
      matchedFilter: filter.name,
      keywordRatio: ratio,
      missing,
    },
    configVersion: config.version,
  };
}
