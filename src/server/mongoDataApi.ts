import type { Response } from 'express';
import type { Document } from 'mongodb';
import { getMongoCollection } from '../lib/mongodb.ts';

const ALLOWED_COLLECTIONS = new Set([
  'inventory_stock',
  'sample_records',
  'order_sticky_notes',
  'ledger_backups',
  'ledger_backup_chunks',
  'buyer_system_view_settings',
  'noteboard_items',
  'supplier_profiles',
  'supplier_quotations',
  'supplier_quotation_items',
  'supplier_quote_parse_jobs',
  'supplier_product_groups',
  'supplier_quote_audit_logs',
]);

type ApiRequest = {
  method?: string;
  body?: unknown;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
};
type ApiResponse = Pick<Response, 'status' | 'json' | 'setHeader'>;

type MongoRecord = Document & { _id: string };

export function setNoStoreHeaders(res: ApiResponse): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

function isAllowedCollection(collectionName: string): boolean {
  return ALLOWED_COLLECTIONS.has(collectionName);
}

function getParam(req: ApiRequest, name: string): string | null {
  const fromParams = req.params?.[name];
  if (typeof fromParams === 'string' && fromParams) return fromParams;
  const fromQuery = req.query?.[name];
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery;
  if (Array.isArray(fromQuery) && typeof fromQuery[0] === 'string' && fromQuery[0]) return fromQuery[0];
  return null;
}

function getQueryFlag(req: ApiRequest, name: string): boolean {
  const value = req.query?.[name];
  if (typeof value === 'string') return value === 'true';
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0] === 'true';
  return false;
}

function getQueryInteger(req: ApiRequest, name: string, fallback: number, maximum: number): number {
  const raw = req.query?.[name];
  const value = typeof raw === 'string'
    ? Number(raw)
    : Array.isArray(raw) && typeof raw[0] === 'string' ? Number(raw[0]) : fallback;
  if (!Number.isInteger(value) || value < 0) return fallback;
  return Math.min(value, maximum);
}

function parseProjection(req: ApiRequest): Record<string, 1 | 0> | undefined {
  const raw = req.query?.fields;
  const value = typeof raw === 'string' ? raw : Array.isArray(raw) && typeof raw[0] === 'string' ? raw[0] : null;
  if (!value) return undefined;
  const projection: Record<string, 1 | 0> = {};
  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (trimmed) projection[trimmed] = 1;
  }
  return Object.keys(projection).length ? projection : undefined;
}

function buildPipeline(req: ApiRequest, includeIds: boolean, offset: number, limit: number): Document[] {
  if (includeIds) {
    return [{ $project: { _id: 1 } }, { $skip: offset }, { $limit: limit }];
  }

  const stages: Document[] = [];
  const sizeFields = req.query?.sizeFields;
  const sizeFieldsValue = typeof sizeFields === 'string'
    ? sizeFields
    : Array.isArray(sizeFields) && typeof sizeFields[0] === 'string' ? sizeFields[0] : null;

  if (sizeFieldsValue) {
    const projection: Document = {};
    for (const part of sizeFieldsValue.split(',')) {
      const trimmed = part.trim();
      if (trimmed) {
        // 对数组字段返回长度而非内容，最大幅度压缩响应体
        projection[`${trimmed}Count`] = { $size: { $ifNull: [`$${trimmed}`, []] } };
      }
    }
    if (Object.keys(projection).length) {
      // 保留其他字段，剔除原数组
      stages.push({ $addFields: projection });
      for (const part of sizeFieldsValue.split(',')) {
        const trimmed = part.trim();
        if (trimmed) {
          stages.push({ $project: { [trimmed]: 0 } });
        }
      }
    }
  }

  const projection = parseProjection(req);
  if (projection) {
    stages.push({ $project: projection });
  }

  stages.push({ $skip: offset }, { $limit: limit });
  return stages;
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
  const collectionName = getParam(req, 'collection') ?? '';
  if (!isAllowedCollection(collectionName)) {
    return sendError(res, 404, 'COLLECTION_NOT_FOUND', '集合不存在或不允许访问。');
  }
  const collection = await getMongoCollection<MongoRecord>(collectionName);
  const includeIds = getQueryFlag(req, 'includeIds');
  const offset = getQueryInteger(req, 'offset', 0, Number.MAX_SAFE_INTEGER);
  const limit = getQueryInteger(req, 'limit', 1000, 1000);
  if (includeIds) {
    const idDocs = await collection.find({}, { projection: { _id: 1 } }).skip(offset).limit(limit).toArray();
    return res.status(200).json({ success: true, data: idDocs.map(record => record._id) });
  }

  const pipeline = buildPipeline(req, false, offset, limit);
  // 仅当请求方真的指定了 projection / sizeFields 才走聚合管道，否则维持原全量 find
  const usingPipeline = Boolean(parseProjection(req) || req.query?.sizeFields);
  const records = usingPipeline
    ? await collection.aggregate(pipeline).toArray()
    : await collection.find({}).skip(offset).limit(limit).toArray();
  return res.status(200).json({ success: true, data: records.map(record => stripMongoId(record as MongoRecord)) });
}

