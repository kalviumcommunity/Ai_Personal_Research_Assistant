import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import Ajv from "ajv";
import dotenv from "dotenv";
import { ChromaClient } from "chromadb-client";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import multer from "multer";
import fs from "fs";

dotenv.config();

const ajv = new Ajv();
const app = express();
app.use(cors());

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

const upload = multer({ dest: "uploads/" });
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

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

async function callOllama(prompt, temperature = 0, top_p = 1, top_k = 40, format = null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);

  const body = {
    model: "llama3",
    prompt,
    stream: false,
    temperature,
    top_p,
    top_k,
  };
  if (format === "json") {
    body.format = "json";
  }

  try {
    const resp = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return await resp.json();

  } catch (error) {
    clearTimeout(timeoutId);
    return { response: `{"error": "Failed to get response from Ollama: ${error.name === 'AbortError' ? 'Request timed out' : error.message}"}` };
  }
}

app.post("/api/ingest", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  try {
    const loader = new PDFLoader(req.file.path);
    const docs = await loader.load();
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const splits = await textSplitter.splitDocuments(docs);
    const embeddingsArray = await embeddings.embedDocuments(
      splits.map((doc) => doc.pageContent)
    );
    const collection = await client.getOrCreateCollection({
      name: "my-research-docs",
    });
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
    res.status(200).json({ message: "File ingested successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to ingest file.", details: err.message });
  }
});

const functionCallingPrompt = (userPrompt) => {
  const currentDate = new Date().toISOString().split('T')[0];
  return `
You have access to a tool called 'web_search'. Use it for recent events or current information.
The current date is ${currentDate}. Use this to understand terms like "latest", "recent", or "this year".
To use the tool, you MUST respond with ONLY a JSON object: {"tool": "web_search", "query": "your search query"}
If you don't need it, just answer the question.
User Question: ${userPrompt}
`;
};

const applyCoT = (originalPrompt) => {
  return `
First, think step-by-step about how to answer the user's request. Break down the problem, analyze the provided context, and outline your plan. Use <thinking> XML tags to enclose your thought process.
After your thinking process, provide your final answer. The final answer MUST be a single, valid JSON object that adheres to the required schema. Do not include any other text outside of the JSON object in the final answer.
Here is the user's request:
---
${originalPrompt}
---
Your response should be structured like this:
<thinking>
1. First I will analyze the user's question to understand the core requirement.
2. Then I will review the provided context (if any) to extract relevant facts.
3. Finally, I will construct the JSON object with the summary, key points, and source links.
</thinking>
{
  "summary": "...",
  "key_points": ["...", "..."],
  "source_links": ["...", "..."]
}
`;
};

app.post("/api/query", async (req, res) => {
  const {
    prompt: userPrompt,
    mode = "auto",
    temperature = 0.2,
    top_p = 1,
    top_k = 40,
    debug = false,
    useRAG = false,
    useFunctionCalling = false,
    useCoT = false,
  } = req.body;

  let finalPrompt;
  let finalResponse;
  let useJsonFormat = true;

  try {
    let baseQueryPrompt;

    if (useFunctionCalling) {
      const decisionPrompt = functionCallingPrompt(userPrompt);
      const decisionData = await callOllama(decisionPrompt, 0, 1, 40, "json");
      const decisionText = decisionData?.response || "";
      
      let toolCall = null;
      try {
        toolCall = JSON.parse(decisionText);
      } catch (e) {}

      if (toolCall && toolCall.tool === "web_search") {
        const searchResponse = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: process.env.TAVILY_API_KEY,
                query: toolCall.query,
                max_results: 5,
                include_answer: true,
            }),
        });
        const searchResults = await searchResponse.json();

        if (!searchResults.results && !searchResults.answer) {
            throw new Error("Failed to get results from Tavily API. Check your API key.");
        }

        let context = "";
        if (searchResults.answer) {
            context += `Consolidated Answer: ${searchResults.answer}\n\n`;
        }
        context += "Supporting Sources:\n" + searchResults.results.map(r => `Source URL: ${r.url}\nTitle: ${r.title}`).join("\n");
        baseQueryPrompt = `Based ONLY on the following consolidated answer and supporting sources, respond to the user's question. Context: --- ${context} --- User Question: "${userPrompt}". Your final output MUST be a JSON object with a summary, key_points, and the source URLs as source_links.`;
      } else {
        baseQueryPrompt = zeroShotPrompt(userPrompt);
      }
    } else if (useRAG) {
      const collection = await client.getCollection({ name: "my-research-docs", embeddingFunction: embeddings });
      const queryEmbedding = await embeddings.embedQuery(userPrompt);
      if (!queryEmbedding || queryEmbedding.length === 0) {
        throw new Error("Generated an empty embedding from Ollama.");
      }
      const results = await collection.query({ queryEmbeddings: [queryEmbedding], nResults: 4 });
      const retrievedDocs = results.documents[0].map((doc, index) => ({
        pageContent: doc,
        metadata: results.metadatas[0][index] || {},
      }));
      const context = retrievedDocs.map((doc, index) => `--- Context Piece ${index + 1} ---\nSource: ${doc.metadata.source}, Page: ${doc.metadata.pageNumber}\n\n${doc.pageContent}`).join("\n\n");
      baseQueryPrompt = `
You are an expert AI research assistant. Use the following context to answer the user's question.
You MUST provide a detailed summary and extract key points based ONLY on the information in the context.
If the answer is not found in the context, state that clearly. The source_links should be populated with the page numbers and sources from the context. Do NOT use outside knowledge.
IMPORTANT: You MUST OUTPUT only a single valid JSON object.
--- CONTEXT ---
${context}
--- END CONTEXT ---
User Question: ${userPrompt}
Answer:
`;
    } else {
      const promptType = detectPromptType(userPrompt, mode);
      switch (promptType) {
        case "one-shot":
          baseQueryPrompt = oneShotPrompt(userPrompt);
          break;
        case "few-shot":
          baseQueryPrompt = fewShotPrompt(userPrompt);
          break;
        default:
          baseQueryPrompt = zeroShotPrompt(userPrompt);
      }
    }

    if (useCoT) {
      finalPrompt = applyCoT(baseQueryPrompt);
      useJsonFormat = false;
    } else {
      finalPrompt = baseQueryPrompt;
    }

    const rawData = await callOllama(
      finalPrompt,
      temperature,
      top_p,
      top_k,
      useJsonFormat ? "json" : null
    );
    finalResponse = rawData?.response || "";

    let parsed = null;
    try {
        const jsonText = useCoT ? extractBalancedJSON(finalResponse) : finalResponse;
        if (!jsonText) throw new Error("No JSON object found in the response.");
        parsed = JSON.parse(jsonText);
    } catch (e) {
        return res.status(500).json({ error: "Model output was not valid JSON.", details: finalResponse });
    }

    const validate = ajv.compile(outputSchema);
    if (!validate(parsed)) {
      return res.status(500).json({ error: "Model output did not match schema." });
    }
    return res.status(200).json({ response: parsed });

  } catch (err) {
    res.status(500).json({ error: "API call failed", details: err.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
