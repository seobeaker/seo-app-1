import { useEffect, useState } from "react";
import { api } from "../api";
import type { KeywordRow, SavedList } from "../types";
import { copyText, downloadCsv, safeFilename, toCsv, toTsv } from "../lib/export";
import { fmtInt } from "../lib/format";

type Detail = SavedList & { items: (KeywordRow & { added_at: string })[] };

export function ListsPanel({ open, onClose, version, notify }: { open: boolean; onClose: () => void; version: number; notify: (m: string) => void }) {
  const [lists, setLists] = useState<SavedList[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);

  const load = () => api.lists().then(setLists).catch((e) => notify(e.message));
  useEffect(() => { if (open) load(); }, [open, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const openList = (id: number) => api.getList(id).then(setDetail).catch((e) => notify(e.message));

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/20" onClick={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">{detail ? <button className="text-indigo-600" onClick={() => setDetail(null)}>← Lists</button> : "Saved keyword lists"}</h2>
          <button className="text-xl text-slate-400 hover:text-slate-700" onClick={onClose} aria-label="Close">×</button>
        </div>
        {!detail && (
          <ul className="flex-1 overflow-auto">
            {lists.map((l) => (
              <li key={l.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 hover:bg-slate-50">
                <button className="text-left" onClick={() => openList(l.id)}>
                  <div className="font-medium text-indigo-700">{l.name}</div>
                  <div className="text-xs text-slate-500">{l.count} keywords</div>
                </button>
                <button className="text-sm text-red-500 hover:underline" onClick={async () => {
                  if (!window.confirm(`Delete list "${l.name}"?`)) return;
                  await api.deleteList(l.id); load();
                }}>Delete</button>
              </li>
            ))}
            {!lists.length && <li className="px-4 py-8 text-center text-slate-400">No lists yet. Select keywords in the table and use "Save to list".</li>}
          </ul>
        )}
        {detail && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
              <span className="mr-auto font-medium">{detail.name} · {detail.items.length}</span>
              <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={() => copyText(detail.items.map((i) => i.keyword).join("\n")).then(() => notify("Keywords copied"))}>Copy keywords</button>
              <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={() => copyText(toTsv(detail.items)).then(() => notify("Table copied"))}>Copy table</button>
              <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={() => downloadCsv(`${safeFilename(detail.name)}.csv`, toCsv(detail.items))}>CSV</button>
            </div>
            <ul className="flex-1 overflow-auto text-sm">
              {detail.items.map((i) => (
                <li key={i.keyword} className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                  <span>{i.keyword}</span>
                  <span className="flex items-center gap-3 text-slate-500">
                    {fmtInt(i.search_volume)}
                    <button className="text-red-400 hover:text-red-600" title="Remove" onClick={async () => {
                      await api.removeFromList(detail.id, [i.keyword]); openList(detail.id);
                    }}>×</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
