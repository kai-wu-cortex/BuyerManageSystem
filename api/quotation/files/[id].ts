import { handleQuotationFileDownload } from '../../../src/server/quotationFileApi.ts';

export default async function handler(
  req: Parameters<typeof handleQuotationFileDownload>[0],
  res: Parameters<typeof handleQuotationFileDownload>[1],
) {
  const { id } = (req.params || {}) as { id?: string };
  try {
    return await handleQuotationFileDownload(req, res, id || '');
  } catch (error) {
    console.error('Quotation file download error:', error);
    return res.status(500).json({
      success: false,
      code: 'QUOTATION_FILE_ERROR',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
