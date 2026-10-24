"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ProductPicker, { type P } from "./ProductPicker";
import { addConsumption, cancelBooking, linkPlayer, loadBooking, payAll, payPlayer, removeConsumption, renamePlayer, setSena, undoPass, undoPayment, applyPass } from "@/app/admin/actions";
import { fmt, dayLabel } from "@/lib/time";
import { passFor } from "@/lib/club29";

const METHODS = ["Efectivo", "Transferencia", "QR Mercado Pago"];
const SRC: Record<string, string> = { app: "App", manual: "Manual", fijo: "Turno fijo", bot: "WhatsApp", torneo: "Torneo" };
const KIND: Record<string, string> = { techada: "techada", panoramica: "panorámica", aire: "al aire libre" };
const PASSK: Record<string, string> = { normal: "Pase 29club", especial: "½ pase · horario especial", anticipada: "½ pase · anticipada", invitado: "Pase de invitado" };

/** Cuenta del turno: ventana grande que deja visible el menú lateral */
export default function BookingDrawer({ id, products, senaDefault, onClose, toast }: { id: string; products: P[]; senaDefault: number; onClose: () => void; toast: (m: string, bad?: boolean) => void }) {
  const router = useRouter(); const [d, setD] = useState<any>(null); const [method, setMethod] = useState("Efectivo");
  const [target, setTarget] = useState<number[]>([]); const [phones, setPhones] = useState<Record<number, string>>({}); const [linking, setLinking] = useState<number | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false); const [showWa, setShowWa] = useState(false);
  const [pending, start] = useTransition();
  const reload = useCallback(async () => { const r = await loadBooking(id); setD(r); }, [id]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const run = (fn: () => Promise<{ ok: boolean; msg: string }>) => start(async () => { const r = await fn(); toast(r.msg, !r.ok); await reload(); router.refresh(); });
  const shell = (body: React.ReactNode) => <div className="overlay sheet" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="sheet-box" role="dialog" aria-modal="true" aria-label="Cuenta del turno">{body}</div></div>;
  if (!d) return shell(<p className="muted" style={{ padding: 24 }}>Cargando…</p>);
  const b = d.booking, a = d.acct, n = d.players.length;
  const subFor = (pid: string | null) => d.subs.find((s: any) => s.player_id === pid);
  const waTxt = `Cuenta del turno · ${b.court_name} ${dayLabel(b.date)} ${b.start}\n` + d.players.map((p: any, i: number) => `• ${p.name}: ${a.due[i] > 0 ? "debe " + fmt(a.due[i]) : "al día"}`).join("\n") + "\nCada uno puede pagar su parte en el club o por transferencia.";
  const forTxt = target.length === 0 ? `entre los ${n}` : target.length === 1 ? `solo ${d.players.find((p: any) => p.idx === target[0])?.name}` : `entre ${target.length}`;

  return shell(<>
    <header className="sheet-head">
      <div style={{ minWidth: 0 }}>
        <h2>{b.court_name} · {b.start}</h2>
        <p>{dayLabel(b.date)} · {KIND[b.court_kind]} · {SRC[b.source] || b.source} · reservó {b.holder_name}</p>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {a.settled && <span className="pill ok" style={{ fontSize: 13, padding: "5px 12px" }}>Cuenta cerrada ✓</span>}
        <button className="btn sm ghost" onClick={() => setShowWa(!showWa)}>💬 Mensaje</button>
        <button className="xbtn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
    </header>

    <div className="sheet-body">
      {/* columna cuenta */}
      <section className="sheet-col" aria-label="Cuenta">
        {showWa && <div className="wa-bubble"><div className="m">{waTxt}</div><button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => { navigator.clipboard?.writeText(waTxt).then(() => toast("Copiado"), () => toast("No se pudo copiar", true)); }}>Copiar</button></div>}
        <div className="bigsum">
          <div><span>Total</span><b>{fmt(a.total)}</b></div>
          <div><span>Cobrado</span><b>{fmt(a.cobrado)}</b></div>
          <div className={"falta" + (a.falta <= 0 ? " zero" : "")}><span>Falta</span><b>{fmt(Math.max(0, a.falta))}</b></div>
        </div>

        <div className="row" style={{ gap: 8 }}><span className="lbl">Cobrar con</span><div className="chips">{METHODS.map(m => <button key={m} className="chip" aria-pressed={m === method} onClick={() => setMethod(m)}>{m === "QR Mercado Pago" ? "QR MP" : m}</button>)}</div></div>

        <div className="players">{d.players.map((p: any, i: number) => {
          const due = a.due[i], sub = subFor(p.player_id);
          const pf = sub && !(p.pass_used > 0) ? passFor({ passesLeft: sub.passes_left, specialLeft: sub.special_left, earlyLeft: sub.early_left, inviteLeft: sub.invite_left, expiresAt: sub.expires_at, plan: { earlyUses: sub.early_uses, canTransfer: sub.can_transfer } }, b.date, b.start, b.booked_on) : null;
          const others = d.players.filter((x: any, j: number) => j !== i && !(x.pass_used > 0));
          return <div key={p.idx} className={"pcard" + (due <= 0 ? " ok" : "")}>
            <div className="between" style={{ gap: 6, flexWrap: "nowrap" }}>
              <input className="pname" defaultValue={p.name} aria-label={`Nombre del jugador ${i + 1}`} onBlur={e => { if (e.target.value !== p.name) run(() => renamePlayer(id, p.idx, e.target.value)); }} />
              {sub && <span className={"pill " + String(sub.plan_name).toLowerCase()}>{sub.plan_name}</span>}
            </div>
            {due > 0 ? <div className="due">{fmt(due)}</div> : <div className="due okc">{due < 0 ? "A favor " + fmt(-due) : "Al día ✓"}</div>}
            <div className="det">{a.det[i].map(([l, v]: [string, number], k: number) => <span key={k}><span>{l}</span><span>{fmt(v)}</span></span>)}{a.paid[i] > 0 && <span><span>Pagó</span><span>−{fmt(a.paid[i])}</span></span>}</div>
            {p.pass_used > 0 && <div className="row small" style={{ gap: 6 }}><span className="pill acc">{PASSK[p.pass_kind] || "Pase"}</span><button className="linkbtn" onClick={() => run(() => undoPass(id, p.idx))}>deshacer</button></div>}
            {sub && !(p.pass_used > 0) && (pf ? <button className="btn sm dark" onClick={() => run(() => applyPass(id, p.idx, sub.id))}>Usar {pf.amount === 0.5 ? "½ pase" : "pase"} · le quedan {Number(sub.passes_left).toLocaleString("es-AR")}</button> : <span className="small muted">Sin pases disponibles</span>)}
            {sub && sub.invite_left > 0 && sub.passes_left >= 1 && others.length > 0 && <select className="input" style={{ padding: "6px 8px", fontSize: 13 }} value="" aria-label="Pagar la parte de otro jugador con pase de invitado" onChange={e => { if (e.target.value !== "") run(() => applyPass(id, p.idx, sub.id, Number(e.target.value))); }}>
              <option value="">Invitar con pase a…</option>{others.map((o: any) => <option key={o.idx} value={o.idx}>{o.name}</option>)}</select>}
            {!p.player_id && (linking === p.idx ? <form className="row" style={{ gap: 6, flexWrap: "nowrap" }} onSubmit={e => { e.preventDefault(); run(() => linkPlayer(id, p.idx, phones[p.idx] || "", p.name.startsWith("Jugador") ? undefined : p.name)); setLinking(null); }}>
              <input autoFocus className="input" style={{ padding: "6px 8px", fontSize: 13 }} placeholder="Celular" inputMode="tel" aria-label={`Celular de ${p.name}`} value={phones[p.idx] || ""} onChange={e => setPhones({ ...phones, [p.idx]: e.target.value })} />
              <button className="btn sm ghost" style={{ padding: "6px 10px" }}>OK</button></form>
              : <button className="linkbtn" onClick={() => setLinking(p.idx)}>+ vincular celular</button>)}
            {due > 0 && <button className="btn" onClick={() => run(() => payPlayer(id, p.idx, method))} disabled={pending}>Cobrar {fmt(due)}</button>}
          </div>; })}</div>

        {a.falta > 0 && <button className="btn dark block" style={{ padding: 16, fontSize: 16 }} onClick={() => run(() => payAll(id, method))} disabled={pending}>Cobrar todo · {fmt(a.falta)}</button>}

        <details className="more">
          <summary>Seña, movimientos y cancelación</summary>
          <div className="stack" style={{ gap: 12, marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              {b.sena_paid > 0 ? <><span className="small">Seña <b>{fmt(b.sena_paid)}</b> de {d.players[0]?.name}. Se descuenta:</span>
                <div className="chips"><button className="chip" aria-pressed={b.sena_mode === "total"} onClick={() => run(() => setSena(id, b.sena_paid, "total"))}>entre todos</button><button className="chip" aria-pressed={b.sena_mode === "reserva"} onClick={() => run(() => setSena(id, b.sena_paid, "reserva"))}>a {d.players[0]?.name}</button></div></>
                : <><span className="small muted">Sin seña.</span><button className="btn sm ghost" onClick={() => run(() => setSena(id, senaDefault, "total"))}>Registrar seña de {fmt(senaDefault)}</button></>}
            </div>
            {(b.sena_paid > 0 || d.payments.length > 0) && <div className="moves">
              {b.sena_paid > 0 && <span><b>Seña {fmt(b.sena_paid)}</b> · {d.players[0]?.name}</span>}
              {d.payments.map((p: any) => <span key={p.id} className="between"><span>{new Date(p.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })} · <b>{d.players.find((x: any) => x.idx === p.player_idx)?.name} pagó {fmt(p.amount)}</b> · {p.method}</span><button className="linkbtn" onClick={() => run(() => undoPayment(p.id))}>anular</button></span>)}
            </div>}
            {a.passCover > 0 && <p className="note" style={{ margin: 0 }}>{fmt(a.passCover)} de cancha cubiertos con pases de 29club.</p>}
            {confirmCancel ? <div className="row"><b className="small">¿Cancelar el turno? Con menos de 12 h se pierden los pases usados.</b><button className="btn danger sm" onClick={() => start(async () => { const r = await cancelBooking(id); toast(r.msg, !r.ok); router.refresh(); onClose(); })}>Sí, cancelar</button><button className="btn ghost sm" onClick={() => setConfirmCancel(false)}>No</button></div>
              : <button className="btn danger sm" style={{ justifySelf: "start" }} onClick={() => setConfirmCancel(true)}>Cancelar turno</button>}
          </div>
        </details>
      </section>

      {/* columna consumos */}
      <section className="sheet-col side2" aria-label="Consumos">
        <h3 style={{ margin: 0, fontSize: 22 }}>Consumos</h3>
        <div className="row" style={{ gap: 8 }}><span className="lbl">Para</span><div className="chips"><button className="chip" aria-pressed={!target.length} onClick={() => setTarget([])}>Todos</button>{d.players.map((p: any) => <button key={p.idx} className="chip" aria-pressed={target.includes(p.idx)} onClick={() => { const t = target.includes(p.idx) ? target.filter(x => x !== p.idx) : [...target, p.idx].sort(); setTarget(t.length === n ? [] : t); }}>{p.name}</button>)}</div></div>
        <p className="small muted" style={{ margin: "-8px 0 0" }}>Se divide {forTxt}.</p>
        <ProductPicker products={products} onAdd={pr => run(() => addConsumption(id, pr.id, 1, target.length ? target : d.players.map((p: any) => p.idx)))} />
        {d.lines.length > 0 && <div className="stack" style={{ gap: 6 }}><div className="lbl">Cargado</div>{d.lines.map((l: any) => {
          const who = l.player_idx.length === n ? "Todos" : l.player_idx.map((x: number) => d.players.find((p: any) => p.idx === x)?.name).join(", ");
          return <div key={l.id} className="line2"><span className="em" aria-hidden>{l.emoji}</span><span>{l.name}{l.qty > 1 ? ` x${l.qty}` : ""}<small>{who}</small></span><span className="amt">{fmt(l.unit_price * l.qty)}</span><button aria-label="Quitar uno" onClick={() => run(() => removeConsumption(l.id))}>−</button></div>; })}</div>}
      </section>
    </div>
  </>);
}
