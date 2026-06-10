import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { parseSampleWithGemini } from "./src/lib/geminiSampleParser";
import { handleMongoCollectionRequest, handleMongoDocumentRequest } from "./src/server/mongoDataApi";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// Large limits to handle pasted base64 screenshot images
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

if (!process.env.GEMINI_API_KEY) {
  console.log("GEMINI_API_KEY environment variable is not defined. Falling back to rule-based parser on client.");
}

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
