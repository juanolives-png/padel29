import { q, one } from "./db";
import { getDay } from "./data";
import { nowAR, toMin } from "./time";

export const METHODS = ["Efectivo", "Transferencia", "QR Mercado Pago"] as const;
export const SHORT: Record<string, string> = { Efectivo: "Efectivo", Transferencia: "Transferencia", "QR Mercado Pago": "QR MP" };
export const CONCEPTS: Record<string, string> = { compra: "Compras de mercadería", cuenta: "Cuentas corrientes", turno: "Turnos", bar: "Bar (mostrador)", plan: "Planes 29club", sena: "Señas", ingreso: "Otros ingresos", gasto: "Gastos", retiro: "Retiros" };
const DAY = "(created_at at time zone 'America/Argentina/Buenos_Aires')::date = $2::date";

export type Move = { id: string; at: string; concept: string; detail: string; method: string; amount: number; sign: 1 | -1; ref?: string; removable?: boolean };
export type Close = { id: string; date: string; opening: number; expected: number; counted: number; diff: number; left_in_box: number; totals: Totals; checks: Record<string, boolean>; note: string; closed_at: string };
export type Totals = { in: number; out: number; byMethod: Record<string, { in: number; out: number }>; byConcept: Record<string, number>; cashIn: number; cashOut: number };

