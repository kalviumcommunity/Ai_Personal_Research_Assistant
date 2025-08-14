import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import Ajv from "ajv";

// --- RAG IMPORTS ---
import { ChromaClient } from "chromadb-client";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import multer from "multer";
import fs from "fs";
import path from "path";

const ajv = new Ajv();
const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- Ingestion Setup ---
const upload = multer({ dest: "uploads/" });
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// --- ChromaDB & Embeddings Setup ---
const client = new ChromaClient({ path: "http://127.0.0.1:8000" });
const embeddings = new OllamaEmbeddings({
  model: "nomic-embed-text",
  baseUrl: "http://localhost:11434",
});

const outputSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    key_points: { type: "array", items: { type: "string" } },
    source_links: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "key_points", "source_links"],
};

const basePrompt = `
You are a research expert.
IMPORTANT: You MUST OUTPUT only a single valid JSON object and nothing else.
The object must match exactly this schema:
{
  "summary": "string",
  "key_points": ["string", "..."],
  "source_links": ["string", "..."]
}
Do NOT include any explanations, headings, bullet points, or markdown fences.
Start the output with '{' and end with the matching '}'.
`;

const zeroShotPrompt = (userPrompt) => `${basePrompt}\nQ: ${userPrompt}\nA:`;
const oneShotPrompt = (userPrompt) => `${basePrompt}
Example:
Q: What is the capital of France?
A: {"summary":"Paris is the capital of France.","key_points":["Largest city in France"],"source_links":["https://en.wikipedia.org/wiki/Paris"]}

Q: ${userPrompt}
A:`;
const fewShotPrompt = (userPrompt) => `${basePrompt}
Example 1:
Q: List three benefits of exercise.
A: {"summary":"Exercise improves health.","key_points":["Cardio health","Mental wellbeing","Strength"],"source_links":["https://example.com/benefits"]}

Example 2:
Q: Name top 3 tallest mountains.
A: {"summary":"Top 3 tallest mountains.","key_points":["Mount Everest - 8849m","K2 - 8611m","Kangchenjunga - 8586m"],"source_links":["https://example.com/mountains"]}

Q: ${userPrompt}
A:`;

function detectPromptType(prompt, clientMode = "auto") {
  if (clientMode !== "auto") return clientMode;
  if (prompt.toLowerCase().includes("compare") || prompt.length > 40)
    return "few-shot";
  if (prompt.length < 20) return "zero-shot";
  return "one-shot";
}

function extractBalancedJSON(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

// --- UPDATED callOllama function ---
async function callOllama(
  prompt,
  temperature = 0,
  top_p = 1,
  top_k = 40,
  format = null
) {
  const body = {
    model: "llama3",
    prompt,
    temperature,
    top_p,
    top_k,
    stream: false,
    stop: ["Q:"],
  };

  // Add the format parameter to the body if it's provided
  if (format === "json") {
    body.format = "json";
  }

  const resp = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await resp.json();
}

// --- Ingestion Endpoint ---
app.post("/api/ingest", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  try {
    console.log(`Ingesting file: ${req.file.originalname}`);
    const loader = new PDFLoader(req.file.path);
    const docs = await loader.load();
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const splits = await textSplitter.splitDocuments(docs);
    console.log(`Split document into ${splits.length} chunks.`);
    console.log("Generating embeddings for all chunks...");
    const embeddingsArray = await embeddings.embedDocuments(
      splits.map((doc) => doc.pageContent)
    );
    console.log("Embeddings generated successfully.");
    const collection = await client.getOrCreateCollection({
      name: "my-research-docs",
    });
    console.log("Got a handle to the collection.");
    console.log("Adding documents and embeddings to the collection...");
    await collection.add({
      ids: splits.map((_, i) => `doc_${Date.now()}_${i}`),
      embeddings: embeddingsArray,
      metadatas: splits.map((doc) => ({
        source: doc.metadata.source,
        pageNumber: doc.metadata.loc.pageNumber,
      })),
      documents: splits.map((doc) => doc.pageContent),
    });
    fs.unlinkSync(req.file.path);
    console.log("Ingestion complete.");
    res.status(200).json({ message: "File ingested successfully." });
  } catch (err) {
    console.error("Ingestion error:", err);
    console.error(err.stack);
    res
      .status(500)
      .json({ error: "Failed to ingest file.", details: err.message });
  }
});

