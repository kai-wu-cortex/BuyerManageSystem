import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const testDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(testDir, '../App.tsx'), 'utf8');

assert.equal(
  appSource.includes("from 'motion/react'"),
  false,
  'App.tsx should not import motion/react at the shell level; keep animation code inside lazy modules or CSS',
);

assert.equal(
  appSource.includes('visitedTabs.has('),
  false,
  'App.tsx should not keep inactive modules mounted; hidden chart modules still measure and compute in the background',
);

for (const eagerModule of [
  './components/Dashboard',
  './components/POList',
  './components/SampleTracker',
  './components/SkeuomorphicNotes',
  './components/NoteboardCanvas',
  './components/SupplierSummaryApp',
]) {
  assert.equal(
    appSource.includes(`from '${eagerModule}'`),
    false,
    `App.tsx should lazy-load ${eagerModule}`,
  );
}
