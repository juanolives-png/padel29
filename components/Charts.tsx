"use client";
import { useEffect, useRef, useState } from "react";

/** ancho real del contenedor: el SVG se dibuja a escala 1:1 para que los textos no se agranden */
function useWidth(def = 300) {
  const ref = useRef<HTMLDivElement>(null); const [w, setW] = useState(def);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(e => setW(Math.max(280, Math.round(e[0].contentRect.width)))); ro.observe(el); return () => ro.disconnect(); }, []);
  return [ref, w] as const;
}

const fmt = (n: number) => (n < 0 ? "−$" : "$") + Math.round(Math.abs(n)).toLocaleString("es-AR");
const short = (n: number) => { const a = Math.abs(n), s = n < 0 ? "−" : ""; return a >= 1e6 ? `${s}$${(a / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })}M` : a >= 1e3 ? `${s}$${Math.round(a / 1e3)}k` : `${s}$${Math.round(a)}`; };
/** escala "linda": máximo redondeado y 4 marcas */
function niceMax(v: number) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }

type Tip = { x: number; y: number; title: string; rows: [string, string, string?][] } | null;
function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return <div className="vz-tip" style={{ left: tip.x, top: tip.y }} role="status"><div className="vz-tt">{tip.title}</div>
    {tip.rows.map(([l, v, c]) => <div key={l} className="vz-tr">{c && <i style={{ background: c }} />}<b>{v}</b><span>{l}</span></div>)}</div>;
}

