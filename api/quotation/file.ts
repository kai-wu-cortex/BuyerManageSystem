import { handleQuotationFileRequest } from '../../src/server/quotationFileApi.ts';

export default async function handler(
  req: Parameters<typeof handleQuotationFileRequest>[0],
  res: Parameters<typeof handleQuotationFileRequest>[1],
) {
  return handleQuotationFileRequest(req, res);
}
