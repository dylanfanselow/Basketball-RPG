/**
 * Round 89b (owner): the projected #1 and #2's lines and the mystery call live in `src/data/draftTalk.json` so they
 * can be edited without touching code. Phaser-free.
 */
import raw from '../data/draftTalk.json';

export interface TalkStep { who: 'scout' | 'think' | 'walk' | 'you' | 'one' | 'settle' | 'narrator' | 'voice'; text?: string }
export interface DraftTalk {
  combine: TalkStep[];
  scrimmageIntro: { one: string; two: string };
  one: { niceYou: string[]; niceHim: string[]; halfDown: string; snakeYou: string[]; snakeHim: string[]; snakeThem: string[]; snakeMiss: string[] };
  two: { scores: string[]; blocks: string[]; steals: string[]; youScore: string[] };
  mysteryCall: TalkStep[];
}
export const DRAFT_TALK = raw as unknown as DraftTalk;
/** Fill the placeholders ({you}, {n1}, {n2}, {height}, {big}). */
export const fillTalk = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
