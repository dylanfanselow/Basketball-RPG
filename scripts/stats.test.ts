import { it } from 'vitest';
import { makeGame, simToEnd } from '../tests/helpers';
it('stats', () => {
  for (let s = 1; s <= 3; s++) {
    const g = makeGame({ seed: s });
    simToEnd(g);
    const uniq = [...new Set([...g.teams[0].roster, ...g.teams[1].roster])];
    const sum = (k: string) => uniq.reduce((a, p) => a + (p.box as any)[k], 0);
    const kinds: Record<string, number> = {};
    for (const e of g.events) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    console.log(`seed ${s} over=${g.over} q=${g.quarter} ${g.teams[0].score}-${g.teams[1].score} fga ${sum('fga')} fgm ${sum('fgm')} 3pa ${sum('tpa')} ast ${sum('ast')} tov ${sum('tov')} stl ${sum('stl')} blk ${sum('blk')} reb ${sum('reb')}`, JSON.stringify(kinds));
    console.log('  fga by player', uniq.filter(p => p.box.fga).map(p => `${p.pos}:${p.box.fga}`).join(' '));
  }
});
