import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config({ path: '.env.local' });

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('missing MONGODB_URI');
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });

async function main(): Promise<void> {
  await client.connect();
  const col = client.db('buysystemDB').collection('ledger_backups');

  // 1. 删旧索引（如果已存在但没有 TTL 选项）
  try {
    await col.dropIndex('createdAt_ttl_5d');
    console.log('dropped createdAt_ttl_5d');
  } catch (e) {
    console.log('drop skip:', (e as Error).message);
  }

  // 2. 建带 TTL 的索引：5 天 = 432000 秒
  const name = await col.createIndex(
    { createdAt: 1 },
    {
      name: 'createdAt_ttl_5d',
      expireAfterSeconds: 5 * 24 * 60 * 60,
    },
  );
  console.log('created TTL index:', name);

  // 3. 打印所有索引确认
  const idx = await col.listIndexes().toArray();
  console.log(JSON.stringify(idx, null, 2));

  await client.close();
}

void main();
