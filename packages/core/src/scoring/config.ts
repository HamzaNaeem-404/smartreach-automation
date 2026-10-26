export type ScoringWeights = {
  skillMatch: number;
  budget: number;
  clientQuality: number;
  freshness: number;
};

export type ScoringConfig = {
  version: string;
  weights: ScoringWeights;
  postingAgeMaxHours: number;
  redFlagTerms: string[];
  redFlagPenalty: number;
  thresholdQualify: number;
  thresholdHot: number;
  keywordFilters: {
    name: string;
    keywords: string[];
    excludeKeywords: string[];
  }[];
};

/** Experimental defaults adapted from bd-pipeline; not treated as optimized. */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  version: "scoring.v1",
  weights: {
    skillMatch: 40,
    budget: 20,
    clientQuality: 20,
    freshness: 20,
  },
  postingAgeMaxHours: 72,
  redFlagTerms: ["wordpress fix", "academic", "urgent same day"],
  redFlagPenalty: 30,
  thresholdQualify: 55,
  thresholdHot: 80,
  keywordFilters: [
    {
      name: "backend_platform",
      keywords: [
        "typescript",
        "node",
        "python",
        "platform",
        "backend",
        "api",
        "infrastructure",
      ],
      excludeKeywords: ["unpaid", "equity only"],
    },
    {
      name: "ai_ml",
      keywords: ["ai", "llm", "machine learning", "ml engineer", "agent"],
      excludeKeywords: [],
    },
  ],
};
