import { describe, it, expect } from 'vitest';

/** Round 60d (owner): no em dashes anywhere in the repo's text (code, comments, in-game strings, docs). */
const EM = String.fromCharCode(0x2014);
const TEXT = import.meta.glob(
  ['/src/**/*.{ts,json,md}', '/tests/**/*.ts', '/docs/**/*.md', '/scripts/**/*.{ts,mjs}', '/README.md', '/CLAUDE.md', '/index.html', '/vite.config.ts'],
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;

describe('style', () => {
  it('has no em dashes', () => {
    expect(Object.keys(TEXT).length).toBeGreaterThan(50);
    expect(Object.entries(TEXT).filter(([, text]) => text.includes(EM)).map(([f]) => f)).toEqual([]);
  });
});
