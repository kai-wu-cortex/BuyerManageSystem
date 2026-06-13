import { handleLoginRequest } from '../src/server/loginApi.ts';

export default async function handler(
  req: Parameters<typeof handleLoginRequest>[0],
  res: Parameters<typeof handleLoginRequest>[1],
) {
  return handleLoginRequest(req, res);
}
