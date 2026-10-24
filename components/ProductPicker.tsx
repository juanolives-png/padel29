"use client";
import { useMemo, useState } from "react";
import { fmt } from "@/lib/time";
export type P = { id: string; name: string; emoji: string; category: string; price: number; stock: number | null; sold: number };
const CATS: [string, string][] = [["top", "Más vendidos"], ["bebidas", "Bebidas"], ["cafeteria", "Cafetería"], ["comidas", "Comidas"], ["padel", "Pádel"], ["club", "Del club"]];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Grilla de productos con foto. `pos` = versión grande para la caja (la grilla scrollea adentro). `inCart` descuenta lo que ya está en la cuenta del stock mostrado. */
export default function ProductPicker({ products, onAdd, pos, inCart }: { products: P[]; onAdd: (p: P) => void; pos?: boolean; inCart?: Record<string, number> }) {
  const [cat, setCat] = useState("top"), [qq, setQ] = useState("");
  const list = useMemo(() => qq ? products.filter(p => norm(p.name).includes(norm(qq))) : cat === "top" ? [...products].sort((a, b) => b.sold - a.sold).slice(0, pos ? 12 : 10) : products.filter(p => p.category === cat), [products, cat, qq, pos]);
  return <div className={"picker" + (pos ? " pos-picker" : "")}>
    <div className="picker-bar">
      <input className="input" type="search" placeholder="Buscar producto" aria-label="Buscar producto" value={qq} onChange={e => setQ(e.target.value)} style={{ borderRadius: 999 }} />
      <div className="chips scroll">{CATS.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={!qq && cat === k} onClick={() => { setCat(k); setQ(""); }}>{l}</button>)}</div>
    </div>
    <div className="tiles">{list.length ? list.map(p => {
      const left = p.stock == null ? null : p.stock - (inCart?.[p.id] || 0);
      return <button key={p.id} type="button" className={"tile cat-" + p.category} disabled={left !== null && left <= 0} onClick={() => onAdd(p)} aria-label={`Agregar ${p.name}`}>
        <span className="img" aria-hidden>{p.emoji}</span><b>{p.name}</b><span className="pr">{fmt(p.price)}</span>
        {left !== null && left < 10 && <span className="st">{left <= 0 ? "Sin stock" : `Últimos ${left}`}</span>}</button>; })
      : <p className="muted small">No encontré ese producto.</p>}</div>
  </div>;
}
