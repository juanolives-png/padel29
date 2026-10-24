import Link from "next/link";
export function Brand({ name, logo, href = "/" }: { name: string; logo?: string | null; href?: string }) {
  return <Link href={href} className="brand" aria-label={name}>{logo ? <img src={logo} alt="" /> : <span className="dot" aria-hidden />}<span>{name}</span></Link>;
}
