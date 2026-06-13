import { handleQuotationUploadRequest } from '../../src/server/quotationFileApi.ts';

export default async function handler(
  req: Parameters<typeof handleQuotationUploadRequest>[0],
  res: Parameters<typeof handleQuotationUploadRequest>[1],
) {
  return handleQuotationUploadRequest(req, res);
}
