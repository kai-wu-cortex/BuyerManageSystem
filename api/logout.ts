import { handleLogoutRequest } from '../src/server/logoutApi.ts';

export default async function handler(
  req: Parameters<typeof handleLogoutRequest>[0],
  res: Parameters<typeof handleLogoutRequest>[1],
) {
  return handleLogoutRequest(req, res);
}
