import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { EJSON } from 'bson';
import { MongoClient, type AnyBulkWriteOperation } from 'mongodb';

dotenv.config({ path: '.env.local' });

const envId = process.env.VITE_CLOUDBASE_ENV_ID;
const accessKey = process.env.VITE_CLOUDBASE_ACCESS_KEY;
const mongoUri = process.env.MONGODB_URI;
const mongoDirectUri = process.env.MONGODB_DIRECT_URI;

const collections = [
  'inventory_stock',
  'sample_records',
  'order_sticky_notes',
  'ledger_backups',
  'buyer_system_view_settings',
] as const;

type CloudBaseDocument = Record<string, unknown> & { _id?: string };

type CloudBaseListResponse = {
  data?: CloudBaseDocument[];
  documents?: CloudBaseDocument[];
  Data?: CloudBaseDocument[];
  Documents?: CloudBaseDocument[];
  list?: CloudBaseDocument[];
  pager?: { Total?: number; total?: number };
  total?: number;
  Total?: number;
  code?: string;
  message?: string;
  error?: string;
};

function getRequiredEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`缺少 ${name} 环境变量。`);
  }
  return value;
}

function normalizeDocumentId(id: string): string {
  const normalized = id.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return normalized || 'document';
}

function stripCloudBaseFields(document: CloudBaseDocument): { id: string; data: Record<string, unknown> } {
  const { _id, _openid, _createTime, _updateTime, ...businessFields } = document;
  void _openid;
  void _createTime;
  void _updateTime;
  return {
    id: normalizeDocumentId(typeof _id === 'string' ? _id : String(businessFields.id ?? randomUUID())),
    data: businessFields,
  };
}

async function fetchCloudBaseCollection(collectionName: string): Promise<CloudBaseDocument[]> {
  const endpoint = new URL(
    `https://${getRequiredEnv('VITE_CLOUDBASE_ENV_ID', envId)}.api.tcloudbasegateway.com/v1/database/instances/(default)/databases/(default)/collections/${collectionName}/documents`,
  );
  endpoint.searchParams.set('offset', '0');
  endpoint.searchParams.set('limit', '1000');

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getRequiredEnv('VITE_CLOUDBASE_ACCESS_KEY', accessKey)}`,
      'Content-Type': 'application/json; charset=utf-8',
      'Accept-Language': 'zh-CN',
    },
  });

  const rawText = await response.text();
  let payload: CloudBaseListResponse;
  try {
    payload = EJSON.parse(rawText, { relaxed: true }) as CloudBaseListResponse;
  } catch (parseError) {
    throw new Error(`${collectionName} 响应解析失败: ${(parseError as Error).message}`);
  }
  if (!response.ok || payload.code || payload.error) {
    throw new Error(`${collectionName} 读取失败: ${payload.message ?? payload.error ?? response.statusText}`);
  }

  const documents = payload.data ?? payload.documents ?? payload.Data ?? payload.Documents ?? payload.list ?? [];
  if (!Array.isArray(documents)) {
    throw new Error(`${collectionName} 返回格式异常。`);
  }
  return documents;
}

async function migrateCollection(client: MongoClient, collectionName: string): Promise<number> {
  const db = client.db('buysystemDB');
  const collection = db.collection<Record<string, unknown> & { _id: string }>(collectionName);
  const documents = await fetchCloudBaseCollection(collectionName);

  if (documents.length === 0) {
    await collection.deleteMany({});
    return 0;
  }

  const operations: AnyBulkWriteOperation<Record<string, unknown> & { _id: string }>[] = documents.map(document => {
    const { id, data } = stripCloudBaseFields(document);
    return {
      updateOne: {
        filter: { _id: id },
        update: { $set: { ...data, _id: id } },
        upsert: true,
      },
    };
  });

  await collection.bulkWrite(operations);
  return documents.length;
}

async function connectMongoClient(): Promise<MongoClient> {
  const primaryUri = getRequiredEnv('MONGODB_URI', mongoUri);
  const primaryClient = new MongoClient(primaryUri);
  try {
    await primaryClient.connect();
    return primaryClient;
  } catch (error) {
    await primaryClient.close().catch(() => undefined);
    if (!mongoDirectUri) {
      throw error;
    }
    console.warn('MONGODB_URI 连接失败，切换到 MONGODB_DIRECT_URI 重试。');
    const fallbackClient = new MongoClient(mongoDirectUri);
    await fallbackClient.connect();
    return fallbackClient;
  }
}

async function main(): Promise<void> {
  const client = await connectMongoClient();
  try {
    for (const collection of collections) {
      const count = await migrateCollection(client, collection);
      console.log(`${collection}: migrated ${count} documents`);
    }
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
