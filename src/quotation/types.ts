export type QuotationWorkflowStatus = 'parsing' | 'review_required' | 'active' | 'voided';
export type ParseJobStatus = 'queued' | 'processing' | 'review_required' | 'failed' | 'completed';
export type PriceTaxMode = 'tax_included' | 'tax_excluded';
export type GroupMatchStatus = 'unmatched' | 'suggested' | 'confirmed';

export interface SourceFileRef {
  blobPath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface NormalizationDetails {
  sourceUnitPrice: number;
  currency: string;
  exchangeRateToCny: number;
  priceTaxMode: PriceTaxMode;
  taxRate: number;
  sourcePackageQuantity: number;
  sourceUnit: string;
  normalizedUnit: string;
  cnyUnitPrice: number;
}

export interface FieldConfidence {
  field: string;
  value: string;
  confidence: number;
  source: 'excel' | 'gemini' | 'manual';
}

export interface ReviewIssue {
  id: string;
  field: string;
  severity: 'error' | 'warning';
  message: string;
  resolved: boolean;
}

export interface SupplierProfile {
  id: string;
  normalizedName: string;
  aliases: string[];
  scores: {
    quality: number;
    delivery: number;
    price: number;
    service: number;
  };
  scoreNotes: string;
  updatedAt: string;
}

export interface SupplierQuotationItem {
  id: string;
  productCode: string;
  productName: string;
  productSpec: string;
  sourceUnitPrice: number;
  currency: string;
  exchangeRateToCny: number;
  priceTaxMode: PriceTaxMode;
  taxRate: number;
  sourcePackageQuantity: number;
  sourceUnit: string;
  normalizedUnit: string;
  cnyUnitPrice: number;
  moq: number;
  leadTimeDays: number;
  paymentTerms: string;
  validUntil: string | null;
  notes: string;
  productGroupId: string | null;
  groupMatchStatus: GroupMatchStatus;
  normalization: NormalizationDetails;
}

export interface SupplierQuotation {
  id: string;
  version: number;
  supplierId: string;
  supplierName: string;
  status: QuotationWorkflowStatus;
  quotationDate: string;
  sourceFile: SourceFileRef;
  items: SupplierQuotationItem[];
  reviewIssues: ReviewIssue[];
  parseJobId: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierProductGroup {
  id: string;
  name: string;
  aliases: string[];
  conversions: { from: string; to: string; factor: number }[];
  confirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierQuoteParseJob {
  id: string;
  quotationId: string;
  status: ParseJobStatus;
  attemptCount: number;
  maxAttempts: number;
  parserVersion: string;
  result: {
    items: Omit<SupplierQuotationItem, 'id' | 'normalization'>[];
    issues: ReviewIssue[];
    confidence: FieldConfidence[];
  } | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuotationDraft {
  supplierName: string;
  quotationDate: string;
  currency: string;
  exchangeRateToCny: number;
  priceTaxMode: PriceTaxMode;
  taxRate: number;
  sourceFile: SourceFileRef;
  items: Omit<SupplierQuotationItem, 'id' | 'normalization'>[];
}

export interface ComparisonColumn {
  quotationId: string;
  quotationItemId: string;
  supplierName: string;
  version: number;
  sourceUnitPrice: number;
  currency: string;
  cnyUnitPrice: number;
  moq: number;
  leadTimeDays: number;
  paymentTerms: string;
  validUntil: string | null;
  normalizedUnit: string;
  normalization: NormalizationDetails;
  scores: SupplierProfile['scores'];
}

export interface ComparisonResult {
  productGroupId: string;
  productName: string;
  columns: ComparisonColumn[];
  highlights: {
    minPriceItemId: string | null;
    minLeadTimeItemId: string | null;
    bestScoreItemId: string | null;
  };
}

export interface NormalizePriceInput {
  sourceUnitPrice: number;
  currency: string;
  exchangeRateToCny: number;
  priceTaxMode: PriceTaxMode;
  taxRate: number;
  sourcePackageQuantity: number;
  sourceUnit: string;
  normalizedUnit: string;
}
