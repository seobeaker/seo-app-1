import { useMemo, useState } from "react";
import {
  createColumnHelper, flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel,
  useReactTable, type RowSelectionState, type SortingState,
} from "@tanstack/react-table";
import type { KeywordRow } from "../types";
import { INTENTS, fmtCpc, fmtInt, kdLabel, relativeAge, serpLabel } from "../lib/format";
import { Sparkline } from "./Sparkline";

const col = createColumnHelper<KeywordRow>();

function IntentBadges({ r }: { r: KeywordRow }) {
  const all = [r.intent, ...(r.secondary_intents ?? [])].filter(Boolean) as string[];
  if (!all.length) return <span className="text-slate-300">–</span>;
  return (
    <span className="flex gap-1">
      {all.map((i) => {
        const def = INTENTS.find((x) => x.key === i);
        return <span key={i} title={i} className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-semibold capitalize ${def?.cls ?? "bg-slate-100"}`}>{def?.short ?? i[0]}</span>;
      })}
    </span>
  );
}

interface Props {
  rows: KeywordRow[];
  regionLabel: string | null;
  selection: RowSelectionState;
  onSelection: (s: RowSelectionState) => void;
}

export function KeywordTable({ rows, regionLabel, selection, onSelection }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "search_volume", desc: true }]);

  const columns = useMemo(() => {
    const c = [
      col.display({
        id: "select",
        header: ({ table }) => (
          <input type="checkbox" aria-label="Select all"
            checked={table.getIsAllRowsSelected()}
            ref={(el) => { if (el) el.indeterminate = table.getIsSomeRowsSelected(); }}
            onChange={table.getToggleAllRowsSelectedHandler()} />
        ),
        cell: ({ row }) => <input type="checkbox" aria-label={`Select ${row.original.keyword}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />,
        size: 36,
      }),
      col.accessor("keyword", {
        header: "Keyword",
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5">
            <span className="text-indigo-700">{row.original.keyword}</span>
            <a className="text-slate-300 hover:text-indigo-600" title="Open Google results" target="_blank" rel="noreferrer"
              href={row.original.serp_url ?? `https://www.google.com/search?q=${encodeURIComponent(row.original.keyword)}`}>↗</a>
          </span>
        ),
        sortingFn: "alphanumeric",
      }),
      col.accessor("intent", { header: "Intent", cell: ({ row }) => <IntentBadges r={row.original} />, enableSorting: true }),
      col.accessor("search_volume", {
        header: "Volume", cell: (i) => fmtInt(i.getValue()), sortUndefined: "last", sortDescFirst: true,
        meta: { right: true },
      }),
    ];
    if (regionLabel) {
      c.push(col.accessor("regional_volume", {
        header: () => <span title="Google Ads search volume for the selected state / city">Vol. {regionLabel}</span>,
        cell: (i) => <span className="font-medium text-teal-700">{fmtInt(i.getValue())}</span>,
        sortUndefined: "last", sortDescFirst: true, meta: { right: true },
      }) as never);
    }
    c.push(
      col.accessor((r) => r.monthly_searches, {
        id: "trend", header: "Trend", enableSorting: false,
        cell: (i) => <Sparkline data={i.getValue()} />,
      }) as never,
      col.accessor("kd", {
        header: "KD %", sortUndefined: "last", sortDescFirst: true, meta: { right: true },
        cell: (i) => {
          const v = i.getValue();
          const k = kdLabel(v);
          return <span className="inline-flex items-center gap-1.5" title={k.label}>{v ?? "–"}<span className={`h-2.5 w-2.5 rounded-full ${k.color}`} /></span>;
        },
      }) as never,
      col.accessor("cpc", { header: "CPC (USD)", cell: (i) => fmtCpc(i.getValue()), sortUndefined: "last", sortDescFirst: true, meta: { right: true } }) as never,
      col.accessor("competition", {
        header: "Com.", sortUndefined: "last", sortDescFirst: true, meta: { right: true },
        cell: (i) => (i.getValue() == null ? "–" : i.getValue()!.toFixed(2)),
      }) as never,
      col.accessor((r) => r.serp_features.length, {
        id: "serp", header: "SERP features", sortDescFirst: true,
        cell: ({ row }) => {
          const f = row.original.serp_features;
          if (!f.length) return <span className="text-slate-300">–</span>;
          return (
            <span className="flex max-w-56 flex-wrap gap-1">
              {f.slice(0, 4).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{serpLabel(t)}</span>)}
              {f.length > 4 && <span className="text-[11px] text-slate-400" title={f.slice(4).map(serpLabel).join(", ")}>+{f.length - 4}</span>}
            </span>
          );
        },
      }) as never,
      col.accessor("updated", {
        header: "Updated", meta: { right: true },
        cell: ({ row }) => (
          <span title={`${row.original.updated ?? ""}${row.original.updated_source === "fetched" ? " (fetched by this app; source has no update date)" : " (DataForSEO last update)"}`}>
            {relativeAge(row.original.updated)}
          </span>
        ),
      }) as never,
    );
    return c;
  }, [regionLabel]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, rowSelection: selection },
    getRowId: (r) => r.keyword,
    enableRowSelection: true,
    onSortingChange: setSorting,
    onRowSelectionChange: (u) => onSelection(typeof u === "function" ? u(selection) : u),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 100 } },
    autoResetPageIndex: true,
  });

  const { pageIndex, pageSize } = table.getState().pagination;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-600">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const right = (h.column.columnDef.meta as { right?: boolean } | undefined)?.right;
                  const sorted = h.column.getIsSorted();
                  return (
                    <th key={h.id} className={`whitespace-nowrap px-3 py-2.5 ${right ? "text-right" : ""} ${sorted ? "bg-slate-100" : ""}`} style={h.id === "select" ? { width: 36 } : undefined}>
                      {h.column.getCanSort() ? (
                        <button className="inline-flex items-center gap-1 hover:text-slate-900" onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <span className="text-[10px]">{sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : ""}</span>
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={`border-b border-slate-100 hover:bg-slate-50 ${row.getIsSelected() ? "bg-indigo-50/60" : ""}`}>
                {row.getVisibleCells().map((cell) => {
                  const right = (cell.column.columnDef.meta as { right?: boolean } | undefined)?.right;
                  return <td key={cell.id} className={`whitespace-nowrap px-3 py-2 ${right ? "text-right tabular-nums" : ""}`}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>;
                })}
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={columns.length} className="px-3 py-12 text-center text-slate-400">No keywords match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-3 py-2 text-sm text-slate-600">
          <span>{pageIndex * pageSize + 1}–{Math.min((pageIndex + 1) * pageSize, rows.length)} of {rows.length}</span>
          <div className="flex items-center gap-2">
            <select className="h-8 rounded border border-slate-300 px-1" value={pageSize} onChange={(e) => table.setPageSize(Number(e.target.value))}>
              {[50, 100, 250, 500, 1000].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <button className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Prev</button>
            <button className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
