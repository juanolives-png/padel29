import { getClub } from "@/lib/data";
import { Brand } from "@/components/Brand";
import { PublicNav } from "@/components/PublicNav";
import Link from "next/link";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const club = await getClub();
  return (
    <>
      <header className="topbar"><div className="wrap"><Brand name={club.name} logo={club.logo_url} /><PublicNav /></div></header>
      {children}
      <footer className="site"><div className="wrap between"><span>{club.name}{club.whatsapp ? ` · WhatsApp ${club.whatsapp}` : ""}</span><Link href="/admin" className="small">Ingreso del club</Link></div></footer>
    </>
  );
}
