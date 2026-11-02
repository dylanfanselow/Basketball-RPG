/** Picking which of your stats the top-left box score shows. Pure (no Phaser), so it can be tested. */

/** Box-score importance weights: a steal or block is worth about 3 points, an assist a bit more than a board. */
export const STAT_WEIGHTS = { pts: 1, reb: 1.3, ast: 1.5, stl: 3, blk: 3 } as const;
const STAT_LABEL: Record<keyof typeof STAT_WEIGHTS, string> = { pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK' };
/** Your three most valuable stats (value × weight); ties PTS > AST > REB > STL > BLK; padded with PTS/REB/AST. */
export function topStats(box: { pts: number; reb: number; ast: number; stl: number; blk: number }): { key: string; label: string; value: number }[] {
  const order: (keyof typeof STAT_WEIGHTS)[] = ['pts', 'ast', 'reb', 'stl', 'blk'];
  const picked = order.filter((k) => box[k] > 0).sort((a, b) => box[b] * STAT_WEIGHTS[b] - box[a] * STAT_WEIGHTS[a] || order.indexOf(a) - order.indexOf(b)).slice(0, 3);
  for (const k of ['pts', 'reb', 'ast'] as const) if (picked.length < 3 && !picked.includes(k)) picked.push(k);
  return picked.map((k) => ({ key: k, label: STAT_LABEL[k], value: box[k] }));
}
