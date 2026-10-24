import Link from "next/link";
import { getClub } from "@/lib/data";
import { q } from "@/lib/db";
import { summary, monthly, barProducts, monthBounds, addMonths, CAJA_CAT } from "@/lib/finance";
import { addDays, nowAR, fmt } from "@/lib/time";
import { MonthBars, HBars } from "@/components/Charts";
import FinTabs from "./FinTabs";

export const metadata = { title: "Finanzas" };
const PERIODS: [string, string][] = [["mes", "Este mes"], ["prev", "Mes anterior"], ["30", "Últimos 30 días"], ["3m", "Últimos 3 meses"], ["anio", "Este año"]];
const pct = (x: number) => (x * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%";
const sgn = (n: number) => (n < 0 ? "−" : "") + fmt(Math.abs(n));

function range(p: string, today: string) {
  const ym = today.slice(0, 7);
  if (p === "prev") return monthBounds(addMonths(ym, -1));
  if (p === "30") return { from: addDays(today, -29), to: today };
  if (p === "3m") return { from: monthBounds(addMonths(ym, -2)).from, to: today };
  if (p === "anio") return { from: today.slice(0, 4) + "-01-01", to: today };
  return { from: ym + "-01", to: today };
}

export default async function Finanzas(props: { searchParams: Promise<{ p?: string }> }) {
  const sp = await props.searchParams; const p = PERIODS.some(x => x[0] === sp.p) ? sp.p! : "mes";
  const club = await getClub(); const today = nowAR().date; const r = range(p, today);
  const [s, months, prods, debt] = await Promise.all([summary(club.id, r.from, r.to), monthly(club.id, 6), barProducts(club.id, r.from, r.to),
    q<{ s: number }>("select coalesce(sum(-b),0)::int as s from (select sum(amount) as b from account_move where club_id=$1 group by player_id) x where b < 0", [club.id])]);
  const egresos = s.cmv + s.gastosTotal;
  const i = s.ingresos;
  const barMargin = i.bar - s.barSinCosto > 0 ? 1 - s.cmv / (i.bar - s.barSinCosto) : null;
  const rows: [string, number, "sub" | "neg" | "tot" | ""][] = [
    ["Canchas", i.cancha, ""], ["Bar y kiosco", i.bar, ""], ["Planes 29club", i.planes, ""], ...(i.otros ? [["Otros ingresos", i.otros, ""] as [string, number, ""]] : []),
    ["Ingresos", i.total, "sub"], ["Costo de lo vendido en el bar", -s.cmv, "neg"], ["Margen bruto", s.margenBruto, "sub"],
    ...s.gastos.map(g => [g.cat, -g.amount, "neg"] as [string, number, "neg"]), ["Resultado", s.resultado, "tot"]];
  return <>
    <div className="page-head" style={{ marginBottom: 14 }}><div><h1>Finanzas</h1><p>Cuánto se gana: ingresos del período, lo que cuesta lo vendido y los gastos.</p></div><FinTabs /></div>
    <div className="chips scroll" style={{ marginBottom: 16 }}>{PERIODS.map(([k, l]) => <Link key={k} href={`/admin/finanzas?p=${k}`} className={"chip" + (k === p ? " on" : "")} style={{ textDecoration: "none" }}>{l}</Link>)}
      <span className="small muted" style={{ alignSelf: "center", marginLeft: 6 }}>{r.from.split("-").reverse().join("/")} al {s.to.split("-").reverse().join("/")}</span></div>

    <div className="fin-kpis">
      <div className="card kpi"><div className="l">Ingresos</div><div className="v">{fmt(i.total)}</div><div className="small muted">{s.turnos} turnos · ocupación {pct(s.ocupacion)}</div></div>
      <div className="card kpi"><div className="l">Egresos</div><div className="v">{fmt(egresos)}</div><div className="small muted">{fmt(s.cmv)} mercadería · {fmt(s.gastosTotal)} gastos</div></div>
      <div className={"card kpi res " + (s.resultado >= 0 ? "up" : "down")}><div className="l">{s.resultado >= 0 ? "▲ Ganancia" : "▼ Pérdida"}</div><div className="v">{sgn(s.resultado)}</div><div className="small">Margen {s.margen < 0 ? "−" : ""}{pct(Math.abs(s.margen))} de los ingresos</div></div>
      <div className="card kpi"><div className="l">Por turno</div><div className="v">{s.turnos ? fmt(i.total / s.turnos) : "—"}</div><div className="small muted">de ingreso · {s.turnos ? sgn(s.resultado / s.turnos) : "—"} de resultado</div></div>
    </div>

    {(s.gastosTotal === 0 || s.barSinCosto > 0) && <div className="alert warn" style={{ margin: "16px 0 0" }}>
      {s.gastosTotal === 0 && <div><b>No hay gastos cargados en este período.</b> El resultado sale inflado hasta que cargues alquiler, sueldos, servicios, etc. <Link href="/admin/finanzas/gastos">Cargar gastos</Link></div>}
      {s.barSinCosto > 0 && <div><b>{fmt(s.barSinCosto)} de ventas del bar no tienen costo cargado</b> y se toman como costo cero. <Link href="/admin/bar/ventas">Cargar costos en el stock</Link></div>}
    </div>}

    <div className="fin-grid">
      <section className="card" aria-label="Estado de resultados"><h3>Estado de resultados</h3>
        <div className="scroll-x"><table className="tbl pl"><thead><tr><th>Concepto</th><th className="r">Importe</th><th className="r">% ingresos</th></tr></thead>
          <tbody>{rows.map(([l, v, k], j) => <tr key={l + j} className={k}><td>{k === "neg" ? "− " : ""}{l}</td><td className="r">{sgn(v)}</td><td className="r">{i.total ? (k === "tot" && v < 0 ? "−" : "") + pct(Math.abs(v) / i.total) : "—"}</td></tr>)}</tbody></table></div>
        <p className="small muted" style={{ margin: "10px 0 0" }}>Cuenta lo jugado y vendido en el período, esté cobrado o no. {debt[0].s ? `Hoy te deben ${fmt(debt[0].s)} en cuentas corrientes.` : ""} {s.compras ? `Compraste ${fmt(s.compras)} de mercadería: no es gasto, se cuenta como costo cuando se vende.` : ""} Los pases de 29club se cuentan al vender el plan.</p>
      </section>
      <div className="stack" style={{ gap: 16 }}>
        <section className="card"><h3>Ingresos por fuente</h3><HBars color="var(--s1)" total={i.total} rows={[["Canchas", i.cancha], ["Bar y kiosco", i.bar], ["Planes 29club", i.planes], ["Otros", i.otros]].filter(([, v]) => (v as number) > 0).map(([label, value]) => ({ label: label as string, value: value as number }))} /></section>
        <section className="card"><h3>Egresos</h3><HBars color="var(--s2)" total={egresos} rows={[...(s.cmv ? [{ label: "Mercadería vendida", value: s.cmv }] : []), ...s.gastos.map(g => ({ label: g.cat, value: g.amount }))]} /></section>
      </div>
    </div>

    <section className="card" style={{ marginTop: 16 }} aria-label="Últimos 6 meses"><div className="between"><h3 style={{ margin: 0 }}>Últimos 6 meses</h3><span className="small muted">El mes en curso va más claro: está incompleto.</span></div>
      <div style={{ marginTop: 10 }}><MonthBars data={months} /></div>
      <details className="more" style={{ marginTop: 10 }}><summary>Ver como tabla</summary><table className="tbl" style={{ marginTop: 8 }}><thead><tr><th>Mes</th><th className="r">Ingresos</th><th className="r">Egresos</th><th className="r">Resultado</th></tr></thead>
        <tbody>{months.map(m => <tr key={m.ym}><td>{m.label}{m.partial ? " (en curso)" : ""}</td><td className="r">{fmt(m.ingresos)}</td><td className="r">{fmt(m.egresos)}</td><td className="r"><b>{sgn(m.resultado)}</b></td></tr>)}</tbody></table></details>
    </section>

    <div className="fin-grid" style={{ marginTop: 16 }}>
      <section className="card"><h3>Bar: qué deja cada producto</h3>
        {barMargin != null && <p className="small muted" style={{ marginTop: -4 }}>Margen promedio del bar: <b>{pct(barMargin)}</b></p>}
        {prods.length ? <div className="scroll-x"><table className="tbl"><thead><tr><th>Producto</th><th className="r">Vendidos</th><th className="r">Venta</th><th className="r">Ganancia</th><th className="r">Margen</th></tr></thead>
          <tbody>{prods.slice(0, 12).map(x => <tr key={x.name}><td>{x.emoji} {x.name}</td><td className="r">{x.qty}</td><td className="r">{fmt(x.venta)}</td>
            <td className="r">{x.costo == null ? <span className="pill warn">sin costo</span> : <b>{fmt(x.venta - x.costo)}</b>}</td><td className="r">{x.costo == null || !x.venta ? "—" : pct(1 - x.costo / x.venta)}</td></tr>)}</tbody></table></div>
          : <p className="muted small" style={{ margin: 0 }}>Sin ventas del bar en el período.</p>}
      </section>
      <section className="card"><h3>Indicadores</h3><dl className="kv">
        <dt>Turnos jugados</dt><dd>{s.turnos} de {s.capacidad}</dd>
        <dt>Ocupación</dt><dd>{pct(s.ocupacion)}</dd>
        <dt>Jugadores con pase 29club</dt><dd>{pct(s.pasesPct)}</dd>
        <dt>Bar por turno</dt><dd>{s.turnos ? fmt(i.bar / s.turnos) : "—"}</dd>
        <dt>Planes vendidos</dt><dd>{s.planesVendidos}</dd>
        <dt>Gastos fijos cargados</dt><dd>{fmt(s.gastosFijos)}</dd>
        <dt>Gastos de caja</dt><dd>{fmt(s.gastos.find(g => g.cat === CAJA_CAT)?.amount || 0)}</dd>
        <dt>Punto de equilibrio</dt><dd>{s.turnos && i.total ? (() => { const perTurno = (s.margenBruto) / s.turnos; return perTurno > 0 ? `${Math.ceil(s.gastosTotal / perTurno)} turnos` : "—"; })() : "—"}</dd>
      </dl><p className="small muted" style={{ margin: "10px 0 0" }}>Punto de equilibrio: turnos que hacen falta en el período para cubrir los gastos con lo que deja cada turno (cancha + bar, ya descontada la mercadería).</p></section>
    </div>
  </>;
}