export async function getMongoDocument(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  const collectionName = getParam(req, 'collection') ?? '';
  if (!isAllowedCollection(collectionName)) {
    return sendError(res, 404, 'COLLECTION_NOT_FOUND', '集合不存在或不允许访问。');
  }
  const idRaw = getParam(req, 'id');
  if (!idRaw) return sendError(res, 400, 'INVALID_ID', '缺少文档 ID。');
  const id = normalizeDocumentId(idRaw);
  const collection = await getMongoCollection<MongoRecord>(collectionName);
  const record = await collection.findOne({ _id: id });
  return res.status(200).json({ success: true, data: record ? stripMongoId(record) : null });
}

export async function setMongoDocument(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  const collectionName = getParam(req, 'collection') ?? '';
  if (!isAllowedCollection(collectionName)) {
    return sendError(res, 404, 'COLLECTION_NOT_FOUND', '集合不存在或不允许访问。');
  }
  const idRaw = getParam(req, 'id');
  if (!idRaw) return sendError(res, 400, 'INVALID_ID', '缺少文档 ID。');
  const id = normalizeDocumentId(idRaw);
  const value = req.body;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return sendError(res, 400, 'INVALID_BODY', '请求体必须是对象。');
  }

  const collection = await getMongoCollection<MongoRecord>(collectionName);
  const docToWrite: Record<string, unknown> = { ...(value as Record<string, unknown>), _id: id };
  // 把 ISO 字符串 createdAt 转成 BSON Date，便于 MongoDB TTL 索引识别
  if (typeof docToWrite.createdAt === 'string') {
    const parsed = new Date(docToWrite.createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      docToWrite.createdAt = parsed;
    }
  }
  await collection.updateOne(
    { _id: id },
    { $set: docToWrite },
    { upsert: true },
  );
  return res.status(200).json({ success: true });
}

export async function deleteMongoDocument(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  const collectionName = getParam(req, 'collection') ?? '';
  if (!isAllowedCollection(collectionName)) {
    return sendError(res, 404, 'COLLECTION_NOT_FOUND', '集合不存在或不允许访问。');
  }
  const idRaw = getParam(req, 'id');
  if (!idRaw) return sendError(res, 400, 'INVALID_ID', '缺少文档 ID。');
  const id = normalizeDocumentId(idRaw);
  const collection = await getMongoCollection<MongoRecord>(collectionName);
  const result = await collection.deleteOne({ _id: id });
  return res.status(200).json({ success: true, deleted: result.deletedCount });
}

export async function handleMongoCollectionRequest(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  setNoStoreHeaders(res);
  if (req.method === 'GET') {
    return listMongoDocuments(req, res);
  }

  res.setHeader('Allow', 'GET');
  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is supported.');
}

export async function handleMongoDocumentRequest(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  setNoStoreHeaders(res);
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
