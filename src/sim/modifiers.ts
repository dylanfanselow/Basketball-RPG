import { Effect, NODES } from './data';

/**
 * Modifier/Hook system. Every perk, move unlock, trait, backstory bonus, event buff and ultimate
 * goes in here as a ModSource. Declarative effects (JSON) are compiled into hook functions.
 * Code can also register hooks directly (see addHook), which is how ultimates and future
 * story/event systems plug in.
 */
export interface ModSource { id: string; label: string; effects: Effect[]; until?: number }

export interface ShotCtx { type: string; conds: Set<string> }
export interface Term { label: string; mult: number }

export type HookMap = {
  shot: (c: ShotCtx) => Term | null;           // multiplies make% (shooter side)
  contestIn: (c: ShotCtx) => Term | null;      // multiplies contest against the shooter
  contestOut: (shotType: string) => number;    // multiplies this defender's contest
};
export type HookName = keyof HookMap;

interface HookEntry<K extends HookName> { src: string; fn: HookMap[K]; until?: number }

export class ModSet {
  sources: ModSource[] = [];
  subAdds: Record<string, number> = {};
  moves = new Set<string>();
  shotTypes = new Set<string>();
  private paramAdd: Record<string, number> = {};
  private paramMult: Record<string, number> = {};
  private hooks: { [K in HookName]: HookEntry<K>[] } = { shot: [], contestIn: [], contestOut: [] };
  private codeHooks: { [K in HookName]: HookEntry<K>[] } = { shot: [], contestIn: [], contestOut: [] };

  static fromNodes(nodeIds: Iterable<string>, extra: ModSource[] = []): ModSet {
    const m = new ModSet();
    for (const id of nodeIds) {
      const n = NODES[id];
      if (n) m.sources.push({ id, label: n.name, effects: n.effects });
    }
    m.sources.push(...extra);
    m.rebuild();
    return m;
  }

  setNodes(nodeIds: Iterable<string>, extra: ModSource[] = []) {
    const keepTemp = this.sources.filter((s) => s.until !== undefined);
    this.sources = [];
    for (const id of nodeIds) { const n = NODES[id]; if (n) this.sources.push({ id, label: n.name, effects: n.effects }); }
    this.sources.push(...extra, ...keepTemp);
    this.rebuild();
  }

  add(src: ModSource) { this.sources = this.sources.filter((s) => s.id !== src.id); this.sources.push(src); this.rebuild(); }
  remove(id: string) { this.sources = this.sources.filter((s) => s.id !== id); this.rebuild(); }
  has(id: string) { return this.sources.some((s) => s.id === id); }

  addHook<K extends HookName>(name: K, src: string, fn: HookMap[K], until?: number) {
    (this.codeHooks[name] as HookEntry<K>[]).push({ src, fn, until });
  }
  removeHooks(src: string) {
    for (const k of Object.keys(this.codeHooks) as HookName[]) (this.codeHooks as any)[k] = (this.codeHooks[k] as any[]).filter((h) => h.src !== src);
  }
  /** Drop timed sources/hooks whose 'until' (sim time) has passed. */
  expire(now: number) {
    const before = this.sources.length;
    this.sources = this.sources.filter((s) => s.until === undefined || s.until > now);
    for (const k of Object.keys(this.codeHooks) as HookName[]) (this.codeHooks as any)[k] = (this.codeHooks[k] as any[]).filter((h) => h.until === undefined || h.until > now);
    if (this.sources.length !== before) this.rebuild();
  }

  rebuild() {
    this.subAdds = {}; this.paramAdd = {}; this.paramMult = {};
    this.moves = new Set(); this.shotTypes = new Set();
    this.hooks = { shot: [], contestIn: [], contestOut: [] };
    for (const s of this.sources) for (const e of s.effects) this.compile(s, e);
  }

  private compile(s: ModSource, e: Effect) {
    const label = (e as any).label ?? s.label;
    switch (e.t) {
      case 'sub': this.subAdds[e.key] = (this.subAdds[e.key] ?? 0) + e.add; break;
      case 'param':
        if (e.add !== undefined) this.paramAdd[e.key] = (this.paramAdd[e.key] ?? 0) + e.add;
        if (e.mult !== undefined) this.paramMult[e.key] = (this.paramMult[e.key] ?? 1) * e.mult;
        break;
      case 'move': this.moves.add(e.move); break;
      case 'shotType': this.shotTypes.add(e.shot); break;
      case 'shot':
        this.hooks.shot.push({ src: s.id, fn: (c) => (e.types.includes(c.type) && (!e.cond || c.conds.has(e.cond)) ? { label, mult: e.mult } : null) });
        break;
      case 'contestIn':
        this.hooks.contestIn.push({ src: s.id, fn: (c) => ((!e.types || e.types.includes(c.type)) && (!e.cond || c.conds.has(e.cond)) ? { label, mult: e.mult } : null) });
        break;
      case 'contestOut':
        this.hooks.contestOut.push({ src: s.id, fn: (t) => (!e.types || e.types.includes(t) ? e.mult : 1) });
        break;
    }
  }

  /** Additive param (default 0). */
  pAdd(key: string) { return this.paramAdd[key] ?? 0; }
  /** Multiplicative param (default 1). */
  pMult(key: string) { return this.paramMult[key] ?? 1; }

  shotTerms(c: ShotCtx): Term[] {
    const out: Term[] = [];
    for (const h of [...this.hooks.shot, ...this.codeHooks.shot]) { const t = h.fn(c); if (t) out.push(t); }
    return out;
  }
  contestInTerms(c: ShotCtx): Term[] {
    const out: Term[] = [];
    for (const h of [...this.hooks.contestIn, ...this.codeHooks.contestIn]) { const t = h.fn(c); if (t) out.push(t); }
    return out;
  }
  contestOutMult(shotType: string): number {
    let m = 1;
    for (const h of [...this.hooks.contestOut, ...this.codeHooks.contestOut]) m *= h.fn(shotType);
    return m;
  }
}
