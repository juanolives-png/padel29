import { q, one } from "./db";
import { addDays, nowAR } from "./time";

export const EXPENSE_CATS = ["Sueldos y cargas", "Alquiler", "Servicios (luz, agua, gas, internet)", "Mantenimiento de canchas", "Limpieza", "Profesores", "Marketing", "Impuestos y tasas", "Comisiones (MP y bancos)", "Seguros", "Otros"];
export const CAJA_CAT = "Gastos de caja";
const AR = "America/Argentina/Buenos_Aires";
const dayOf = (col: string) => `to_char(${col} at time zone '${AR}', 'YYYY-MM-DD')`;

export type Summary = {
  from: string; to: string; days: number;
  turnos: number; capacidad: number; ocupacion: number; pasesPct: number;
  ingresos: { cancha: number; bar: number; planes: number; otros: number; total: number };
  cmv: number; barSinCosto: number; margenBruto: number;
  gastos: { cat: string; amount: number }[]; gastosTotal: number; gastosFijos: number;
  resultado: number; margen: number;
  compras: number; planesVendidos: number;
};

export function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
export const monthLabel = (ym: string) => ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(ym.slice(5, 7)) - 1] + " " + ym.slice(2, 4);
export function addMonths(ym: string, n: number) { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); }
const daysIncl = (a: string, b: string) => Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 864e5) + 1;

/** Estado de resultados de un período (devengado: turnos jugados, ventas hechas, gastos con fecha en el período). Corta en hoy. */
export async function summary(clubId: string, from: string, toReq: string): Promise<Summary> {
  const today = nowAR().date; const to = toReq > today ? today : toReq;
  if (to < from) return empty(from, toReq);
  const [club, courts, cancha, barT, barM, planes, otros, gastos, caja, compras] = await Promise.all([
    one("select open_times from club where id=$1", [clubId]),
    one<{ n: number }>("select count(*)::int as n from court where club_id=$1 and active", [clubId]),
    one(`select coalesce(sum(b.court_price * (x.np - x.npass)::numeric / nullif(x.np,0)),0)::float as cancha, count(*)::int as turnos, coalesce(sum(x.npass),0)::int as pases, coalesce(sum(x.np),0)::int as jug
      from booking b join lateral (select count(*)::int np, count(*) filter (where pass_used>0)::int npass from booking_player where booking_id=b.id) x on true
      where b.club_id=$1 and b.status<>'cancelled' and b.date between $2 and $3`, [clubId, from, to]),
    one(`select coalesce(sum(c.qty*c.unit_price),0)::float as venta, coalesce(sum(c.qty*coalesce(c.unit_cost,p.cost,0)),0)::float as costo,
      coalesce(sum(case when coalesce(c.unit_cost,p.cost) is null then c.qty*c.unit_price else 0 end),0)::float as sin_costo
      from consumption c join booking b on b.id=c.booking_id join product p on p.id=c.product_id where b.club_id=$1 and b.status<>'cancelled' and b.date between $2 and $3`, [clubId, from, to]),
    one(`select coalesce(sum((i->>'qty')::int*(i->>'price')::int),0)::float as venta, coalesce(sum((i->>'qty')::int*coalesce((i->>'cost')::int,p.cost,0)),0)::float as costo,
      coalesce(sum(case when coalesce((i->>'cost')::int,p.cost) is null then (i->>'qty')::int*(i->>'price')::int else 0 end),0)::float as sin_costo
      from counter_sale cs cross join jsonb_array_elements(cs.items) i
      left join product p on p.club_id=cs.club_id and (p.id = i->>'productId' or (i->>'productId' is null and p.name = i->>'name'))
      where cs.club_id=$1 and ${dayOf("cs.created_at")} between $2 and $3`, [clubId, from, to]),
    one(`select coalesce(sum(s.price_paid),0)::float as total, count(*)::int as n from subscription s join player p on p.id=s.player_id where p.club_id=$1 and ${dayOf("s.started_at")} between $2 and $3`, [clubId, from, to]),
    one(`select coalesce(sum(amount),0)::float as total from cash_move where club_id=$1 and kind='ingreso' and date between $2 and $3`, [clubId, from, to]),
    q<{ cat: string; amount: number; fixed: number }>(`select category as cat, sum(amount)::float as amount, sum(case when fixed then amount else 0 end)::float as fixed from expense where club_id=$1 and date between $2 and $3 group by category`, [clubId, from, to]),
    one(`select coalesce(sum(amount),0)::float as total from cash_move where club_id=$1 and kind='gasto' and date between $2 and $3`, [clubId, from, to]),
    one(`select coalesce(sum(qty*unit_cost),0)::float as total from stock_entry where club_id=$1 and ${dayOf("created_at")} between $2 and $3`, [clubId, from, to]),
  ]);
  const days = daysIncl(from, to);
  const capacidad = (club?.open_times?.length || 0) * (courts?.n || 0) * days;
  const g = [...gastos.map(x => ({ cat: x.cat, amount: x.amount })), ...(caja.total ? [{ cat: CAJA_CAT, amount: caja.total }] : [])].sort((a, b) => b.amount - a.amount);
  const gastosTotal = g.reduce((s, x) => s + x.amount, 0);
  const ing = { cancha: Math.round(cancha.cancha), bar: Math.round(barT.venta + barM.venta), planes: Math.round(planes.total), otros: Math.round(otros.total), total: 0 };
  ing.total = ing.cancha + ing.bar + ing.planes + ing.otros;
  const cmv = Math.round(barT.costo + barM.costo);
  const margenBruto = ing.total - cmv, resultado = margenBruto - Math.round(gastosTotal);
  return { from, to, days, turnos: cancha.turnos, capacidad, ocupacion: capacidad ? cancha.turnos / capacidad : 0, pasesPct: cancha.jug ? cancha.pases / cancha.jug : 0,
    ingresos: ing, cmv, barSinCosto: Math.round(barT.sin_costo + barM.sin_costo), margenBruto,
    gastos: g.map(x => ({ cat: x.cat, amount: Math.round(x.amount) })), gastosTotal: Math.round(gastosTotal), gastosFijos: Math.round(gastos.reduce((s, x) => s + x.fixed, 0)),
    resultado, margen: ing.total ? resultado / ing.total : 0, compras: Math.round(compras.total), planesVendidos: planes.n };
}
function empty(from: string, to: string): Summary {
  return { from, to, days: 0, turnos: 0, capacidad: 0, ocupacion: 0, pasesPct: 0, ingresos: { cancha: 0, bar: 0, planes: 0, otros: 0, total: 0 }, cmv: 0, barSinCosto: 0, margenBruto: 0, gastos: [], gastosTotal: 0, gastosFijos: 0, resultado: 0, margen: 0, compras: 0, planesVendidos: 0 };
}

