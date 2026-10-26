import {
  CANONICAL_CSV_FIELDS,
  CSV_COLUMN_ALIASES,
  type CanonicalCsvField,
} from "@smartreach/shared";

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ");
}

/** Auto-map familiar column headers to canonical fields. */
export function autoMapColumns(
  headers: string[],
): Record<string, CanonicalCsvField | null> {
  const used = new Set<CanonicalCsvField>();
  const mapping: Record<string, CanonicalCsvField | null> = {};

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    let matched: CanonicalCsvField | null = null;

    for (const field of CANONICAL_CSV_FIELDS) {
      if (used.has(field)) continue;
      const aliases = CSV_COLUMN_ALIASES[field] ?? [];
      if (
        aliases.some((alias) => normalizeHeader(alias) === normalized) ||
        normalizeHeader(field) === normalized
      ) {
        matched = field;
        used.add(field);
        break;
      }
    }

    mapping[header] = matched;
  }

  return mapping;
}

export function applyMapping(
  raw: Record<string, string>,
  mapping: Record<string, string | null>,
): Record<CanonicalCsvField, string | null> {
  const result = Object.fromEntries(
    CANONICAL_CSV_FIELDS.map((f) => [f, null]),
  ) as Record<CanonicalCsvField, string | null>;

  for (const [header, field] of Object.entries(mapping)) {
    if (!field) continue;
    if (!(CANONICAL_CSV_FIELDS as readonly string[]).includes(field)) continue;
    const value = raw[header]?.trim();
    if (value) {
      result[field as CanonicalCsvField] = value;
    }
  }

  return result;
}

export function unmappedHeaders(
  mapping: Record<string, string | null>,
): string[] {
  return Object.entries(mapping)
    .filter(([, field]) => !field)
    .map(([header]) => header);
}
