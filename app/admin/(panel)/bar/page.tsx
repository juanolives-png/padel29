import { getClub, getDay, getProducts } from "@/lib/data";
import { q } from "@/lib/db";
import { nowAR, fmt } from "@/lib/time";
import BarClient from "./BarClient";
export const metadata = { title: "Bar" };
export default async function Bar() {
  const club = await getClub(); const n = nowAR();
  const [products, day, cons, sales] = await Promise.all([getProducts(club.id, true), getDay(club.id, n.date),
    q<{ s: number }>("select coalesce(sum(c.qty*c.unit_price),0)::int as s from consumption c join booking b on b.id=c.booking_id where b.club_id=$1 and b.date=$2 and b.status<>'cancelled'", [club.id, n.date]),
    q<{ s: number; c: number }>("select coalesce(sum(total),0)::int as s, count(*)::int as c from counter_sale where club_id=$1 and (created_at at time zone 'America/Argentina/Buenos_Aires')::date = $2::date", [club.id, n.date])]);
  const open = day.filter(b => b.hasActivity && b.falta >= 1).sort((a, b) => a.start.localeCompare(b.start));
  const turnos = day.filter(b => !b.settled).sort((a, b) => a.start.localeCompare(b.start));
  const courts = await q("select id,name from court where club_id=$1", [club.id]);
  const cname = (id: string) => courts.find(c => c.id === id)?.name || "";
  const low = products.filter(p => p.active && p.stock != null && p.stock < 10);
  const top = [...products].sort((a, b) => b.sold - a.sold)[0];
  return <>
    <div className="page-head"><div><h1>Bar y consumos</h1><p>Venta de mostrador, cuentas abiertas de los turnos de hoy y stock. Lo que se carga a un turno se divide entre los jugadores que elijas.</p></div></div>
    <div className="grid4" style={{ marginBottom: 16 }}>
      <div className="card kpi"><div className="l">Ventas del bar hoy</div><div className="v">{fmt(cons[0].s + sales[0].s)}</div><div className="small muted">{fmt(cons[0].s)} en turnos · {fmt(sales[0].s)} en mostrador</div></div>
      <div className="card kpi"><div className="l">Cuentas abiertas</div><div className="v">{open.length}</div><div className="small muted">{fmt(open.reduce((s, b) => s + b.falta, 0))} por cobrar</div></div>
      <div className="card kpi"><div className="l">Lo más vendido</div><div className="v" style={{ fontSize: 24 }}>{top ? `${top.emoji} ${top.name}` : "—"}</div><div className="small muted">{top ? `${top.sold} unidades` : ""}</div></div>
      <div className="card kpi"><div className="l">Stock bajo</div><div className="v">{low.length}</div><div className="small muted">{low.map(p => p.name).join(", ") || "Todo en orden"}</div></div>
    </div>
    <BarClient products={products} open={open.map(b => ({ id: b.id, label: `${cname(b.court_id)} · ${b.start}`, holder: b.holder_name, falta: b.falta, ok: `${b.okPlayers}/${b.nPlayers}` }))}
      turnos={turnos.map(b => ({ id: b.id, label: `${cname(b.court_id)} · ${b.start} · ${b.holder_name}` }))} />
  </>;
}
