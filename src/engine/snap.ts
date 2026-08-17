/** Snap thresholds in px. Mag is attraction while dragging, not pack-from-zero. */
export const SNAP_EDGE_PX = 10;
export const SNAP_MAG_PX = 14;
export const SNAP_ZERO_PX = 22;
export const SNAP_ZERO_MAG_PX = 36;

export function snapTime(
  t: number,
  points: number[],
  enabled: boolean,
  opts?: {
    zoom?: number;
    mag?: boolean;
    origin?: number;
    prev?: number;
  },
): { t: number; hit: number | null } {
  const clamped = Math.max(0, t);
  if (!enabled) return { t: clamped, hit: null };

  const zoom = Math.max(1, opts?.zoom ?? 80);
  const mag = !!opts?.mag;
  const edgeR = Math.max(0.06, (mag ? SNAP_MAG_PX : SNAP_EDGE_PX) / zoom);
  const zeroR = Math.max(0.12, (mag ? SNAP_ZERO_MAG_PX : SNAP_ZERO_PX) / zoom);

  const origin = opts?.origin;
  const prev = opts?.prev;
  const away = origin != null && Math.abs(t - origin) > edgeR * 0.35;

  let best = clamped;
  let bestDist = Infinity;
  let hit: number | null = null;

  const consider = (o: number) => {
    if (!Number.isFinite(o)) return;
    if (away && origin != null && Math.abs(o - origin) < 1e-4) return;
    // Drag through / away: once the pointer is leaving a target, do not recapture it.
    if (prev != null && Math.abs(t - o) > Math.abs(prev - o) + 1e-6) return;
    const radius = Math.abs(o) < 1e-6 ? zeroR : edgeR;
    const dd = Math.abs(o - t);
    if (dd <= radius && dd < bestDist) {
      bestDist = dd;
      best = o;
      hit = o;
    }
  };

  consider(0);
  for (const o of points) consider(o);

  return { t: Math.max(0, best), hit };
}