// --- Query Endpoint ---
app.post("/api/query", async (req, res) => {
  const {
    prompt: userPrompt,
    mode = "auto",
    temperature = 0.2,
    top_p = 1,
    top_k = 40,
    debug = false,
    useRAG = false,
  } = req.body;

  let finalPrompt;

  try {
    if (useRAG) {
      console.log("RAG Mode Enabled: Retrieving context...");
      const collection = await client.getCollection({
        name: "my-research-docs",
        embeddingFunction: embeddings,
      });
      const queryEmbedding = await embeddings.embedQuery(userPrompt);
      if (!queryEmbedding || queryEmbedding.length === 0) {
        throw new Error("Generated an empty embedding from Ollama.");
      }
      const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: 4,
      });
      const retrievedDocs = results.documents[0].map((doc, index) => ({
        pageContent: doc,
        metadata: results.metadatas[0][index] || {},
      }));
      const context = retrievedDocs
        .map(
          (doc, index) =>
            `--- Context Piece ${index + 1} ---\nSource: ${
              doc.metadata.source
            }, Page: ${doc.metadata.pageNumber}\n\n${doc.pageContent}`
        )
        .join("\n\n");
      finalPrompt = `
You are an expert AI research assistant. Use the following context to answer the user's question.
You MUST provide a detailed summary and extract key points based ONLY on the information in the context.
If the answer is not found in the context, state that clearly. The source_links should be populated with the page numbers and sources from the context. Do NOT use outside knowledge.
IMPORTANT: You MUST OUTPUT only a single valid JSON object and nothing else.
The object must match exactly this schema:
{
  "summary": "string",
  "key_points": ["string", "..."],
  "source_links": ["string", "..."]
}
Do NOT include any explanations, headings, bullet points, or markdown fences.
--- CONTEXT ---
${context}
--- END CONTEXT ---
User Question: ${userPrompt}
Answer:
`;
    } else {
      console.log("Standard Mode Enabled.");
      const promptType = detectPromptType(userPrompt, mode);
      switch (promptType) {
        case "one-shot":
          finalPrompt = oneShotPrompt(userPrompt);
          break;
        case "few-shot":
          finalPrompt = fewShotPrompt(userPrompt);
          break;
        default:
          finalPrompt = zeroShotPrompt(userPrompt);
      }
    }

    // --- UPDATED Ollama call with JSON format ---
    const rawData = await callOllama(
      finalPrompt,
      temperature,
      top_p,
      top_k,
      "json" // Force JSON output
    );
    const rawOutput =
      rawData && rawData.response ? String(rawData.response) : "";

    let cleaned = rawOutput.replace(/```(?:json)?/g, "").trim();
    let jsonText = extractBalancedJSON(cleaned);

    if (!jsonText) {
      const simpleMatch = cleaned.match(/\{[\s\S]*\}/);
      jsonText = simpleMatch ? simpleMatch[0] : null;
    }

    let parsed = null;
    if (jsonText) {
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        parsed = null;
      }
    }

    // JSON repair logic is now less necessary with format: 'json', but kept as a fallback.
    if (!parsed && rawOutput) {
      const repairPrompt = `You received a previous non-JSON or malformed output. Below is the original output. Please EXTRACT AND RETURN ONLY a valid JSON object that matches the specified schema. Return only the JSON object. Original output: ${rawOutput}`;
      const repairData = await callOllama(repairPrompt, 0, 1, 40, "json");
      const repairRaw = repairData?.response ? String(repairData.response) : "";
      const repairedJson = extractBalancedJSON(repairRaw);
      if (repairedJson) {
        try {
          parsed = JSON.parse(repairedJson);
        } catch (e) {
          parsed = null;
        }
      }
    }

    if (!parsed) {
      return res.status(200).json({
        response:
          "Model output was not valid JSON after extraction and repair.",
      });
    }

    const validate = ajv.compile(outputSchema);
    if (!validate(parsed)) {
      return res.status(200).json({
        response: "Model output did not match expected schema.",
      });
    }

    return res.status(200).json({ response: parsed });
  } catch (err) {
    console.error("API error:", err);
    console.error(err.stack);
    return res
      .status(500)
      .json({ error: "API call failed", details: err.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
