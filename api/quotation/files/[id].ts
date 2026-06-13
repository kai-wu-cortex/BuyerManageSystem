import { handleQuotationFileRequest } from '../../../src/server/quotationFileApi.ts';

export default async function handler(
  req: Parameters<typeof handleQuotationFileRequest>[0],
  res: Parameters<typeof handleQuotationFileRequest>[1],
) {
  try {
    return await handleQuotationFileRequest(req, res);
  } catch (error) {
    console.error('Quotation file download error:', error);
    return res.status(500).json({
      success: false,
      code: 'QUOTATION_FILE_ERROR',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
