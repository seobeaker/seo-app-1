import type { KeywordRow } from "../types";

const STOP = new Set([
  "a", "an", "the", "and", "or", "for", "of", "to", "in", "on", "at", "by", "with", "is", "are", "do", "does",
  "how", "what", "why", "when", "where", "who", "which", "can", "i", "my", "me", "you", "your", "it", "vs", "near",
]);

export interface Group { word: string; count: number; volume: number }

/** Topic groups like the reference sidebar: words that appear across the result keywords, minus seed words. */
export function topicGroups(rows: KeywordRow[], seed: string, limit = 60): Group[] {
  const seedWords = new Set(seed.toLowerCase().split(/\s+/));
  const map = new Map<string, Group>();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const w of r.keyword.toLowerCase().split(/\s+/)) {
      if (w.length < 2 || STOP.has(w) || seedWords.has(w) || seen.has(w)) continue;
      seen.add(w);
      const g = map.get(w) ?? { word: w, count: 0, volume: 0 };
      g.count++;
      g.volume += r.search_volume ?? 0;
      map.set(w, g);
    }
  }
  return [...map.values()].filter((g) => g.count > 1).sort((a, b) => b.count - a.count || b.volume - a.volume).slice(0, limit);
}