/** Rentabilidad del bar por producto en el período */
export async function barProducts(clubId: string, from: string, to: string) {
  return q<{ name: string; emoji: string; qty: number; venta: number; costo: number | null }>(`
    with v as (
      select c.product_id as pid, c.qty, c.qty*c.unit_price as venta, c.qty*coalesce(c.unit_cost,p.cost) as costo
        from consumption c join booking b on b.id=c.booking_id join product p on p.id=c.product_id where b.club_id=$1 and b.status<>'cancelled' and b.date between $2 and $3
      union all
      select p.id, (i->>'qty')::int, (i->>'qty')::int*(i->>'price')::int, (i->>'qty')::int*coalesce((i->>'cost')::int,p.cost)
        from counter_sale cs cross join jsonb_array_elements(cs.items) i
        join product p on p.club_id=cs.club_id and (p.id = i->>'productId' or (i->>'productId' is null and p.name = i->>'name'))
        where cs.club_id=$1 and ${dayOf("cs.created_at")} between $2 and $3)
    select p.name, p.emoji, sum(v.qty)::int as qty, sum(v.venta)::float as venta, case when bool_or(v.costo is null) then null else sum(v.costo)::float end as costo
    from v join product p on p.id=v.pid group by p.id order by sum(v.venta) desc`, [clubId, from, to]);
}

/** Serie mensual de los últimos n meses (el actual incluido, hasta hoy) */
export async function monthly(clubId: string, n = 6) {
  const cur = nowAR().date.slice(0, 7);
  const months = Array.from({ length: n }, (_, i) => addMonths(cur, i - n + 1));
  const rows = await Promise.all(months.map(async ym => { const b = monthBounds(ym); const s = await summary(clubId, b.from, b.to);
    return { ym, label: monthLabel(ym), ingresos: s.ingresos.total, egresos: s.cmv + s.gastosTotal, resultado: s.resultado, partial: ym === cur }; }));
  return rows;
}

/** Valores reales de los últimos 90 días para arrancar la proyección */
export async function baseline(clubId: string) {
  const today = nowAR().date;
  // si el club arrancó hace menos de 90 días, se promedia desde el primer turno (si no, la ocupación sale baja)
  const first = await one<{ d: string | null }>("select min(date) as d from booking where club_id=$1 and status<>'cancelled'", [clubId]);
  const from = first?.d && first.d > addDays(today, -89) ? first.d : addDays(today, -89);
  const [s, club, courts, fixed, cajaG] = await Promise.all([summary(clubId, from, today), one("select court_price, open_times, finance from club where id=$1", [clubId]),
    one<{ n: number }>("select count(*)::int as n from court where club_id=$1 and active", [clubId]),
    one(`select coalesce(sum(amount),0)::float as t, count(distinct substr(date,1,7))::int as m from expense where club_id=$1 and date between $2 and $3`, [clubId, addDays(today, -89), today]),
    one<{ t: number }>("select coalesce(sum(amount),0)::float as t from cash_move where club_id=$1 and kind='gasto' and date between $2 and $3", [clubId, addDays(today, -89), today])]);
  const months = Math.max(1, s.days) / 30.4;
  const barTicket = s.turnos ? s.ingresos.bar / s.turnos : 0;
  const barCostKnown = s.ingresos.bar - s.barSinCosto;
  return {
    actual: {
      courts: courts?.n || 0, slotsPerDay: club.open_times.length, price: club.court_price,
      occupancy: Math.round(s.ocupacion * 1000) / 10, passPct: Math.round(s.pasesPct * 1000) / 10,
      barTicket: Math.round(barTicket), barMargin: barCostKnown > 0 ? Math.round((1 - s.cmv / barCostKnown) * 1000) / 10 : 45,
      plansPerMonth: Math.round((s.planesVendidos / Math.max(1, months)) * 10) / 10, planPrice: s.planesVendidos ? Math.round(s.ingresos.planes / s.planesVendidos) : 0,
      // gastos por mes: lo cargado dividido los meses que tienen gastos (máx. 3)
      fixedCosts: Math.round((fixed.t + (cajaG?.t || 0)) / Math.max(1, Math.min(3, fixed.m || 1))),
      otherIncome: Math.round(s.ingresos.otros / Math.max(1, months)),
    },
    saved: (club.finance || {}) as Record<string, number>,
    basedOn: { from, to: today, days: s.days, turnos: s.turnos, hasExpenses: fixed.t > 0, barWithoutCost: s.barSinCosto },
  };
}
