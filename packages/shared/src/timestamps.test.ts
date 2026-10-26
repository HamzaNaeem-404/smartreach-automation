import { describe, expect, it } from "vitest";
import { parseSourceTimestamp } from "./timestamps";

describe("parseSourceTimestamp", () => {
  const observed = new Date("2026-10-26T12:00:00.000Z");

  it("parses absolute ISO timestamps", () => {
    const result = parseSourceTimestamp("2026-03-01", observed);
    expect(result.status).toBe("absolute");
    expect(result.absolute?.toISOString().startsWith("2026-03-01")).toBe(true);
    expect(result.raw).toBe("2026-03-01");
  });

  it("parses SimplyHired relative hours against observation time", () => {
    const result = parseSourceTimestamp("1h", observed);
    expect(result.status).toBe("relative");
    expect(result.absolute?.toISOString()).toBe("2026-10-26T11:00:00.000Z");
    expect(result.uncertainty).toMatch(/recompute/i);
  });

  it("parses 12h relative", () => {
    const result = parseSourceTimestamp("12h", observed);
    expect(result.absolute?.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("handles null and invalid without throwing", () => {
    expect(parseSourceTimestamp(null, observed).status).toBe("null");
    expect(parseSourceTimestamp("", observed).status).toBe("null");
    const bad = parseSourceTimestamp("not-a-date", observed);
    expect(bad.status).toBe("invalid");
    expect(bad.absolute).toBeNull();
  });

  it("preserves raw string for relative values", () => {
    const result = parseSourceTimestamp("5h", observed);
    expect(result.raw).toBe("5h");
    expect(result.observationTime?.toISOString()).toBe(observed.toISOString());
  });
});
