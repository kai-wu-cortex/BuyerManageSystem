import { handleMongoDocumentRequest } from "../../../src/server/mongoDataApi.ts";

export default async function handler(req: Parameters<typeof handleMongoDocumentRequest>[0], res: Parameters<typeof handleMongoDocumentRequest>[1]) {
  try {
    return await handleMongoDocumentRequest(req, res);
  } catch (error) {
    console.error('Mongo document API error:', error);
    return res.status(500).json({
      success: false,
      code: 'MONGODB_API_ERROR',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
