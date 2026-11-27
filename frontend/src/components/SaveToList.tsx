import { useEffect, useState } from "react";
import { api } from "../api";
import type { KeywordRow, SavedList } from "../types";
import { Popover } from "./Popover";

export function SaveToList({ rows, onSaved, notify }: { rows: KeywordRow[]; onSaved: () => void; notify: (m: string) => void }) {
  const [lists, setLists] = useState<SavedList[]>([]);
  const [name, setName] = useState("");
  useEffect(() => { api.lists().then(setLists).catch(() => {}); }, [rows.length]);

  const save = async (id: number, listName: string) => {
    try {
      const r = await api.addToList(id, rows);
      notify(`Saved ${r.added} keywords to "${listName}"`);
      onSaved();
      api.lists().then(setLists);
    } catch (e) { notify((e as Error).message); }
  };

  return (
    <Popover align="right" label={<span>Save to list{rows.length ? ` (${rows.length})` : ""}</span>}>
      <div className="w-60 space-y-2 text-sm">
        {!rows.length && <p className="text-slate-500">Select keywords first.</p>}
        {rows.length > 0 && (
          <>
            {lists.map((l) => (
              <button key={l.id} className="flex w-full justify-between rounded px-2 py-1 hover:bg-slate-100" onClick={() => save(l.id, l.name)}>
                <span>{l.name}</span><span className="text-slate-400">{l.count}</span>
              </button>
            ))}
            <form className="flex gap-1 border-t border-slate-100 pt-2" onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              const l = await api.createList(name.trim());
              setName("");
              await save(l.id, l.name);
            }}>
              <input className="h-8 flex-1 rounded border border-slate-300 px-2" placeholder="New list name" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="rounded bg-indigo-600 px-2 text-white">Add</button>
            </form>
          </>
        )}
      </div>
    </Popover>
  );
}
