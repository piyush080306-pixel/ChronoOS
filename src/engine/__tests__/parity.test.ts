import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runSimulation } from '../simulator';
import { computeAnalytics } from '../analytics';
import { explain } from '../forensics';
import type { SimulationConfig } from '../types';

const readShared = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../shared/parity/${name}`, import.meta.url)), 'utf8'));

const { cases } = readShared('cases.json') as { cases: { name: string; config: SimulationConfig }[] };
const golden = readShared('golden.json') as {
  cases: { name: string; log: unknown; analytics: unknown; findings: unknown }[];
};

describe('TypeScript engine matches shared parity golden output', () => {
  it.each(cases.map((c) => [c.name, c] as const))('%s', (name, testCase) => {
    const expected = golden.cases.find((g) => g.name === name);
    expect(expected).toBeDefined();

    const log = runSimulation(testCase.config);
    expect(JSON.parse(JSON.stringify(log))).toEqual(expected!.log);
    expect(JSON.parse(JSON.stringify(computeAnalytics(log.finalState, log.endTime)))).toEqual(expected!.analytics);
    expect(JSON.parse(JSON.stringify(explain(log.events)))).toEqual(expected!.findings);
  });
});
