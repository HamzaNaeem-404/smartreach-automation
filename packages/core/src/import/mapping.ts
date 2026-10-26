import {
  CANONICAL_CSV_FIELDS,
  CSV_COLUMN_ALIASES,
  SOURCE_MAPPING_PRESETS,
  type CanonicalCsvField,
} from "@smartreach/shared";

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ");
}

/** Auto-map familiar column headers to canonical fields. */
export function autoMapColumns(
  headers: string[],
  sourceKey?: string | null,
): Record<string, CanonicalCsvField | null> {
  const used = new Set<CanonicalCsvField>();
  const mapping: Record<string, CanonicalCsvField | null> = {};

  const preset =
    sourceKey != null
      ? SOURCE_MAPPING_PRESETS[sourceKey.toLowerCase()]
      : undefined;

  // Apply deterministic source presets first (exact header match).
  if (preset) {
    for (const header of headers) {
      const presetField = preset[header] ?? preset[normalizeHeader(header)];
      if (
        presetField &&
        (CANONICAL_CSV_FIELDS as readonly string[]).includes(presetField) &&
        !used.has(presetField as CanonicalCsvField)
      ) {
        mapping[header] = presetField as CanonicalCsvField;
        used.add(presetField as CanonicalCsvField);
      }
    }
  }

  for (const header of headers) {
    if (mapping[header]) continue;

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
