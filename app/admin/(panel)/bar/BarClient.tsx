"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ProductPicker, { type P } from "@/components/ProductPicker";
import BookingDrawer from "@/components/BookingDrawer";
import { useToast } from "@/components/Toast";
import { chargeToBooking, counterSale, loadBooking, saveProduct } from "../../actions";
import { fmt } from "@/lib/time";

type Prod = P & { active: boolean };
const CATS: [string, string][] = [["bebidas", "Bebidas"], ["cafeteria", "Cafetería"], ["comidas", "Comidas"], ["padel", "Pádel"], ["club", "Del club"]];
export default function BarClient({ products, open, turnos }: { products: Prod[]; open: { id: string; label: string; holder: string; falta: number; ok: string }[]; turnos: { id: string; label: string }[] }) {
  const router = useRouter(); const toast = useToast(); const [pending, start] = useTransition();
  const [ticket, setTicket] = useState<{ p: P; qty: number }[]>([]); const [to, setTo] = useState(turnos[0]?.id || ""); const [who, setWho] = useState("all"); const [players, setPlayers] = useState<{ idx: number; name: string }[]>([]);
  const [drawer, setDrawer] = useState<string | null>(null); const [edit, setEdit] = useState<Partial<Prod> | null>(null);
  useEffect(() => { if (!to) { setPlayers([]); return; } loadBooking(to).then(d => setPlayers(d ? d.players.map((p: any) => ({ idx: p.idx, name: p.name })) : [])); setWho("all"); }, [to]);
  const active = products.filter(p => p.active);
  const add = (p: P, n: number) => { const ex = ticket.find(t => t.p.id === p.id); const cur = ex?.qty || 0; if (n > 0 && p.stock != null && p.stock - cur < n) { toast.show("Sin stock de " + p.name, true); return; }
    setTicket(ex ? ticket.map(t => t.p.id === p.id ? { ...t, qty: t.qty + n } : t).filter(t => t.qty > 0) : [...ticket, { p, qty: n }]); };
  const total = ticket.reduce((s, t) => s + t.p.price * t.qty, 0);
  const items = ticket.map(t => ({ productId: t.p.id, qty: t.qty }));
  return <div className="grid2" style={{ gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)", alignItems: "start" }}>
    <div className="card stack">
      <h3 style={{ margin: 0 }}>Venta de mostrador</h3>
      <ProductPicker products={active} onAdd={p => add(p, 1)} />
      <div className="stack" style={{ gap: 6 }}>{ticket.length ? ticket.map(t => <div key={t.p.id} className="line2"><span className="em" aria-hidden>{t.p.emoji}</span><span>{t.p.name}{t.qty > 1 ? ` x${t.qty}` : ""}</span><span className="amt">{fmt(t.p.price * t.qty)}</span><button aria-label="Quitar uno" onClick={() => add(t.p, -1)}>−</button></div>) : <p className="muted small" style={{ margin: 0 }}>Tocá productos para armar el ticket.</p>}</div>
      <div className="between card soft" style={{ padding: 14 }}><span className="lbl">Total</span><b style={{ fontFamily: "var(--f-head)", fontSize: 32 }}>{fmt(total)}</b></div>
      <div className="lbl">Cobrar ahora</div>
      <div className="grid3" style={{ gap: 8 }}>{["Efectivo", "Transferencia", "QR Mercado Pago"].map(m => <button key={m} className="btn" disabled={pending || !ticket.length} onClick={() => start(async () => { const r = await counterSale(items, m); toast.show(r.msg, !r.ok); if (r.ok) { setTicket([]); router.refresh(); } })}>{m === "QR Mercado Pago" ? "QR MP" : m}</button>)}</div>
      <div className="lbl">O cargarlo a la cuenta de un turno de hoy</div>
      <div className="row"><select className="input" style={{ flex: "2 1 200px" }} value={to} onChange={e => setTo(e.target.value)} aria-label="Turno">{turnos.length ? turnos.map(t => <option key={t.id} value={t.id}>{t.label}</option>) : <option value="">No hay turnos hoy</option>}</select>
        <select className="input" style={{ flex: "1 1 120px" }} value={who} onChange={e => setWho(e.target.value)} aria-label="A quién"><option value="all">Todos</option>{players.map(p => <option key={p.idx} value={p.idx}>{p.name}</option>)}</select>
        <button className="btn ghost" disabled={pending || !ticket.length || !to} onClick={() => start(async () => { const r = await chargeToBooking(to, items, who === "all" ? players.map(p => p.idx) : [Number(who)]); toast.show(r.msg, !r.ok); if (r.ok) { setTicket([]); router.refresh(); } })}>Cargar</button></div>
    </div>
    <div className="stack">
      <div className="card"><h3>Cuentas abiertas hoy</h3><div className="stack" style={{ gap: 8 }}>{open.length ? open.map(o => <button key={o.id} className="card between" style={{ padding: 12, textAlign: "left" }} onClick={() => setDrawer(o.id)}><span><b>{o.label}</b><br /><span className="small muted">{o.holder} · {o.ok} al día</span></span><b style={{ fontFamily: "var(--f-head)", fontSize: 20 }}>{fmt(o.falta)}</b></button>) : <p className="muted small" style={{ margin: 0 }}>No hay cuentas abiertas.</p>}</div></div>
      <div className="card"><div className="between"><h3 style={{ margin: 0 }}>Productos y stock</h3><button className="btn sm" onClick={() => setEdit({ name: "", emoji: "🛒", category: "bebidas", price: 0, stock: null, active: true })}>+ Producto</button></div>
        <div className="scroll-x" style={{ maxHeight: 520, overflowY: "auto", marginTop: 8 }}><table className="tbl"><thead><tr><th>Producto</th><th className="r">Precio</th><th className="r">Stock</th><th className="r">Vendidos</th><th></th></tr></thead>
          <tbody>{products.map(p => <tr key={p.id} style={{ opacity: p.active ? 1 : .5 }}><td>{p.emoji} {p.name}</td><td className="r">{fmt(p.price)}</td><td className="r">{p.stock == null ? "—" : p.stock < 10 ? <span className="pill warn">{p.stock}</span> : p.stock}</td><td className="r">{p.sold}</td><td className="r"><button className="btn sm ghost" style={{ padding: "3px 8px" }} onClick={() => setEdit(p)}>Editar</button></td></tr>)}</tbody></table></div></div>
    </div>
    {drawer && <BookingDrawer id={drawer} products={active} senaDefault={10000} onClose={() => { setDrawer(null); router.refresh(); }} toast={toast.show} />}
    {edit && <div className="overlay center" onClick={e => { if (e.target === e.currentTarget) setEdit(null); }}><form className="modal" onSubmit={e => { e.preventDefault(); start(async () => { const r = await saveProduct({ id: edit.id, name: edit.name || "", emoji: edit.emoji || "🛒", category: edit.category || "bebidas", price: Number(edit.price), stock: edit.stock === null || (edit.stock as unknown) === "" ? null : Number(edit.stock), active: edit.active !== false }); toast.show(r.msg, !r.ok); if (r.ok) { setEdit(null); router.refresh(); } }); }}>
      <h3>{edit.id ? "Editar producto" : "Nuevo producto"}</h3>
      <div className="row" style={{ alignItems: "end" }}><div className="field" style={{ width: 80 }}><label htmlFor="pe">Imagen</label><input id="pe" value={edit.emoji || ""} onChange={e => setEdit({ ...edit, emoji: e.target.value })} style={{ fontSize: 24, textAlign: "center" }} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor="pn">Nombre</label><input id="pn" value={edit.name || ""} onChange={e => setEdit({ ...edit, name: e.target.value })} required /></div></div>
      <div className="field"><label htmlFor="pc">Categoría</label><select id="pc" value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="grid2" style={{ gap: 10 }}><div className="field"><label htmlFor="pp">Precio</label><input id="pp" type="number" min={0} value={edit.price ?? ""} onChange={e => setEdit({ ...edit, price: Number(e.target.value) })} required /></div>
        <div className="field"><label htmlFor="ps">Stock (vacío = sin control)</label><input id="ps" type="number" value={edit.stock ?? ""} onChange={e => setEdit({ ...edit, stock: e.target.value === "" ? null : Number(e.target.value) })} /></div></div>
      <label className="row small"><input type="checkbox" checked={edit.active !== false} onChange={e => setEdit({ ...edit, active: e.target.checked })} /> A la venta</label>
      <button className="btn block" disabled={pending}>Guardar</button><button type="button" className="btn ghost block" onClick={() => setEdit(null)}>Cancelar</button></form></div>}
    {toast.node}
  </div>;
}
