import { handleMongoCollectionRequest } from "../../../src/server/mongoDataApi.ts";

export default async function handler(req: Parameters<typeof handleMongoCollectionRequest>[0], res: Parameters<typeof handleMongoCollectionRequest>[1]) {
  try {
    return await handleMongoCollectionRequest(req, res);
  } catch (error) {
    console.error('Mongo collection API error:', error);
    return res.status(500).json({
      success: false,
      code: 'MONGODB_API_ERROR',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
