"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ProductPicker, { type P } from "@/components/ProductPicker";
import { useToast } from "@/components/Toast";
import { chargeToBooking, counterSale, loadBooking } from "../../actions";
import { fmt } from "@/lib/time";

const METHODS: [string, string, string][] = [["Efectivo", "💵", "Efectivo"], ["Transferencia", "🏦", "Transferencia"], ["QR Mercado Pago", "📱", "QR MP"]];

/** Caja del bar: productos a la izquierda, la cuenta y el total grande a la derecha. */
export default function BarClient({ products, turnos }: { products: P[]; turnos: { id: string; label: string }[] }) {
  const router = useRouter(); const toast = useToast(); const [pending, start] = useTransition();
  const [ticket, setTicket] = useState<{ p: P; qty: number }[]>([]);
  const [mode, setMode] = useState<"cobrar" | "turno">("cobrar");
  const [to, setTo] = useState(turnos[0]?.id || ""); const [who, setWho] = useState<number[]>([]); const [players, setPlayers] = useState<{ idx: number; name: string }[]>([]);
  useEffect(() => { setWho([]); if (!to) { setPlayers([]); return; } loadBooking(to).then(d => setPlayers(d ? d.players.map((p: any) => ({ idx: p.idx, name: p.name })) : [])); }, [to]);
  const inCart = Object.fromEntries(ticket.map(t => [t.p.id, t.qty]));
  const add = (p: P, n: number) => {
    const cur = inCart[p.id] || 0;
    if (n > 0 && p.stock != null && p.stock - cur < n) { toast.show("No queda más " + p.name, true); return; }
    setTicket(cur ? ticket.map(t => t.p.id === p.id ? { ...t, qty: t.qty + n } : t).filter(t => t.qty > 0) : [...ticket, { p, qty: n }]);
  };
  const total = ticket.reduce((s, t) => s + t.p.price * t.qty, 0);
  const units = ticket.reduce((s, t) => s + t.qty, 0);
  const items = ticket.map(t => ({ productId: t.p.id, qty: t.qty }));
  const after = (r: { ok: boolean; msg: string }) => { toast.show(r.msg, !r.ok); if (r.ok) { setTicket([]); router.refresh(); } };
  const turnoName = turnos.find(t => t.id === to)?.label.split(" · ").slice(0, 2).join(" · ");
  const whoTxt = who.length === 0 ? "a la mesa" : who.length === 1 ? `a ${players.find(p => p.idx === who[0])?.name}` : `entre ${who.length}`;

  return <div className="pos-main">
    <section className="pos-prods card" aria-label="Productos"><ProductPicker products={products} onAdd={p => add(p, 1)} pos inCart={inCart} /></section>

    <aside className="pos-ticket" aria-label="Cuenta">
      <div className="pt-head"><h2>Cuenta</h2>{ticket.length > 0 && <button className="linkbtn" onClick={() => setTicket([])}>Vaciar</button>}</div>
      <div className="pt-lines">{ticket.length ? ticket.map(t => <div key={t.p.id} className="pt-line">
        <span className="em" aria-hidden>{t.p.emoji}</span>
        <span className="nm">{t.p.name}<small>{fmt(t.p.price)} c/u</small></span>
        <span className="qty"><button aria-label={`Uno menos de ${t.p.name}`} onClick={() => add(t.p, -1)}>−</button><b>{t.qty}</b><button aria-label={`Uno más de ${t.p.name}`} onClick={() => add(t.p, 1)}>+</button></span>
        <span className="amt">{fmt(t.p.price * t.qty)}</span></div>)
        : <div className="pt-empty"><span aria-hidden>🛒</span>Tocá los productos para sumarlos</div>}</div>

      <div className="pt-total"><span>{units ? `${units} producto${units > 1 ? "s" : ""}` : "Total"}</span><b>{fmt(total)}</b></div>

      <div className="seg" role="tablist" aria-label="Cómo se paga">
        <button role="tab" aria-selected={mode === "cobrar"} onClick={() => setMode("cobrar")}>Cobrar ahora</button>
        <button role="tab" aria-selected={mode === "turno"} onClick={() => setMode("turno")}>A la cuenta de un turno</button>
      </div>

      {mode === "cobrar" ? <div className="pay3">{METHODS.map(([m, ic, l]) =>
        <button key={m} className="btn" disabled={pending || !ticket.length} onClick={() => start(async () => after(await counterSale(items, m)))}><span aria-hidden style={{ fontSize: 22 }}>{ic}</span>{l}</button>)}</div>
        : turnos.length ? <div className="stack" style={{ gap: 10 }}>
          <select className="input" value={to} onChange={e => setTo(e.target.value)} aria-label="Turno de hoy">{turnos.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
          <div className="chips"><button className="chip" aria-pressed={!who.length} onClick={() => setWho([])}>🧺 Mesa</button>{players.map(p => <button key={p.idx} className="chip" aria-pressed={who.includes(p.idx)} onClick={() => { const w = who.includes(p.idx) ? who.filter(x => x !== p.idx) : [...who, p.idx].sort(); setWho(w); }}>{p.name}</button>)}</div>
          <button className="btn dark block" style={{ padding: 16, fontSize: 16 }} disabled={pending || !ticket.length || !to} onClick={() => start(async () => after(await chargeToBooking(to, items, who)))}>Cargar {fmt(total)} a {turnoName} · {whoTxt}</button>
        </div> : <p className="muted small" style={{ margin: 0 }}>No hay turnos con cuenta abierta hoy.</p>}
    </aside>
    {toast.node}
  </div>;
}
