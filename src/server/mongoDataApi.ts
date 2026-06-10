import type { Request, Response } from 'express';
import type { Document } from 'mongodb';
import { getMongoCollection } from '../lib/mongodb.ts';

const ALLOWED_COLLECTIONS = new Set([
  'inventory_stock',
  'sample_records',
  'order_sticky_notes',
  'ledger_backups',
  'buyer_system_view_settings',
]);

type ApiRequest = Pick<Request, 'method' | 'params' | 'body' | 'query'>;
type ApiResponse = Pick<Response, 'status' | 'json' | 'setHeader'>;

type MongoRecord = Document & { _id: string };

function isAllowedCollection(collectionName: string): boolean {
  return ALLOWED_COLLECTIONS.has(collectionName);
}

function stripMongoId<T>(record: MongoRecord): T {
  const { _id, ...rest } = record;
  void _id;
  return rest as T;
}

function normalizeDocumentId(id: string): string {
  const normalized = id.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return normalized || 'document';
}

function sendError(res: ApiResponse, statusCode: number, code: string, message: string): unknown {
  return res.status(statusCode).json({ success: false, code, message });
}

export async function listMongoDocuments(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  const collectionName = req.params.collection;
  if (!isAllowedCollection(collectionName)) {
    return sendError(res, 404, 'COLLECTION_NOT_FOUND', '集合不存在或不允许访问。');
  }

  const collection = await getMongoCollection<MongoRecord>(collectionName);
  if (req.query.includeIds === 'true') {
    const idDocs = await collection.find({}, { projection: { _id: 1 } }).limit(1000).toArray();
    return res.status(200).json({ success: true, data: idDocs.map(record => record._id) });
  }
  const records = await collection.find({}).limit(1000).toArray();
  return res.status(200).json({ success: true, data: records.map(stripMongoId) });
}

export async function getMongoDocument(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  const collectionName = req.params.collection;
  if (!isAllowedCollection(collectionName)) {
    return sendError(res, 404, 'COLLECTION_NOT_FOUND', '集合不存在或不允许访问。');
  }

  const id = normalizeDocumentId(req.params.id);
  const collection = await getMongoCollection<MongoRecord>(collectionName);
  const record = await collection.findOne({ _id: id });
  return res.status(200).json({ success: true, data: record ? stripMongoId(record) : null });
}

export async function setMongoDocument(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  const collectionName = req.params.collection;
  if (!isAllowedCollection(collectionName)) {
    return sendError(res, 404, 'COLLECTION_NOT_FOUND', '集合不存在或不允许访问。');
  }

  const id = normalizeDocumentId(req.params.id);
  const value = req.body;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return sendError(res, 400, 'INVALID_BODY', '请求体必须是对象。');
  }

  const collection = await getMongoCollection<MongoRecord>(collectionName);
  await collection.updateOne(
    { _id: id },
    { $set: { ...(value as Record<string, unknown>), _id: id } },
    { upsert: true },
  );
  return res.status(200).json({ success: true });
}

export async function deleteMongoDocument(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  const collectionName = req.params.collection;
  if (!isAllowedCollection(collectionName)) {
    return sendError(res, 404, 'COLLECTION_NOT_FOUND', '集合不存在或不允许访问。');
  }

  const id = normalizeDocumentId(req.params.id);
  const collection = await getMongoCollection<MongoRecord>(collectionName);
  const result = await collection.deleteOne({ _id: id });
  return res.status(200).json({ success: true, deleted: result.deletedCount });
}

export async function handleMongoCollectionRequest(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method === 'GET') {
    return listMongoDocuments(req, res);
  }

  res.setHeader('Allow', 'GET');
  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is supported.');
}

export async function handleMongoDocumentRequest(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method === 'GET') {
    return getMongoDocument(req, res);
  }

  if (req.method === 'PUT') {
    return setMongoDocument(req, res);
  }

  if (req.method === 'DELETE') {
    return deleteMongoDocument(req, res);
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET, PUT and DELETE are supported.');
}
