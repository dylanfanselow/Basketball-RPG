/**
 * Post up (hold L2 with the ball): back your defender down. The stick only goes straight toward or away from the
 * rim. The strength battle (post vs postD, both mostly Strength) decides how it goes:
 *   - stronger (gap >= POST.NOTICE): discrete bumps toward the rim that stun-lock the defender (no contest);
 *   - even: a slow continuous push, the defender giving ground (he only half-contests);
 *   - weaker (gap <= -POST.NOTICE): you barely move and he can bump you back, stunning you for a second.
 * Let go of L2 and the defender stays locked in his bumped pose for a short window: post shots (hook / floater /
 * layup / fade) out of it.
 *
 * Phaser-free. GameSim calls postControl-style inputs (p.postHeldIn / p.postStickIn, set by the user's input or the
 * AI each tick) and runs updatePost() after think and before physics: it sets the posting pair's positions directly
 * and zeroes their velocity, so physics leaves them where the post put them.
 */
import type { GameSim } from './game';
import { Player, PostMode } from './player';
import { Vec, add, dist, dot, norm, scale, sub, v } from './math';

export const POST = {
  /** farthest from the rim you can start / keep a post up (ft) */
  RANGE: 20,
  /** a defender this close on the rim side gets engaged (ft) */
  ENGAGE: 4.5,
  /** contact spacing: the defender sits this far toward the rim from you (ft) */
  GAP: 2.0,
  /** "noticeably" stronger / weaker: post - postD gap */
  NOTICE: 8,
  /** stronger: one bump every BUMP_PERIOD while pushing, each moving BUMP_STEP ft over BUMP_DUR s */
  BUMP_PERIOD: 0.8, BUMP_DUR: 0.3, BUMP_STEP: 1.5,
  /** even: continuous push speed; weaker: what's left of it; with nobody on you: walking it in */
  EVEN_SPEED: 1.1, WEAK_SPEED: 0.35, FREE_SPEED: 2.0,
  /** stepping back out (stick away from the rim) */
  AWAY_SPEED: 2.5,
  /** the push stops here (ft from the rim) */
  MIN_RIM: 4.5,
  /** after letting go: your scoring window, and how long the defender stays locked / sealed */
  WINDOW: 0.6,
  /** weaker: the defender tries to bump you back this often; you go back BACK_STEP ft and are stunned BACK_STUN s */
  BACK_EVERY: 1.1, BACK_STEP: 1.5, BACK_DUR: 0.25, BACK_STUN: 1.0,
  // ---- commitment (round 44: mashing L2 was overpowered) ----
  /** once you post up you're in it for at least this long (letting go early doesn't end it) */
  COMMIT: 0.9,
  /** after a post ends you can't start another for this long */
  REPOST_CD: 1.4,
  /** the first bump comes this long after you engage (no instant bump on every press) */
  FIRST_BUMP: 0.55,
  /** even battles: you must have leaned in this long for the window to seal him */
  SEAL_PUSH: 0.35,
  /** backing down exposes the ball: swipes on a posting player are this much likelier */
  STEAL_MULT: 1.6,
  /** once the double arrives, the helper digs at the ball only after this long (your moment to kick it out) */
  HELP_REACT: 0.55,
  /** a strength edge of HELP_GAP+ may draw a second defender: chance HELP_MIN there, rising with the gap to HELP_MAX;
   *  the rotation takes HELP_DELAY s */
  HELP_GAP: 4, HELP_MIN: 0.15, HELP_MAX: 0.85, HELP_DELAY: [0.5, 1.0] as [number, number],
  /** round 74: the double comes for who he is too: a star (or a man the heat has at tier 2+) HELP_STAR, a real post
   *  scorer (Post HELP_POST_RATING+) HELP_SCORER, whatever the strength battle says */
  HELP_STAR: 0.6, HELP_SCORER: 0.35, HELP_POST_RATING: 75,
};
/** Chance the defense doubles a post with this strength gap (only when the attacker has a strength edge). */
export const helpChance = (gap: number) => gap < POST.HELP_GAP ? 0 : Math.min(POST.HELP_MAX, POST.HELP_MIN + (gap - POST.HELP_GAP) / 18);

