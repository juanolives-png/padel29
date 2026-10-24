"use client";
import { useState } from "react";
import { fmt } from "@/lib/time";

const MONEY: [string, string][] = [["Efectivo", "💵 Efectivo"], ["Transferencia", "🏦 Transferencia"], ["QR Mercado Pago", "📱 QR MP"]];
const BILLS = [1000, 5000, 10000, 20000];
const num = (s: string) => Number(String(s).replace(/\D/g, "")) || 0;
/** billetes con los que suele pagar la gente para un total */
function quick(total: number) {
  const out = new Set<number>();
  for (const b of BILLS) { const v = Math.ceil(total / b) * b; if (v > total) out.add(v); }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

export type PayItem = { id: string; name: string; emoji: string; unit: number; left: number };
export type PayResult = { method: string; received?: number; changeToCredit: boolean; restToAccount: boolean; includeOwn: boolean; includeDebt: boolean; takes: { lineId: string; amount: number }[]; phone?: string; name?: string };
const fullName = (n: string) => n.trim().split(/\s+/).filter(w => w.length > 1).length >= 2;

/** Ventana de cobro: qué paga, cómo paga, vuelto y cuenta corriente */
export default function PayModal({ title, own, ownLabel, pool, balance, linked, allowAccount, onClose, onPay, pending, ident }: {
  title: string; own: number; ownLabel: string; pool: PayItem[]; balance: number | null; linked: boolean; allowAccount: boolean; ident?: { name: string; phone: string };
  onClose: () => void; onPay: (r: PayResult) => void; pending: boolean;
}) {
  const [inclOwn, setInclOwn] = useState(own > 0);
  const [inclDebt, setInclDebt] = useState(false);
  const [amt, setAmt] = useState<Record<string, number>>({});
  const [custom, setCustom] = useState<string | null>(null);
  const [method, setMethod] = useState("Efectivo");
  const [recv, setRecv] = useState("");
  const [credit, setCredit] = useState(false);
  const [phone, setPhone] = useState(ident?.phone || "");
  const [name, setName] = useState(ident?.name || "");
  const [rest, setRest] = useState(false);
  const identOk = fullName(ident?.name || "") && (ident?.phone || "").replace(/\D/g, "").length >= 8;
  const bal = balance ?? 0;
  const items = pool.reduce((s, l) => s + (amt[l.id] || 0), 0);
  const part = Math.round((inclOwn ? own : 0) + items);
  const debt = inclDebt && bal < 0 ? -bal : 0;
  const total = part + (method === "Saldo" || method === "A cuenta" ? 0 : debt);
  const got = method === "Efectivo" && recv !== "" ? num(recv) : total;
  const change = method === "Efectivo" ? got - total : 0;
  const needsAcct = method === "Saldo" || method === "A cuenta" || credit || inclDebt || (rest && change < 0);
  const setA = (l: PayItem, v: number) => setAmt({ ...amt, [l.id]: Math.max(0, Math.min(l.left, Math.round(v * 100) / 100)) });
  const units = (l: PayItem) => { const a = amt[l.id] || 0, u = a / l.unit; return Math.abs(u - Math.round(u)) < 0.001 ? Math.round(u) : null; };
  const label = method === "A cuenta" ? `Dejar ${fmt(part)} a su cuenta` : method === "Saldo" ? `Pagar ${fmt(Math.min(part, bal))} con su saldo` : `Cobrar ${fmt(got)}`;
  const can = !pending && (method === "Saldo" ? part > 0 && bal > 0 : method === "A cuenta" ? part > 0 : got > 0) && (!needsAcct || identOk || (fullName(name) && phone.replace(/\D/g, "").length >= 8));

  return <div className="overlay center" style={{ zIndex: 70 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal checkout" role="dialog" aria-modal="true" aria-label={title}>
      <div className="between"><h3 style={{ margin: 0 }}>{title}</h3><button className="xbtn" onClick={onClose} aria-label="Cerrar">✕</button></div>
      {balance != null && bal !== 0 && <div className={"balpill " + (bal > 0 ? "ok" : "bad")}>{bal > 0 ? `Tiene ${fmt(bal)} a favor` : `Debe ${fmt(-bal)} de antes`}</div>}

      {own > 0 && <label className={"co-own" + (inclOwn ? " on" : "")}><input type="checkbox" checked={inclOwn} onChange={e => setInclOwn(e.target.checked)} />
        <span><b>Su parte</b><small>{ownLabel}</small></span><b>{fmt(own)}</b></label>}
      {bal < 0 && allowAccount && method !== "A cuenta" && method !== "Saldo" && <label className={"co-own" + (inclDebt ? " on" : "")}><input type="checkbox" checked={inclDebt} onChange={e => setInclDebt(e.target.checked)} />
        <span><b>Lo que debe de antes</b><small>Se descuenta de su cuenta corriente</small></span><b>{fmt(-bal)}</b></label>}

      {pool.length > 0 && <><div className="lbl">De la mesa · tocá lo que paga</div>
        <div className="co-items">{pool.map(l => { const a = amt[l.id] || 0, u = units(l);
          return <div key={l.id} className={"co-item2" + (a ? " on" : "")}>
            <div className="co-top">
              <span className="em" aria-hidden>{l.emoji}</span>
              <span className="nm">{l.name}<small>{fmt(l.unit)} c/u · quedan {fmt(l.left)}</small></span>
              <b className="amt">{a ? fmt(a) : ""}</b>
            </div>
            <div className="co-ctl">
              <div className="qty"><button onClick={() => setA(l, (u ?? Math.floor(a / l.unit)) * l.unit - l.unit)} disabled={!a} aria-label={`Uno menos de ${l.name}`}>−</button>
                <b>{u ?? "parte"}</b>
                <button onClick={() => setA(l, (u ?? Math.floor(a / l.unit)) * l.unit + l.unit)} disabled={a >= l.left} aria-label={`Uno más de ${l.name}`}>+</button></div>
              <div className="parts">{[2, 3, 4].map(k => <button key={k} className={"chip" + (Math.abs(a - l.unit / k) < 0.01 ? " on" : "")} onClick={() => setA(l, l.unit / k)} aria-label={`1/${k} de ${l.name}`}>{k === 2 ? "½" : k === 3 ? "⅓" : "¼"}</button>)}
                {custom === l.id ? <input autoFocus className="input" inputMode="numeric" placeholder="$" style={{ width: 92, padding: "6px 8px" }} defaultValue={a ? Math.round(a) : ""} onBlur={e => { setA(l, num(e.target.value)); setCustom(null); }} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label={`Monto de ${l.name}`} />
                  : <button className="chip" onClick={() => setCustom(l.id)}>$ monto</button>}</div>
            </div>
          </div>; })}</div></>}

      <div className="co-total"><span>Total</span><b>{fmt(method === "A cuenta" || method === "Saldo" ? part : total)}</b></div>

      <div className="lbl">¿Cómo paga?</div>
      <div className="paym">{MONEY.map(([m, l]) => <button key={m} className="chip" aria-pressed={method === m} onClick={() => setMethod(m)}>{l}</button>)}
        {allowAccount && bal > 0 && <button className="chip" aria-pressed={method === "Saldo"} onClick={() => setMethod("Saldo")}>👛 Su saldo ({fmt(bal)})</button>}
        {allowAccount && <button className="chip" aria-pressed={method === "A cuenta"} onClick={() => setMethod("A cuenta")}>📝 Dejar a cuenta</button>}</div>

      {method === "Efectivo" && total > 0 && <div className="cash">
        <div className="row" style={{ gap: 6 }}><span className="lbl" style={{ marginRight: 4 }}>Paga con</span>
          <button className="chip" aria-pressed={recv === "" || num(recv) === total} onClick={() => setRecv("")}>Justo</button>
          {quick(total).map(v => <button key={v} className="chip" aria-pressed={num(recv) === v} onClick={() => setRecv(String(v))}>{fmt(v)}</button>)}
          <input className="input" inputMode="numeric" placeholder="Otro $" style={{ width: 110, padding: "7px 10px" }} value={recv && !quick(total).includes(num(recv)) ? fmt(num(recv)) : ""} onChange={e => setRecv(e.target.value.replace(/\D/g, ""))} aria-label="Con cuánto paga" /></div>
        {change > 0 && <div className="vuelto"><span>Vuelto</span><b>{fmt(change)}</b></div>}
        {change > 0 && allowAccount && <label className="checkrow"><input type="checkbox" checked={credit} onChange={e => setCredit(e.target.checked)} /><span>No le doy vuelto: <b>dejar {fmt(change)} a favor</b> en su cuenta</span></label>}
        {change < 0 && <div className="vuelto debe"><span>Paga menos · {rest ? "va a su cuenta corriente" : "queda debiendo"}</span><b>{fmt(-change)}</b></div>}
        {change < 0 && allowAccount && <label className="checkrow"><input type="checkbox" checked={rest} onChange={e => setRest(e.target.checked)} /><span>Mandar los <b>{fmt(-change)}</b> que faltan a su cuenta corriente</span></label>}
      </div>}
      {method === "A cuenta" && <p className="small muted" style={{ margin: 0 }}>Se va sin pagar: la cuenta del turno queda cerrada y lo que debe pasa a su cuenta corriente.</p>}
      {needsAcct && !identOk && <div className="identbox"><b>Para la cuenta corriente necesitamos sus datos</b>
        <div className="grid2" style={{ gap: 8 }}><div className="field"><label htmlFor="ccnm">Nombre y apellido</label><input id="ccnm" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Juan Pérez" /></div>
          <div className="field"><label htmlFor="ccph">Celular</label><input id="ccph" className="input" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="2478 123456" /></div></div>
        {name && !fullName(name) && <span className="small" style={{ color: "var(--bad)" }}>Falta el apellido.</span>}</div>}

      <button className="btn block" style={{ padding: 16, fontSize: 17 }} disabled={!can}
        onClick={() => onPay({ method, received: method === "Efectivo" && recv !== "" ? num(recv) : undefined, changeToCredit: credit, restToAccount: rest && change < 0, includeOwn: inclOwn, includeDebt: inclDebt && method !== "A cuenta" && method !== "Saldo", takes: Object.entries(amt).filter(([, v]) => v > 0).map(([lineId, amount]) => ({ lineId, amount })), phone: identOk ? undefined : phone, name: identOk ? undefined : name })}>{label}</button>
      {pool.length > 0 && <p className="small muted" style={{ margin: 0 }}>Lo que no toques queda en la mesa para los demás.</p>}
    </div></div>;
}
