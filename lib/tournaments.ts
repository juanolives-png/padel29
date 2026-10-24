import { q, one } from "./db";
import { generate, type Fixture, type Results, type TConfig } from "./tournament";
export type TRow = { id: string; name: string; format: string; category: string; config: TConfig; fixture: Fixture; results: Results; created_at: string };
export async function getTournament(id: string): Promise<TRow | null> {
  const t = await one("select * from tournament where id=$1", [id]); if (!t) return null;
  if (!t.fixture) { t.fixture = generate(t.format, t.config); await q("update tournament set fixture=$2 where id=$1", [id, JSON.stringify(t.fixture)]); }
  t.results = t.results || { scores: {}, winners: {} }; t.results.scores ||= {}; t.results.winners ||= {};
  return JSON.parse(JSON.stringify(t));
}
export const listTournaments = (clubId: string) => q("select id,name,format,category,config,created_at from tournament where club_id=$1 order by created_at desc", [clubId]);
export const FORMAT_LABEL: Record<string, string> = { liga: "Liga semanal individual", zonas: "Fin de semana por parejas", americano: "Americano" };
