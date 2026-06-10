import { attachDatabasePool } from '@vercel/functions';
import { MongoClient, type Collection, type Db, type Document } from 'mongodb';

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

function getPrimaryMongoUri(): string {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_DIRECT_URI;
  if (!uri) {
    throw new Error('缺少 MONGODB_URI 环境变量。');
  }
  return uri;
}

async function tryConnect(uri: string): Promise<MongoClient> {
  const candidate = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
  });
  attachDatabasePool(candidate);
  await candidate.connect();
  return candidate;
}

export function getMongoClient(): Promise<MongoClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const primaryUri = getPrimaryMongoUri();
      try {
        client = await tryConnect(primaryUri);
        return client;
      } catch (error) {
        const fallbackUri = process.env.MONGODB_DIRECT_URI;
        if (!fallbackUri || fallbackUri === primaryUri) {
          throw error;
        }
        console.warn('MONGODB_URI 连接失败，切换到 MONGODB_DIRECT_URI 重试。', (error as Error).message);
        client = await tryConnect(fallbackUri);
        return client;
      }
    })().catch(err => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export async function getMongoDb(): Promise<Db> {
  const connectedClient = await getMongoClient();
  return connectedClient.db('buysystemDB');
}

export async function getMongoCollection<T extends Document>(name: string): Promise<Collection<T>> {
  const db = await getMongoDb();
  return db.collection<T>(name);
}
