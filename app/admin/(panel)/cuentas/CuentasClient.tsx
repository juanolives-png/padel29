"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { accountAction, loadAccount, undoAccountMove } from "../../actions";
import { fmt } from "@/lib/time";

type Row = { id: string; name: string; phone: string; balance: number; last: string | null };
const KIND: Record<string, string> = { a_favor: "Vuelto que dejó a favor", uso_saldo: "Usó su saldo", deuda: "Se fue debiendo", pago_deuda: "Pagó deuda", carga: "Cargó saldo a favor", devolucion: "Se le devolvió saldo" };
const METHODS = ["Efectivo", "Transferencia", "QR Mercado Pago"];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const num = (s: string) => Number(String(s).replace(/\D/g, "")) || 0;

export default function CuentasClient({ rows }: { rows: Row[] }) {
  const router = useRouter(); const toast = useToast(); const [pending, start] = useTransition();
  const [qq, setQ] = useState(""); const [sel, setSel] = useState<string | null>(null); const [acc, setAcc] = useState<any>(null);
  const [f, setF] = useState({ kind: "pago_deuda" as "pago_deuda" | "carga" | "devolucion", amount: "", method: "Efectivo", note: "" });
  const [nw, setNw] = useState<{ name: string; phone: string } | null>(null);
  useEffect(() => { if (!sel) { setAcc(null); return; } loadAccount(sel).then(a => { setAcc(a); setF(x => ({ ...x, kind: a && a.balance < 0 ? "pago_deuda" : "carga", amount: a && a.balance < 0 ? String(-a.balance) : "" })); }); }, [sel]);
  const debe = rows.filter(r => r.balance < 0), favor = rows.filter(r => r.balance > 0);
  const list = useMemo(() => qq ? rows.filter(r => norm(r.name + " " + r.phone).includes(norm(qq))) : [...debe.sort((a, b) => a.balance - b.balance), ...favor.sort((a, b) => b.balance - a.balance)], [qq, rows, debe, favor]);
  const submit = () => start(async () => {
    const r = await accountAction({ playerId: sel || undefined, name: nw?.name, phone: nw?.phone, kind: f.kind, amount: num(f.amount), method: f.method, note: f.note });
    toast.show(r.msg, !r.ok); if (r.ok) { setNw(null); setSel(r.id); setAcc(await loadAccount(r.id)); setF({ ...f, amount: "", note: "" }); router.refresh(); }
  });
  const form = (bal: number) => <div className="card soft stack" style={{ gap: 10 }}>
    <div className="chips"><button className="chip" aria-pressed={f.kind === "pago_deuda"} onClick={() => setF({ ...f, kind: "pago_deuda", amount: bal < 0 ? String(-bal) : f.amount })}>Cobrar deuda</button>
      <button className="chip" aria-pressed={f.kind === "carga"} onClick={() => setF({ ...f, kind: "carga" })}>Cargar a favor</button>
      {bal > 0 && <button className="chip" aria-pressed={f.kind === "devolucion"} onClick={() => setF({ ...f, kind: "devolucion", amount: String(bal) })}>Devolver saldo</button>}</div>
    <div className="grid2" style={{ gap: 8 }}><input className="input" inputMode="numeric" placeholder="$ Importe" aria-label="Importe" value={f.amount ? fmt(num(f.amount)) : ""} onChange={e => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} />
      <select className="input" value={f.method} onChange={e => setF({ ...f, method: e.target.value })} aria-label="Medio">{METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
    <input className="input" placeholder="Nota (opcional)" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} aria-label="Nota" />
    <button className="btn" disabled={pending || !num(f.amount)} onClick={submit}>{f.kind === "pago_deuda" ? `Cobrar ${f.amount ? fmt(num(f.amount)) : ""}` : f.kind === "carga" ? `Cargar ${f.amount ? fmt(num(f.amount)) : ""} a favor` : `Devolver ${f.amount ? fmt(num(f.amount)) : ""}`}</button>
    <p className="small muted" style={{ margin: 0 }}>Entra (o sale) de la caja del día con el medio que elijas.</p>
  </div>;

  return <div className="stack" style={{ gap: 16 }}>
    <div className="grid3">
      <div className="card kpi"><div className="l">Te deben</div><div className="v" style={{ color: "var(--bad)" }}>{fmt(Math.abs(debe.reduce((s, r) => s + r.balance, 0)))}</div><div className="small muted">{debe.length} jugador{debe.length === 1 ? "" : "es"}</div></div>
      <div className="card kpi"><div className="l">Saldo a favor de jugadores</div><div className="v" style={{ color: "var(--ok)" }}>{fmt(favor.reduce((s, r) => s + r.balance, 0))}</div><div className="small muted">{favor.length} jugador{favor.length === 1 ? "" : "es"}</div></div>
      <button className="card kpi" style={{ textAlign: "left" }} onClick={() => { setSel(null); setNw({ name: "", phone: "" }); setF({ ...f, kind: "carga" }); }}><div className="l">Nueva cuenta</div><div className="v" style={{ fontSize: 24 }}>+ Cargar</div><div className="small muted">Saldo a favor o deuda de alguien nuevo</div></button>
    </div>
    <div className="grid2" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.1fr)", alignItems: "start" }}>
      <div className="card stack" style={{ gap: 10 }}>
        <input className="input" type="search" placeholder="Buscar jugador por nombre o celular" value={qq} onChange={e => setQ(e.target.value)} style={{ borderRadius: 999 }} aria-label="Buscar jugador" />
        {!qq && !list.length && <p className="muted small" style={{ margin: 0 }}>Nadie debe ni tiene saldo a favor. Buscá un jugador para ver su cuenta.</p>}
        <div className="stack" style={{ gap: 6 }}>{list.slice(0, 60).map(r => <button key={r.id} className={"acrow" + (sel === r.id ? " on" : "")} onClick={() => { setNw(null); setSel(r.id); }}>
          <span><b>{r.name || "Sin nombre"}</b><small>{r.phone}</small></span>
          {r.balance === 0 ? <span className="muted small">Al día</span> : <b className={r.balance > 0 ? "bal-pos" : "bal-neg"}>{r.balance > 0 ? `${fmt(r.balance)} a favor` : `debe ${fmt(-r.balance)}`}</b>}</button>)}</div>
      </div>
      <div className="stack" style={{ gap: 12 }}>
        {nw && <div className="card stack" style={{ gap: 10 }}><h3 style={{ margin: 0 }}>Nueva cuenta</h3>
          <div className="grid2" style={{ gap: 8 }}><input className="input" placeholder="Nombre" value={nw.name} onChange={e => setNw({ ...nw, name: e.target.value })} aria-label="Nombre" /><input className="input" placeholder="Celular" inputMode="tel" value={nw.phone} onChange={e => setNw({ ...nw, phone: e.target.value })} aria-label="Celular" /></div>
          {form(0)}</div>}
        {!nw && !acc && <div className="card soft"><p className="muted" style={{ margin: 0 }}>Elegí un jugador para ver sus movimientos.</p></div>}
        {!nw && acc && <div className="card stack" style={{ gap: 12 }}>
          <div className="between"><div><h3 style={{ margin: 0 }}>{acc.player.name}</h3><span className="small muted">{acc.player.phone}</span></div>
            <div className={"accbal " + (acc.balance > 0 ? "bal-pos" : acc.balance < 0 ? "bal-neg" : "")}><span>{acc.balance > 0 ? "A favor" : acc.balance < 0 ? "Debe" : "Saldo"}</span><b>{fmt(Math.abs(acc.balance))}</b></div></div>
          {form(acc.balance)}
          <div className="lbl">Movimientos</div>
          {acc.moves.length ? <div className="stack" style={{ gap: 6 }}>{acc.moves.map((m: any) => <div key={m.id} className="mvrow">
            <span>{new Date(m.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })}</span>
            <span>{KIND[m.kind] || m.kind}<small>{[m.court ? `${m.court} ${m.start}` : "", m.method, m.note].filter(Boolean).join(" · ")}</small></span>
            <b className={m.amount < 0 ? "neg" : ""}>{m.amount < 0 ? "−" : "+"}{fmt(Math.abs(m.amount))}</b>
            {!(m.booking_id && (m.kind === "deuda" || m.kind === "uso_saldo")) ? <button className="linkbtn" onClick={() => start(async () => { const r = await undoAccountMove(m.id); toast.show(r.msg, !r.ok); setAcc(await loadAccount(acc.player.id)); router.refresh(); })}>anular</button> : <span />}
          </div>)}</div> : <p className="muted small" style={{ margin: 0 }}>Sin movimientos.</p>}
        </div>}
      </div>
    </div>
    {toast.node}
  </div>;
}
