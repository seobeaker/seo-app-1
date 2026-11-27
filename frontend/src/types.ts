export type Mode = "broad" | "phrase" | "questions" | "related" | "ideas";

export interface Country { location_code: number; name: string; iso: string; labs: boolean }
export interface Loc { location_code: number; name: string; full_name: string; type: string; parent: number | null }
export interface Language { language_code: string; language_name: string }

export interface Monthly { year: number; month: number; search_volume: number | null }

export interface KeywordRow {
  keyword: string;
  search_volume: number | null;
  cpc: number | null;
  competition: number | null;
  competition_level: string | null;
  kd: number | null;
  intent: string | null;
  secondary_intents: string[];
  monthly_searches: Monthly[];
  serp_features: string[];
  serp_url: string | null;
  updated: string | null;
  updated_source: "dataforseo" | "fetched";
  regional_volume: number | null;
}

export interface Estimate {
  total_usd: number;
  parts: { label: string; usd: number }[];
  spent_today_usd: number;
  cap_usd: number;
  note: string;
}

export interface SearchMeta {
  seed: string;
  mode: Mode;
  location_code: number;
  language_code: string;
  source: "labs" | "google_ads";
  region: { location_code: number; name: string; type: string } | null;
  regional_fetched_at: string | null;
  cost_usd: number;
  cached: boolean;
  fetched_at: string | null;
  estimate: Estimate;
  spent_today_usd: number;
}

export interface SearchResponse { rows: KeywordRow[]; meta: SearchMeta }

export interface SearchParams {
  keyword: string;
  location_code: number;
  language_code: string;
  mode: Mode;
  region_code: number | null;
  limit: number;
  include_serp_info: boolean;
  include_clickstream_data: boolean;
  related_depth: number;
  refresh?: boolean;
}

export interface SavedList { id: number; name: string; count: number; created_at?: string }

export interface Filters {
  volMin: string; volMax: string;
  kdMin: string; kdMax: string;
  cpcMin: string; cpcMax: string;
  intents: string[];
  include: string; exclude: string;
  includeAll: boolean;
  exactPhrase: boolean;
  group: string | null;
}
