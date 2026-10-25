"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import ToAccountModal from "@/components/ToAccountModal";
import { addCashMove, closeDay, removeCashMove, reopenDay, setOpening } from "../../actions";
import { fmt } from "@/lib/time";

const METHODS = ["Efectivo", "Transferencia", "QR Mercado Pago"];
const SHORT: Record<string, string> = { Efectivo: "Efectivo", Transferencia: "Transferencia", "QR Mercado Pago": "QR Mercado Pago" };
const ICON: Record<string, string> = { Efectivo: "💵", Transferencia: "🏦", "QR Mercado Pago": "📱" };
const CONCEPT: Record<string, [string, string]> = { mesa: ["Mesa bar", "🍺"], compra: ["Compra mercadería", "📦"], cuenta: ["Cuenta corriente", "👛"], turno: ["Turno", "🎾"], bar: ["Bar", "🥤"], plan: ["29club", "⭐"], sena: ["Seña", "📌"], ingreso: ["Ingreso", "➕"], gasto: ["Gasto", "🧾"], retiro: ["Retiro", "↩️"] };
const BILLS = [20000, 10000, 2000, 1000, 500, 200, 100];
const hm = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" });
const num = (s: string) => Number(String(s).replace(/\D/g, "")) || 0;

export default function CajaClient({ date, label, clubName, d, closes }: { date: string; label: string; clubName: string; d: any; closes: any[] }) {
  const router = useRouter(); const toast = useToast(); const [pending, start] = useTransition();
  const t = d.totals, c = d.close;
  const [counted, setCounted] = useState<string>(""); const [bills, setBills] = useState<Record<number, string>>({}); const [useBills, setUseBills] = useState(false);
  const [left, setLeft] = useState<string>(String(d.opening || "")); const [checks, setChecks] = useState<Record<string, boolean>>({}); const [note, setNote] = useState("");
  const [mv, setMv] = useState<{ kind: string; amount: string; method: string; note: string } | null>(null);
  const [toAcc, setToAcc] = useState<null | "only" | "close">(null);
  const [editOpen, setEditOpen] = useState<string | null>(null); const [filter, setFilter] = useState("all");
  const billsTotal = BILLS.reduce((s, b) => s + b * num(bills[b] || ""), 0);
  const cnt = useBills ? billsTotal : num(counted);
  const hasCount = useBills ? Object.values(bills).some(v => v !== "") : counted !== "";
  const diff = cnt - d.expected;
  const leftN = left === "" ? 0 : num(left);
  const net = (m: string) => t.byMethod[m].in - t.byMethod[m].out;
  const run = (fn: () => Promise<{ ok: boolean; msg: string }>, after?: () => void) => start(async () => { const r = await fn(); toast.show(r.msg, !r.ok); if (r.ok) { after?.(); router.refresh(); } });
  const list = useMemo(() => filter === "all" ? d.list : d.list.filter((m: any) => m.method === filter), [d.list, filter]);
  const cashOutMoves = d.list.filter((m: any) => m.sign < 0 && m.method === "Efectivo");

  const resumen = () => [`*Caja ${clubName} · ${label} ${date.slice(8)}/${date.slice(5, 7)}*`, "",
    ...METHODS.map(m => `${ICON[m]} ${SHORT[m]}: ${fmt(net(m))}`), `*Total: ${fmt(t.in - t.out)}*`, "",
    ...Object.entries(t.byConcept).map(([k, v]) => `• ${CONCEPT[k]?.[0] || k}: ${["gasto", "retiro", "compra"].includes(k) ? "−" : ""}${fmt(v as number)}`),
    ...(c ? ["", `Efectivo esperado ${fmt(c.expected)} · contado ${fmt(c.counted)} · ${c.diff === 0 ? "cuadra ✓" : c.diff < 0 ? "falta " + fmt(-c.diff) : "sobra " + fmt(c.diff)}`, `Queda en caja ${fmt(c.left_in_box)} · se retira ${fmt(c.counted - c.left_in_box)}`] : []),
    ...(d.pending.length ? ["", `Pendiente de cobro: ${fmt(d.pending.reduce((s: number, p: any) => s + p.falta, 0))}`] : [])].join("\n");

  return <div className="stack" style={{ gap: 18 }}>
    {/* totales por medio de pago */}
    <div className="caja-top">
      {METHODS.map(m => <div key={m} className="card mcard"><div className="mh"><span aria-hidden>{ICON[m]}</span>{SHORT[m]}</div><div className="mv">{fmt(net(m))}</div>
        <div className="small muted">{t.byMethod[m].in ? `Entró ${fmt(t.byMethod[m].in)}` : "Sin cobros"}{t.byMethod[m].out ? ` · salió ${fmt(t.byMethod[m].out)}` : ""}</div></div>)}
      <div className="card dark mcard"><div className="mh" style={{ color: "rgba(255,255,255,.7)" }}>Total del día</div><div className="mv" style={{ color: "var(--acc)" }}>{fmt(t.in - t.out)}</div>
        <div className="small" style={{ opacity: .7 }}>{d.list.filter((m: any) => m.sign > 0).length} cobros{t.out ? ` · ${fmt(t.out)} en gastos y retiros` : ""}</div></div>
    </div>

    {d.pending.length > 0 && <div className="alert warn"><b>Quedan {fmt(d.pending.reduce((s: number, p: any) => s + p.falta, 0))} sin cobrar</b> en {d.pending.length} turno{d.pending.length > 1 ? "s" : ""}: {d.pending.map((p: any) => `${p.start} ${p.holder} (${fmt(p.falta)})`).join(" · ")}. <div className="row" style={{ gap: 8, marginTop: 8 }}><a className="btn sm ghost" href={`/admin?d=${date}`}>Cobrar en la agenda</a>{!c && <button className="btn sm dark" onClick={() => setToAcc("only")}>📝 Pasar todo a cuenta corriente</button>}</div></div>}
    {c && d.changed && <div className="alert bad"><b>Hubo movimientos después del cierre.</b> Los números de arriba ya no coinciden con lo que se cerró. Reabrí la caja y volvé a cerrarla.</div>}

    <div className="caja-grid">
      {/* arqueo */}
      <section className="card stack arqueo" style={{ gap: 14 }} aria-label="Arqueo de efectivo">
        <div className="between"><h3 style={{ margin: 0 }}>💵 Arqueo de efectivo</h3>{c ? <span className="pill ok" style={{ fontSize: 13, padding: "4px 12px" }}>Cerrada {hm(c.closed_at)}</span> : <span className="pill warn" style={{ fontSize: 13, padding: "4px 12px" }}>Abierta</span>}</div>
        <div className="calc">
          <div><span>Fondo inicial <small>{d.openingFrom}</small></span>
            {editOpen !== null ? <form className="row" style={{ gap: 6, flexWrap: "nowrap" }} onSubmit={e => { e.preventDefault(); run(() => setOpening(date, num(editOpen)), () => setEditOpen(null)); }}><input autoFocus className="input" inputMode="numeric" style={{ width: 120, padding: "6px 8px" }} value={editOpen} onChange={e => setEditOpen(e.target.value)} aria-label="Fondo inicial" /><button className="btn sm">OK</button></form>
              : <b>{fmt(d.opening)} {!c && <button className="linkbtn" onClick={() => setEditOpen(String(d.opening))}>cambiar</button>}</b>}</div>
          <div><span>+ Cobros en efectivo</span><b>{fmt(t.cashIn)}</b></div>
          <div><span>− Gastos y retiros en efectivo</span><b>{fmt(t.cashOut)}</b></div>
          <div className="eq"><span>Debería haber en caja</span><b>{fmt(d.expected)}</b></div>
        </div>

        {c ? <div className="stack" style={{ gap: 10 }}>
          <div className={"diffbox " + (c.diff === 0 ? "ok" : c.diff < 0 ? "bad" : "warn")}><span>Contado {fmt(c.counted)}</span><b>{c.diff === 0 ? "Cuadra ✓" : c.diff < 0 ? `Faltan ${fmt(-c.diff)}` : `Sobran ${fmt(c.diff)}`}</b></div>
          <div className="calc"><div><span>Quedó en caja para mañana</span><b>{fmt(c.left_in_box)}</b></div><div><span>Se retiró</span><b>{fmt(c.counted - c.left_in_box)}</b></div></div>
          {Object.keys(c.checks || {}).length > 0 && <p className="small muted" style={{ margin: 0 }}>{Object.entries(c.checks).filter(([, v]) => v).map(([k]) => `${SHORT[k]} controlado ✓`).join(" · ")}</p>}
          {c.note && <p className="note" style={{ margin: 0 }}>{c.note}</p>}
          <div className="row"><button className="btn dark" onClick={() => { navigator.clipboard?.writeText(resumen()).then(() => toast.show("Resumen copiado"), () => toast.show("No se pudo copiar", true)); }}>Copiar resumen para WhatsApp</button>
            <button className="btn ghost" disabled={pending} onClick={() => run(() => reopenDay(date))}>Reabrir caja</button></div>
        </div> : <>
          <div className="stack" style={{ gap: 8 }}>
            <div className="between"><label className="lbl" htmlFor="cnt">¿Cuánto efectivo hay en la caja?</label><button className="linkbtn" onClick={() => setUseBills(!useBills)}>{useBills ? "Poner el total" : "Contar billetes"}</button></div>
            {useBills ? <div className="bills">{BILLS.map(b => <label key={b} className="bill"><span>{fmt(b)}</span><input inputMode="numeric" placeholder="0" value={bills[b] || ""} onChange={e => setBills({ ...bills, [b]: e.target.value.replace(/\D/g, "") })} aria-label={`Billetes de ${fmt(b)}`} /><small>{num(bills[b] || "") ? fmt(b * num(bills[b])) : ""}</small></label>)}
              <div className="bill tot"><span>Total contado</span><b>{fmt(billsTotal)}</b></div></div>
              : <input id="cnt" className="input big-in" inputMode="numeric" placeholder="$ 0" value={counted ? fmt(num(counted)) : ""} onChange={e => setCounted(e.target.value.replace(/\D/g, ""))} />}
          </div>
          {hasCount && <div className={"diffbox " + (diff === 0 ? "ok" : diff < 0 ? "bad" : "warn")}><span>{diff === 0 ? "Coincide con lo esperado" : diff < 0 ? "Hay menos de lo esperado" : "Hay más de lo esperado"}</span><b>{diff === 0 ? "Cuadra ✓" : diff < 0 ? `Faltan ${fmt(-diff)}` : `Sobran ${fmt(diff)}`}</b></div>}
          <div className="grid2" style={{ gap: 10 }}>
            <div className="field"><label htmlFor="left">Dejo en caja para mañana</label><input id="left" className="input" inputMode="numeric" value={left === "" ? "" : fmt(num(left))} onChange={e => setLeft(e.target.value.replace(/\D/g, ""))} placeholder="$ 0" /></div>
            <div className="field"><label>Se retira</label><div className="input" style={{ background: "var(--soft)", fontWeight: 800 }}>{hasCount ? fmt(Math.max(0, cnt - leftN)) : "—"}</div></div>
          </div>
          {METHODS.filter(m => m !== "Efectivo" && t.byMethod[m].in > 0).map(m => <label key={m} className="checkrow"><input type="checkbox" checked={!!checks[m]} onChange={e => setChecks({ ...checks, [m]: e.target.checked })} />
            <span>Controlé {m === "Transferencia" ? "las transferencias en el banco" : "los cobros en Mercado Pago"}: <b>{fmt(t.byMethod[m].in)}</b></span></label>)}
          <div className="field"><label htmlFor="nt">Nota (opcional)</label><input id="nt" className="input" value={note} onChange={e => setNote(e.target.value)} placeholder={diff < 0 ? "¿Por qué falta? Ej: vuelto mal dado" : "Ej: cerró Juan"} /></div>
          <button className="btn block" style={{ padding: 16, fontSize: 16 }} disabled={pending || !hasCount || leftN > cnt}
            onClick={() => d.pending.length ? setToAcc("close") : run(() => closeDay({ date, counted: cnt, leftInBox: leftN, checks, note }))}>{leftN > cnt ? "Lo que dejás no puede superar lo contado" : d.pending.length ? `Pasar deudas a cuenta corriente y cerrar` : `Cerrar caja de ${label.toLowerCase()}`}</button>
          {d.pending.length > 0 && <p className="small muted" style={{ margin: 0 }}>Hay {fmt(d.pending.reduce((s: number, p: any) => s + p.falta, 0))} sin cobrar: al cerrar, esas deudas pasan a la cuenta corriente de cada jugador.</p>}
        </>}
      </section>

      {/* resumen y gastos */}
      <div className="stack" style={{ gap: 18 }}>
        <section className="card" aria-label="Por concepto"><h3>Por concepto</h3>
          {Object.keys(t.byConcept).length ? <div className="concepts">{Object.entries(t.byConcept).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k, v]) => { const out = ["gasto", "retiro", "compra"].includes(k);
            return <div key={k}><span><span aria-hidden>{CONCEPT[k]?.[1]}</span> {CONCEPT[k]?.[0] || k}</span><b style={{ color: out || (v as number) < 0 ? "var(--bad)" : undefined }}>{out || (v as number) < 0 ? "−" : ""}{fmt(Math.abs(v as number))}</b></div>; })}</div>
            : <p className="muted small" style={{ margin: 0 }}>Todavía no hay movimientos.</p>}
        </section>
        <section className="card stack" style={{ gap: 12 }} aria-label="Gastos y retiros">
          <h3 style={{ margin: 0 }}>Gastos, retiros y otros ingresos</h3>
          {!c && !mv && <div className="row" style={{ gap: 8 }}>
            <button className="btn sm ghost" onClick={() => setMv({ kind: "gasto", amount: "", method: "Efectivo", note: "" })}>🧾 + Gasto</button>
            <button className="btn sm ghost" onClick={() => setMv({ kind: "retiro", amount: "", method: "Efectivo", note: "" })}>↩️ + Retiro</button>
            <button className="btn sm ghost" onClick={() => setMv({ kind: "ingreso", amount: "", method: "Efectivo", note: "" })}>➕ + Ingreso</button></div>}
          {mv && <form className="card soft stack" style={{ gap: 10, padding: 14 }} onSubmit={e => { e.preventDefault(); run(() => addCashMove({ date, kind: mv.kind, amount: num(mv.amount), method: mv.method, note: mv.note }), () => setMv(null)); }}>
            <b>{mv.kind === "gasto" ? "Nuevo gasto" : mv.kind === "retiro" ? "Nuevo retiro" : "Nuevo ingreso"}</b>
            <div className="grid2" style={{ gap: 8 }}><input autoFocus className="input" inputMode="numeric" placeholder="$ Importe" aria-label="Importe" value={mv.amount ? fmt(num(mv.amount)) : ""} onChange={e => setMv({ ...mv, amount: e.target.value.replace(/\D/g, "") })} />
              <select className="input" value={mv.method} onChange={e => setMv({ ...mv, method: e.target.value })} aria-label="Medio">{METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
            <input className="input" placeholder={mv.kind === "gasto" ? "Detalle (ej: hielo, proveedor de bebidas)" : mv.kind === "retiro" ? "Detalle (ej: retiro del dueño)" : "Detalle"} aria-label="Detalle" value={mv.note} onChange={e => setMv({ ...mv, note: e.target.value })} />
            <div className="row"><button className="btn sm" disabled={pending}>Guardar</button><button type="button" className="btn sm ghost" onClick={() => setMv(null)}>Cancelar</button></div></form>}
          {d.list.filter((m: any) => m.removable).length ? <div className="stack" style={{ gap: 6 }}>{d.list.filter((m: any) => m.removable).map((m: any) => <div key={m.id} className="mvrow"><span>{hm(m.at)}</span><span>{CONCEPT[m.concept]?.[1]} {m.detail}<small>{SHORT[m.method]}</small></span><b className={m.sign < 0 ? "neg" : ""}>{m.sign < 0 ? "−" : "+"}{fmt(m.amount)}</b>{!c && <button className="linkbtn" onClick={() => run(() => removeCashMove(m.id))} aria-label="Borrar">borrar</button>}</div>)}</div>
            : <p className="muted small" style={{ margin: 0 }}>{cashOutMoves.length ? "" : "Sin gastos ni retiros."}</p>}
        </section>
      </div>
    </div>

    {/* movimientos */}
    <section className="card" aria-label="Movimientos del día">
      <div className="between"><h3 style={{ margin: 0 }}>Movimientos</h3><div className="chips"><button className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Todos ({d.list.length})</button>{METHODS.map(m => <button key={m} className="chip" aria-pressed={filter === m} onClick={() => setFilter(m)}>{m === "QR Mercado Pago" ? "QR MP" : m}</button>)}</div></div>
      <div className="scroll-x" style={{ marginTop: 10 }}><table className="tbl"><thead><tr><th>Hora</th><th>Concepto</th><th>Detalle</th><th>Medio</th><th className="r">Importe</th></tr></thead>
        <tbody>{list.length ? list.map((m: any) => <tr key={m.concept + m.id}><td>{hm(m.at)}</td><td><span className="pill">{CONCEPT[m.concept]?.[1]} {CONCEPT[m.concept]?.[0]}</span></td><td>{m.detail}</td><td>{m.method === "QR Mercado Pago" ? "QR MP" : m.method}</td><td className="r" style={{ fontWeight: 700, color: m.sign < 0 ? "var(--bad)" : undefined }}>{m.sign < 0 ? "−" : ""}{fmt(m.amount)}</td></tr>)
          : <tr><td colSpan={5} className="muted">Sin movimientos.</td></tr>}</tbody></table></div>
    </section>

    {closes.length > 0 && <section className="card" aria-label="Cierres anteriores"><h3>Cierres anteriores</h3>
      <div className="scroll-x"><table className="tbl"><thead><tr><th>Día</th><th className="r">Total</th><th className="r">Efectivo esperado</th><th className="r">Contado</th><th className="r">Diferencia</th><th className="r">Quedó en caja</th></tr></thead>
        <tbody>{closes.map(x => <tr key={x.id}><td><a href={`/admin/caja?d=${x.date}`}>{x.date.slice(8)}/{x.date.slice(5, 7)}</a></td><td className="r">{fmt(x.totals.in - x.totals.out)}</td><td className="r">{fmt(x.expected)}</td><td className="r">{fmt(x.counted)}</td>
          <td className="r">{x.diff === 0 ? <span className="pill ok">Cuadra</span> : <span className={"pill " + (x.diff < 0 ? "bad" : "warn")}>{x.diff < 0 ? "−" : "+"}{fmt(Math.abs(x.diff))}</span>}</td><td className="r">{fmt(x.left_in_box)}</td></tr>)}</tbody></table></div></section>}
    {toAcc && <ToAccountModal bookingIds={d.pending.map((p: any) => p.id)} toast={toast.show} title={toAcc === "close" ? "Antes de cerrar: deudas del día" : undefined} onClose={() => setToAcc(null)}
      onDone={() => { const closing = toAcc === "close"; setToAcc(null); if (closing) run(() => closeDay({ date, counted: cnt, leftInBox: leftN, checks, note })); else router.refresh(); }} />}
    {toast.node}
  </div>;
}