/** The strength gap: positive = the attacker is stronger. */
export const postGap = (atk: Player, def: Player) => atk.sub.post - def.sub.postD;
export function postMode(gap: number): PostMode {
  return gap >= POST.NOTICE ? 'stronger' : gap <= -POST.NOTICE ? 'weaker' : 'even';
}
/** Chance the stronger defender bumps you back at each try (weaker mode). */
export const bumpBackChance = (gap: number) => Math.min(0.9, Math.max(0.35, 0.35 + (-gap - POST.NOTICE) / 30));

/** The defender you'd post: your man's defender, else the nearest opponent, within reach on the rim side. */
export function postDefender(sim: GameSim, p: Player): Player | null {
  const rim = sim.rim(p.team), toRim = norm(sub(rim, p.p));
  const ok = (d: Player | null) => !!d && d.state !== 'fallen' && dist(d.p, p.p) <= POST.ENGAGE && dot(sub(d.p, p.p), toRim) > 0.3;
  const own = sim.defenderOf(p);
  if (ok(own)) return own;
  let best: Player | null = null, bd = 1e9;
  for (const d of sim.opp(p.team)) { const r = dist(d.p, p.p); if (ok(d) && r < bd) { bd = r; best = d; } }
  return best;
}

/** Can this ball handler post up right now? */
export function canPost(sim: GameSim, p: Player): boolean {
  return sim.live && sim.holder() === p && !p.deadDribble && p.state === 'idle' && p.z === 0 && dist(p.p, sim.rim(p.team)) <= POST.RANGE;
}

const byId = (sim: GameSim, id: string | null) => (id ? sim.players.find((q) => q.id === id) ?? null : null);

function engage(sim: GameSim, p: Player) {
  const d = postDefender(sim, p);
  if (!d || !p.post) return;
  const gap = postGap(p, d);
  p.post.defId = d.id; p.post.gap = gap; p.post.mode = postMode(gap);
  p.postDefId = d.id;
  d.postedBy = p.id;
}

function startPost(sim: GameSim, p: Player) {
  p.post = { defId: null, mode: 'even', gap: 0, nextBumpAt: sim.time + POST.FIRST_BUMP, since: sim.time, pushing: false, bumps: 0, pushT: 0, helpId: null, helpAt: 0, helpCalled: false, helpArrivedAt: 0 };
  p.postDefId = null;
  engage(sim, p);
  const d = byId(sim, p.post.defId);
  // a mismatch: the defense may rotate a second defender over (he leaves his man, so someone's open for the kick-out)
  const hc = d ? Math.max(helpChance(p.post.gap), p.star || sim.tierOf(p) >= 2 ? POST.HELP_STAR : p.sub.post >= POST.HELP_POST_RATING ? POST.HELP_SCORER : 0) : 0;
  if (d && hc > 0 && sim.rng.chance(hc)) {
    let best: Player | null = null, bd = 1e9;
    for (const o of sim.opp(p.team)) {
      if (o === d || !sim.isAI(o) || o.state === 'fallen') continue;
      const r = dist(o.p, p.p); if (r < bd && r < 22) { bd = r; best = o; }
    }
    if (best) { p.post.helpId = best.id; p.post.helpAt = sim.time + sim.rng.range(POST.HELP_DELAY[0], POST.HELP_DELAY[1]); }
  }
  const label = p.post.mode === 'stronger' ? 'STRONGER: bump him' : p.post.mode === 'weaker' ? 'WEAKER: he can bump you back' : 'EVEN: lean on him';
  sim.emit({ kind: 'post', text: d ? `POST UP · ${label} (${p.sub.post.toFixed(0)} vs ${d.sub.postD.toFixed(0)})` : 'POST UP', pid: p.id, quiet: !sim.isHuman(p) });
}

/**
 * End the post. seal = you let go (not stripped / passed / moved): you get the scoring window and your defender
 * stays locked (stronger) or sealed (even) in his bumped pose for it. Weaker battles give no window.
 */
