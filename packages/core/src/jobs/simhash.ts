import { createHash } from "node:crypto";

const HASH_BITS = 64;

export function normalizeJobText(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function wordShingles(text: string, size = 2): string[] {
  const words = text.split(" ").filter(Boolean);
  if (words.length < size) return text ? [text] : [];
  const out: string[] = [];
  for (let i = 0; i <= words.length - size; i++) {
    out.push(words.slice(i, i + size).join(" "));
  }
  return out;
}

function charShingles(text: string, size = 3): string[] {
  const compact = text.replace(/ /g, "");
  if (compact.length < size) return compact ? [compact] : [];
  const out: string[] = [];
  for (let i = 0; i <= compact.length - size; i++) {
    out.push(compact.slice(i, i + size));
  }
  return out;
}

function hashToken(token: string): bigint {
  const digest = createHash("sha256").update(token, "utf8").digest();
  return digest.readBigUInt64BE(0);
}

/** 64-bit SimHash as signed bigint string-friendly number. */
export function computeSimHash(text: string): bigint {
  const normalized = normalizeJobText(text);
  const shingles = [
    ...wordShingles(normalized, 2),
    ...charShingles(normalized, 3),
  ];
  if (shingles.length === 0) return 0n;

  const weights = new Array<number>(HASH_BITS).fill(0);
  for (const shingle of shingles) {
    const tokenHash = hashToken(shingle);
    for (let bit = 0; bit < HASH_BITS; bit++) {
      if ((tokenHash >> BigInt(bit)) & 1n) weights[bit]! += 1;
      else weights[bit]! -= 1;
    }
  }

  let result = 0n;
  for (let bit = 0; bit < HASH_BITS; bit++) {
    if ((weights[bit] ?? 0) > 0) result |= 1n << BigInt(bit);
  }

  // Signed 64-bit for DB bigint compatibility
  const signBit = 1n << BigInt(HASH_BITS - 1);
  if (result >= signBit) result -= 1n << BigInt(HASH_BITS);
  return result;
}

export function hammingDistance(a: bigint, b: bigint): number {
  const mask = (1n << BigInt(HASH_BITS)) - 1n;
  let x = (a & mask) ^ (b & mask);
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

export function isNearDuplicate(
  a: bigint,
  b: bigint,
  threshold = 6,
): boolean {
  return hammingDistance(a, b) <= threshold;
}

/**
 * Asymmetric skill overlap: fraction of `reference` skills covered by `candidate`.
 * Used only for candidate generation — never auto-merge.
 */
export function skillOverlapRatio(
  candidate: string[],
  reference: string[],
): number {
  const setA = new Set(candidate.map((s) => s.toLowerCase()));
  const setB = new Set(reference.map((s) => s.toLowerCase()));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const s of setB) {
    if (setA.has(s)) intersection += 1;
  }
  return intersection / setB.size;
}

export type RelatedPostingSuggestion = {
  related: boolean;
  reason: "simhash" | "skill_overlap" | null;
  hammingDistance?: number;
  skillOverlap?: number;
};

export function suggestRelatedPosting(
  a: { text: string; skills?: string[] },
  b: { text: string; skills?: string[] },
  opts?: { simThreshold?: number; skillThreshold?: number },
): RelatedPostingSuggestion {
  const simThreshold = opts?.simThreshold ?? 6;
  const skillThreshold = opts?.skillThreshold ?? 0.6;

  const hashA = computeSimHash(a.text);
  const hashB = computeSimHash(b.text);
  const distance = hammingDistance(hashA, hashB);
  if (distance <= simThreshold) {
    return { related: true, reason: "simhash", hammingDistance: distance };
  }

  const overlap = skillOverlapRatio(a.skills ?? [], b.skills ?? []);
  if (overlap >= skillThreshold) {
    return {
      related: true,
      reason: "skill_overlap",
      hammingDistance: distance,
      skillOverlap: overlap,
    };
  }

  return {
    related: false,
    reason: null,
    hammingDistance: distance,
    skillOverlap: overlap,
  };
}
