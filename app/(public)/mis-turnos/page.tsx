import MyClient from "./MyClient";
export const metadata = { title: "Mis turnos" };
export default function Page() {
  return <main className="wrap page"><div className="page-head"><div><h1>Mis turnos</h1><p>Con tu celular ves tus reservas, tus pases de 29club y tus puntos.</p></div></div><MyClient /></main>;
}
