import { describe, expect, it } from "vitest";
import { scoreJobPosting } from "./score";
import { DEFAULT_SCORING_CONFIG } from "./config";

describe("scoreJobPosting", () => {
  it("scores a relevant backend role with explainable breakdown", () => {
    const result = scoreJobPosting({
      title: "Senior Backend Platform Engineer",
      description: "TypeScript Node API infrastructure",
      postedAt: new Date(),
      now: new Date(),
    });
    expect(result.configVersion).toBe(DEFAULT_SCORING_CONFIG.version);
    expect(result.breakdown.matchedFilter).toBeTruthy();
    expect(result.breakdown.skillMatch).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it("handles missing data with partial credit", () => {
    const result = scoreJobPosting({
      title: "Python AI Engineer LLM agent",
      description: "Build MCP tools",
    });
    expect(result.breakdown.missing).toContain("postedAt");
    expect(result.breakdown.freshness).toBe(
      DEFAULT_SCORING_CONFIG.weights.freshness * 0.5,
    );
  });

  it("discards when no filter matches", () => {
    const result = scoreJobPosting({
      title: "Retail Cashier",
      description: "Front desk greeting and register work",
    });
    expect(result.qualified).toBe(false);
    expect(result.discardReason).toBe("no_filter_match");
  });
});
