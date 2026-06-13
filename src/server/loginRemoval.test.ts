import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const sourceFiles = [
  'src/App.tsx',
  'src/lib/cloudbaseData.ts',
  'src/server/mongoDataApi.ts',
  'src/server/quotationFileApi.ts',
  'src/server/quotationParseApi.ts',
  'src/server/quotationConfirmApi.ts',
  'server.ts',
];

for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /requireBuyerSession|SystemLogin|signInToCloudbase|signOutFromCloudbase|\/api\/login|\/api\/logout/);
}

for (const file of [
  'api/login.ts',
  'api/logout.ts',
  'src/components/SystemLogin.tsx',
  'src/server/loginApi.ts',
  'src/server/logoutApi.ts',
  'src/server/sessionAuth.ts',
]) {
  assert.equal(existsSync(file), false, `${file} should be removed`);
}

console.log('login removal tests passed');
