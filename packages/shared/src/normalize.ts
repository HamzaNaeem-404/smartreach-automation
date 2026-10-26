/** Normalize company/contact names for exact dedup keys. */
export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .replace(
      /\b(inc|llc|ltd|corp|corporation|company|co|gmbh|plc|sa|ag)\b\.?/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeLinkedInUrl(value: string): string {
  let url = value.trim().toLowerCase();
  url = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
  url = url.replace(/\/+$/, "");
  // Collapse mobile / country prefixes to linkedin.com/in/...
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (match?.[1]) {
    return `linkedin.com/in/${match[1]}`;
  }
  return url;
}

export function normalizeContactMethodValue(
  type: "email" | "linkedin" | "phone",
  value: string,
): string {
  if (type === "email") return normalizeEmail(value);
  if (type === "linkedin") return normalizeLinkedInUrl(value);
  return value.trim();
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function splitFullName(fullName: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(" ") || null,
  };
}
