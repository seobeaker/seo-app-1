import { describe, expect, it } from "vitest";
import type { KeywordRow } from "../types";
import { applyFilters, emptyFilters, containsPhrase } from "./filters";
import { topicGroups } from "./groups";
import { toCsv, toTsv } from "./export";
import { relativeAge } from "./format";

const row = (keyword: string, extra: Partial<KeywordRow> = {}): KeywordRow => ({
  keyword, search_volume: 100, cpc: 1.5, competition: 0.3, competition_level: "LOW", kd: 20,
  intent: "informational", secondary_intents: [], monthly_searches: [], serp_features: [], serp_url: null,
  updated: "2026-10-01T00:00:00+00:00", updated_source: "dataforseo", regional_volume: null, ...extra,
});

const rows = [
  row("dentist seo", { search_volume: 880, kd: 9 }),
  row("seo for dentists", { search_volume: 1600, kd: 10, intent: "commercial" }),
  row("dentist seo services", { search_volume: 720, kd: 40, cpc: null }),
  row("local seo for dentists melbourne", { search_volume: 30, secondary_intents: ["transactional"] }),
];

describe("filters", () => {
  it("filters by volume, kd and intent", () => {
    expect(applyFilters(rows, { ...emptyFilters, volMin: "500" }).map((r) => r.keyword)).toEqual(["dentist seo", "seo for dentists", "dentist seo services"]);
    expect(applyFilters(rows, { ...emptyFilters, kdMax: "15" })).toHaveLength(2);
    expect(applyFilters(rows, { ...emptyFilters, intents: ["transactional"] })).toHaveLength(1);
    expect(applyFilters(rows, { ...emptyFilters, cpcMin: "1" })).toHaveLength(3);
  });
  it("include / exclude words", () => {
    expect(applyFilters(rows, { ...emptyFilters, include: "local, services" })).toHaveLength(2);
    expect(applyFilters(rows, { ...emptyFilters, include: "local, melbourne", includeAll: true })).toHaveLength(1);
    expect(applyFilters(rows, { ...emptyFilters, exclude: "melbourne" })).toHaveLength(3);
  });
  it("exact phrase and group", () => {
    expect(containsPhrase("best dentist seo agency", "dentist seo")).toBe(true);
    expect(containsPhrase("seo for dentists", "dentist seo")).toBe(false);
    expect(applyFilters(rows, { ...emptyFilters, exactPhrase: true }, "dentist seo")).toHaveLength(2);
    expect(applyFilters(rows, { ...emptyFilters, group: "dentists" })).toHaveLength(2);
  });
});

describe("groups", () => {
  it("counts non-seed words appearing more than once", () => {
    const g = topicGroups(rows, "dentist seo");
    expect(g[0]).toEqual({ word: "dentists", count: 2, volume: 1630 });
  });
});

describe("export", () => {
  it("quotes csv and builds tsv", () => {
    const csv = toCsv([row('say "hi", ok')]);
    expect(csv.split("\r\n")[1].startsWith('"say ""hi"", ok"')).toBe(true);
    const tsv = toTsv([row("a\tb", { regional_volume: 5 })], { regionLabel: "Victoria" });
    const [h, l] = tsv.split("\n");
    expect(h.split("\t")[3]).toBe("Volume (Victoria)");
    expect(l.split("\t")[0]).toBe("a b");
    expect(l.split("\t")[3]).toBe("5");
  });
});

describe("format", () => {
  it("relative age", () => {
    const now = new Date("2026-11-27T00:00:00Z");
    expect(relativeAge("2026-10-21T09:13:44+00:00", now)).toBe("1 month");
    expect(relativeAge("2026-11-27T00:00:00Z", now)).toBe("today");
    expect(relativeAge(null, now)).toBe("–");
  });
});
