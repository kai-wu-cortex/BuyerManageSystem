import type { IncomingMessage } from 'node:http';
import type { Response } from 'express';
import { getMongoClient, getMongoDb } from '../lib/mongodb.ts';
import { normalizeTaxIncludedCnyPrice } from '../quotation/normalization.ts';
import type {
  QuotationDraft,
  SupplierProductGroup,
} from '../quotation/types.ts';

const QUOTATION_WORKSPACE_ACTOR = 'quotation-workspace';

type ApiRequest = IncomingMessage & { method?: string; body?: unknown };
type ApiResponse = Pick<Response, 'status' | 'json' | 'setHeader'>;
type StringIdDocument<T> = T & { _id: string };

export function prepareConfirmedQuotation(
  draft: QuotationDraft,
  productGroups: SupplierProductGroup[],
  actor: string,
  confirmedAt = new Date().toISOString(),
): QuotationDraft {
  if (!draft.quotation.supplierId) throw new Error('缺少供应商。');
  if (!draft.quotation.quotationDate) throw new Error('缺少报价日期。');
  if (!draft.quotation.currency) throw new Error('缺少币种。');
  if (!Number.isFinite(draft.quotation.exchangeRateToCny) || draft.quotation.exchangeRateToCny <= 0) {
    throw new Error('缺少有效固定汇率。');
  }
  if (!draft.items.length) throw new Error('报价单没有产品明细。');

  const groupMap = new Map(productGroups.map(group => [group.id, group]));
  const items = draft.items.map(item => {
    if (!item.productGroupId || item.groupMatchStatus !== 'confirmed') {
      throw new Error(`第 ${item.lineNumber} 行产品组尚未确认。`);
    }
    const group = groupMap.get(item.productGroupId);
    if (!group || group.status !== 'confirmed' || group.deletedAt) {
      throw new Error(`第 ${item.lineNumber} 行产品组尚未确认。`);
    }
    if (!item.sourceProductName || !item.sourceUnit) {
      throw new Error(`第 ${item.lineNumber} 行缺少产品名称或单位。`);
    }
    if (item.sourceUnitPrice === null || item.sourcePackageQuantity === null) {
      throw new Error(`第 ${item.lineNumber} 行缺少单价或包装数量。`);
    }
    const normalizedPrice = normalizeTaxIncludedCnyPrice({
      sourceUnitPrice: item.sourceUnitPrice,
      currency: draft.quotation.currency,
      exchangeRateToCny: draft.quotation.exchangeRateToCny,
      priceTaxMode: draft.quotation.priceTaxMode,
      taxRate: draft.quotation.taxRate,
      sourcePackageQuantity: item.sourcePackageQuantity,
      sourceUnit: item.sourceUnit,
      normalizedUnit: group.baseUnit,
    });
    return {
      ...item,
      normalizedQuantity: 1,
      normalizedUnit: group.baseUnit,
      normalizedTaxIncludedCnyPrice: normalizedPrice,
      normalizationDetails: {
        currency: draft.quotation.currency,
        exchangeRateToCny: draft.quotation.exchangeRateToCny,
        priceTaxMode: draft.quotation.priceTaxMode,
        taxRate: draft.quotation.taxRate,
        sourceUnit: item.sourceUnit,
        sourcePackageQuantity: item.sourcePackageQuantity,
        normalizedUnit: group.baseUnit,
        formula: '原始单价 × 固定汇率 × 税率系数 ÷ 包装数量',
      },
      reviewIssues: [],
      updatedAt: confirmedAt,
    };
  });

  return {
    quotation: {
      ...draft.quotation,
      status: 'active',
      confirmedBy: actor,
      confirmedAt,
      updatedAt: confirmedAt,
    },
    items,
  };
}

function sendError(res: ApiResponse, status: number, code: string, message: string): unknown {
  return res.status(status).json({ success: false, code, message });
}

export async function handleQuotationConfirmRequest(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is supported.');
  }

  const draft = req.body as QuotationDraft | undefined;
  if (!draft?.quotation || !Array.isArray(draft.items)) {
    return sendError(res, 400, 'INVALID_BODY', '报价确认请求格式无效。');
  }

  try {
    const db = await getMongoDb();
    const groupIds = [...new Set(draft.items.map(item => item.productGroupId).filter((value): value is string => Boolean(value)))];
    const groups = await db.collection<StringIdDocument<SupplierProductGroup>>('supplier_product_groups')
      .find({ _id: { $in: groupIds } })
      .toArray();
    const confirmed = prepareConfirmedQuotation(draft, groups, QUOTATION_WORKSPACE_ACTOR);

    const client = await getMongoClient();
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection<StringIdDocument<typeof confirmed.quotation>>('supplier_quotations').updateOne(
          { _id: confirmed.quotation.id },
          { $set: confirmed.quotation },
          { upsert: true, session },
        );
        for (const item of confirmed.items) {
          await db.collection<StringIdDocument<typeof item>>('supplier_quotation_items').updateOne(
            { _id: item.id },
            { $set: item },
            { upsert: true, session },
          );
        }
        const auditId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.collection<{
          _id: string;
          id: string;
          objectType: string;
          objectId: string;
          action: string;
          actor: string;
          createdAt: string;
          summary: string;
        }>('supplier_quote_audit_logs').insertOne({
          _id: auditId,
          id: auditId,
          objectType: 'quotation',
          objectId: confirmed.quotation.id,
          action: 'confirm',
          actor: QUOTATION_WORKSPACE_ACTOR,
          createdAt: confirmed.quotation.confirmedAt,
          summary: `确认报价单并重算 ${confirmed.items.length} 条标准化价格`,
        }, { session });
      });
    } finally {
      await session.endSession();
    }

    return res.status(200).json({ success: true, data: confirmed });
  } catch (error) {
    return sendError(res, 422, 'CONFIRMATION_FAILED', error instanceof Error ? error.message : String(error));
  }
}
