"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCourt, saveClub, saveCourts } from "../../actions";
import { useToast } from "@/components/Toast";
export default function ConfigClient({ club, courts }: { club: any; courts: { id: string; name: string; kind: string }[] }) {
  const router = useRouter(); const toast = useToast(); const [pending, start] = useTransition();
  const [c, setC] = useState({ ...club, logo_url: club.logo_url || "", open_times: club.open_times.join(", ") });
  const [cs, setCs] = useState<{ id?: string; name: string; kind: string }[]>(courts);
  return <div className="grid2" style={{ alignItems: "start" }}>
    <form className="card stack" onSubmit={e => { e.preventDefault(); start(async () => { const r = await saveClub({ ...c, court_price: Number(c.court_price), sena_amount: Number(c.sena_amount), open_times: c.open_times.split(/[,\s]+/) }); toast.show(r.msg, !r.ok); router.refresh(); }); }}>
      <h3 style={{ margin: 0 }}>Club</h3>
      <div className="field"><label htmlFor="cn">Nombre</label><input id="cn" value={c.name} onChange={e => setC({ ...c, name: e.target.value })} /></div>
      <div className="field"><label htmlFor="ct">Frase</label><input id="ct" value={c.tagline} onChange={e => setC({ ...c, tagline: e.target.value })} /></div>
      <div className="grid2" style={{ gap: 10 }}>
        <div className="field"><label htmlFor="cp">Color principal</label><input id="cp" type="color" value={c.color_primary} onChange={e => setC({ ...c, color_primary: e.target.value })} style={{ height: 46 }} /></div>
        <div className="field"><label htmlFor="ca">Color de acento</label><input id="ca" type="color" value={c.color_accent} onChange={e => setC({ ...c, color_accent: e.target.value })} style={{ height: 46 }} /></div></div>
      <div className="field"><label htmlFor="cl">Logo (URL de la imagen, opcional)</label><input id="cl" value={c.logo_url} onChange={e => setC({ ...c, logo_url: e.target.value })} placeholder="https://…" /></div>
      <div className="field"><label htmlFor="cw">WhatsApp del club</label><input id="cw" value={c.whatsapp} onChange={e => setC({ ...c, whatsapp: e.target.value })} inputMode="tel" /></div>
      <div className="grid2" style={{ gap: 10 }}>
        <div className="field"><label htmlFor="cpr">Precio del turno (4 jugadores)</label><input id="cpr" type="number" value={c.court_price} onChange={e => setC({ ...c, court_price: e.target.value })} /></div>
        <div className="field"><label htmlFor="cs">Seña</label><input id="cs" type="number" value={c.sena_amount} onChange={e => setC({ ...c, sena_amount: e.target.value })} /></div></div>
      <div className="field"><label htmlFor="co">Horarios de inicio de turno</label><textarea id="co" rows={3} value={c.open_times} onChange={e => setC({ ...c, open_times: e.target.value })} /><span className="small muted">Separados por coma, formato HH:MM.</span></div>
      <button className="btn" disabled={pending}>Guardar</button>
    </form>
    <form className="card stack" onSubmit={e => { e.preventDefault(); start(async () => { const r = await saveCourts(cs); toast.show(r.msg, !r.ok); router.refresh(); }); }}>
      <h3 style={{ margin: 0 }}>Canchas</h3>
      {cs.map((x, i) => <div key={x.id || i} className="row"><input className="input" style={{ flex: 1 }} value={x.name} onChange={e => setCs(cs.map((y, j) => j === i ? { ...y, name: e.target.value } : y))} aria-label={`Nombre cancha ${i + 1}`} />
        <select className="input" style={{ width: 160 }} value={x.kind} onChange={e => setCs(cs.map((y, j) => j === i ? { ...y, kind: e.target.value } : y))} aria-label="Tipo"><option value="techada">Techada</option><option value="panoramica">Panorámica</option><option value="aire">Al aire libre</option></select>
        <button type="button" className="xbtn" title="Quitar cancha" aria-label={`Quitar ${x.name}`} disabled={pending || cs.length <= 1} onClick={() => {
          if (!x.id) { setCs(cs.filter((_, j) => j !== i)); return; }
          if (!confirm(`¿Quitar ${x.name}?`)) return;
          start(async () => {
            let r = await deleteCourt(x.id!);
            if (!r.ok && r.pending > 0 && confirm(`${x.name} tiene ${r.pending} turno${r.pending > 1 ? "s" : ""} desde hoy. ¿Cancelarlos y quitar la cancha igual?`)) r = await deleteCourt(x.id!, true);
            toast.show(r.msg, !r.ok); if (r.ok) { setCs(cs.filter((_, j) => j !== i)); router.refresh(); } }); }}>🗑</button></div>)}
      <button type="button" className="btn ghost sm" onClick={() => setCs([...cs, { name: `Cancha ${cs.length + 1}`, kind: "techada" }])}>+ Agregar cancha</button>
      <button className="btn" disabled={pending}>Guardar canchas</button>
    </form>{toast.node}
  </div>;
}
