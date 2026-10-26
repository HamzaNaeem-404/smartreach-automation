import { describe, expect, it } from "vitest";
import {
  computeSimHash,
  hammingDistance,
  isNearDuplicate,
  skillOverlapRatio,
  suggestRelatedPosting,
} from "./simhash";

describe("simhash", () => {
  it("is stable for identical text", () => {
    const text = "Senior backend engineer TypeScript Node APIs";
    expect(computeSimHash(text)).toBe(computeSimHash(text));
  });

  it("detects near-duplicates under small edits", () => {
    const a =
      "Build secure identity and loyalty integrations for AI-assisted commerce using Python and TypeScript.";
    const b =
      "Build secure identity and loyalty integrations for AI assisted commerce using Python and TypeScript!";
    expect(isNearDuplicate(computeSimHash(a), computeSimHash(b), 10)).toBe(
      true,
    );
  });

  it("does not treat unrelated roles as near-duplicates", () => {
    const a = computeSimHash("Staff Platform Engineer Kubernetes Terraform");
    const b = computeSimHash("Dental Hygienist patient care clinic");
    expect(hammingDistance(a, b)).toBeGreaterThan(6);
  });

  it("computes asymmetric skill overlap", () => {
    expect(skillOverlapRatio(["python", "go"], ["python", "java"])).toBe(0.5);
  });

  it("suggests related via skill overlap without auto-merge semantics", () => {
    const result = suggestRelatedPosting(
      { text: "Role A", skills: ["typescript", "node", "postgres"] },
      { text: "Role B", skills: ["typescript", "node"] },
    );
    expect(result.related).toBe(true);
    expect(result.reason).toBe("skill_overlap");
  });
});
