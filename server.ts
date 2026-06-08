import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

type GeminiContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Large limits to handle pasted base64 screenshot images
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Shared server-side GoogleGenAI client
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
  console.log("Gemini API Client initialized successfully.");
} else {
  console.log("GEMINI_API_KEY environment variable is not defined. Falling back to rule-based parser on client.");
}

// REST API endpoint to parse clipboard data (Rich Text + Clipboard screenshot Image)
app.post("/api/gemini/parse-sample", async (req, res) => {
  if (!ai) {
    return res.status(200).json({
      success: false,
      error: "KEY_MISSING",
      message: "未配置本地开发密钥 GEMINI_API_KEY，系统已自动切为智能匹配模式。"
    });
  }

  const { text, image, images } = req.body;

  try {
    const contents: GeminiContentPart[] = [];
    
    // Set up parsing context parts
    contents.push({
      text: `您正在为一个专业的采购和样品工程管理系统格式化用户贴入的任何内容为一个极其规范的[样品获取跟踪对象]。
用户可能贴入了手写便签、Excel表格片段、或者包含该样品图画外观的截图，也有可能两者兼备。
请彻底分析贴入的信息，提取或合理推测并转换成结构化的 JSON 结果。
请格外关注以下信息：
- 样品名称 (name): 尽可能干净具体的中文名称（例如：超细硅酸铝材料，而不是一长串冗余废话）。
- 规格型号 (spec): 例如 102# 配套，NXP UCODE 9 等。
- 物料分类 (category): 只能是 ["原材料", "标签", "包装物", "瓶子", "袋子", "辅料", "其他"] 之一。
- 提供供应商 (supplier): 如果找到或提到公司、厂房、商家名字，作为供应商。
- 申领数量 (quantity): 必须是整数数值。若未指定或没提及则默认为 1。
- 计量单位 (unit): 例如 "PCS", "KG", "包", "件", "对", "个", "组"。若未指定则合理推断。
- 物流快递信息 (courierInfo): 例如 "顺丰快递 SF123456" 或 "顺丰速运 34912" 等，如果有。
- 负责跟进人 (assignedTo): 例如 "张工" 或 "李研发工程师" 等。
- 详细记事备注 (notes): 包含关键试验指标、打样约束、测试合格标准等。若图里有说明文字也顺便识别进去。

用户提供的数据：
文字信息:
${text || "[无贴入文字]"}
`
    });

    const processBase64Image = (img: string) => {
      let mimeType = "image/png";
      let base64Data = "";
      const match = img.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      } else {
        base64Data = img;
      }
      return base64Data ? { mimeType, data: base64Data } : null;
    };

    if (image) {
      const imgData = processBase64Image(image);
      if (imgData) {
        contents.push({ inlineData: imgData });
      }
    }

    if (images && Array.isArray(images)) {
      for (const img of images) {
        const imgData = processBase64Image(img);
        if (imgData) {
          contents.push({ inlineData: imgData });
        }
      }
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: contents },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "样品名称" },
            spec: { type: Type.STRING, description: "规格规格或技术规格型号" },
            category: { type: Type.STRING, description: "类别，限定匹配为: 原材料、标签、包装物、瓶子、袋子、辅料、其他" },
            supplier: { type: Type.STRING, description: "样品来源的厂商或供应商名" },
            quantity: { type: Type.INTEGER, description: "样品申领数量，整型" },
            unit: { type: Type.STRING, description: "样品数量单位" },
            courierInfo: { type: Type.STRING, description: "样品快递公司及单号信息" },
            assignedTo: { type: Type.STRING, description: "内部负责跟进此样品的工程师" },
            notes: { type: Type.STRING, description: "核心备注、测试目的、关注事项总结" }
          },
          required: ["name", "spec", "category", "supplier", "quantity", "unit", "courierInfo", "assignedTo", "notes"]
        }
      }
    });

    const parsedText = response.text;
    if (!parsedText) {
      throw new Error("Empty response from Gemini endpoint.");
    }

    const resultObject = JSON.parse(parsedText.trim());

    return res.json({
      success: true,
      data: resultObject
    });

  } catch (error) {
    const message = getErrorMessage(error);
    console.warn("Gemini Parsing warning in server-side (likely overload or quota):", message);
    return res.status(500).json({
      success: false,
      error: "AI_PROCESSING_ERROR",
      message
    });
  }
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