/** Ingresos vs egresos por mes: barras agrupadas, un solo eje */
export function MonthBars({ data }: { data: { label: string; ingresos: number; egresos: number; resultado: number; partial?: boolean }[] }) {
  const [tip, setTip] = useState<Tip>(null); const [ref, W] = useWidth();
  const H = 240, L = 52, B = 26, T = 10, max = niceMax(Math.max(...data.map(d => Math.max(d.ingresos, d.egresos)), 1));
  const gw = (W - L - 8) / data.length, bw = Math.min(26, gw * 0.3), y = (v: number) => T + (H - T - B) * (1 - v / max);
  return <div className="vz">
    <div className="vz-legend"><span><i style={{ background: "var(--s1)" }} />Ingresos</span><span><i style={{ background: "var(--s2)" }} />Egresos (mercadería + gastos)</span></div>
    <div ref={ref} style={{ position: "relative", width: "100%", minWidth: 0, overflow: "hidden" }} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={"Ingresos y egresos por mes: " + data.map(d => `${d.label} ${fmt(d.ingresos)} y ${fmt(d.egresos)}`).join("; ")}>
        {[0, .25, .5, .75, 1].map(f => <g key={f}><line x1={L} x2={W - 4} y1={y(max * f)} y2={y(max * f)} className="vz-grid" /><text x={L - 6} y={y(max * f) + 4} className="vz-ax" textAnchor="end">{short(max * f)}</text></g>)}
        {data.map((d, i) => { const cx = L + gw * i + gw / 2;
          return <g key={d.label} tabIndex={0} onFocus={() => setTip({ x: (cx / W) * 100, y: 0, title: d.label + (d.partial ? " (en curso)" : ""), rows: [["Ingresos", fmt(d.ingresos), "var(--s1)"], ["Egresos", fmt(d.egresos), "var(--s2)"], ["Resultado", fmt(d.resultado)]] })} onBlur={() => setTip(null)}
            onMouseMove={() => setTip({ x: (cx / W) * 100, y: 0, title: d.label + (d.partial ? " (en curso)" : ""), rows: [["Ingresos", fmt(d.ingresos), "var(--s1)"], ["Egresos", fmt(d.egresos), "var(--s2)"], ["Resultado", fmt(d.resultado)]] })}>
            <rect x={L + gw * i} y={T} width={gw} height={H - T - B} fill="transparent" />
            <path d={bar(cx - bw - 1, y(d.ingresos), bw, H - B - y(d.ingresos))} fill="var(--s1)" opacity={d.partial ? .55 : 1} />
            <path d={bar(cx + 1, y(d.egresos), bw, H - B - y(d.egresos))} fill="var(--s2)" opacity={d.partial ? .55 : 1} />
            <text x={cx} y={H - 8} className="vz-ax" textAnchor="middle">{d.label}</text></g>; })}
        <line x1={L} x2={W - 4} y1={H - B} y2={H - B} className="vz-base" />
      </svg>
      {tip && <Tooltip tip={{ ...tip, x: tip.x, y: 8 }} />}
    </div>
  </div>;
}
/** barra con extremo redondeado de 4px, apoyada en la base */
function bar(x: number, y: number, w: number, h: number) {
  if (h <= 0) return ""; const r = Math.min(4, h, w / 2);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/** Resultado por mes: barras hacia arriba (ganancia) o abajo (pérdida) */
export function ResultBars({ data, title }: { data: { label: string; value: number; sub?: string }[]; title: string }) {
  const [tip, setTip] = useState<Tip>(null); const [ref, W] = useWidth();
  const H = 200, L = 52, B = 22, T = 8;
  const mx = niceMax(Math.max(...data.map(d => Math.abs(d.value)), 1)), hasNeg = data.some(d => d.value < 0), hasPos = data.some(d => d.value > 0);
  const top = hasPos ? mx : 0, bot = hasNeg ? -mx : 0, y = (v: number) => T + (H - T - B) * (top - v) / (top - bot || 1);
  const gw = (W - L - 8) / data.length, bw = Math.min(30, gw * 0.6);
  return <div ref={ref} className="vz" style={{ position: "relative", minWidth: 0, overflow: "hidden" }} onMouseLeave={() => setTip(null)}>
    <div className="vz-legend"><span><i style={{ background: "var(--s1)" }} />Ganancia</span>{hasNeg && <span><i style={{ background: "var(--s2)" }} />Pérdida</span>}</div>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={title + ": " + data.map(d => `${d.label} ${fmt(d.value)}`).join("; ")}>
      {[top, (top + bot) / 2, bot].filter((v, i, a) => a.indexOf(v) === i).map(v => <g key={v}><line x1={L} x2={W - 4} y1={y(v)} y2={y(v)} className="vz-grid" /><text x={L - 6} y={y(v) + 4} className="vz-ax" textAnchor="end">{short(v)}</text></g>)}
      {data.map((d, i) => { const cx = L + gw * i + gw / 2, y0 = y(0), y1 = y(d.value);
        const t = { x: (cx / W) * 100, y: 8, title: d.label, rows: [["Resultado", fmt(d.value), d.value >= 0 ? "var(--s1)" : "var(--s2)"] as [string, string, string], ...(d.sub ? [["", d.sub] as [string, string]] : [])] };
        return <g key={d.label + i} tabIndex={0} onMouseMove={() => setTip(t)} onFocus={() => setTip(t)} onBlur={() => setTip(null)}>
          <rect x={L + gw * i} y={T} width={gw} height={H - T - B} fill="transparent" />
          {d.value >= 0 ? <path d={bar(cx - bw / 2, y1, bw, y0 - y1)} fill="var(--s1)" /> : <path d={bar(cx - bw / 2, y0, bw, y1 - y0)} transform={`rotate(180 ${cx} ${(y0 + y1) / 2})`} fill="var(--s2)" />}
          {(data.length <= 12 && (i % (data.length > 8 ? 2 : 1) === 0 || i === data.length - 1)) && <text x={cx} y={H - 6} className="vz-ax" textAnchor="middle">{d.label}</text>}</g>; })}
      <line x1={L} x2={W - 4} y1={y(0)} y2={y(0)} className="vz-base" />
    </svg>
    <Tooltip tip={tip} />
  </div>;
}

/** Ranking horizontal de una sola serie (ingresos por fuente, gastos por categoría) */
export function HBars({ rows, color, total }: { rows: { label: string; value: number }[]; color: string; total: number }) {
  const max = Math.max(...rows.map(r => r.value), 1);
  if (!rows.length) return <p className="muted small" style={{ margin: 0 }}>Sin datos en el período.</p>;
  return <div className="hb">{rows.map(r => <div key={r.label} className="hb-row" title={`${r.label}: ${fmt(r.value)}`}>
    <span className="hb-l">{r.label}</span>
    <span className="hb-track"><span className="hb-bar" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: color }} /></span>
    <span className="hb-v"><b>{fmt(r.value)}</b><small>{total ? Math.round((r.value / total) * 100) + "%" : ""}</small></span></div>)}</div>;
}
