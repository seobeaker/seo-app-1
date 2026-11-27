import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { Country, Language, Loc } from "../types";

interface Props {
  countries: Country[];
  country: Country | null;
  onCountry: (c: Country) => void;
  region: Loc | null;
  onRegion: (r: Loc | null) => void;
  city: Loc | null;
  onCity: (c: Loc | null) => void;
  languages: Language[];
  language: string;
  onLanguage: (l: string) => void;
}

const sel = "h-9 rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-indigo-500 focus:outline-none";

export function flag(iso: string) {
  if (!/^[A-Z]{2}$/.test(iso)) return "";
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function LocationPicker(p: Props) {
  const [regions, setRegions] = useState<Loc[]>([]);
  const [regionCities, setRegionCities] = useState<Loc[]>([]);
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<Loc[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRegions([]);
    if (p.country) api.children(p.country.location_code).then(setRegions).catch(() => setRegions([]));
  }, [p.country]);

  useEffect(() => {
    setRegionCities([]);
    if (p.region) api.children(p.region.location_code).then(setRegionCities).catch(() => setRegionCities([]));
  }, [p.region]);

  useEffect(() => {
    setCityQuery(p.city ? p.city.name : "");
  }, [p.city]);

  useEffect(() => {
    if (!p.country || p.region || cityQuery.trim().length < 2 || (p.city && cityQuery === p.city.name)) {
      setCityResults([]);
      return;
    }
    const t = setTimeout(() => {
      api.cities(p.country!.iso, cityQuery).then(setCityResults).catch(() => setCityResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [cityQuery, p.country, p.region, p.city]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const suggestions = useMemo(() => {
    if (p.region) {
      const q = cityQuery.toLowerCase();
      return regionCities.filter((c) => !q || (p.city && cityQuery === p.city.name) || c.name.toLowerCase().startsWith(q)).slice(0, 80);
    }
    return cityResults;
  }, [p.region, regionCities, cityResults, cityQuery, p.city]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={`${sel} w-52`}
        value={p.country?.location_code ?? ""}
        onChange={(e) => {
          const c = p.countries.find((x) => x.location_code === Number(e.target.value));
          if (c) p.onCountry(c);
        }}
        aria-label="Country"
      >
        {p.countries.map((c) => (
          <option key={c.location_code} value={c.location_code}>
            {flag(c.iso)} {c.name}{c.labs ? "" : " (Ads data only)"}
          </option>
        ))}
      </select>

      <select
        className={`${sel} w-44`}
        value={p.region?.location_code ?? ""}
        onChange={(e) => {
          const r = regions.find((x) => x.location_code === Number(e.target.value)) ?? null;
          p.onRegion(r);
          p.onCity(null);
        }}
        disabled={!regions.length}
        aria-label="State or region"
      >
        <option value="">{regions.length ? "All states / regions" : "No regions"}</option>
        {regions.map((r) => (
          <option key={r.location_code} value={r.location_code}>{r.name}{r.type !== "State" ? ` (${r.type})` : ""}</option>
        ))}
      </select>

      <div className="relative" ref={boxRef}>
        <input
          className={`${sel} w-44`}
          placeholder={p.region ? `City in ${p.region.name}` : "City (optional)"}
          value={cityQuery}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setCityQuery(e.target.value); setOpen(true); if (p.city) p.onCity(null); }}
          aria-label="City"
        />
        {p.city && (
          <button className="absolute right-2 top-2 text-slate-400 hover:text-slate-700" onClick={() => p.onCity(null)} aria-label="Clear city">×</button>
        )}
        {open && suggestions.length > 0 && !p.city && (
          <ul className="absolute z-30 mt-1 max-h-64 w-64 overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
            {suggestions.map((c) => (
              <li key={c.location_code}>
                <button
                  className="w-full px-3 py-1.5 text-left hover:bg-indigo-50"
                  onClick={() => { p.onCity(c); setOpen(false); }}
                >
                  {c.name} <span className="text-xs text-slate-400">{c.full_name.split(",").slice(1, -1).join(", ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <select className={`${sel} w-32`} value={p.language} onChange={(e) => p.onLanguage(e.target.value)} aria-label="Language">
        {p.languages.map((l) => (
          <option key={l.language_code} value={l.language_code}>{l.language_name}</option>
        ))}
      </select>
    </div>
  );
}
