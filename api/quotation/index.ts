import { getMongoCollection } from '../../src/lib/mongodb.ts';
import { requireBuyerSession } from '../../src/server/sessionAuth.ts';

type QuotationDoc = {
  _id: string;
  version: number;
  supplierId: string;
  supplierName: string;
  status: string;
  quotationDate: string;
  sourceFile: {
    blobPath: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
  };
  items: unknown[];
  reviewIssues: unknown[];
  parseJobId: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type VercelRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status: (code: number) => {
    json: (body: unknown) => unknown;
    setHeader?: (name: string, value: string) => unknown;
  };
  setHeader?: (name: string, value: string) => unknown;
};

function generateQuotationId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `QT-${year}${month}-${seq}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const user = requireBuyerSession({ headers: req.headers }, process.env.SESSION_SECRET || 'test-secret');
      const collection = await getMongoCollection<QuotationDoc>('supplier_quotations');

      const status = typeof req.query?.status === 'string' ? req.query.status : undefined;
      const search = typeof req.query?.search === 'string' ? req.query.search : undefined;

      const filter: Record<string, unknown> = {};
      if (status && status !== 'all') {
        filter.status = status;
      }
      if (search) {
        filter.$or = [
          { supplierName: { $regex: search, $options: 'i' } },
          { _id: { $regex: search, $options: 'i' } },
        ];
      }

      const quotations = await collection
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();

      const data = quotations.map(doc => ({
        id: doc._id,
        version: doc.version,
        supplierId: doc.supplierId,
        supplierName: doc.supplierName,
        status: doc.status,
        quotationDate: doc.quotationDate,
        sourceFile: doc.sourceFile,
        items: doc.items,
        reviewIssues: doc.reviewIssues,
        parseJobId: doc.parseJobId,
        confirmedAt: doc.confirmedAt,
        confirmedBy: doc.confirmedBy,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }));

      return res.status(200).json({ success: true, data });
    }

    if (req.method === 'POST') {
      const user = requireBuyerSession({ headers: req.headers }, process.env.SESSION_SECRET || 'test-secret');
      const body = req.body as {
        supplierName?: string;
        quotationDate?: string;
        sourceFile?: {
          blobPath: string;
          originalName: string;
          mimeType: string;
          sizeBytes: number;
          uploadedAt: string;
        };
        items?: unknown[];
      };

      if (!body?.supplierName) {
        return res.status(400).json({ success: false, message: '缺少供应商名称' });
      }
      if (!body?.sourceFile) {
        return res.status(400).json({ success: false, message: '缺少源文件信息' });
      }

      const collection = await getMongoCollection<QuotationDoc>('supplier_quotations');
      const id = generateQuotationId();
      const now = new Date().toISOString();

      const doc: QuotationDoc = {
        _id: id,
        version: 1,
        supplierId: '',
        supplierName: body.supplierName,
        status: 'parsing',
        quotationDate: body.quotationDate || now.split('T')[0],
        sourceFile: body.sourceFile,
        items: body.items || [],
        reviewIssues: [],
        parseJobId: null,
        confirmedAt: null,
        confirmedBy: null,
        createdAt: now,
        updatedAt: now,
      };

      await collection.updateOne({ _id: id }, { $set: doc }, { upsert: true });

      return res.status(201).json({
        success: true,
        data: {
          id: doc._id,
          ...doc,
        },
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (error) {
    console.error('Quotation API error:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('UNAUTHORIZED')) {
      return res.status(401).json({ success: false, message: '请先登录' });
    }
    if (message.includes('FORBIDDEN')) {
      return res.status(403).json({ success: false, message: '无权限' });
    }
    return res.status(500).json({ success: false, message });
  }
}
