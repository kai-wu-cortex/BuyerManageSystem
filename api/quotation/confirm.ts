import { handleQuotationConfirmRequest } from '../../src/server/quotationConfirmApi.ts';

export default async function handler(
  req: Parameters<typeof handleQuotationConfirmRequest>[0],
  res: Parameters<typeof handleQuotationConfirmRequest>[1],
) {
  return handleQuotationConfirmRequest(req, res);
}
