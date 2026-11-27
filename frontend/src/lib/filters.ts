import type { Filters, KeywordRow } from "../types";

export const emptyFilters: Filters = {
  volMin: "", volMax: "", kdMin: "", kdMax: "", cpcMin: "", cpcMax: "",
  intents: [], include: "", exclude: "", includeAll: false, exactPhrase: false, group: null,
};

const num = (s: string) => (s.trim() === "" ? null : Number(s));
const words = (s: string) => s.split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean);

function inRange(v: number | null, min: number | null, max: number | null) {
  if (min == null && max == null) return true;
  if (v == null) return false;
  return (min == null || v >= min) && (max == null || v <= max);
}

export function containsPhrase(keyword: string, seed: string) {
  const k = ` ${keyword.toLowerCase()} `;
  return k.includes(` ${seed.trim().toLowerCase()} `);
}

export function applyFilters(rows: KeywordRow[], f: Filters, seed = ""): KeywordRow[] {
  const inc = words(f.include);
  const exc = words(f.exclude);
  const [vMin, vMax, kMin, kMax, cMin, cMax] = [f.volMin, f.volMax, f.kdMin, f.kdMax, f.cpcMin, f.cpcMax].map(num);
  return rows.filter((r) => {
    const kw = r.keyword.toLowerCase();
    if (!inRange(r.search_volume, vMin, vMax)) return false;
    if (!inRange(r.kd, kMin, kMax)) return false;
    if (!inRange(r.cpc, cMin, cMax)) return false;
    if (f.intents.length) {
      const all = [r.intent, ...(r.secondary_intents ?? [])].filter(Boolean);
      if (!all.some((i) => f.intents.includes(i as string))) return false;
    }
    if (inc.length && !(f.includeAll ? inc.every((w) => kw.includes(w)) : inc.some((w) => kw.includes(w)))) return false;
    if (exc.length && exc.some((w) => kw.includes(w))) return false;
    if (f.exactPhrase && seed && !containsPhrase(kw, seed)) return false;
    if (f.group && !kw.split(/\s+/).includes(f.group)) return false;
    return true;
  });
}

export function activeFilterCount(f: Filters) {
  let n = 0;
  if (f.volMin || f.volMax) n++;
  if (f.kdMin || f.kdMax) n++;
  if (f.cpcMin || f.cpcMax) n++;
  if (f.intents.length) n++;
  if (f.include.trim()) n++;
  if (f.exclude.trim()) n++;
  if (f.exactPhrase) n++;
  if (f.group) n++;
  return n;
}
