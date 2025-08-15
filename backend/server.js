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
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 3-minute timeout

  const body = {
    model: "llama3",
    prompt,
    stream: false,
  };
  if (format === "json") {
    body.format = "json";
  }

  try {
    console.log("--> Attempting to call Ollama API with a 3-minute timeout...");
    const resp = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal, 
    });

    clearTimeout(timeoutId);
    console.log("--> Ollama API call successful.");
    return await resp.json();

  } catch (error) {
    clearTimeout(timeoutId);
    console.error("--> Ollama API call failed or timed out:", error.name === 'AbortError' ? 'Timeout' : error.message);
    return { response: `{"error": "Failed to get response from Ollama: ${error.name === 'AbortError' ? 'Request timed out' : error.message}"}` };
  }
}


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
    res.status(500).json({ error: "Failed to ingest file.", details: err.message });
  }
});

const functionCallingPrompt = (userPrompt) => {
  const currentDate = new Date().toISOString().split('T')[0]; // Gets today's date in YYYY-MM-DD format

  return `
You have access to a tool called 'web_search'. Use it for recent events or current information.
The current date is ${currentDate}. Use this to understand terms like "latest", "recent", or "this year".

To use the tool, you MUST respond with ONLY a JSON object: {"tool": "web_search", "query": "your search query"}
If you don't need it, just answer the question.

User Question: ${userPrompt}
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
  } = req.body;

  let finalResponse;

  try {
if (useFunctionCalling) {
  console.log("Function Calling Mode Enabled");
  const decisionPrompt = functionCallingPrompt(userPrompt);
  const decisionData = await callOllama(decisionPrompt, 0, 1, 40, "json");
  const decisionText = decisionData?.response || "";
  
  let toolCall = null;
  try {
    toolCall = JSON.parse(decisionText);
  } catch (e) {  }

  if (toolCall && toolCall.tool === "web_search") {
    console.log(`--> AI decided to use tool: web_search with query: "${toolCall.query}"`);
    
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
        console.error("Tavily API Error:", searchResults);
        throw new Error("Failed to get results from Tavily API. Check your API key.");
    }

    let context = "";
    if (searchResults.answer) {
        console.log("--> Tavily provided a direct answer.");
        context += `Consolidated Answer: ${searchResults.answer}\n\n`;
    }
    
    context += "Supporting Sources:\n" + searchResults.results.map(r => `Source URL: ${r.url}\nTitle: ${r.title}`).join("\n");

    const answerPrompt = `Based ONLY on the following consolidated answer and supporting sources, respond to the user's question. Context: --- ${context} --- User Question: "${userPrompt}". Your final output MUST be a JSON object with a summary, key_points, and the source URLs as source_links.`;
    const answerData = await callOllama(answerPrompt, temperature, top_p, top_k, "json");
    finalResponse = answerData?.response || "";

  }else {
        console.log("AI decided not to use a tool. Answering directly.");
        const directPrompt = zeroShotPrompt(userPrompt); // Use a standard prompt
        const rawData = await callOllama(directPrompt, temperature, top_p, top_k, "json");
        finalResponse = rawData?.response || "";
      }
    } else if (useRAG) {
      console.log("RAG Mode Enabled");
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
      const ragPrompt = `
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
      const rawData = await callOllama(ragPrompt, temperature, top_p, top_k, "json");
      finalResponse = rawData?.response || "";
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
      const rawData = await callOllama(finalPrompt, temperature, top_p, top_k, "json");
      finalResponse = rawData?.response || "";
    }

    let parsed = null;
    try {
        parsed = JSON.parse(finalResponse);
    } catch (e) {
        console.error("Final response was not valid JSON:", finalResponse);
        return res.status(500).json({ error: "Model output was not valid JSON." });
    }

    const validate = ajv.compile(outputSchema);
    if (!validate(parsed)) {
      return res.status(500).json({ error: "Model output did not match schema." });
    }
    return res.status(200).json({ response: parsed });

  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: "API call failed", details: err.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
