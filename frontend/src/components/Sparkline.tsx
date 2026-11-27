import type { Monthly } from "../types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function Sparkline({ data, width = 72, height = 22 }: { data: Monthly[]; width?: number; height?: number }) {
  const pts = data.slice(-12);
  if (pts.length < 2) return <span className="text-slate-300">–</span>;
  const vals = pts.map((m) => m.search_volume ?? 0);
  const max = Math.max(...vals, 1);
  const bw = width / pts.length;
  const title = pts.map((m) => `${MONTHS[m.month - 1]} ${m.year}: ${(m.search_volume ?? 0).toLocaleString()}`).join("\n");
  return (
    <svg width={width} height={height} className="inline-block align-middle" role="img" aria-label="12 month trend">
      <title>{title}</title>
      {vals.map((v, i) => {
        const h = Math.max(1.5, (v / max) * (height - 2));
        return <rect key={i} x={i * bw + 0.5} y={height - h} width={Math.max(1, bw - 1.5)} height={h} rx={0.8} className="fill-indigo-400" />;
      })}
    </svg>
  );
}
