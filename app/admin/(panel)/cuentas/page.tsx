import { getClub } from "@/lib/data";
import { q } from "@/lib/db";
import CuentasClient from "./CuentasClient";
export const metadata = { title: "Cuentas" };
export default async function Cuentas() {
  const club = await getClub();
  const rows = await q<{ id: string; name: string; phone: string; balance: number; last: string | null }>(`select p.id, p.name, p.phone, coalesce(sum(m.amount),0)::int as balance, max(m.created_at) as last
    from player p left join account_move m on m.player_id=p.id where p.club_id=$1 group by p.id order by p.name`, [club.id]);
  return <>
    <div className="page-head"><div><h1>Cuentas corrientes</h1><p>Lo que cada jugador tiene a favor (por un vuelto que dejó) o debe (porque se fue sin pagar). Se usa desde el cobro del turno.</p></div></div>
    <CuentasClient rows={JSON.parse(JSON.stringify(rows))} />
  </>;
}
