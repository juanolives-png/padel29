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
const PASSK: Record<string, string> = { normal: "1 pase", especial: "medio pase · horario especial", anticipada: "medio pase · reserva anticipada", invitado: "pase de invitado" };

export default function BookingDrawer({ id, products, senaDefault, onClose, toast }: { id: string; products: P[]; senaDefault: number; onClose: () => void; toast: (m: string, bad?: boolean) => void }) {
  const router = useRouter(); const [d, setD] = useState<any>(null); const [method, setMethod] = useState("Efectivo");
  const [target, setTarget] = useState<number[]>([]); const [phones, setPhones] = useState<Record<number, string>>({}); const [confirmCancel, setConfirmCancel] = useState(false); const [showWa, setShowWa] = useState(false);
  const [pending, start] = useTransition();
  const reload = useCallback(async () => { const r = await loadBooking(id); setD(r); }, [id]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const run = (fn: () => Promise<{ ok: boolean; msg: string }>) => start(async () => { const r = await fn(); toast(r.msg, !r.ok); await reload(); router.refresh(); });
  if (!d) return <div className="overlay right" onClick={onClose}><aside className="drawer"><p className="muted">Cargando…</p></aside></div>;
  const b = d.booking, a = d.acct, n = d.players.length;
  const subFor = (pid: string | null) => d.subs.find((s: any) => s.player_id === pid);
  const waTxt = `Cuenta del turno · ${b.court_name} ${dayLabel(b.date)} ${b.start}\n` + d.players.map((p: any, i: number) => `• ${p.name}: ${a.due[i] > 0 ? "debe " + fmt(a.due[i]) : "al día"}`).join("\n") + "\nCada uno puede pagar su parte en el club o por transferencia.";
  return (
    <div className="overlay right" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Cuenta del turno">
        <div className="between" style={{ alignItems: "start" }}>
          <div><h2 style={{ fontSize: 30 }}>{b.court_name} · {b.start}</h2>
            <p className="muted small" style={{ margin: "6px 0 0" }}>{dayLabel(b.date)} · {KIND[b.court_kind]} · {SRC[b.source] || b.source} · reservó {b.holder_name}{b.holder_phone ? ` (${b.holder_phone})` : ""}{a.settled ? " · " : ""}{a.settled && <span className="pill ok">Cuenta cerrada</span>}</p></div>
          <button className="xbtn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="sum3"><div><div className="l">Total</div><div className="v">{fmt(a.total)}</div></div><div><div className="l">Cobrado</div><div className="v">{fmt(a.cobrado)}</div></div><div className="falta"><div className="l">Falta</div><div className="v">{fmt(a.falta)}</div></div></div>
        {a.passCover > 0 && <p className="note" style={{ margin: 0 }}>{fmt(a.passCover)} de cancha cubiertos con pases de 29club (ya cobrados al vender el plan).</p>}
        <div className="row"><span className="lbl">Medio de pago</span><div className="chips">{METHODS.map(m => <button key={m} className="chip" aria-pressed={m === method} onClick={() => setMethod(m)}>{m === "QR Mercado Pago" ? "QR MP" : m}</button>)}</div></div>
        <div className="card soft row" style={{ padding: 12, justifyContent: "space-between" }}>
          {b.sena_paid > 0 ? <span className="small">Seña <b>{fmt(b.sena_paid)}</b> de {d.players[0]?.name}. Se descuenta:</span> : <span className="small">Sin seña.</span>}
          {b.sena_paid > 0 ? <div className="chips"><button className="chip" aria-pressed={b.sena_mode === "total"} onClick={() => run(() => setSena(id, b.sena_paid, "total"))}>de la cancha, entre todos</button><button className="chip" aria-pressed={b.sena_mode === "reserva"} onClick={() => run(() => setSena(id, b.sena_paid, "reserva"))}>a favor de {d.players[0]?.name}</button></div>
            : <button className="btn sm ghost" onClick={() => run(() => setSena(id, senaDefault, "total"))}>Registrar seña de {fmt(senaDefault)}</button>}
        </div>
        <div className="players">{d.players.map((p: any, i: number) => {
          const due = a.due[i], sub = subFor(p.player_id);
          const pf = sub && !(p.pass_used > 0) ? passFor({ passesLeft: sub.passes_left, specialLeft: sub.special_left, earlyLeft: sub.early_left, inviteLeft: sub.invite_left, expiresAt: sub.expires_at, plan: { earlyUses: sub.early_uses, canTransfer: sub.can_transfer } }, b.date, b.start, b.booked_on) : null;
          const others = d.players.filter((x: any, j: number) => j !== i && !(x.pass_used > 0));
          return <div key={p.idx} className={"pcard" + (due <= 0 ? " ok" : "")}>
            <input className="pname" defaultValue={p.name} aria-label={`Nombre del jugador ${i + 1}`} onBlur={e => { if (e.target.value !== p.name) run(() => renamePlayer(id, p.idx, e.target.value)); }} />
            {!p.player_id ? <form className="row" style={{ gap: 6 }} onSubmit={e => { e.preventDefault(); run(() => linkPlayer(id, p.idx, phones[p.idx] || "", p.name.startsWith("Jugador") ? undefined : p.name)); }}>
              <input className="input" style={{ flex: 1, padding: "6px 8px", fontSize: 13 }} placeholder="Celular (socio 29club)" inputMode="tel" aria-label={`Celular de ${p.name}`} value={phones[p.idx] || ""} onChange={e => setPhones({ ...phones, [p.idx]: e.target.value })} />
              <button className="btn sm ghost" style={{ padding: "6px 10px" }}>Vincular</button></form> : <span className="small muted">📱 {p.phone}</span>}
            {sub && <div className="sub29"><span className={"pill " + String(sub.plan_name).toLowerCase()}>{sub.plan_name}</span><span>{Number(sub.passes_left).toLocaleString("es-AR")} pases</span>
              {p.pass_used > 0 ? null : pf ? <button className="btn sm dark" style={{ padding: "5px 9px" }} onClick={() => run(() => applyPass(id, p.idx, sub.id))}>Usar {pf.amount === 0.5 ? "medio pase" : "pase"}</button> : <span className="muted">sin pases</span>}
              {sub.invite_left > 0 && sub.passes_left >= 1 && others.length > 0 && <select className="input" style={{ padding: "4px 6px", fontSize: 12, width: "auto" }} value="" aria-label="Pagar la parte de otro jugador con pase de invitado" onChange={e => { if (e.target.value !== "") run(() => applyPass(id, p.idx, sub.id, Number(e.target.value))); }}>
                <option value="">Invitar a…</option>{others.map((o: any) => <option key={o.idx} value={o.idx}>{o.name}</option>)}</select>}</div>}
            {p.pass_used > 0 && <div className="row small" style={{ gap: 6 }}><span className="pill acc">{PASSK[p.pass_kind] || "pase"}</span><button className="btn sm ghost" style={{ padding: "3px 8px" }} onClick={() => run(() => undoPass(id, p.idx))}>Deshacer</button></div>}
            <div className="det">{a.det[i].map(([l, v]: [string, number], k: number) => <span key={k}><span>{l}</span><span>{fmt(v)}</span></span>)}{a.paid[i] > 0 && <span><span>Pagó</span><span>−{fmt(a.paid[i])}</span></span>}</div>
            {due > 0 ? <><div className="due">{fmt(due)}<small>debe</small></div><button className="btn sm" onClick={() => run(() => payPlayer(id, p.idx, method))} disabled={pending}>Cobrar {fmt(due)}</button></>
              : <div className="due okc">{due < 0 ? "A favor " + fmt(-due) : "Al día ✓"}</div>}
          </div>; })}</div>
        {a.falta > 0 && <button className="btn ghost block" onClick={() => run(() => payAll(id, method))} disabled={pending}>Cobrar todo lo que falta ({fmt(a.falta)})</button>}
        <div className="lbl">Cargar consumo a</div>
        <div className="chips"><button className="chip" aria-pressed={!target.length} onClick={() => setTarget([])}>Todos</button>{d.players.map((p: any) => <button key={p.idx} className="chip" aria-pressed={target.includes(p.idx)} onClick={() => { const t = target.includes(p.idx) ? target.filter(x => x !== p.idx) : [...target, p.idx].sort(); setTarget(t.length === n ? [] : t); }}>{p.name}</button>)}</div>
        <p className="small muted" style={{ margin: "-6px 0 0" }}>{target.length > 1 ? `Se divide en partes iguales entre ${target.length}.` : target.length === 1 ? `Lo paga solo ${d.players.find((p: any) => p.idx === target[0])?.name}.` : `Se divide en partes iguales entre los ${n}.`}</p>
        <ProductPicker products={products} onAdd={pr => run(() => addConsumption(id, pr.id, 1, target.length ? target : d.players.map((p: any) => p.idx)))} />
        {d.lines.length > 0 && <><div className="lbl">Consumos cargados</div><div className="stack" style={{ gap: 6 }}>{d.lines.map((l: any) => {
          const who = l.player_idx.length === n ? "Todos, partes iguales" : l.player_idx.map((x: number) => d.players.find((p: any) => p.idx === x)?.name).join(", ") + (l.player_idx.length > 1 ? " · partes iguales" : "");
          return <div key={l.id} className="line2"><span className="em" aria-hidden>{l.emoji}</span><span>{l.name}{l.qty > 1 ? ` x${l.qty}` : ""}<small>{who}</small></span><span className="amt">{fmt(l.unit_price * l.qty)}</span><button aria-label="Quitar uno" onClick={() => run(() => removeConsumption(l.id))}>−</button></div>; })}</div></>}
        {(b.sena_paid > 0 || d.payments.length > 0) && <><div className="lbl">Movimientos</div><div className="moves">
          {b.sena_paid > 0 && <span><b>Seña {fmt(b.sena_paid)}</b> · {d.players[0]?.name}</span>}
          {d.payments.map((p: any) => <span key={p.id} className="between"><span>{new Date(p.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })} · <b>{d.players.find((x: any) => x.idx === p.player_idx)?.name} pagó {fmt(p.amount)}</b> · {p.method}</span><button className="btn sm ghost" style={{ padding: "2px 8px" }} onClick={() => run(() => undoPayment(p.id))}>Anular</button></span>)}
        </div></>}
        <button className="btn ghost" onClick={() => setShowWa(!showWa)}>{showWa ? "Ocultar mensaje" : "Mensaje con la cuenta para el grupo"}</button>
        {showWa && <div className="wa-bubble"><div className="m">{waTxt}</div><button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => { navigator.clipboard?.writeText(waTxt).then(() => toast("Copiado"), () => toast("No se pudo copiar", true)); }}>Copiar</button></div>}
        {confirmCancel ? <div className="card soft stack" style={{ gap: 8 }}><b>¿Cancelar este turno?</b><span className="small muted">Si faltan menos de 12 h, los pases de 29club usados se pierden.</span>
          <div className="row"><button className="btn danger sm" onClick={() => start(async () => { const r = await cancelBooking(id); toast(r.msg, !r.ok); router.refresh(); onClose(); })}>Sí, cancelar turno</button><button className="btn ghost sm" onClick={() => setConfirmCancel(false)}>No</button></div></div>
          : <button className="btn danger" onClick={() => setConfirmCancel(true)}>Cancelar turno</button>}
      </aside>
    </div>
  );
}
