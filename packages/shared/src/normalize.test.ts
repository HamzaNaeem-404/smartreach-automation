import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  normalizeLinkedInUrl,
  normalizeName,
} from "./normalize";

describe("normalizeName", () => {
  it("normalizes company suffixes", () => {
    expect(normalizeName("Acme Robotics, Inc.")).toBe("acme robotics");
    expect(normalizeName("Acme Robotics LLC")).toBe("acme robotics");
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Jordan@Example.COM ")).toBe("jordan@example.com");
  });
});

describe("normalizeLinkedInUrl", () => {
  it("canonicalizes profile urls", () => {
    expect(
      normalizeLinkedInUrl("https://www.linkedin.com/in/JordanLee/"),
    ).toBe("linkedin.com/in/jordanlee");
    expect(normalizeLinkedInUrl("https://linkedin.com/in/jordanlee")).toBe(
      "linkedin.com/in/jordanlee",
    );
  });
});
