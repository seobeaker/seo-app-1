export const fmtInt = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-US"));
export const fmtCpc = (n: number | null | undefined) => (n == null ? "–" : n.toFixed(2));
export const fmtUsd = (n: number) => `$${n < 0.1 ? n.toFixed(4) : n.toFixed(2)}`;

/** "3 days", "1 month", like the reference UI's Updated column. */
export function relativeAge(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "–";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "–";
  const days = Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
  if (days === 0) return "today";
  if (days < 7) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 30) { const w = Math.floor(days / 7); return `${w} week${w === 1 ? "" : "s"}`; }
  if (days < 365) { const m = Math.floor(days / 30); return `${m} month${m === 1 ? "" : "s"}`; }
  const y = Math.floor(days / 365);
  return `${y} year${y === 1 ? "" : "s"}`;
}

export function kdLabel(kd: number | null): { label: string; color: string } {
  if (kd == null) return { label: "n/a", color: "bg-slate-300" };
  if (kd < 15) return { label: "Very easy", color: "bg-emerald-500" };
  if (kd < 30) return { label: "Easy", color: "bg-lime-500" };
  if (kd < 50) return { label: "Possible", color: "bg-amber-400" };
  if (kd < 70) return { label: "Difficult", color: "bg-orange-500" };
  if (kd < 85) return { label: "Hard", color: "bg-red-500" };
  return { label: "Very hard", color: "bg-red-800" };
}

export const INTENTS: { key: string; short: string; cls: string }[] = [
  { key: "informational", short: "I", cls: "bg-sky-100 text-sky-800" },
  { key: "navigational", short: "N", cls: "bg-violet-100 text-violet-800" },
  { key: "commercial", short: "C", cls: "bg-amber-100 text-amber-800" },
  { key: "transactional", short: "T", cls: "bg-emerald-100 text-emerald-800" },
];

export const SERP_LABELS: Record<string, string> = {
  local_pack: "Local pack",
  people_also_ask: "People also ask",
  featured_snippet: "Featured snippet",
  video: "Video",
  images: "Images",
  ai_overview: "AI overview",
  related_searches: "Related searches",
  paid: "Ads",
  knowledge_graph: "Knowledge panel",
  top_stories: "Top stories",
  shopping: "Shopping",
  popular_products: "Popular products",
  map: "Map",
  carousel: "Carousel",
  twitter: "X posts",
  perspectives: "Perspectives",
  discussions_and_forums: "Discussions",
};
export const serpLabel = (t: string) => SERP_LABELS[t] ?? t.replace(/_/g, " ");
