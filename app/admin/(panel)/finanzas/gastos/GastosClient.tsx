"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { HBars } from "@/components/Charts";
import { copyFixedExpenses, deleteExpense, importExpenses, saveExpense } from "../../../actions";
import { fmt } from "@/lib/time";

type E = { id: string; date: string; category: string; detail: string; amount: number; method: string; fixed: boolean };
const METHODS = ["Transferencia", "Efectivo", "QR Mercado Pago", "Débito automático", "Tarjeta"];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const dmy = (d: string) => d.split("-").reverse().join("/");

/** "15/10/2026", "15/10", "2026-10-15" → YYYY-MM-DD */
function parseDate(s: string, ym: string) {
  const t = s.trim(); let m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  if ((m = t.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/))) { const y = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : ym.slice(0, 4); return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return "";
}
/** "$ 1.234.567,50", "1234567.5", "150000" → número */
function parseAmount(s: string) {
  let t = s.replace(/[^\d.,-]/g, ""); if (!t) return 0;
  if (t.includes(",") && t.lastIndexOf(",") > t.lastIndexOf(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if ((t.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, "").replace(/,/g, "");
  else t = t.replace(/,/g, "");
  return Math.round(Math.abs(Number(t)) || 0);
}
function guessCat(s: string, cats: string[]) {
  const n = norm(s); if (!n) return "Otros";
  const exact = cats.find(c => norm(c) === n || norm(c).startsWith(n)); if (exact) return exact;
  const KEYS: [RegExp, string][] = [[/sueldo|cargas|aguinaldo|personal|empleado|sindicato/, "Sueldos y cargas"], [/alquiler|expensa/, "Alquiler"], [/luz|edenor|edesur|agua|gas|internet|telefon|servicio|electric/, "Servicios (luz, agua, gas, internet)"],
    [/cancha|cesped|blindex|red|mantenim|pintura|reparac/, "Mantenimiento de canchas"], [/limpi/, "Limpieza"], [/profe|clase/, "Profesores"], [/marketing|publici|instagram|redes|meta|google/, "Marketing"],
    [/impuesto|tasa|afip|arca|iibb|ingresos brutos|monotributo|municip|abl/, "Impuestos y tasas"], [/comisi|mercado ?pago|banco|mantenimiento de cuenta/, "Comisiones (MP y bancos)"], [/seguro/, "Seguros"]];
  return KEYS.find(([r]) => r.test(n))?.[1] || "Otros";
}

export default function GastosClient({ ym, today, cats, rows, caja, canCopy }: { ym: string; today: string; cats: string[]; rows: E[]; caja: { id: string; date: string; amount: number; note: string; method: string }[]; canCopy: boolean }) {
  const router = useRouter(); const toast = useToast(); const [pending, start] = useTransition();
  const defDate = today.slice(0, 7) === ym ? today : `${ym}-01`;
  const blank = { date: defDate, category: "Alquiler", detail: "", amount: "", method: "Transferencia", fixed: false };
  const [f, setF] = useState<{ id?: string; date: string; category: string; detail: string; amount: string; method: string; fixed: boolean }>(blank);
  const [paste, setPaste] = useState<string | null>(null);
  const parsed = useMemo(() => !paste ? [] : paste.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const c = l.includes("\t") ? l.split("\t") : l.split(/;|,(?=\s*[^\d])/);
    const [d = "", cat = "", det = "", amt = ""] = c.length >= 4 ? c : c.length === 3 ? [c[0], "", c[1], c[2]] : [c[0], "", "", c[1] || ""];
    const date = parseDate(d, ym), amount = parseAmount(amt), category = guessCat(cat || det, cats);
    return { raw: l, date, category, detail: (det || (cat && !cats.includes(cat) ? cat : "")).trim(), amount, ok: !!date && amount > 0 };
  }), [paste, ym, cats]);
  const total = rows.reduce((s, r) => s + r.amount, 0), cajaTotal = caja.reduce((s, r) => s + r.amount, 0);
  const byCat = Object.entries(rows.reduce((m, r) => ({ ...m, [r.category]: (m[r.category] || 0) + r.amount }), {} as Record<string, number>)).map(([label, value]) => ({ label, value }))
    .concat(cajaTotal ? [{ label: "Gastos de caja", value: cajaTotal }] : []).sort((a, b) => b.value - a.value);
  const run = (fn: () => Promise<{ ok: boolean; msg: string }>, after?: () => void) => start(async () => { const r = await fn(); toast.show(r.msg, !r.ok); if (r.ok) { after?.(); router.refresh(); } });
  const amt = Number(String(f.amount).replace(/\D/g, "")) || 0;

  return <div className="stack" style={{ gap: 16 }}>
    <div className="fin-grid" style={{ marginTop: 0 }}>
      <section className="card stack" style={{ gap: 12 }} aria-label="Cargar gasto">
        <div className="between"><h3 style={{ margin: 0 }}>{f.id ? "Editar gasto" : "Cargar gasto"}</h3>
          <div className="row" style={{ gap: 6 }}>{canCopy && !f.id && <button className="btn sm ghost" disabled={pending} onClick={() => run(() => copyFixedExpenses(ym))}>↻ Repetir fijos del mes anterior</button>}
            <button className="btn sm ghost" onClick={() => setPaste(paste == null ? "" : null)}>{paste == null ? "📋 Pegar varios" : "Cerrar"}</button></div></div>
        {paste != null ? <div className="stack" style={{ gap: 10 }}>
          <p className="small muted" style={{ margin: 0 }}>Copiá filas de Excel o Google Sheets y pegalas acá. Columnas: <b>fecha · categoría · detalle · monto</b>. También sirve <b>fecha · detalle · monto</b>: la categoría se adivina por el detalle.</p>
          <textarea className="input" rows={6} value={paste} onChange={e => setPaste(e.target.value)} placeholder={"05/10/2026\tAlquiler\tGalpón octubre\t$ 850.000\n10/10\tServicios\tEdenor\t182.340,50\n12/10;Sueldos;Encargado;650000"} aria-label="Gastos para pegar" style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }} />
          {parsed.length > 0 && <><div className="scroll-x"><table className="tbl"><thead><tr><th>Fecha</th><th>Categoría</th><th>Detalle</th><th className="r">Monto</th></tr></thead>
            <tbody>{parsed.map((r, i) => <tr key={i} style={{ background: r.ok ? undefined : "#fbe4e2" }}><td>{r.date ? dmy(r.date) : <span className="pill bad">fecha?</span>}</td><td>{r.category}</td><td>{r.detail}</td><td className="r">{r.amount ? fmt(r.amount) : <span className="pill bad">monto?</span>}</td></tr>)}</tbody></table></div>
            <button className="btn" disabled={pending || !parsed.some(r => r.ok)} onClick={() => run(() => importExpenses(parsed.filter(r => r.ok)), () => setPaste(null))}>Importar {parsed.filter(r => r.ok).length} gastos · {fmt(parsed.filter(r => r.ok).reduce((s, r) => s + r.amount, 0))}</button>
            {parsed.some(r => !r.ok) && <p className="small" style={{ margin: 0, color: "var(--bad)" }}>Las filas en rojo no se importan: revisá fecha y monto.</p>}</>}
        </div> : <form className="stack" style={{ gap: 10 }} onSubmit={e => { e.preventDefault(); run(() => saveExpense({ id: f.id, date: f.date, category: f.category, detail: f.detail, amount: amt, method: f.method, fixed: f.fixed }), () => setF({ ...blank, date: f.date })); }}>
          <div className="grid2" style={{ gap: 10 }}>
            <div className="field"><label htmlFor="gd">Fecha</label><input id="gd" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} required /></div>
            <div className="field"><label htmlFor="ga">Importe</label><input id="ga" inputMode="numeric" placeholder="$ 0" value={amt ? fmt(amt) : ""} onChange={e => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} required /></div></div>
          <div className="field"><label htmlFor="gc">Categoría</label><select id="gc" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{cats.map(c => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="gt">Detalle</label><input id="gt" value={f.detail} onChange={e => setF({ ...f, detail: e.target.value })} placeholder="Ej: Edenor octubre, sueldo encargado" /></div>
          <div className="grid2" style={{ gap: 10 }}>
            <div className="field"><label htmlFor="gm">Se pagó con</label><select id="gm" value={f.method} onChange={e => setF({ ...f, method: e.target.value })}>{METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
            <label className="checkrow" style={{ alignSelf: "end" }}><input type="checkbox" checked={f.fixed} onChange={e => setF({ ...f, fixed: e.target.checked })} /><span>Gasto fijo mensual</span></label></div>
          <div className="row"><button className="btn" disabled={pending || !amt}>{f.id ? "Guardar cambios" : "Cargar gasto"}</button>{f.id && <button type="button" className="btn ghost" onClick={() => setF(blank)}>Cancelar</button>}</div>
        </form>}
      </section>
      <section className="card" aria-label="Por categoría"><div className="between"><h3 style={{ margin: 0 }}>Total del mes</h3><b style={{ fontFamily: "var(--f-head)", fontSize: 28 }}>{fmt(total + cajaTotal)}</b></div>
        <div style={{ marginTop: 12 }}><HBars color="var(--s2)" total={total + cajaTotal} rows={byCat} /></div>
        <p className="small muted" style={{ margin: "10px 0 0" }}>Fijos: {fmt(rows.filter(r => r.fixed).reduce((s, r) => s + r.amount, 0))} · Variables: {fmt(rows.filter(r => !r.fixed).reduce((s, r) => s + r.amount, 0) + cajaTotal)}</p></section>
    </div>

    <section className="card" aria-label="Gastos del mes"><h3>Gastos del mes</h3>
      <div className="scroll-x"><table className="tbl"><thead><tr><th>Fecha</th><th>Categoría</th><th>Detalle</th><th>Medio</th><th className="r">Importe</th><th></th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}><td>{dmy(r.date)}</td><td>{r.category}{r.fixed ? <span className="pill" style={{ marginLeft: 6 }}>fijo</span> : null}</td><td>{r.detail}</td><td>{r.method}</td><td className="r"><b>{fmt(r.amount)}</b></td>
          <td className="r" style={{ whiteSpace: "nowrap" }}><button className="linkbtn" onClick={() => { setPaste(null); setF({ id: r.id, date: r.date, category: r.category, detail: r.detail, amount: String(r.amount), method: r.method, fixed: r.fixed }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>editar</button> · <button className="linkbtn" onClick={() => { if (confirm("¿Borrar este gasto?")) run(() => deleteExpense(r.id)); }}>borrar</button></td></tr>)}
          {caja.map(r => <tr key={r.id} style={{ color: "var(--muted)" }}><td>{dmy(r.date)}</td><td>Gastos de caja</td><td>{r.note || "Gasto de caja"}</td><td>{r.method}</td><td className="r">{fmt(r.amount)}</td><td className="r small">desde Caja</td></tr>)}
          {!rows.length && !caja.length && <tr><td colSpan={6} className="muted">Todavía no hay gastos este mes.</td></tr>}</tbody></table></div>
    </section>
    {toast.node}
  </div>;
}
