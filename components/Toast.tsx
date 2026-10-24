"use client";
import { useCallback, useRef, useState } from "react";
export function useToast() {
  const [t, setT] = useState<{ m: string; bad?: boolean } | null>(null); const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((m: string, bad?: boolean) => { setT({ m, bad }); clearTimeout(timer.current); timer.current = setTimeout(() => setT(null), 3200); }, []);
  const node = t ? <div className={"toast" + (t.bad ? " bad" : "")} role="status">{t.m}</div> : null;
  return { show, node };
}
