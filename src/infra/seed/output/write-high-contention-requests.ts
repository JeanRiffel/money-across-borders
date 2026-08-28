import fs from 'node:fs';
import path from 'node:path';
import { ContentionIntent } from '../types';

/**
 * Writes the high-contention scenario's request tuples to a JSON fixture —
 * never a new DB table — so an external load-test tool (k6, artillery, a
 * bespoke script) can fire them concurrently against a *running* app
 * afterward. The seed process itself never executes these (AGENTS.md
 * request section 11: "não execute concorrência durante o seed").
 */
export function writeHighContentionRequests(
  intents: readonly ContentionIntent[],
  sharedAccountIds: readonly string[],
  outDir: string = path.join(process.cwd(), 'seed-output')
): string {
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, 'high-contention-requests.json');

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sharedAccountIds,
        count: intents.length,
        note:
          'Each entry is one candidate POST /remittances-shaped request against the shared ' +
          'account pool above. Not executed by the seed itself — fire these concurrently with ' +
          'an external load-test tool to exercise locking/retry behavior. See docs/seed.md §11.',
        requests: intents,
      },
      null,
      2
    )
  );

  return filePath;
}
