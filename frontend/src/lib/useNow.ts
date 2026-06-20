import { useEffect, useState } from 'react';
import type { TFunc } from './i18n';

/** A clock that re-renders every `intervalMs` so countdowns stay live. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Translatable countdown — visible words flow through `t` so the label
    localizes; the numeric fields stay as-is. */
export function formatCountdown(deadlineMs: number, now: number, t: TFunc): string {
  const ms = deadlineMs - now;
  if (ms <= 0) return t('deadline passed');
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return t('{d}d {h}h left', { d, h });
  if (h > 0) return t('{h}h {m}m left', { h, m });
  if (m > 0) return t('{m}m {sec}s left', { m, sec });
  return t('{sec}s left', { sec });
}
