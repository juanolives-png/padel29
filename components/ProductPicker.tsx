"use client";
import { useMemo, useState } from "react";
import { fmt } from "@/lib/time";
export type P = { id: string; name: string; emoji: string; category: string; price: number; stock: number | null; sold: number };
const CATS: [string, string][] = [["top", "Más vendidos"], ["bebidas", "Bebidas"], ["cafeteria", "Cafetería"], ["comidas", "Comidas"], ["padel", "Pádel"], ["club", "Del club"]];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export default function ProductPicker({ products, onAdd }: { products: P[]; onAdd: (p: P) => void }) {
  const [cat, setCat] = useState("top"), [qq, setQ] = useState("");
  const list = useMemo(() => qq ? products.filter(p => norm(p.name).includes(norm(qq))) : cat === "top" ? [...products].sort((a, b) => b.sold - a.sold).slice(0, 10) : products.filter(p => p.category === cat), [products, cat, qq]);
  return <div className="stack" style={{ gap: 10 }}>
    <input className="input" type="search" placeholder="Buscar producto" aria-label="Buscar producto" value={qq} onChange={e => setQ(e.target.value)} style={{ borderRadius: 999 }} />
    <div className="chips scroll">{CATS.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={!qq && cat === k} onClick={() => { setCat(k); setQ(""); }}>{l}</button>)}</div>
    <div className="tiles">{list.length ? list.map(p => <button key={p.id} type="button" className={"tile cat-" + p.category} disabled={p.stock === 0} onClick={() => onAdd(p)} aria-label={`Agregar ${p.name}`}>
      <span className="img" aria-hidden>{p.emoji}</span><b>{p.name}</b><span className="pr">{fmt(p.price)}</span>{p.stock != null && p.stock < 10 && <span className="st">{p.stock === 0 ? "sin stock" : "quedan " + p.stock}</span>}</button>)
      : <p className="muted small">No encontré ese producto.</p>}</div>
  </div>;
}
