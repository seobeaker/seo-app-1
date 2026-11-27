import type { Country, Estimate, KeywordRow, Language, Loc, SavedList, SearchParams, SearchResponse } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try {
      const body = await r.json();
      if (body?.detail) msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch { /* not json */ }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => req<{ ok: boolean; mock: boolean; credentials_set: boolean; default_country_iso: string; default_language_code: string }>("/api/health"),
  usage: () => req<{ spent_today_usd: number; spent_total_usd: number; cap_usd: number }>("/api/usage"),
  countries: () => req<Country[]>("/api/locations/countries"),
  children: (code: number) => req<Loc[]>(`/api/locations/${code}/children`),
  cities: (country: string, q: string) => req<Loc[]>(`/api/locations/cities?country=${encodeURIComponent(country)}&q=${encodeURIComponent(q)}`),
  languages: (code: number) => req<Language[]>(`/api/languages?location_code=${code}`),
  estimate: (p: SearchParams) => req<Estimate>("/api/estimate", post(p)),
  search: (p: SearchParams) => req<SearchResponse>("/api/search", post(p)),
  regionalVolume: (keywords: string[], location_code: number, language_code: string) =>
    req<{ rows: KeywordRow[]; cost: number; cached: boolean; fetched_at: string }>("/api/regional-volume", post({ keywords, location_code, language_code })),
  lists: () => req<SavedList[]>("/api/lists"),
  createList: (name: string) => req<SavedList>("/api/lists", post({ name })),
  getList: (id: number) => req<SavedList & { items: (KeywordRow & { added_at: string })[] }>(`/api/lists/${id}`),
  deleteList: (id: number) => req<{ ok: boolean }>(`/api/lists/${id}`, { method: "DELETE" }),
  addToList: (id: number, items: KeywordRow[]) => req<{ added: number }>(`/api/lists/${id}/items`, post({ items })),
  removeFromList: (id: number, keywords: string[]) => req<{ ok: boolean }>(`/api/lists/${id}/items/remove`, post({ keywords })),
};
