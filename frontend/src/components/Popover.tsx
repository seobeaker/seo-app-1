import { useEffect, useRef, useState, type ReactNode } from "react";

export function Popover({ label, active, children, align = "left" }: { label: ReactNode; active?: boolean; children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        className={`flex h-8 items-center gap-1 rounded-md border px-3 text-sm ${active ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" className="ml-1 opacity-60"><path d="M1 3l4 4 4-4" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
      </button>
      {open && (
        <div className={`absolute z-30 mt-1 min-w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}>
          {children}
        </div>
      )}
    </div>
  );
}
