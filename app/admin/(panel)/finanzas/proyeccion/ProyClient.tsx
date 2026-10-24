"use client";
import { useMemo, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { ResultBars } from "@/components/Charts";
import { saveFinanceSettings } from "../../../actions";
import { fmt } from "@/lib/time";

type A = Record<string, number>;
const MO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ml = (ym: string, k: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); return `${MO[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`; };
const sg = (n: number) => (n < 0 ? "−" : "") + fmt(Math.abs(n));

/** campos: [clave, etiqueta, unidad, paso, grupo] */
const FIELDS: [string, string, "" | "$" | "%" | "pp", number, string][] = [
  ["courts", "Canchas", "", 1, "Canchas"], ["slotsPerDay", "Turnos por día por cancha", "", 1, "Canchas"], ["price", "Precio del turno", "$", 500, "Canchas"],
  ["occupancy", "Ocupación", "%", 1, "Canchas"], ["occGrowth", "La ocupación sube por mes", "pp", 0.5, "Canchas"], ["passPct", "Jugadores que usan pase 29club", "%", 1, "Canchas"],
  ["barTicket", "Bar por turno", "$", 500, "Bar y 29club"], ["barMargin", "Margen del bar", "%", 1, "Bar y 29club"], ["plansPerMonth", "Planes 29club vendidos por mes", "", 1, "Bar y 29club"], ["planPrice", "Precio promedio del plan", "$", 1000, "Bar y 29club"],
  ["otherIncome", "Otros ingresos por mes", "$", 10000, "Gastos e inflación"], ["fixedCosts", "Gastos del mes (fijos + variables)", "$", 10000, "Gastos e inflación"], ["priceInfl", "Suba de precios por mes", "%", 0.5, "Gastos e inflación"], ["costInfl", "Suba de gastos por mes", "%", 0.5, "Gastos e inflación"],
  ["investment", "Inversión a recuperar", "$", 100000, "Gastos e inflación"],
];
const DAYS = 30.4;

export function project(a: A, months = 12) {
  const cap = a.courts * a.slotsPerDay * DAYS; let acc = -(a.investment || 0);
  const rows = Array.from({ length: months }, (_, k) => {
    const pf = Math.pow(1 + a.priceInfl / 100, k), cf = Math.pow(1 + a.costInfl / 100, k);
    const occ = Math.max(0, Math.min(100, a.occupancy + a.occGrowth * k));
    const turnos = cap * occ / 100;
    const cancha = turnos * a.price * pf * (1 - a.passPct / 100);
    const bar = turnos * a.barTicket * pf, cmv = bar * (1 - a.barMargin / 100);
    const planes = a.plansPerMonth * a.planPrice * pf, otros = a.otherIncome * pf;
    const ingresos = cancha + bar + planes + otros, gastos = a.fixedCosts * cf, res = ingresos - cmv - gastos; acc += res;
    // ocupación que hace falta para no perder plata este mes
    const perTurno = a.price * pf * (1 - a.passPct / 100) + a.barTicket * pf * (a.barMargin / 100);
    const be = perTurno > 0 && cap > 0 ? Math.max(0, (gastos - planes - otros) / perTurno / cap * 100) : NaN;
    return { k, occ, turnos, cancha, bar, cmv, planes, otros, ingresos, gastos, res, acc, be };
  });
  return rows;
}

