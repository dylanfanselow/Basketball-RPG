import { app } from '../state';
import { CORE_STATS, TREES, ULTIMATES, PLAYS, NODES } from '../sim/data';
import { POSITIONS, HEIGHTS } from '../sim/attributes';
import { newCareer } from '../career/career';
import { Player } from '../sim/player';

/**
 * Developer tools overlay (F1 / ` / Back+Start). Everything applies live: to the career save
 * AND to the player currently on the court.
 */
const PRESET_KEY = 'hoopcareer.presets';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) (e as any)[k] = v;
    else if (k === 'style') e.setAttribute('style', v);
    else if (k in e) (e as any)[k] = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k);
  return e;
}

function livePlayer(): Player | null { return app.sim?.user ?? null; }

/** Push career core/nodes/extra into the live sim player. */
function syncLive() {
  const p = livePlayer();
  const c = app.career;
  if (p) {
    p.core = { ...c.core };
    p.nodes = new Set(c.nodes);
    p.recompute();
    if (app.sim) app.sim.ult.state = { unlocked: !!c.flags.ult_unlocked, id: c.ult.id, level: c.ult.level };
  }
  app.changed();
}

export function initDevPanel() {
  const root = el('div', { id: 'dev' });
  document.body.append(root);
  let open = false;
  const toggle = () => { open = !open; root.style.display = open ? 'block' : 'none'; if (open) render(); };
  (window as any).__toggleDev = toggle;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F1' || e.key === '`') { e.preventDefault(); toggle(); }
  });
  root.style.display = 'none';
  setInterval(() => { if (open) refreshLive(); }, 250);

  let liveBox: HTMLElement;
  function refreshLive() {
    if (!liveBox) return;
    const s = app.sim, p = livePlayer();
    if (!s || !p) { liveBox.textContent = 'No game running.'; return; }
    const top = ['three', 'mid', 'layup', 'dunk', 'floater', 'speed', 'ballSpeed', 'ankleBreak', 'perimD', 'steal', 'block', 'rebound', 'screen', 'driveStability', 'passSpeed'];
    liveBox.textContent = [
      `state ${p.state}  stamina ${(p.stamina * 100).toFixed(0)}%  ult ${p.ultCharge.toFixed(0)}  on court: ${s.userOnCourt}`,
      `walk ${p.walkSpeed.toFixed(1)} ft/s  sprint ${p.sprintSpeed.toFixed(1)}  jump ${p.jumpVel.toFixed(1)}  pass ${p.passSpeed.toFixed(0)} ft/s  safe pass ${p.safePassDist.toFixed(0)} ft`,
      top.map((k) => `${k} ${p.sub[k].toFixed(0)}`).join(' · '),
      `moves: ${[...p.mods.moves].join(', ') || '(basic only)'}   shots: ${[...p.mods.shotTypes].join(', ') || '-'}`,
      `trust team ${s.trust.team.toFixed(1)} coach ${s.trust.coach.toFixed(1)}   play: ${s.runner.play?.name ?? '-'} phase ${s.runner.phase}`,
    ].join('\n');
  }

  function section(name: string, ...kids: (Node | string)[]) {
    const det = el('details', { open: ['Core stats', 'Perks / moves / abilities', 'Game controls'].includes(name) }, el('summary', {}, name), ...kids);
    return det;
  }
  function btn(label: string, fn: () => void, title = '') { return el('button', { onclick: () => { fn(); render(); }, title }, label); }
  function check(label: string, val: boolean, fn: (v: boolean) => void) {
    const inp = el('input', { type: 'checkbox', checked: val, onchange: (e: any) => fn(e.target.checked) });
    return el('label', { class: 'chk' }, inp, ' ' + label);
  }
  function slider(label: string, min: number, max: number, step: number, val: number, fn: (v: number) => void) {
    const out = el('span', { class: 'val' }, String(val));
    const inp = el('input', { type: 'range', min, max, step, value: val, oninput: (e: any) => { out.textContent = e.target.value; fn(Number(e.target.value)); } });
    return el('div', { class: 'row' }, el('span', { class: 'lbl' }, label), inp, out);
  }

  function render() {
    const c = app.career;
    const s = app.sim;
    root.innerHTML = '';
    root.append(el('div', { class: 'hdr' }, el('b', {}, 'DEV TOOLS'), el('span', {}, '  F1 / ` / Back+Start to close'), btn('×', toggle)));

    liveBox = el('pre', { class: 'live' });
    root.append(section('Live readout', liveBox));
    refreshLive();

    // core stats
    const stats = el('div');
    for (const st of CORE_STATS) stats.append(slider(st, 25, 99, 1, c.core[st], (v) => { c.core[st] = v; syncLive(); }));
    stats.append(el('div', { class: 'row' },
      btn('All 40', () => { for (const st of CORE_STATS) c.core[st] = 40; syncLive(); }),
      btn('All 60', () => { for (const st of CORE_STATS) c.core[st] = 60; syncLive(); }),
      btn('All 85', () => { for (const st of CORE_STATS) c.core[st] = 85; syncLive(); }),
      btn('All 99', () => { for (const st of CORE_STATS) c.core[st] = 99; syncLive(); }),
    ));
    stats.append(el('div', { class: 'row' },
      el('span', { class: 'lbl' }, 'position'),
      el('select', { onchange: (e: any) => { c.pos = e.target.value; c.height = HEIGHTS[c.pos]; app.changed(); } }, ...POSITIONS.map((p) => el('option', { value: p, selected: p === c.pos }, p))),
      el('span', { class: 'note' }, ' (restart game to apply)'),
    ));
    stats.append(el('div', { class: 'row' },
      btn('+5 stat pts', () => { c.statPoints += 5; app.changed(); }),
      btn('+3 perk pts', () => { c.perkPoints += 3; app.changed(); }),
      btn('+1 level', () => { c.level++; c.statPoints += 3; c.perkPoints++; app.changed(); }),
    ));
    root.append(section('Core stats', stats));

    // perks
    const perks = el('div');
    perks.append(el('div', { class: 'row' },
      btn('Unlock ALL', () => { c.nodes = Object.keys(NODES); syncLive(); }),
      btn('Remove ALL', () => { c.nodes = []; syncLive(); }),
      btn('All dribble moves', () => { c.nodes = [...new Set([...c.nodes, ...TREES.find((t) => t.id === 'dribbling')!.nodes.map((n) => n.id)])]; syncLive(); }),
    ));
    for (const t of TREES) {
      const box = el('div', { class: 'tree' }, el('div', { class: 'tname', style: `color:${t.color}` }, t.name,
        btn('all', () => { c.nodes = [...new Set([...c.nodes, ...t.nodes.map((n) => n.id)])]; syncLive(); }),
        btn('none', () => { const ids = new Set(t.nodes.map((n) => n.id)); c.nodes = c.nodes.filter((n) => !ids.has(n)); syncLive(); })));
      for (const n of t.nodes) {
        box.append(check(`${n.type === 'passive' ? '●' : '◆'} ${n.name}`, c.nodes.includes(n.id), (v) => {
          c.nodes = v ? [...new Set([...c.nodes, n.id])] : c.nodes.filter((x) => x !== n.id);
          syncLive();
        }));
      }
      perks.append(box);
    }
    root.append(section('Perks / moves / abilities', perks));

    // ultimates
    const ult = el('div');
    ult.append(check('ult_unlocked (story flag)', !!c.flags.ult_unlocked, (v) => { c.flags.ult_unlocked = v; syncLive(); render(); }));
    ult.append(check('show all ultimates regardless of position', !!c.flags.dev_all_ults, (v) => { c.flags.dev_all_ults = v; app.changed(); }));
    ult.append(el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'equipped'),
      el('select', { onchange: (e: any) => { c.ult.id = e.target.value || null; c.ult.level = 0; syncLive(); } },
        el('option', { value: '' }, '(none)'), ...Object.entries(ULTIMATES).map(([id, u]) => el('option', { value: id, selected: c.ult.id === id }, u.name)))));
    ult.append(slider('evolution lvl', 0, 2, 1, c.ult.level, (v) => { c.ult.level = v; syncLive(); }));
    ult.append(el('div', { class: 'row' },
      btn('Fill meter', () => { const p = livePlayer(); if (p) p.ultCharge = 100; }),
      btn('+3 evo points', () => { c.ult.evoPoints += 3; app.changed(); }),
    ));
    root.append(section('Ultimate', ult));

    // game controls
    const gc = el('div');
    if (s) {
      gc.append(el('div', { class: 'row' },
        btn('Give me the ball', () => { if (s.user && s.userOnCourt) { s.giveBall(s.user); s.possession = s.user.team; s.live = true; s.assignMatchups(); } }),
        btn('Reset possession', () => { if (s.cfg.mode === 'practice') s.practiceReset(); else s.inbound(s.possession); }),
        btn('Swap possession', () => { s.inbound((1 - s.possession) as 0 | 1); }),
      ));
      gc.append(el('div', { class: 'row' },
        btn('Spawn defender in cone 3ft', () => spawnDefender(3)),
        btn('… 6ft', () => spawnDefender(6)),
        btn('Put me in the game', () => { if (s.cfg.rotation) s.cfg.rotation.stints = [[0, 1e9]]; (s as any).putUserOnCourt?.(); s.refreshOnCourt(); s.assignMatchups(); }),
      ));
      gc.append(check('Freeze AI', s.freezeAI, (v) => { s.freezeAI = v; }));
      gc.append(check('Force clutch time', s.forceClutch, (v) => { s.forceClutch = v; }));
      gc.append(check('Defense switches everything', s.switchAll, (v) => { s.switchAll = v; }));
      gc.append(slider('shot clock', 1, 24, 1, Math.ceil(s.shotClock), (v) => { s.shotClock = v; }));
      gc.append(slider('game clock (s)', 1, s.cfg.quarterLen, 1, Math.ceil(s.clock), (v) => { s.clock = v; }));
      gc.append(el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'call play'),
        el('select', { onchange: (e: any) => { if (e.target.value) { s.runner.call(e.target.value); s.phaseStartedAt = s.time; } } },
          el('option', { value: '' }, '—'), ...Object.entries(PLAYS).map(([id, p]) => el('option', { value: id }, p.name)))));
    } else gc.append('Start a game or practice to use these.');
    gc.append(slider('time scale', 0.25, 1, 0.05, app.settings.timeScale, (v) => { app.settings.timeScale = v; }));
    gc.append(slider('bench sim speed', 1, 16, 1, app.settings.benchSpeed, (v) => { app.settings.benchSpeed = v; }));
    gc.append(slider('quarter length (s)', 30, 720, 30, app.settings.quarterLen, (v) => { app.settings.quarterLen = v; }));
    root.append(section('Game controls', gc));

    // practice
    const pr = el('div');
    const ps = app.settings.practice;
    pr.append(slider('defenders', 0, 5, 1, ps.defenders, (v) => { ps.defenders = v; }));
    pr.append(slider('teammates', 0, 4, 1, ps.teammates, (v) => { ps.teammates = v; }));
    pr.append(check('Coach calls plays', ps.runPlays, (v) => { ps.runPlays = v; }));
    pr.append(el('div', { class: 'note' }, 'Practice changes apply on the next practice reset; use the button to restart now.'));
    pr.append(btn('Restart practice now', () => { const sc = (window as any).__phaser?.scene; sc?.stop('Game'); sc?.start('Game', { mode: 'practice' }); }));
    root.append(section('Practice court', pr));

    // trust / minutes
    const tr = el('div');
    const tsrc = s ? s.trust : c.trust;
    tr.append(el('div', { class: 'note' }, s && s.cfg.rotation ? 'Editing CAREER trust (live game).' : s ? 'Editing this game\'s sandbox trust (quick/practice).' : 'Editing CAREER trust.'));
    tr.append(slider('team trust', 0, 100, 1, Math.round(tsrc.team), (v) => { tsrc.team = v; app.changed(); }));
    tr.append(slider('coach trust', 0, 100, 1, Math.round(tsrc.coach), (v) => { tsrc.coach = v; app.changed(); }));
    tr.append(check('Force starter (career)', c.forceStarter, (v) => { c.forceStarter = v; app.changed(); }));
    root.append(section('Trust / minutes', tr));

    // debug draw
    const dd = el('div');
    const d = app.settings.debug;
    dd.append(check('Contest cone', d.cone, (v) => (d.cone = v)));
    dd.append(check('Passing lanes', d.lanes, (v) => (d.lanes = v)));
    dd.append(check('Play assignment path', d.paths, (v) => (d.paths = v)));
    dd.append(check('AI targets', d.aiTargets, (v) => (d.aiTargets = v)));
    dd.append(check('Hitboxes', d.hitboxes, (v) => (d.hitboxes = v)));
    root.append(section('Debug draw', dd));

    // presets
    const pz = el('div');
    const presets = loadPresets();
    const name = el('input', { type: 'text', placeholder: 'preset name', class: 'txt' });
    pz.append(el('div', { class: 'row' }, name, btn('Save loadout', () => { const n = (name as HTMLInputElement).value || `Preset ${Object.keys(presets).length + 1}`; presets[n] = { core: { ...c.core }, nodes: [...c.nodes], pos: c.pos, ult: { ...c.ult }, flags: { ...c.flags } }; savePresets(presets); })));
    for (const [n, p] of Object.entries(presets)) {
      pz.append(el('div', { class: 'row' }, el('span', { class: 'lbl' }, n),
        btn('load', () => { Object.assign(c, { core: { ...p.core }, nodes: [...p.nodes], pos: p.pos, ult: { ...p.ult }, flags: { ...p.flags } }); c.height = HEIGHTS[c.pos]; syncLive(); }),
        btn('del', () => { delete presets[n]; savePresets(presets); })));
    }
    pz.append(el('div', { class: 'row' },
      btn('Built-in: Shooter guard', () => { Object.assign(c.core, { shooting: 88, finishing: 60, strength: 45, mobility: 75, playmaking: 70 }); c.nodes = ['sh_root', 'sh_catch', 'sh_corner', 'sh_range', 'sh_release', 'dr_handle', 'dr_cross', 'dr_btb', 'dr_stepback', 'dr_spin', 'dr_inout']; syncLive(); }),
      btn('Built-in: Rim-running big', () => { Object.assign(c.core, { shooting: 40, finishing: 85, strength: 88, mobility: 65, playmaking: 50 }); c.nodes = ['fi_root', 'fi_fork', 'fi_power', 'fi_lob', 'fi_poster', 'sc_root', 'sc_roll', 'sc_slip', 'in_root', 'in_getlow', 'in_wall', 'in_anchor', 'in_swat']; syncLive(); }),
    ));
    pz.append(el('div', { class: 'row' }, btn('RESET CAREER SAVE', () => { if (confirm('Reset career save?')) { app.career = newCareer('Rookie', 'SG'); syncLive(); } })));
    root.append(section('Presets / save', pz));
  }

  function spawnDefender(ft: number) {
    const s = app.sim; const u = s?.user;
    if (!s || !u) return;
    const rim = s.rim(u.team);
    const dir = { x: rim.x - u.p.x, y: rim.y - u.p.y };
    const l = Math.hypot(dir.x, dir.y) || 1;
    const opp = s.teams[1 - u.team];
    const d = opp.roster.find((p) => !opp.onCourt.includes(p)) ?? opp.onCourt[0];
    if (!d) return;
    if (!opp.onCourt.includes(d)) { opp.onCourt.push(d); s.refreshOnCourt(); }
    d.p = { x: u.p.x + (dir.x / l) * ft, y: u.p.y + (dir.y / l) * ft };
    d.guarding = u.id; d.vel = { x: 0, y: 0 };
    app.changed();
  }
}

function loadPresets(): Record<string, any> { try { return JSON.parse(localStorage.getItem(PRESET_KEY) ?? '{}'); } catch { return {}; } }
function savePresets(p: Record<string, any>) { try { localStorage.setItem(PRESET_KEY, JSON.stringify(p)); } catch { /* ignore */ } }
