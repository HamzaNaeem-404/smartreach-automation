/**
 * Source-aware posting timestamp parser.
 * Relative expressions are interpreted against an observation time and must
 * not be recomputed differently on re-import of an already-persisted job.
 */

export type TimestampParseStatus =
  | "absolute"
  | "relative"
  | "null"
  | "invalid";

export type ParsedTimestamp = {
  /** Original source string (trimmed), or null if empty/missing */
  raw: string | null;
  /** Resolved absolute instant, if parseable */
  absolute: Date | null;
  status: TimestampParseStatus;
  /** Human-readable uncertainty / error note */
  uncertainty: string | null;
  /** Observation time used for relative resolution */
  observationTime: Date | null;
  /** Adapter that matched, if any */
  adapter: string | null;
};

export type TimestampAdapter = {
  id: string;
  /** Return a result if this adapter handles the value; otherwise null */
  tryParse: (
    raw: string,
    observationTime: Date,
  ) => Omit<ParsedTimestamp, "observationTime"> | null;
};

const ABSOLUTE_ISO =
  /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** SimplyHired-style relative: 1h, 12h, 2d, 3w, 1mo, 30m, just now, yesterday */
const RELATIVE_RE =
  /^(?:just\s*now|yesterday|(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years))$/i;

function unitToMs(amount: number, unit: string): number | null {
  const u = unit.toLowerCase();
  if (["m", "min", "mins", "minute", "minutes"].includes(u)) {
    return amount * 60_000;
  }
  if (["h", "hr", "hrs", "hour", "hours"].includes(u)) {
    return amount * 3_600_000;
  }
  if (["d", "day", "days"].includes(u)) {
    return amount * 86_400_000;
  }
  if (["w", "wk", "wks", "week", "weeks"].includes(u)) {
    return amount * 7 * 86_400_000;
  }
  if (["mo", "mos", "month", "months"].includes(u)) {
    return amount * 30 * 86_400_000;
  }
  if (["y", "yr", "yrs", "year", "years"].includes(u)) {
    return amount * 365 * 86_400_000;
  }
  return null;
}

export const absoluteIsoAdapter: TimestampAdapter = {
  id: "absolute-iso",
  tryParse(raw) {
    if (RELATIVE_RE.test(raw)) return null;
    // Reject compact relative-like tokens (e.g. 1h) even if Date.parse is quirky
    if (/^\d+[a-z]+$/i.test(raw)) return null;

    if (!ABSOLUTE_ISO.test(raw)) {
      const msLoose = Date.parse(raw);
      if (Number.isNaN(msLoose)) return null;
      return {
        raw,
        absolute: new Date(msLoose),
        status: "absolute",
        uncertainty: "Parsed via Date.parse",
        adapter: "absolute-iso",
      };
    }

    const ms = Date.parse(raw);
    if (Number.isNaN(ms)) return null;

    return {
      raw,
      absolute: new Date(ms),
      status: "absolute",
      uncertainty: null,
      adapter: "absolute-iso",
    };
  },
};

export const relativeExpressionAdapter: TimestampAdapter = {
  id: "relative-expression",
  tryParse(raw, observationTime) {
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();

    if (lower === "just now" || lower === "justnow") {
      return {
        raw: trimmed,
        absolute: new Date(observationTime.getTime()),
        status: "relative",
        uncertainty: "Resolved as observation time (just now)",
        adapter: "relative-expression",
      };
    }

    if (lower === "yesterday") {
      return {
        raw: trimmed,
        absolute: new Date(observationTime.getTime() - 86_400_000),
        status: "relative",
        uncertainty: "Resolved as 1 day before observation time",
        adapter: "relative-expression",
      };
    }

    const match = trimmed.match(RELATIVE_RE);
    if (!match?.[1] || !match[2]) return null;

    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount < 0) return null;

    const delta = unitToMs(amount, match[2]);
    if (delta == null) return null;

    return {
      raw: trimmed,
      absolute: new Date(observationTime.getTime() - delta),
      status: "relative",
      uncertainty: `Relative '${trimmed}' resolved against observation time; do not recompute on re-import`,
      adapter: "relative-expression",
    };
  },
};

const DEFAULT_ADAPTERS: TimestampAdapter[] = [
  relativeExpressionAdapter,
  absoluteIsoAdapter,
];

/**
 * Parse a source timestamp string.
 * Relative values require `observationTime` (e.g. import batch createdAt).
 */
export function parseSourceTimestamp(
  value: string | null | undefined,
  observationTime: Date = new Date(),
  adapters: TimestampAdapter[] = DEFAULT_ADAPTERS,
): ParsedTimestamp {
  if (value == null || String(value).trim() === "") {
    return {
      raw: null,
      absolute: null,
      status: "null",
      uncertainty: null,
      observationTime,
      adapter: null,
    };
  }

  const raw = String(value).trim();

  for (const adapter of adapters) {
    const result = adapter.tryParse?.(raw, observationTime);
    if (result) {
      return { ...result, observationTime };
    }
  }

  // Last resort: Date.parse for absolute-looking strings
  const ms = Date.parse(raw);
  if (!Number.isNaN(ms) && !/^\d+[a-z]+$/i.test(raw)) {
    return {
      raw,
      absolute: new Date(ms),
      status: "absolute",
      uncertainty: "Parsed via Date.parse fallback",
      observationTime,
      adapter: "date-parse-fallback",
    };
  }

  return {
    raw,
    absolute: null,
    status: "invalid",
    uncertainty: `Unrecognized timestamp '${raw}'`,
    observationTime,
    adapter: null,
  };
}

export function parsedTimestampToMetadata(
  parsed: ParsedTimestamp,
): Record<string, unknown> {
  return {
    raw: parsed.raw,
    absolute: parsed.absolute?.toISOString?.() ?? null,
    status: parsed.status,
    uncertainty: parsed.uncertainty,
    observationTime: parsed.observationTime?.toISOString?.() ?? null,
    adapter: parsed.adapter,
  };
}