export default function ProyClient({ actual, saved, basedOn, start }: { actual: A; saved: A; basedOn: { from: string; to: string; days: number; turnos: number; hasExpenses: boolean; barWithoutCost: number }; start: string }) {
  const toast = useToast(); const [pending, go] = useTransition();
  const real: A = { ...actual, occGrowth: 0, priceInfl: 2.5, costInfl: 2.5, investment: 0 };
  const [a, setA] = useState<A>({ ...real, ...saved });
  const rows = useMemo(() => project(a), [a]);
  const year = rows.reduce((s, r) => ({ ing: s.ing + r.ingresos, res: s.res + r.res, cmv: s.cmv + r.cmv, g: s.g + r.gastos }), { ing: 0, res: 0, cmv: 0, g: 0 });
  const payback = a.investment > 0 ? rows.find(r => r.acc >= 0) : null;
  const scen = [-10, 0, 10].map(d => ({ d, res: project({ ...a, occupancy: Math.max(0, a.occupancy + d) }).reduce((s, r) => s + r.res, 0) }));
  const set = (k: string, v: string) => setA({ ...a, [k]: v === "" ? 0 : Number(v.replace(",", ".")) });
  const changed = (k: string) => Math.abs((a[k] ?? 0) - (real[k] ?? 0)) > 1e-9;
  const groups = [...new Set(FIELDS.map(f => f[4]))];

  return <div className="stack" style={{ gap: 16 }}>
    <div className="fin-kpis">
      <div className="card kpi"><div className="l">Ingresos 12 meses</div><div className="v">{fmt(year.ing)}</div><div className="small muted">{fmt(year.ing / 12)} por mes en promedio</div></div>
      <div className={"card kpi res " + (year.res >= 0 ? "up" : "down")}><div className="l">{year.res >= 0 ? "▲ Ganancia 12 meses" : "▼ Pérdida 12 meses"}</div><div className="v">{sg(year.res)}</div><div className="small">Margen {year.ing ? Math.round(year.res / year.ing * 100) : 0}%</div></div>
      <div className="card kpi"><div className="l">Ocupación de equilibrio</div><div className="v">{isFinite(rows[0].be) ? Math.ceil(rows[0].be) + "%" : "—"}</div><div className="small muted">para no perder plata · hoy {a.occupancy}%</div></div>
      <div className="card kpi"><div className="l">Recupero de la inversión</div><div className="v" style={{ fontSize: a.investment > 0 ? undefined : 22 }}>{a.investment > 0 ? (payback ? `${payback.k + 1} meses` : "+12 meses") : "Sin cargar"}</div><div className="small muted">{a.investment > 0 ? `de ${fmt(a.investment)}` : "Poné la inversión abajo"}</div></div>
    </div>

    {(!basedOn.hasExpenses || basedOn.barWithoutCost > 0 || basedOn.turnos < 30 || basedOn.days < 14) && <div className="alert warn">
      Los supuestos arrancan con lo real del {basedOn.from.split("-").reverse().join("/")} al {basedOn.to.split("-").reverse().join("/")} ({basedOn.turnos} turnos).
      {!basedOn.hasExpenses && <> <b>No hay gastos cargados:</b> poné tus gastos del mes a mano.</>}
      {basedOn.barWithoutCost > 0 && <> Hay ventas del bar sin costo: el margen del bar puede estar alto.</>}
      {(basedOn.turnos < 30 || basedOn.days < 14) && <> <b>Hay {basedOn.days} día{basedOn.days === 1 ? "" : "s"} de datos:</b> todavía es poco para confiar en el promedio. Ajustá la ocupación a lo que esperás.</>}</div>}

    <div className="fin-grid" style={{ marginTop: 0 }}>
      <section className="card stack" style={{ gap: 14 }} aria-label="Supuestos">
        <div className="between"><h3 style={{ margin: 0 }}>Supuestos</h3>
          <div className="row" style={{ gap: 6 }}><button className="btn sm ghost" onClick={() => setA(real)}>Volver a lo real</button><button className="btn sm" disabled={pending} onClick={() => go(async () => { const r = await saveFinanceSettings(a); toast.show(r.msg, !r.ok); })}>Guardar</button></div></div>
        {groups.map(g => <div key={g} className="stack" style={{ gap: 8 }}><div className="lbl">{g}</div>
          <div className="assm">{FIELDS.filter(f => f[4] === g).map(([k, l, u, step]) => <label key={k} className={"as" + (changed(k) ? " ch" : "")}>
            <span>{l}</span>
            <span className="as-in">{u === "$" && <i>$</i>}<input type="number" step={step} value={Number.isFinite(a[k]) ? a[k] : 0} onChange={e => set(k, e.target.value)} aria-label={l} />{u === "%" && <i>%</i>}{u === "pp" && <i>pts</i>}</span>
            <small>{["occGrowth", "priceInfl", "costInfl", "investment"].includes(k) ? " " : `real: ${u === "$" ? fmt(real[k]) : real[k].toLocaleString("es-AR")}${u === "%" ? "%" : ""}`}</small></label>)}</div></div>)}
      </section>
      <div className="stack" style={{ gap: 16 }}>
        <section className="card"><h3>Resultado mes a mes</h3><ResultBars title="Resultado proyectado por mes" data={rows.map(r => ({ label: ml(start, r.k), value: Math.round(r.res), sub: `Ocupación ${r.occ.toFixed(0)}% · ingresos ${fmt(r.ingresos)}` }))} /></section>
        <section className="card"><h3>¿Y si cambia la ocupación?</h3>
          <table className="tbl"><thead><tr><th>Escenario</th><th className="r">Ocupación</th><th className="r">Resultado 12 meses</th></tr></thead>
            <tbody>{scen.map(s => <tr key={s.d} style={{ fontWeight: s.d === 0 ? 800 : 400 }}><td>{s.d < 0 ? "Pesimista" : s.d > 0 ? "Optimista" : "Base"}</td><td className="r">{Math.max(0, a.occupancy + s.d).toFixed(0)}%</td><td className="r" style={{ color: s.res < 0 ? "var(--bad)" : "var(--ok)" }}>{sg(s.res)}</td></tr>)}</tbody></table>
          <p className="small muted" style={{ margin: "8px 0 0" }}>Cada 10 puntos de ocupación mueven el resultado del año en {fmt(Math.abs(scen[2].res - scen[1].res))}.</p></section>
      </div>
    </div>

    <section className="card" aria-label="Detalle mensual"><h3>Detalle mensual</h3>
      <div className="scroll-x"><table className="tbl proy"><thead><tr><th>Mes</th><th className="r">Ocup.</th><th className="r">Turnos</th><th className="r">Canchas</th><th className="r">Bar</th><th className="r">29club</th><th className="r">Ingresos</th><th className="r">Mercadería</th><th className="r">Gastos</th><th className="r">Resultado</th><th className="r">Acumulado</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.k}><td>{ml(start, r.k)}</td><td className="r">{r.occ.toFixed(0)}%</td><td className="r">{Math.round(r.turnos)}</td><td className="r">{fmt(r.cancha)}</td><td className="r">{fmt(r.bar)}</td><td className="r">{fmt(r.planes)}</td><td className="r"><b>{fmt(r.ingresos)}</b></td><td className="r">{fmt(r.cmv)}</td><td className="r">{fmt(r.gastos)}</td>
          <td className="r" style={{ color: r.res < 0 ? "var(--bad)" : undefined }}><b>{sg(r.res)}</b></td><td className="r" style={{ color: r.acc < 0 ? "var(--bad)" : "var(--ok)" }}>{sg(r.acc)}</td></tr>)}
          <tr className="tot"><td>Total</td><td /><td className="r">{Math.round(rows.reduce((s, r) => s + r.turnos, 0))}</td><td className="r">{fmt(rows.reduce((s, r) => s + r.cancha, 0))}</td><td className="r">{fmt(rows.reduce((s, r) => s + r.bar, 0))}</td><td className="r">{fmt(rows.reduce((s, r) => s + r.planes, 0))}</td><td className="r">{fmt(year.ing)}</td><td className="r">{fmt(year.cmv)}</td><td className="r">{fmt(year.g)}</td><td className="r">{sg(year.res)}</td><td /></tr></tbody></table></div>
      <p className="small muted" style={{ margin: "10px 0 0" }}>Meses de {DAYS} días. Canchas: turnos × precio, menos la parte que se paga con pases (esa plata entra al vender el plan). Bar: turnos × bar por turno; la mercadería es lo vendido × (1 − margen). Los precios y gastos suben cada mes con el porcentaje elegido.</p>
    </section>
    {toast.node}
  </div>;
}
