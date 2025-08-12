import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import Ajv from "ajv";

const ajv = new Ajv();
const app = express();
app.use(cors());
app.use(bodyParser.json());

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


async function callOllama(prompt, temperature = 0, top_p = 1, top_k = 40) {
  const resp = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3",
      prompt,
      temperature,
      top_p,
      top_k,
      stop: ["Q:"],
      stream: false,
    }),
  });
  return await resp.json();
}

app.post("/api/query", async (req, res) => {
  const {
    prompt: userPrompt,
    mode = "auto",
    temperature = 0, 
    top_p = 1,
    top_k = 40,
    debug = false, 
  } = req.body;

  const promptType = detectPromptType(userPrompt, mode);
  let finalPrompt;
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

  try {
    const rawData = await callOllama(finalPrompt, temperature, top_p, top_k);
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

    
    let repairRaw = null;
    if (!parsed) {
      const repairPrompt = `
You received a previous non-JSON or malformed output. Below is the original output.
Please EXTRACT AND RETURN ONLY a valid JSON object that matches exactly this schema:
{
  "summary": "string",
  "key_points": ["string", "..."],
  "source_links": ["string", "..."]
}
Do NOT add any extra text. Return only the JSON object (start with '{' and end with '}').

Original output:
${rawOutput}
`;
      const repairData = await callOllama(repairPrompt, 0, 1, 40);
      repairRaw =
        repairData && repairData.response ? String(repairData.response) : "";

      
      let cleanedRepair = repairRaw.replace(/```(?:json)?/g, "").trim();
      const repairedJson =
        extractBalancedJSON(cleanedRepair) ||
        (cleanedRepair.match(/\{[\s\S]*\}/)
          ? cleanedRepair.match(/\{[\s\S]*\}/)[0]
          : null);

      if (repairedJson) {
        try {
          parsed = JSON.parse(repairedJson);
        } catch (e) {
          parsed = null;
        }
      }
    }

   
    if (!parsed) {
      const payload = {
        response:
          "Model output was not valid JSON after extraction and repair.",
      };
      if (debug) {
        payload.raw = rawOutput;
        payload.repairAttempt = repairRaw;
      }
      return res.status(200).json(payload);
    }

  
    const validate = ajv.compile(outputSchema);
    if (!validate(parsed)) {
      const payload = {
        response: "Model output did not match expected schema.",
      };
      if (debug) {
        payload.parsed = parsed;
      }
      return res.status(200).json(payload);
    }

   
    const result = { response: parsed };
    if (debug) {
      result.raw = rawOutput;
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("Ollama API error:", err);
    return res.status(500).json({ error: "Ollama API call failed" });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
