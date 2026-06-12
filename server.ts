import express from "express";
import compression from "compression";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { parseSampleWithGemini } from "./src/lib/geminiSampleParser";
import { handleMongoCollectionRequest, handleMongoDocumentRequest } from "./src/server/mongoDataApi";
import { handleLoginRequest } from "./src/server/loginApi";
import { handleLogoutRequest } from "./src/server/logoutApi";
import { handleQuotationFileRequest, handleQuotationUploadRequest } from "./src/server/quotationFileApi";
import { handleQuotationParseRequest } from "./src/server/quotationParseApi";
import { getMongoDb } from "./src/lib/mongodb";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// gzip JSON 响应——MongoDB ledger_backups 等大体积响应能压缩 5-10 倍
app.use(compression());
// Large limits to handle pasted base64 screenshot images
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

if (!process.env.GEMINI_API_KEY) {
  console.log("GEMINI_API_KEY environment variable is not defined. Falling back to rule-based parser on client.");
}

app.get("/api/health", (_req, res) => {
  return res.status(200).json({
    success: true,
    service: "buyer-manage-system",
    time: new Date().toISOString(),
  });
});

app.get("/api/health/db", async (_req, res) => {
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    return res.status(200).json({
      success: true,
      database: "ok",
      time: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      code: "DATABASE_UNAVAILABLE",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// REST API endpoint to parse clipboard data (Rich Text + Clipboard screenshot Image)
app.post("/api/gemini/parse-sample", async (req, res) => {
  const { status, payload } = await parseSampleWithGemini(process.env.GEMINI_API_KEY, req.body);
  if (payload.success === false) {
    console.warn("Gemini Parsing warning in server-side:", payload.message);
  }
  return res.status(status).json(payload);
});

// MongoDB-backed data API
app.get("/api/data/:collection", async (req, res) => {
  await handleMongoCollectionRequest(req, res);
});
app.get("/api/data/:collection/:id", async (req, res) => {
  await handleMongoDocumentRequest(req, res);
});
app.put("/api/data/:collection/:id", async (req, res) => {
  await handleMongoDocumentRequest(req, res);
});
app.delete("/api/data/:collection/:id", async (req, res) => {
  await handleMongoDocumentRequest(req, res);
});

// Login API (MongoDB-backed)
app.post("/api/login", async (req, res) => {
  await handleLoginRequest(req, res);
});
app.post("/api/logout", async (req, res) => {
  await handleLogoutRequest(req, res);
});
app.post("/api/quotation/upload", async (req, res) => {
  await handleQuotationUploadRequest(req, res);
});
app.get("/api/quotation/file", async (req, res) => {
  await handleQuotationFileRequest(req, res);
});
app.post("/api/quotation/parse", async (req, res) => {
  await handleQuotationParseRequest(req, res);
});

async function startServer() {
  // Use Vite middleware for development (handles asset compiling and HMR)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite middleware mounted for development workspace.");
  } else {
    // Static build outputs serving for deployment container
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Listen strictly under port 3000 and 0.0.0.0 for reverse proxy routing
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NovaSpark Procurement dashboard app is running live at http://localhost:${PORT}`);
  });
}

startServer();
