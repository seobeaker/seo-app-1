import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import { api } from "./api";
import type { Country, Estimate, Filters, KeywordRow, Language, Loc, Mode, SearchParams, SearchResponse } from "./types";
import { LocationPicker, flag } from "./components/LocationPicker";
import { FiltersBar } from "./components/FiltersBar";
import { GroupSidebar } from "./components/GroupSidebar";
import { KeywordTable } from "./components/KeywordTable";
import { ListsPanel } from "./components/ListsPanel";
import { SaveToList } from "./components/SaveToList";
import { Popover } from "./components/Popover";
import { applyFilters, emptyFilters } from "./lib/filters";
import { copyText, downloadCsv, safeFilename, toCsv, toTsv } from "./lib/export";
import { fmtInt, fmtUsd, relativeAge } from "./lib/format";

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "broad", label: "Broad match", hint: "Keywords that contain your seed words (Labs keyword suggestions)" },
  { key: "phrase", label: "Phrase match", hint: "Keywords containing the seed phrase in order (exact_match)" },
  { key: "related", label: "Related", hint: "Google 'searches related to' graph" },
  { key: "ideas", label: "Ideas", hint: "Keywords from the same product/service categories" },
];

const btn = "h-8 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40";

export default function App() {
  const [health, setHealth] = useState<{ mock: boolean; credentials_set: boolean } | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState<Country | null>(null);
  const [region, setRegion] = useState<Loc | null>(null);
  const [city, setCity] = useState<Loc | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [language, setLanguage] = useState("en");

  const [keyword, setKeyword] = useState("");
  const [mode, setMode] = useState<Mode>("broad");
  const [questions, setQuestions] = useState(false);
  const [limit, setLimit] = useState(200);
  const [depth, setDepth] = useState(2);
  const [serpInfo, setSerpInfo] = useState(true);
  const [clickstream, setClickstream] = useState(false);

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [listsOpen, setListsOpen] = useState(false);
  const [listsVersion, setListsVersion] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ spent_today_usd: number; cap_usd: number } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  // ---- bootstrap ----------------------------------------------------------
  useEffect(() => {
    api.health().then((h) => {
      setHealth(h);
      setLanguage(h.default_language_code);
      return api.countries().then((cs) => {
        setCountries(cs);
        setCountry(cs.find((c) => c.iso === h.default_country_iso) ?? cs[0] ?? null);
      });
    }).catch((e) => setError(`Cannot reach the backend: ${e.message}`));
    api.usage().then(setUsage).catch(() => {});
  }, []);

  useEffect(() => {
    if (!country) return;
    setRegion(null);
    setCity(null);
    api.languages(country.location_code).then((ls) => {
      setLanguages(ls);
      setLanguage((cur) => (ls.some((l) => l.language_code === cur) ? cur : ls.find((l) => l.language_code === "en")?.language_code ?? ls[0]?.language_code ?? "en"));
    }).catch(() => setLanguages([{ language_code: "en", language_name: "English" }]));
  }, [country]);

  const regionLoc = city ?? region;
  const effectiveMode: Mode = questions ? "questions" : mode;

  const params: SearchParams | null = useMemo(() => country && keyword.trim() ? {
    keyword: keyword.trim(), location_code: country.location_code, language_code: language, mode: effectiveMode,
    region_code: regionLoc?.location_code ?? null, limit, include_serp_info: serpInfo,
    include_clickstream_data: clickstream, related_depth: depth,
  } : null, [country, keyword, language, effectiveMode, regionLoc, limit, serpInfo, clickstream, depth]);

  // ---- live cost estimate -------------------------------------------------
  useEffect(() => {
    if (!params) { setEstimate(null); return; }
    const t = setTimeout(() => api.estimate(params).then(setEstimate).catch(() => setEstimate(null)), 300);
    return () => clearTimeout(t);
  }, [params]);

  const runSearch = useCallback(async (p: SearchParams | null, refresh = false) => {
    if (!p) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.search({ ...p, refresh });
      setResult(r);
      setSelection({});
      setFilters((f) => ({ ...emptyFilters, exactPhrase: false, intents: f.intents }));
      if (r.meta.cached) notify("Loaded from cache: no cost");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      api.usage().then(setUsage).catch(() => {});
    }
  }, [notify]);

  // Switching tabs / questions re-runs the current search (usually a cache hit when revisited).
  const lastSeed = result?.meta.seed;
  const switchMode = (m: Mode, q: boolean) => {
    setMode(m);
    setQuestions(q);
    if (lastSeed && params) runSearch({ ...params, keyword: lastSeed, mode: q ? "questions" : m });
  };

  // ---- derived ------------------------------------------------------------
  const rows = result?.rows ?? [];
  const filtered = useMemo(() => applyFilters(rows, filters, result?.meta.seed ?? ""), [rows, filters, result]);
  const selectedRows = useMemo(() => filtered.filter((r) => selection[r.keyword]), [filtered, selection]);
  const exportRows = selectedRows.length ? selectedRows : filtered;
  const regionLabel = result?.meta.region ? result.meta.region.name.split(",")[0] : null;
  const totalVol = filtered.reduce((s, r) => s + (r.search_volume ?? 0), 0);
  const kds = filtered.map((r) => r.kd).filter((k): k is number => k != null);
  const avgKd = kds.length ? Math.round(kds.reduce((a, b) => a + b, 0) / kds.length) : null;
  const canAddRegional = !!(result && regionLoc && result.meta.region?.location_code !== regionLoc.location_code);

  const addRegional = async () => {
    if (!result || !regionLoc) return;
    setLoading(true);
    try {
      const kws = filtered.slice(0, 1000).map((r) => r.keyword);
      const r = await api.regionalVolume(kws, regionLoc.location_code, language);
      const vols = new Map(r.rows.map((x) => [x.keyword, x.search_volume]));
      setResult({
        rows: result.rows.map((row) => ({ ...row, regional_volume: vols.get(row.keyword) ?? null })),
        meta: { ...result.meta, region: { location_code: regionLoc.location_code, name: regionLoc.full_name, type: regionLoc.type }, regional_fetched_at: r.fetched_at },
      });
      notify(r.cached ? "Regional volume from cache" : `Regional volume added (${fmtUsd(r.cost)})`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      api.usage().then(setUsage).catch(() => {});
    }
  };

  const exportName = () => safeFilename(`${result?.meta.seed ?? "keywords"}-${country?.iso ?? ""}${regionLabel ? "-" + regionLabel : ""}-${effectiveMode}`);
  const exportOpts = { regionLabel };

  return (
    <div className="mx-auto flex min-h-full max-w-[1600px] flex-col gap-4 p-4">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Keyword Research{result && <span className="font-normal text-slate-500">: {result.meta.seed}</span>}</h1>
        {health?.mock && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title="DATAFORSEO_MOCK=true: sample data, no API calls">Mock data</span>}
        {health && !health.mock && !health.credentials_set && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">DataForSEO credentials missing in .env</span>}
        <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
          {usage && <span title="Actual DataForSEO spend logged today (UTC)">Today: <b>{fmtUsd(usage.spent_today_usd)}</b> / {fmtUsd(usage.cap_usd)} cap</span>}
          <button className={btn} onClick={() => setListsOpen(true)}>Saved lists</button>
        </div>
      </header>

      {/* Search */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); runSearch(params); }}>
          <input
            className="h-9 min-w-64 flex-1 rounded-md border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none"
            placeholder="Enter a seed keyword, e.g. dentist seo" value={keyword} onChange={(e) => setKeyword(e.target.value)} maxLength={80} autoFocus
          />
          <LocationPicker countries={countries} country={country} onCountry={setCountry} region={region} onRegion={setRegion}
            city={city} onCity={setCity} languages={languages} language={language} onLanguage={setLanguage} />
          <Popover align="right" label="Options">
            <div className="w-64 space-y-3 text-sm">
              <label className="flex items-center justify-between">Max keywords
                <select className="h-8 rounded border border-slate-300 px-1" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                  {[50, 100, 200, 500, 1000].map((n) => <option key={n}>{n}</option>)}
                </select>
              </label>
              <label className="flex items-center justify-between">Related depth
                <select className="h-8 rounded border border-slate-300 px-1" value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={serpInfo} onChange={(e) => setSerpInfo(e.target.checked)} /> Include SERP features</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={clickstream} onChange={(e) => setClickstream(e.target.checked)} /> Clickstream data (doubles cost)</label>
            </div>
          </Popover>
          <button className="h-9 rounded-md bg-indigo-600 px-5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50" disabled={!params || loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {estimate && (
            <span title={estimate.parts.map((p) => `${p.label}: ${fmtUsd(p.usd)}`).join("\n") + "\n" + estimate.note}>
              Estimated cost: <b className="text-slate-700">~{fmtUsd(estimate.total_usd)}</b> (free if cached)
              {estimate.spent_today_usd + estimate.total_usd > estimate.cap_usd && estimate.cap_usd > 0 && <b className="ml-1 text-red-600">over today's cap</b>}
            </span>
          )}
          {country && !country.labs && <span className="text-amber-700">{flag(country.iso)} DataForSEO Labs has no data for {country.name}; using Google Ads ideas (no KD or SERP features).</span>}
          {regionLoc && <span>Regional volume for <b>{regionLoc.full_name}</b> will be added from Google Ads.</span>}
        </div>
      </section>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Tabs */}
      {result && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white text-sm">
              {[["All", false], ["Questions", true]].map(([label, q]) => (
                <button key={label as string} className={`px-3 py-1.5 ${questions === q ? "bg-indigo-50 font-medium text-indigo-700" : "hover:bg-slate-50"}`}
                  onClick={() => switchMode(mode, q as boolean)}>{label as string}</button>
              ))}
            </div>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white text-sm">
              {MODES.map((m) => (
                <button key={m.key} title={m.hint} disabled={questions && m.key !== "broad"}
                  className={`border-l border-slate-200 px-3 py-1.5 first:border-l-0 disabled:text-slate-300 ${!questions && mode === m.key ? "bg-indigo-50 font-medium text-indigo-700" : "hover:bg-slate-50"}`}
                  onClick={() => switchMode(m.key, false)}>{m.label}</button>
              ))}
            </div>
            {canAddRegional && (
              <button className="h-8 rounded-md border border-teal-300 bg-teal-50 px-3 text-sm text-teal-800" onClick={addRegional} disabled={loading}>
                Add volume for {regionLoc!.name}
              </button>
            )}
          </div>

          <FiltersBar f={filters} onChange={setFilters} showExactPhrase={effectiveMode !== "related" && effectiveMode !== "ideas"} />

          <div className="flex items-start gap-4">
            <GroupSidebar rows={rows} seed={result.meta.seed} active={filters.group} onSelect={(g) => setFilters({ ...filters, group: g })} />
            <section className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-100 px-3 py-3 text-sm">
                <span>Keywords: <b>{fmtInt(filtered.length)}</b>{filtered.length !== rows.length && <span className="text-slate-400"> of {fmtInt(rows.length)}</span>}</span>
                <span>Total volume: <b>{fmtInt(totalVol)}</b></span>
                <span>Average KD: <b>{avgKd == null ? "–" : `${avgKd}%`}</b></span>
                <span className="text-xs text-slate-400" title={result.meta.fetched_at ?? ""}>
                  {result.meta.source === "labs" ? "DataForSEO Labs" : "Google Ads"} · fetched {relativeAge(result.meta.fetched_at)} ago · {result.meta.cached ? "cached" : fmtUsd(result.meta.cost_usd)}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {selectedRows.length > 0 && <span className="text-xs text-indigo-700">{selectedRows.length} selected <button className="underline" onClick={() => setSelection({})}>clear</button></span>}
                  <button className={btn} title="Copy keyword column" onClick={() => copyText(exportRows.map((r) => r.keyword).join("\n")).then(() => notify(`Copied ${exportRows.length} keywords`))}>Copy keywords</button>
                  <button className={btn} title="Tab separated, pastes into Excel / Sheets" onClick={() => copyText(toTsv(exportRows, exportOpts)).then(() => notify(`Copied ${exportRows.length} rows`))}>Copy table</button>
                  <button className={btn} onClick={() => downloadCsv(`${exportName()}.csv`, toCsv(exportRows, exportOpts))}>Export CSV{selectedRows.length ? " (selected)" : ""}</button>
                  <SaveToList rows={selectedRows} onSaved={() => setListsVersion((v) => v + 1)} notify={notify} />
                  <button className={btn} title="Fetch fresh data from DataForSEO (costs money)" disabled={loading}
                    onClick={() => { if (window.confirm(`Refresh from DataForSEO? Estimated ${fmtUsd(result.meta.estimate.total_usd)}.`)) runSearch({ ...params!, keyword: result.meta.seed }, true); }}>↻ Refresh</button>
                </div>
              </div>
              <KeywordTable rows={filtered as KeywordRow[]} regionLabel={regionLabel} selection={selection} onSelection={setSelection} />
            </section>
          </div>
        </>
      )}

      {!result && !loading && !error && (
        <div className="py-16 text-center text-slate-400">
          Enter a seed keyword and pick a country to find keyword ideas.
          <div className="mt-1 text-xs">Pick a state or city to add Google Ads regional search volume next to the national numbers.</div>
        </div>
      )}

      <ListsPanel open={listsOpen} onClose={() => setListsOpen(false)} version={listsVersion} notify={notify} />
      {toast && <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}
