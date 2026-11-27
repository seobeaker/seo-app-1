import type { KeywordRow } from "../types";

export interface ExportOptions { regionLabel?: string | null }

function headers(o: ExportOptions) {
  const h = ["Keyword", "Intent", "Volume"];
  if (o.regionLabel) h.push(`Volume (${o.regionLabel})`);
  h.push("KD %", "CPC (USD)", "Competition", "SERP features", "Trend (last 12 months)", "Updated");
  return h;
}

function values(r: KeywordRow, o: ExportOptions): (string | number)[] {
  const v: (string | number)[] = [r.keyword, [r.intent, ...(r.secondary_intents ?? [])].filter(Boolean).join(", "), r.search_volume ?? ""];
  if (o.regionLabel) v.push(r.regional_volume ?? "");
  v.push(
    r.kd ?? "",
    r.cpc ?? "",
    r.competition ?? "",
    r.serp_features.join(", "),
    r.monthly_searches.slice(-12).map((m) => m.search_volume ?? 0).join(" "),
    r.updated ? r.updated.slice(0, 10) : "",
  );
  return v;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const tsvCell = (v: string | number) => String(v).replace(/[\t\n\r]/g, " ");

export function toCsv(rows: KeywordRow[], o: ExportOptions = {}): string {
  return [headers(o), ...rows.map((r) => values(r, o))].map((line) => line.map(csvCell).join(",")).join("\r\n");
}

/** Tab separated: pastes straight into Excel / Google Sheets as columns. */
export function toTsv(rows: KeywordRow[], o: ExportOptions = {}): string {
  return [headers(o), ...rows.map((r) => values(r, o))].map((line) => line.map(tsvCell).join("\t")).join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); // BOM so Excel reads UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for non-secure contexts (plain http on a LAN IP)
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export const safeFilename = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "keywords";
