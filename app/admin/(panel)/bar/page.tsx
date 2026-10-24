import { getClub, getDay, getProducts } from "@/lib/data";
import { q } from "@/lib/db";
import { nowAR } from "@/lib/time";
import BarClient from "./BarClient";
import BarTabs from "./BarTabs";
export const metadata = { title: "Bar" };
export default async function Bar() {
  const club = await getClub(); const n = nowAR();
  const [products, day, courts] = await Promise.all([getProducts(club.id), getDay(club.id, n.date), q("select id,name from court where club_id=$1", [club.id])]);
  const cname = (id: string) => courts.find(c => c.id === id)?.name || "";
  const turnos = day.filter(b => !b.settled).sort((a, b) => a.start.localeCompare(b.start)).map(b => ({ id: b.id, label: `${b.start} · ${cname(b.court_id)} · ${b.holder_name}` }));
  return <div className="pos">
    <div className="pos-top"><h1>Bar</h1><BarTabs /></div>
    <BarClient products={products} turnos={turnos} />
  </div>;
}
