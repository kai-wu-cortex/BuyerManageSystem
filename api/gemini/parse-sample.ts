import { parseSampleWithGemini } from "../../src/lib/geminiSampleParser.ts";

type VercelRequest = {
  method?: string;
  body: unknown;
};

type VercelResponse = {
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => {
    json: (body: unknown) => unknown;
  };
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      error: "METHOD_NOT_ALLOWED",
      message: "Only POST is supported.",
    });
  }

  const { status, payload } = await parseSampleWithGemini(process.env.GEMINI_API_KEY, req.body);
  return res.status(status).json(payload);
}