export function endPost(sim: GameSim, p: Player, seal: boolean) {
  const post = p.post;
  if (!post) return;
  const d = byId(sim, post.defId);
  p.post = null;
  p.postCdUntil = sim.time + POST.REPOST_CD; // no instant re-post
  if (d && d.postedBy === p.id) d.postedBy = null;
  if (!seal || !d || post.mode === 'weaker' || sim.time < p.stunnedUntil) return;
  // the window has to be earned: a bump landed (stronger) or a real lean (even); a quick tap gives nothing
  if (post.mode === 'stronger' ? post.bumps < 1 : post.pushT < POST.SEAL_PUSH) return;
  const until = sim.time + POST.WINDOW;
  p.postWindowUntil = until;
  p.postBumpAt = sim.time; // the final seal bump
  if (post.mode === 'stronger') d.postLockUntil = Math.max(d.postLockUntil, until);
  else d.postSealUntil = Math.max(d.postSealUntil, until);
  lockDefender(sim, d, until, 'postBumped');
}

/** Freeze a posted defender in his bumped pose (no actions, no jumping at the shot) until `until`. */
function lockDefender(sim: GameSim, d: Player, until: number, anim: string) {
  d.stunnedUntil = Math.max(d.stunnedUntil, until);
  d.jumpAt = 0; d.move = null;
  if (d.state === 'dribbleMove' || d.state === 'jump' || d.state === 'swipe' || d.state === 'charge') d.state = 'idle';
  if (!d.anim || d.anim.name !== anim || sim.time - d.anim.start > 0.5) d.anim = { name: anim, start: sim.time, dur: until - sim.time };
}

/**
 * A shot out of the post (while posting, or in the window): your defender stays locked / sealed through the
 * release, then the post ends.
 */
export function onPostShot(sim: GameSim, p: Player, releaseAt: number) {
  const inPost = !!p.post, inWindow = sim.time < p.postWindowUntil;
  if (!inPost && !inWindow) return;
  const mode = p.post?.mode;
  const d = byId(sim, p.post?.defId ?? p.postDefId);
  if (p.post) endPost(sim, p, false);
  if (!d) return;
  const until = releaseAt + 0.1;
  if (sim.time < d.postLockUntil || mode === 'stronger') { d.postLockUntil = Math.max(d.postLockUntil, until); lockDefender(sim, d, until, 'postBumped'); }
  else if (sim.time < d.postSealUntil || mode === 'even') { d.postSealUntil = Math.max(d.postSealUntil, until); lockDefender(sim, d, until, 'postBumped'); }
}

/** Is this defender locked out of the play by a post (no jumping / blocking)? */
export const postLocked = (sim: GameSim, d: Player) => sim.time < d.postLockUntil || sim.time < d.postSealUntil;

/**
 * Per tick, before physics. The ball handler's intent comes from p.postHeldIn / p.postStickIn (set this tick by the
 * user's input or the AI), which are cleared here.
 */
