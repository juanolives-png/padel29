import { getClub, getDay, getProducts, getTabs } from "@/lib/data";
import { q } from "@/lib/db";
import { nowAR } from "@/lib/time";
import BarTabs from "../BarTabs";
import VentasClient from "./VentasClient";
export const metadata = { title: "Ventas y stock" };
export default async function Ventas() {
  const club = await getClub(); const n = nowAR();
  const [products, day, cons, sales, courts, tabs] = await Promise.all([getProducts(club.id, true), getDay(club.id, n.date),
    q<{ s: number }>("select coalesce(sum(c.qty*c.unit_price),0)::int as s from consumption c join booking b on b.id=c.booking_id where b.club_id=$1 and b.date=$2 and b.status<>'cancelled'", [club.id, n.date]),
    q<{ s: number; c: number }>("select coalesce(sum(total),0)::int as s, count(*)::int as c from counter_sale where club_id=$1 and (created_at at time zone 'America/Argentina/Buenos_Aires')::date = $2::date", [club.id, n.date]),
    q("select id,name from court where club_id=$1", [club.id]), getTabs(club.id)]);
  const cname = (id: string) => courts.find(c => c.id === id)?.name || "";
  const open = day.filter(b => b.hasActivity && b.falta >= 1).sort((a, b) => a.start.localeCompare(b.start))
    .map(b => ({ id: b.id, label: `${b.start} · ${cname(b.court_id)}`, holder: b.holder_name, falta: b.falta, ok: `${b.okPlayers}/${b.nPlayers}` }))
    .concat(tabs.filter(t => t.falta >= 1).map(t => ({ id: t.id, label: `🍺 ${t.tab_name}`, holder: `mesa del bar · desde ${t.start}`, falta: t.falta, ok: `${t.okPlayers}/${t.nPlayers}` })));
  return <>
    <div className="pos-top" style={{ marginBottom: 18 }}><h1>Bar</h1><BarTabs /></div>
    <VentasClient products={products} open={open} kpi={{ turnos: cons[0].s, mostrador: sales[0].s, tickets: sales[0].c }} sena={club.sena_amount} />
  </>;
}
