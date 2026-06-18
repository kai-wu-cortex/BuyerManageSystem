import assert from 'node:assert/strict';
import { setNoStoreHeaders } from './mongoDataApi';

const headers: Record<string, string> = {};
setNoStoreHeaders({
  status() {
    return this;
  },
  json() {
    return this;
  },
  setHeader(name: string, value: string) {
    headers[name] = value;
    return this;
  },
});

assert.equal(headers['Cache-Control'], 'no-store, no-cache, must-revalidate, proxy-revalidate');
assert.equal(headers.Pragma, 'no-cache');
assert.equal(headers.Expires, '0');
assert.equal(headers['Surrogate-Control'], 'no-store');

console.log('mongo data API cache policy tests passed');
