import { getMongoDb } from "../../src/lib/mongodb.ts";

type VercelResponse = {
  status: (statusCode: number) => {
    json: (body: unknown) => unknown;
  };
};

export default async function handler(_req: unknown, res: VercelResponse) {
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    return res.status(200).json({
      success: true,
      database: 'ok',
      time: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      code: 'DATABASE_UNAVAILABLE',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