/** Todo lo que entró y salió de la caja en un día (hora Argentina) */
export async function getCajaDay(clubId: string, date: string) {
  const [pays, sales, plans, senas, moves, accts, buys, close, prevClose, day] = await Promise.all([
    q(`select p.id, p.amount, p.method, p.created_at, bp.name, c.name as court, b.start, b.id as booking_id from payment p join booking b on b.id=p.booking_id
       join court c on c.id=b.court_id left join booking_player bp on bp.booking_id=b.id and bp.idx=p.player_idx where b.club_id=$1 and p.method = any($3) and (p.created_at at time zone 'America/Argentina/Buenos_Aires')::date = $2::date`, [clubId, date, METHODS]),
    q(`select id, total, method, items, created_at from counter_sale where club_id=$1 and ${DAY}`, [clubId, date]),
    q(`select s.id, s.price_paid, s.method, s.started_at as created_at, pl.name as plan, p.name from subscription s join plan pl on pl.id=s.plan_id join player p on p.id=s.player_id
       where p.club_id=$1 and (s.started_at at time zone 'America/Argentina/Buenos_Aires')::date = $2::date`, [clubId, date]),
    q(`select b.id, b.sena_paid, b.sena_method, b.sena_at as created_at, b.holder_name, b.date, b.start, c.name as court from booking b join court c on c.id=b.court_id
       where b.club_id=$1 and b.sena_paid > 0 and b.sena_at is not null and (b.sena_at at time zone 'America/Argentina/Buenos_Aires')::date = $2::date`, [clubId, date]),
    q("select * from cash_move where club_id=$1 and date=$2 order by created_at", [clubId, date]),
    q(`select m.id, m.amount, m.kind, m.method, m.created_at, p.name from account_move m join player p on p.id=m.player_id
       where m.club_id=$1 and m.method = any($3) and ${DAY.replace("created_at", "m.created_at")}`, [clubId, date, METHODS]),
    q(`select e.id, e.qty, e.unit_cost, e.method, e.supplier, e.created_at, p.name from stock_entry e join product p on p.id=e.product_id
       where e.club_id=$1 and e.from_cash and ${DAY.replace("created_at", "e.created_at")}`, [clubId, date]),
    one<Close>("select * from cash_close where club_id=$1 and date=$2", [clubId, date]),
    one<Close>("select * from cash_close where club_id=$1 and date < $2 order by date desc limit 1", [clubId, date]),
    getDay(clubId, date)]);

  const list: Move[] = [
    ...pays.map(p => ({ id: p.id, at: p.created_at, concept: "turno", detail: `${p.court} ${p.start} · ${p.name || "Jugador"}`, method: p.method, amount: p.amount, sign: 1 as const, ref: p.booking_id })),
    ...sales.map(s => ({ id: s.id, at: s.created_at, concept: "bar", detail: (s.items as { name: string; qty: number }[]).map(i => (i.qty > 1 ? i.qty + " " : "") + i.name).join(", "), method: s.method, amount: s.total, sign: 1 as const })),
    ...plans.map(s => ({ id: s.id, at: s.created_at, concept: "plan", detail: `Plan ${s.plan} · ${s.name}`, method: s.method, amount: s.price_paid, sign: 1 as const })),
    ...senas.map(b => ({ id: b.id, at: b.created_at, concept: "sena", detail: `${b.court} ${b.start}${b.date !== date ? " del " + b.date.slice(8) + "/" + b.date.slice(5, 7) : ""} · ${b.holder_name}`, method: b.sena_method, amount: b.sena_paid, sign: 1 as const, ref: b.id })),
    ...accts.map(m => ({ id: m.id, at: m.created_at, concept: "cuenta", detail: `${m.kind === "a_favor" ? "Vuelto que quedó a favor" : m.kind === "pago_deuda" ? "Pagó deuda" : m.kind === "carga" ? "Cargó saldo a favor" : "Devolución de saldo"} · ${m.name}`, method: m.method, amount: Math.abs(m.amount), sign: (m.amount >= 0 ? 1 : -1) as 1 | -1 })),
    ...buys.map(e => ({ id: e.id, at: e.created_at, concept: "compra", detail: `${e.qty} ${e.name}${e.supplier ? " · " + e.supplier : ""}`, method: e.method, amount: e.qty * e.unit_cost, sign: -1 as const })),
    ...moves.filter(m => m.kind !== "apertura").map(m => ({ id: m.id, at: m.created_at, concept: m.kind, detail: m.note || CONCEPTS[m.kind], method: m.method, amount: m.amount, sign: (m.kind === "ingreso" ? 1 : -1) as 1 | -1, removable: true })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const totals = summarize(list);
  const ap = moves.filter(m => m.kind === "apertura").pop();
  const opening = ap ? ap.amount : prevClose ? prevClose.left_in_box : 0;
  const openingFrom = ap ? "manual" : prevClose ? `quedó del cierre del ${prevClose.date.slice(8)}/${prevClose.date.slice(5, 7)}` : "sin cierre anterior";
  const expected = opening + totals.cashIn - totals.cashOut;
  // turnos ya jugados (o empezados) que quedaron con plata sin cobrar
  const n = nowAR(); const played = (start: string) => date < n.date || (date === n.date && toMin(start) <= toMin(n.time));
  const pending = day.filter(b => b.falta >= 1 && (b.hasActivity || played(b.start))).map(b => ({ id: b.id, start: b.start, holder: b.holder_name, falta: b.falta }));
  // si hubo movimientos después de cerrar, avisamos
  const changed = close ? close.totals.in !== totals.in || close.totals.out !== totals.out || close.opening !== opening : false;
  return JSON.parse(JSON.stringify({ list, totals, opening, openingFrom, expected, close, changed, pending }));
}

export function summarize(list: Move[]): Totals {
  const byMethod: Totals["byMethod"] = Object.fromEntries(METHODS.map(m => [m, { in: 0, out: 0 }]));
  const byConcept: Record<string, number> = {};
  let tin = 0, tout = 0;
  for (const m of list) {
    const k = byMethod[m.method] ? m.method : "Efectivo";
    if (m.sign > 0) { byMethod[k].in += m.amount; tin += m.amount; } else { byMethod[k].out += m.amount; tout += m.amount; }
    byConcept[m.concept] = (byConcept[m.concept] || 0) + (m.concept === "cuenta" ? m.sign : 1) * m.amount;
  }
  return { in: tin, out: tout, byMethod, byConcept, cashIn: byMethod.Efectivo.in, cashOut: byMethod.Efectivo.out };
}

export const getCloses = (clubId: string, limit = 10) => q<Close>("select * from cash_close where club_id=$1 order by date desc limit $2", [clubId, limit]);
