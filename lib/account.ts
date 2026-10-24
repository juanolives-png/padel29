export type AcctInput = {
  courtPrice: number; senaPaid: number; senaMode: string;
  players: { idx: number; name: string; passUsed: number; passKind: string }[];
  lines: { id: string; qty: number; unitPrice: number; playerIdx: number[]; name: string; emoji: string }[];
  payments: { playerIdx: number; amount: number }[];
};
const FR: Record<string, string> = { "1/2": "½", "1/3": "⅓", "1/4": "¼", "2/3": "⅔", "3/4": "¾" };
export function frac(q: number, n: number) {
  if (n === 1) return q > 1 ? "x" + q : "";
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a); const k = g(q, n); const s = `${q / k}/${n / k}`;
  return FR[s] || s;
}
export function computeAccount(b: AcctInput) {
  const players = [...b.players].sort((a, c) => a.idx - c.idx), n = players.length || 4;
  const courtBase = b.senaMode === "total" ? b.courtPrice - b.senaPaid : b.courtPrice;
  const owe = players.map(() => 0), paid = players.map(() => 0);
  const det: [string, number][][] = players.map(() => []);
  players.forEach((p, i) => {
    const share = courtBase / n;
    if (p.passUsed > 0) det[i].push([`Cancha ${frac(1, n)} · ${p.passUsed === 0.5 ? "medio pase" : "1 pase"} 29club`, 0]);
    else { owe[i] += share; det[i].push([`Cancha ${frac(1, n)}`, share]); }
  });
  // consumos de la mesa: todavía sin dueño, se asignan cuando alguien los paga
  const poolLines = b.lines.filter(l => !l.playerIdx.length);
  const pool = poolLines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  b.lines.filter(l => l.playerIdx.length).forEach(l => {
    const each = (l.unitPrice * l.qty) / l.playerIdx.length;
    l.playerIdx.forEach(pi => { const i = players.findIndex(p => p.idx === pi); if (i < 0) return; owe[i] += each; det[i].push([`${l.name} ${frac(l.qty, l.playerIdx.length)}`.trim(), each]); });
  });
  if (b.senaMode === "reserva" && b.senaPaid) paid[0] += b.senaPaid;
  b.payments.forEach(p => { const i = players.findIndex(x => x.idx === p.playerIdx); if (i >= 0) paid[i] += p.amount; });
  const due = owe.map((o, i) => (Math.abs(o - paid[i]) < 1 ? 0 : o - paid[i]));
  const consumos = b.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const passCover = players.reduce((s, p) => s + (p.passUsed > 0 ? courtBase / n : 0), 0);
  const total = b.courtPrice + consumos;
  const cobrado = b.senaPaid + b.payments.reduce((s, p) => s + p.amount, 0);
  const falta = due.reduce((s, d) => s + Math.max(0, d), 0) + pool;
  return { players, owe, paid, due, det, consumos, passCover, total, cobrado, falta, pool, poolLines, settled: falta < 1 && (b.payments.length > 0 || passCover > 0 || b.senaPaid >= b.courtPrice) };
}
