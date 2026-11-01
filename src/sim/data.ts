import statInfluenceRaw from '../data/statInfluence.json';
import shotTypesRaw from '../data/shotTypes.json';
import movesRaw from '../data/moves.json';
import ultimatesRaw from '../data/ultimates.json';
import playsRaw from '../data/plays/plays.json';
import leagueRaw from '../data/league.json';
import shootingTree from '../data/trees/shooting.json';
import finishingTree from '../data/trees/finishing.json';
import dribblingTree from '../data/trees/dribbling.json';
import drivingTree from '../data/trees/driving.json';
import passingTree from '../data/trees/passing.json';
import screensTree from '../data/trees/screens.json';
import perimeterTree from '../data/trees/perimeter.json';
import interiorTree from '../data/trees/interior.json';
import backstoriesRaw from '../data/backstories.json';

export const CORE_STATS = ['shooting', 'finishing', 'strength', 'mobility', 'playmaking'] as const;
export type CoreStat = (typeof CORE_STATS)[number];
export type CoreStats = Record<CoreStat, number>;

export type Effect =
  | { t: 'sub'; key: string; add: number }
  | { t: 'shot'; types: string[]; mult: number; cond?: string; label?: string }
  | { t: 'contestIn'; types?: string[]; mult: number; cond?: string }
  | { t: 'contestOut'; types?: string[]; mult: number }
  | { t: 'param'; key: string; add?: number; mult?: number }
  | { t: 'move'; move: string }
  | { t: 'shotType'; shot: string };

export interface TreeNode {
  id: string; name: string; type: 'passive' | 'move' | 'ability';
  x: number; y: number; prereqs: string[]; cost: number; desc: string;
  effects: Effect[]; posLock?: string[]; req?: Partial<CoreStats>;
}
export interface Tree { id: string; name: string; shape: string; color: string; desc: string; nodes: TreeNode[] }

export interface ShotTypeDef { name: string; base: number[][]; sub: string; windup: number; contestW: number; pts: number; contact?: boolean }
export interface MoveDef {
  name: string; dist?: number; dir: 'toward' | 'back' | 'cross' | 'same' | 'neutral' | 'any'; default?: boolean; slow?: boolean; moving?: boolean; plantAt?: number;
  chainFrom?: string; chainWindow?: number; needsClose?: boolean;
  burst: number; burstDir: string; dur: number; ankle: number; stagger: number;
  openShot?: number; pumpFake?: boolean;
}
export interface UltLevel { name: string; cost: number; [k: string]: any }
export interface UltDef { name: string; positions: string[]; context: 'ball' | 'defense'; desc: string; levels: UltLevel[] }
export interface PlayRole { to: string; act: 'move' | 'screen' | 'cut' | 'handle' | 'hold' }
export interface PlayPhase { dur: number; ball?: string; roles: Record<string, PlayRole>; options?: string[] }
export interface PlayDef { name: string; tags: string[]; focus?: string; phases: PlayPhase[] }
export interface TeamDef { id: string; city: string; name: string; colors: string[]; seed: number }

const strip = <T>(o: any): T => { const { _doc, ...rest } = o; return rest as T; };

export const STAT_INFLUENCE = strip<Record<string, Record<string, number>>>(statInfluenceRaw);
export const SUB_KEYS = Object.keys(STAT_INFLUENCE);
export const SHOT_TYPES = strip<Record<string, ShotTypeDef>>(shotTypesRaw);
export const MOVES = strip<Record<string, MoveDef>>(movesRaw);
export const ULTIMATES = strip<Record<string, UltDef>>(ultimatesRaw);
export const PLAYS = strip<Record<string, PlayDef>>(playsRaw);
export const TEAMS: TeamDef[] = (leagueRaw as any).teams;
export const BACKSTORIES = strip<Record<string, any>>(backstoriesRaw);
export const TREES: Tree[] = [shootingTree, finishingTree, dribblingTree, drivingTree, passingTree, screensTree, perimeterTree, interiorTree] as Tree[];
export const NODES: Record<string, TreeNode & { tree: string }> = {};
for (const t of TREES) for (const n of t.nodes) NODES[n.id] = { ...n, tree: t.id };
