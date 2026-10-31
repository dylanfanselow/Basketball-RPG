import { it } from 'vitest';
import { makeGame } from '../tests/helpers';
it('debug', () => {
  const g = makeGame();
  const inp = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
  const dt = 1 / 30;
  let last = '';
  for (let t = 0; t < 400; t += dt) {
    g.update(dt, inp);
    const h = g.holder();
    const s = `${g.ball.st.kind} ${h ? h.name + '(' + h.team + ')' : ''} live=${g.live} poss=${g.possession} sc=${g.shotClock.toFixed(0)} clock=${g.clock.toFixed(0)} play=${g.runner.playId}:${g.runner.phase}`;
    if (Math.floor(t) % 5 === 0 && Math.floor(t) !== Math.floor(t - dt)) console.log(t.toFixed(0), s, h ? `${h.p.x.toFixed(1)},${h.p.y.toFixed(1)}` : `${g.ball.p.x.toFixed(1)},${g.ball.p.y.toFixed(1)} z${g.ball.z.toFixed(1)}`);
    for (const e of g.drainEvents()) console.log('   ev', t.toFixed(1), e.text);
  }
});
