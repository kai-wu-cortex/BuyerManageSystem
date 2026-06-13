import { handleQuotationParseRequest } from '../../src/server/quotationParseApi.ts';

export default async function handler(
  req: Parameters<typeof handleQuotationParseRequest>[0],
  res: Parameters<typeof handleQuotationParseRequest>[1],
) {
  return handleQuotationParseRequest(req, res);
}
