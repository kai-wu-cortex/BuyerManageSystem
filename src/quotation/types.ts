export type QuotationWorkflowStatus = 'parsing' | 'review_required' | 'active' | 'voided';
export type QuotationDisplayStatus = QuotationWorkflowStatus | 'expired';
export type ParseJobStatus = 'queued' | 'processing' | 'review_required' | 'failed' | 'completed';
export type PriceTaxMode = 'tax_included' | 'tax_excluded';
export type GroupMatchStatus = 'unmatched' | 'suggested' | 'confirmed';

export interface SourceFileRef {
  id: string;
  pathname: string;
  fileName: string;
  mimeType: string;
  size: number;
  checksum: string;
}

export interface FieldConfidence {
  [field: string]: number;
}

export interface ReviewIssue {
  field: string;
  message: string;
  blocking: boolean;
}

export interface NormalizationDetails {
  currency: string;
  exchangeRateToCny: number;
  priceTaxMode: PriceTaxMode;
  taxRate: number;
  sourceUnit: string;
  sourcePackageQuantity: number;
  normalizedUnit: string;
  formula: string;
}

export interface SupplierProfile {
  id: string;
  name: string;
  normalizedName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  qualityScore: number | null;
  deliveryScore: number | null;
  serviceScore: number | null;
  cooperationScore: number | null;
  scoreNote: string;
  scoreUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SupplierQuotation {
  id: string;
  supplierId: string;
  quotationNumber: string;
  quotationDate: string;
  validUntil: string | null;
  currency: string;
  exchangeRateToCny: number;
  taxRate: number;
  priceTaxMode: PriceTaxMode;
  paymentTerms: string;
  leadTimeDays: number | null;
  status: QuotationWorkflowStatus;
  sourceFile: SourceFileRef;
  parseJobId: string | null;
  version: number;
  confirmedBy: string | null;
  confirmedAt: string | null;
  summary?: string;
  smartFields?: Record<string, string[]>;
  customColumns?: CustomColumn[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SupplierQuotationItem {
  id: string;
  quotationId: string;
  lineNumber: number;
  sourceProductCode: string;
  sourceProductName: string;
  sourceSpecification: string;
  sourceUnit: string;
  sourcePackageDescription: string;
  sourcePackageQuantity: number | null;
  sourceUnitPrice: number | null;
  minimumOrderQuantity: number | null;
  lineLeadTimeDays: number | null;
  productGroupId: string | null;
  groupMatchStatus: GroupMatchStatus;
  normalizedQuantity: number | null;
  normalizedUnit: string | null;
  normalizedTaxIncludedCnyPrice: number | null;
  normalizationDetails: NormalizationDetails | null;
  fieldConfidence: FieldConfidence;
  reviewIssues: ReviewIssue[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CustomColumn {
  id: string;
  label: string;
  sourceField: keyof SupplierQuotationItem | null;
  values: Record<string, string | number | null>;
}

export interface SupplierQuoteParseJob {
  id: string;
  quotationId: string;
  fileId: string;
  fileType: string;
  status: ParseJobStatus;
  attemptCount: number;
  parserVersion: string;
  rawStructuredResult: unknown;
  validationIssues: ReviewIssue[];
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuotationDraft {
  quotation: SupplierQuotation;
  items: SupplierQuotationItem[];
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
