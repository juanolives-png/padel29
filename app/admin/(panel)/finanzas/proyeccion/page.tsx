import { getClub } from "@/lib/data";
import { baseline, addMonths } from "@/lib/finance";
import { nowAR } from "@/lib/time";
import FinTabs from "../FinTabs";
import ProyClient from "./ProyClient";

export const metadata = { title: "Proyección" };
export default async function Proyeccion() {
  const club = await getClub(); const b = await baseline(club.id);
  const start = addMonths(nowAR().date.slice(0, 7), 1);
  return <>
    <div className="page-head" style={{ marginBottom: 14 }}><div><h1>Proyección</h1><p>Los próximos 12 meses según los números reales del club. Cambiá cualquier supuesto y mirá cómo se mueve el resultado.</p></div><FinTabs /></div>
    <ProyClient actual={b.actual} saved={b.saved} basedOn={b.basedOn} start={start} />
  </>;
}
