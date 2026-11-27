import type { Filters } from "../types";
import { INTENTS } from "../lib/format";
import { activeFilterCount, emptyFilters } from "../lib/filters";
import { Popover } from "./Popover";

const inp = "h-8 w-24 rounded-md border border-slate-300 px-2 text-sm focus:border-indigo-500 focus:outline-none";

function Range({ f, set, minKey, maxKey, presets, step }: {
  f: Filters; set: (p: Partial<Filters>) => void; minKey: keyof Filters; maxKey: keyof Filters;
  presets: [string, string, string][]; step?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-0.5">
        {presets.map(([label, min, max]) => (
          <button key={label} className={`rounded px-2 py-1 text-left text-sm hover:bg-slate-100 ${f[minKey] === min && f[maxKey] === max ? "bg-indigo-50 text-indigo-700" : ""}`}
            onClick={() => set({ [minKey]: min, [maxKey]: max } as Partial<Filters>)}>{label}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-slate-100 pt-2">
        <input className={inp} type="number" step={step} placeholder="From" value={f[minKey] as string} onChange={(e) => set({ [minKey]: e.target.value } as Partial<Filters>)} />
        <span className="text-slate-400">–</span>
        <input className={inp} type="number" step={step} placeholder="To" value={f[maxKey] as string} onChange={(e) => set({ [maxKey]: e.target.value } as Partial<Filters>)} />
      </div>
    </div>
  );
}

export function FiltersBar({ f, onChange, showExactPhrase }: { f: Filters; onChange: (f: Filters) => void; showExactPhrase: boolean }) {
  const set = (p: Partial<Filters>) => onChange({ ...f, ...p });
  const n = activeFilterCount(f);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover label="Volume" active={!!(f.volMin || f.volMax)}>
        <Range f={f} set={set} minKey="volMin" maxKey="volMax" presets={[
          ["100,001+", "100001", ""], ["10,001–100,000", "10001", "100000"], ["1,001–10,000", "1001", "10000"],
          ["101–1,000", "101", "1000"], ["11–100", "11", "100"], ["1–10", "1", "10"]]} />
      </Popover>
      <Popover label="KD %" active={!!(f.kdMin || f.kdMax)}>
        <Range f={f} set={set} minKey="kdMin" maxKey="kdMax" presets={[
          ["Very hard 85–100", "85", "100"], ["Hard 70–84", "70", "84"], ["Difficult 50–69", "50", "69"],
          ["Possible 30–49", "30", "49"], ["Easy 15–29", "15", "29"], ["Very easy 0–14", "0", "14"]]} />
      </Popover>
      <Popover label="Intent" active={f.intents.length > 0}>
        <div className="space-y-1">
          {INTENTS.map((i) => (
            <label key={i.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm capitalize hover:bg-slate-50">
              <input type="checkbox" checked={f.intents.includes(i.key)}
                onChange={(e) => set({ intents: e.target.checked ? [...f.intents, i.key] : f.intents.filter((x) => x !== i.key) })} />
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-semibold ${i.cls}`}>{i.short}</span>
              {i.key}
            </label>
          ))}
        </div>
      </Popover>
      <Popover label="CPC (USD)" active={!!(f.cpcMin || f.cpcMax)}>
        <Range f={f} set={set} step="0.01" minKey="cpcMin" maxKey="cpcMax" presets={[
          ["$10+", "10", ""], ["$5–10", "5", "10"], ["$1–5", "1", "5"], ["$0–1", "0", "1"]]} />
      </Popover>
      <Popover label="Include keywords" active={!!f.include.trim()}>
        <div className="w-64 space-y-2">
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-1"><input type="radio" checked={!f.includeAll} onChange={() => set({ includeAll: false })} /> Any</label>
            <label className="flex items-center gap-1"><input type="radio" checked={f.includeAll} onChange={() => set({ includeAll: true })} /> All</label>
          </div>
          <textarea className="h-24 w-full rounded-md border border-slate-300 p-2 text-sm" placeholder="One per line or comma separated"
            value={f.include} onChange={(e) => set({ include: e.target.value })} />
        </div>
      </Popover>
      <Popover label="Exclude keywords" active={!!f.exclude.trim()}>
        <textarea className="h-24 w-64 rounded-md border border-slate-300 p-2 text-sm" placeholder="One per line or comma separated"
          value={f.exclude} onChange={(e) => set({ exclude: e.target.value })} />
      </Popover>
      {showExactPhrase && (
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm" title="Only keywords that contain the seed words together, in order">
          <input type="checkbox" checked={f.exactPhrase} onChange={(e) => set({ exactPhrase: e.target.checked })} /> Exact phrase only
        </label>
      )}
      {n > 0 && (
        <button className="h-8 px-2 text-sm text-indigo-600 hover:underline" onClick={() => onChange(emptyFilters)}>Clear filters ({n})</button>
      )}
    </div>
  );
}