export function updatePost(sim: GameSim, dt: number) {
  const h = sim.holder();
  for (const p of sim.players) if (p.post && (p !== h || !sim.live || p.state === 'shoot' || p.state === 'dribbleMove' || p.state === 'fallen')) endPost(sim, p, false);
  for (const d of sim.players) if (d.postedBy && !byId(sim, d.postedBy)?.post) d.postedBy = null;
  if (!h) return;
  const held = h.postHeldIn, stick = h.postStickIn;
  h.postHeldIn = false; h.postStickIn = v();
  const stunned = sim.time < h.stunnedUntil;
  if (!h.post) {
    if (held && !stunned && canPost(sim, h)) {
      if (sim.time < h.postCdUntil) {
        if (sim.isHuman(h) && sim.time - h.postCdMsgAt > 0.8) { h.postCdMsgAt = sim.time; sim.emit({ kind: 'post', text: `Post up recovering… ${(h.postCdUntil - sim.time).toFixed(1)}s`, pid: h.id }); }
        return;
      }
      startPost(sim, h);
    } else return;
  } else if (!held && !stunned && sim.time - h.post.since >= POST.COMMIT) { endPost(sim, h, true); return; }
  const post = h.post!;
  const rim = sim.rim(h.team);
  const toRim = norm(sub(rim, h.p));
  let move = 0;

  if (stunned) {
    // bumped back by a stronger defender: slide away from the rim, then wait it out (the post resumes if L2 is held)
    if (sim.time < h.postBumpedBackAt + POST.BACK_DUR) move = -POST.BACK_STEP * dt / POST.BACK_DUR;
    if (!held && sim.time + dt >= h.stunnedUntil) { endPost(sim, h, false); }
  } else {
    let d = byId(sim, post.defId);
    if (!d || d.postedBy !== h.id || dist(d.p, h.p) > POST.ENGAGE + 0.5) { if (d && d.postedBy === h.id) d.postedBy = null; post.defId = null; engage(sim, h); d = byId(sim, post.defId); }
    const along = dot(stick, toRim);
    const toward = along > 0.3, away = along < -0.3;
    post.pushing = toward;
    const room = dist(h.p, rim) > POST.MIN_RIM;
    if (away) move = -POST.AWAY_SPEED * dt;
    else if (toward && room) {
      if (!d) move = POST.FREE_SPEED * dt;
      else if (post.mode === 'stronger') {
        if (sim.time >= post.nextBumpAt) {
          h.postBumpAt = sim.time; post.nextBumpAt = sim.time + POST.BUMP_PERIOD; post.bumps++;
          const lock = sim.time + POST.BUMP_PERIOD + POST.BUMP_DUR;
          d.postLockUntil = Math.max(d.postLockUntil, lock);
          lockDefender(sim, d, lock, 'postBumped');
          d.anim = { name: 'postBumped', start: sim.time, dur: lock - sim.time };
          sim.quiet('contact', { hard: true, post: true }, h.id);
        }
        if (sim.time < h.postBumpAt + POST.BUMP_DUR) move = POST.BUMP_STEP * dt / POST.BUMP_DUR;
      } else { move = (post.mode === 'even' ? POST.EVEN_SPEED : POST.WEAK_SPEED) * dt; post.pushT += dt; }
    }
    // the double team arrives: tell the player to kick it out
    const help = byId(sim, post.helpId);
    if (help && !post.helpCalled && sim.time >= post.helpAt && dist(help.p, h.p) < 4.5) {
      post.helpCalled = true; post.helpArrivedAt = sim.time;
      sim.emit({ kind: 'post', text: `DOUBLE TEAM: ${help.name} comes over · pass it out!`, pid: h.id, quiet: !sim.isHuman(h) });
    }
    // weaker: the defender fights back
    if (d && post.mode === 'weaker' && sim.time >= post.nextBumpAt) {
      post.nextBumpAt = sim.time + POST.BACK_EVERY;
      if (sim.rng.chance(bumpBackChance(post.gap))) {
        h.postBumpedBackAt = sim.time;
        sim.stun(h, POST.BACK_STUN, 'postBumpedBack');
        d.postedBy = null; post.defId = null;
        sim.quiet('contact', { hard: true, post: true }, d.id);
        sim.emit({ kind: 'post', text: `${d.name} bumps you back!`, pid: h.id, quiet: !sim.isHuman(h) });
        move = 0;
      }
    }
    // keep the defender on your back
    if (d && post.defId === d.id) {
      d.vel = v(); d.want = v();
      d.face = scale(toRim, -1);
    }
  }
  h.p = sim.clampFor(h, add(h.p, scale(toRim, move)));
  h.vel = v(); h.want = v();
  h.face = scale(norm(sub(rim, h.p)), -1); // back to the basket
  const d = byId(sim, post.defId);
  if (d && h.post) d.p = sim.clampFor(d, add(h.p, scale(norm(sub(rim, h.p)), POST.GAP)));
}

/** Movement intent for the posting player this tick (the AI's version of holding L2 + the stick). */
export function postIntent(p: Player, held: boolean, stick: Vec) { p.postHeldIn = held; p.postStickIn = stick; }
