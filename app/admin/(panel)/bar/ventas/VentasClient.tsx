"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { P } from "@/components/ProductPicker";
import BookingDrawer from "@/components/BookingDrawer";
import { useToast } from "@/components/Toast";
import { saveProduct } from "../../../actions";
import { fmt } from "@/lib/time";

type Prod = P & { active: boolean };
const CATS: [string, string][] = [["bebidas", "Bebidas"], ["cafeteria", "Cafetería"], ["comidas", "Comidas"], ["padel", "Pádel"], ["club", "Del club"]];

export default function VentasClient({ products, open, kpi, sena }: { products: Prod[]; open: { id: string; label: string; holder: string; falta: number; ok: string }[]; kpi: { turnos: number; mostrador: number; tickets: number }; sena: number }) {
  const router = useRouter(); const toast = useToast(); const [pending, start] = useTransition();
  const [drawer, setDrawer] = useState<string | null>(null); const [edit, setEdit] = useState<Partial<Prod> | null>(null);
  const [filter, setFilter] = useState<"all" | "low">("all");
  const low = products.filter(p => p.active && p.stock != null && p.stock < 10);
  const top = [...products].sort((a, b) => b.sold - a.sold)[0];
  const list = filter === "low" ? low : products;
  return <div className="stack" style={{ gap: 18 }}>
    <div className="grid4">
      <div className="card kpi"><div className="l">Vendido hoy</div><div className="v">{fmt(kpi.turnos + kpi.mostrador)}</div><div className="small muted">{fmt(kpi.mostrador)} mostrador · {fmt(kpi.turnos)} en turnos</div></div>
      <div className="card kpi"><div className="l">Cuentas abiertas</div><div className="v">{open.length}</div><div className="small muted">{fmt(open.reduce((s, b) => s + b.falta, 0))} por cobrar</div></div>
      <div className="card kpi"><div className="l">Lo más vendido</div><div className="v" style={{ fontSize: 24 }}>{top ? `${top.emoji} ${top.name}` : "—"}</div><div className="small muted">{top ? `${top.sold} unidades` : ""}</div></div>
      <button className="card kpi" style={{ textAlign: "left", borderColor: low.length ? "#f0d29b" : undefined }} onClick={() => setFilter(low.length ? "low" : "all")}><div className="l">Stock bajo</div><div className="v" style={{ color: low.length ? "var(--warn)" : undefined }}>{low.length}</div><div className="small muted">{low.length ? "Ver cuáles →" : "Todo en orden"}</div></button>
    </div>

    <div className="grid2" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.5fr)", alignItems: "start" }}>
      <div className="card"><h3>Cuentas abiertas hoy</h3><div className="stack" style={{ gap: 8 }}>{open.length ? open.map(o => <button key={o.id} className="card between" style={{ padding: 12, textAlign: "left" }} onClick={() => setDrawer(o.id)}><span><b>{o.label}</b><br /><span className="small muted">{o.holder} · {o.ok} al día</span></span><b style={{ fontFamily: "var(--f-head)", fontSize: 20 }}>{fmt(o.falta)}</b></button>) : <p className="muted small" style={{ margin: 0 }}>No hay cuentas abiertas.</p>}</div></div>
      <div className="card"><div className="between"><h3 style={{ margin: 0 }}>Productos y stock</h3>
        <div className="row" style={{ gap: 8 }}><div className="chips"><button className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Todos</button><button className="chip" aria-pressed={filter === "low"} onClick={() => setFilter("low")}>Stock bajo ({low.length})</button></div>
          <button className="btn sm" onClick={() => setEdit({ name: "", emoji: "🛒", category: "bebidas", price: 0, stock: null, active: true })}>+ Producto</button></div></div>
        <div className="scroll-x" style={{ marginTop: 8 }}><table className="tbl"><thead><tr><th>Producto</th><th className="r">Precio</th><th className="r">Stock</th><th className="r">Vendidos</th><th></th></tr></thead>
          <tbody>{list.map(p => <tr key={p.id} style={{ opacity: p.active ? 1 : .5 }}><td>{p.emoji} {p.name}</td><td className="r">{fmt(p.price)}</td><td className="r">{p.stock == null ? "—" : p.stock < 10 ? <span className="pill warn">{p.stock}</span> : p.stock}</td><td className="r">{p.sold}</td><td className="r"><button className="btn sm ghost" style={{ padding: "3px 8px" }} onClick={() => setEdit(p)}>Editar</button></td></tr>)}</tbody></table></div></div>
    </div>

    {drawer && <BookingDrawer id={drawer} products={products.filter(p => p.active)} senaDefault={sena} onClose={() => { setDrawer(null); router.refresh(); }} toast={toast.show} />}
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
