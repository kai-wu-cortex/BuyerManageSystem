import assert from 'node:assert/strict';
import { buildGeminiSampleParts } from './geminiSampleParser';

const parts = buildGeminiSampleParts({
  text: '样品名称：测试标签',
  images: ['data:image/jpeg;base64,abc123', 'rawbase64'],
});

assert.equal(parts.length, 3);
assert.ok('text' in parts[0]);
assert.deepEqual(parts[1], {
  inlineData: {
    mimeType: 'image/jpeg',
    data: 'abc123',
  },
});
assert.deepEqual(parts[2], {
  inlineData: {
    mimeType: 'image/png',
    data: 'rawbase64',
  },
});
