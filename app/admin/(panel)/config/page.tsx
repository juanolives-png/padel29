import { getClub, getCourts } from "@/lib/data";
import ConfigClient from "./ConfigClient";
export const metadata = { title: "Configuración" };
export default async function Config() {
  const club = await getClub(); const courts = await getCourts(club.id);
  return <><div className="page-head"><div><h1>Configuración</h1><p>Marca, precios, horarios y canchas. Los cambios se ven al instante en la app del jugador.</p></div></div>
    <ConfigClient club={JSON.parse(JSON.stringify(club))} courts={courts} /></>;
}
