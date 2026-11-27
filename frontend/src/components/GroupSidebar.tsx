import { useMemo, useState } from "react";
import type { KeywordRow } from "../types";
import { topicGroups } from "../lib/groups";
import { fmtInt } from "../lib/format";

export function GroupSidebar({ rows, seed, active, onSelect }: { rows: KeywordRow[]; seed: string; active: string | null; onSelect: (w: string | null) => void }) {
  const [by, setBy] = useState<"count" | "volume">("count");
  const groups = useMemo(() => {
    const g = topicGroups(rows, seed);
    return by === "volume" ? [...g].sort((a, b) => b.volume - a.volume) : g;
  }, [rows, seed, by]);
  const total = rows.reduce((s, r) => s + (r.search_volume ?? 0), 0);
  return (
    <aside className="hidden w-60 shrink-0 rounded-lg border border-slate-200 bg-white lg:block">
      <div className="flex gap-1 border-b border-slate-100 p-2">
        {(["count", "volume"] as const).map((k) => (
          <button key={k} className={`flex-1 rounded-md px-2 py-1 text-sm ${by === k ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}
            onClick={() => setBy(k)}>By {k === "count" ? "number" : "volume"}</button>
        ))}
      </div>
      <ul className="max-h-[70vh] overflow-auto py-1 text-sm">
        <li>
          <button className={`flex w-full justify-between px-3 py-1.5 hover:bg-slate-50 ${active == null ? "font-semibold" : ""}`} onClick={() => onSelect(null)}>
            <span>All keywords</span><span>{by === "count" ? rows.length : fmtInt(total)}</span>
          </button>
        </li>
        {groups.map((g) => (
          <li key={g.word}>
            <button className={`flex w-full justify-between px-3 py-1.5 hover:bg-slate-50 ${active === g.word ? "bg-indigo-50 text-indigo-700" : ""}`}
              onClick={() => onSelect(active === g.word ? null : g.word)}>
              <span className="truncate">{g.word}</span>
              <span className="text-slate-500">{by === "count" ? g.count : fmtInt(g.volume)}</span>
            </button>
          </li>
        ))}
        {!groups.length && <li className="px-3 py-2 text-slate-400">No groups yet</li>}
      </ul>
    </aside>
  );
}
