import { describe, expect, it } from "vitest";
import { roleHasPermission } from "./permissions";

describe("roleHasPermission", () => {
  it("allows members to record activity but not approve follow-ups", () => {
    expect(roleHasPermission("member", "activities:write")).toBe(true);
    expect(roleHasPermission("member", "followups:complete")).toBe(true);
    expect(roleHasPermission("member", "followups:approve")).toBe(false);
    expect(roleHasPermission("member", "suppressions:write")).toBe(false);
  });

  it("allows admins to manage suppressions and approve", () => {
    expect(roleHasPermission("admin", "suppressions:write")).toBe(true);
    expect(roleHasPermission("admin", "followups:approve")).toBe(true);
    expect(roleHasPermission("admin", "workspace:manage")).toBe(false);
  });

  it("gives owners full access", () => {
    expect(roleHasPermission("owner", "workspace:manage")).toBe(true);
    expect(roleHasPermission("owner", "senders:write")).toBe(true);
  });
});
