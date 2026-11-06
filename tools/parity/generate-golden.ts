import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runSimulation } from '../../src/engine/simulator';
import { computeAnalytics } from '../../src/engine/analytics';
import { explain } from '../../src/engine/forensics';
import type { SimulationConfig } from '../../src/engine/types';

const casesPath = fileURLToPath(new URL('../../shared/parity/cases.json', import.meta.url));
const goldenPath = fileURLToPath(new URL('../../shared/parity/golden.json', import.meta.url));

interface ParityCase {
  name: string;
  config: SimulationConfig;
}

const { cases } = JSON.parse(readFileSync(casesPath, 'utf8')) as { cases: ParityCase[] };

const golden = cases.map((testCase) => {
  const log = runSimulation(testCase.config);
  return {
    name: testCase.name,
    log,
    analytics: computeAnalytics(log.finalState, log.endTime),
    findings: explain(log.events),
  };
});

writeFileSync(goldenPath, `${JSON.stringify({ version: 1, generatedBy: 'src/engine (TypeScript)', cases: golden }, null, 2)}\n`);
console.log(`Wrote ${golden.length} golden cases to shared/parity/golden.json`);
