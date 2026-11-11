import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { updateRosters, formatRosters } from './rosterPerks';

// Round 77: WRITE=1 npx vitest run scripts/rosterPerks.test.ts --dir . --config /dev/null
it('roster perks', () => {
  const path = 'src/data/rosters.json';
  const src = readFileSync(path, 'utf8');
  const { rosters, report } = updateRosters(JSON.parse(src));
  console.log(report.join('\n'));
  if (process.env.WRITE) writeFileSync(path, formatRosters(rosters) + (src.endsWith('\n') ? '\n' : ''));
});
