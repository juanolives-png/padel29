"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ProductPicker, { type P } from "@/components/ProductPicker";
import { useToast } from "@/components/Toast";
import { chargeToBooking, counterSale, loadBooking, openTab } from "../../actions";
import BookingDrawer from "@/components/BookingDrawer";
import { fmt } from "@/lib/time";

const METHODS: [string, string, string][] = [["Efectivo", "💵", "Efectivo"], ["Transferencia", "🏦", "Transferencia"], ["QR Mercado Pago", "📱", "QR MP"]];

/** Caja del bar: productos a la izquierda, la cuenta y el total grande a la derecha. */
export type Tab = { id: string; name: string; falta: number; empty: boolean };
export default function BarClient({ products, turnos, tabs, senaDefault }: { products: P[]; turnos: { id: string; label: string }[]; tabs: Tab[]; senaDefault: number }) {
  const router = useRouter(); const toast = useToast(); const [pending, start] = useTransition();
  const [ticket, setTicket] = useState<{ p: P; qty: number }[]>([]);
  const [mode, setMode] = useState<"cobrar" | "turno">("cobrar");
  const [to, setTo] = useState(tabs[0]?.id || turnos[0]?.id || "__new"); const [newName, setNewName] = useState("");
  const [sheet, setSheet] = useState<string | null>(null); const [opening, setOpening] = useState<string | null>(null); const [who, setWho] = useState<number[]>([]); const [players, setPlayers] = useState<{ idx: number; name: string }[]>([]);
  useEffect(() => { setWho([]); if (!to || to === "__new") { setPlayers([]); return; } loadBooking(to).then(d => setPlayers(d ? d.players.map((p: any) => ({ idx: p.idx, name: p.name })) : [])); }, [to]);
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
  const turnoName = to === "__new" ? `la mesa nueva${newName.trim() ? " " + newName.trim() : ""}` : tabs.find(t => t.id === to) ? "🍺 " + tabs.find(t => t.id === to)!.name : turnos.find(t => t.id === to)?.label.split(" · ").slice(0, 2).join(" · ");
  const charge = () => start(async () => {
    let id = to;
    if (to === "__new") { const r = await openTab({ name: newName }); if (!r.ok) { toast.show(r.msg, true); return; } id = r.id; setNewName(""); }
    const r = await chargeToBooking(id, items, who); after(r); if (r.ok) setTo(id);
  });
  const newTab = () => start(async () => { const r = await openTab({ name: opening || "" }); toast.show(r.msg, !r.ok); if (r.ok) { setOpening(null); setTo(r.id); setMode("turno"); router.refresh(); } });
  const whoTxt = who.length === 0 ? "a la mesa" : who.length === 1 ? `a ${players.find(p => p.idx === who[0])?.name}` : `entre ${who.length}`;

  return <>
  <div className="tabs-strip" aria-label="Mesas abiertas">
    <span className="lbl">🍺 Mesas abiertas</span>
    {tabs.map(t => <button key={t.id} className={"tabchip" + (t.falta > 0 ? " due" : "")} onClick={() => setSheet(t.id)}><b>{t.name}</b><span>{t.empty ? "vacía" : fmt(t.falta)}</span></button>)}
    {opening === null ? <button className="tabchip add" onClick={() => setOpening("")}>+ Abrir mesa</button>
      : <form className="row" style={{ gap: 6, flexWrap: "nowrap" }} onSubmit={e => { e.preventDefault(); newTab(); }}><input autoFocus className="input" style={{ width: 170, padding: "7px 10px" }} placeholder="Nombre o mesa" value={opening} onChange={e => setOpening(e.target.value)} aria-label="Nombre de la mesa" /><button className="btn sm" disabled={pending}>Abrir</button><button type="button" className="linkbtn" onClick={() => setOpening(null)}>cancelar</button></form>}
  </div>
  <div className="pos-main">
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
        <button role="tab" aria-selected={mode === "turno"} onClick={() => setMode("turno")}>A una cuenta</button>
      </div>

      {mode === "cobrar" ? <div className="pay3">{METHODS.map(([m, ic, l]) =>
        <button key={m} className="btn" disabled={pending || !ticket.length} onClick={() => start(async () => after(await counterSale(items, m)))}><span aria-hidden style={{ fontSize: 22 }}>{ic}</span>{l}</button>)}</div>
        : <div className="stack" style={{ gap: 10 }}>
          <select className="input" value={to} onChange={e => setTo(e.target.value)} aria-label="Cuenta">
            {tabs.length > 0 && <optgroup label="🍺 Mesas del bar">{tabs.map(t => <option key={t.id} value={t.id}>{t.name}{t.falta > 0 ? ` · debe ${fmt(t.falta)}` : ""}</option>)}</optgroup>}
            {turnos.length > 0 && <optgroup label="🎾 Turnos de hoy">{turnos.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</optgroup>}
            <option value="__new">➕ Abrir mesa nueva…</option>
          </select>
          {to === "__new" ? <input className="input" placeholder="Nombre de la mesa (ej: Juan, los de la tribuna)" value={newName} onChange={e => setNewName(e.target.value)} aria-label="Nombre de la mesa nueva" />
            : players.length > 1 && <div className="chips"><button className="chip" aria-pressed={!who.length} onClick={() => setWho([])}>🧺 Mesa</button>{players.map(p => <button key={p.idx} className="chip" aria-pressed={who.includes(p.idx)} onClick={() => { const w = who.includes(p.idx) ? who.filter(x => x !== p.idx) : [...who, p.idx].sort(); setWho(w); }}>{p.name}</button>)}</div>}
          <button className="btn dark block" style={{ padding: 16, fontSize: 16 }} disabled={pending || !ticket.length || (to === "__new" && newName.trim().length < 2)} onClick={charge}>Cargar {fmt(total)} a {turnoName}{to !== "__new" && players.length > 1 ? " · " + whoTxt : ""}</button>
        </div>}
    </aside>
  </div>
    {sheet && <BookingDrawer id={sheet} products={products} senaDefault={senaDefault} onClose={() => { setSheet(null); router.refresh(); }} toast={toast.show} />}
    {toast.node}
  </>;
}
