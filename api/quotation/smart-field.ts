import { handleSmartFieldExtractRequest } from '../../src/server/smartFieldApi.ts';

export default async function handler(
  req: Parameters<typeof handleSmartFieldExtractRequest>[0],
  res: Parameters<typeof handleSmartFieldExtractRequest>[1],
) {
  return handleSmartFieldExtractRequest(req, res);
}
