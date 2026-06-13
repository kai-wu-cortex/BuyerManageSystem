import { handleQuotationUploadRequest } from '../../../src/server/quotationFileApi.ts';

export default async function handler(
  req: Parameters<typeof handleQuotationUploadRequest>[0],
  res: Parameters<typeof handleQuotationUploadRequest>[1],
) {
  try {
    return await handleQuotationUploadRequest(req, res);
  } catch (error) {
    console.error('Quotation upload API error:', error);
    return res.status(500).json({
      success: false,
      code: 'QUOTATION_UPLOAD_ERROR',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
