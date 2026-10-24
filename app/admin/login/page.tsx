"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login } from "../actions";
function Btn() { const { pending } = useFormStatus(); return <button className="btn block" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>; }
export default function Login() {
  const [st, act] = useActionState(login, { msg: "" });
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--pri)", padding: 16 }}>
    <form action={act} className="modal" style={{ width: "min(380px,100%)" }}>
      <span className="eyebrow">Panel del club</span><h3>Ingresar</h3>
      <div className="field"><label htmlFor="pw">Contraseña</label><input id="pw" name="password" type="password" autoComplete="current-password" required /></div>
      {st?.msg && <p style={{ color: "var(--bad)", margin: 0 }}>{st.msg}</p>}<Btn />
    </form></main>;
}
