import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Example prompt templates
const zeroShotPrompt = (userPrompt) => `
You are a research expert. Answer in JSON format:
{
  "summary": "...",
  "key_points": ["...", "..."],
  "source_links": ["..."]
}

Q: ${userPrompt}
A:
`;

const oneShotPrompt = (userPrompt) => `
Example:
Q: Compare India's GDP growth in 2020 and 2021.
A: {
  "summary": "India’s GDP contracted in 2020 due to COVID and recovered in 2021.",
  "key_points": [
    "GDP contracted -7.3% in 2020",
    "GDP grew 8.7% in 2021"
  ],
  "source_links": ["https://example.com/source1"]
}

Q: ${userPrompt}
A:
`;

const fewShotPrompt = (userPrompt) => `
You are a research assistant. Answer all questions in this JSON format:
{
  "summary": "...",
  "key_points": ["...", "..."],
  "source_links": ["..."]
}

Example 1:
Q: Compare the 2024 and 2019 Indian election results.
A: {
  "summary": "BJP won fewer seats in 2024 but retained majority...",
  "key_points": [
    "BJP: 303 in 2019 → 290 in 2024",
    "Opposition coalition gains strength"
  ],
  "source_links": ["https://example.com/election2024"]
}

Example 2:
Q: What are the key climate policies in the EU and US?
A: {
  "summary": "The EU has stricter targets, while the US is catching up post-IRA.",
  "key_points": [
    "EU aims for net-zero by 2050",
    "US Inflation Reduction Act provides $370B for climate"
  ],
  "source_links": ["https://example.com/climate"]
}

Q: ${userPrompt}
A:
`;

function detectPromptType(prompt, clientMode = "auto") {
  if (clientMode !== "auto") return clientMode;
  if (prompt.toLowerCase().includes("compare") || prompt.length > 40)
    return "few-shot";
  if (prompt.length < 20) return "zero-shot";
  return "one-shot";
}

app.post("/api/query", async (req, res) => {
  const userPrompt = req.body.prompt;
  const mode = req.body.mode || "auto";

  const promptType = detectPromptType(userPrompt, mode);

  let finalPrompt;
  switch (promptType) {
    case "one-shot":
      finalPrompt = oneShotPrompt(userPrompt);
      break;
    case "few-shot":
      finalPrompt = fewShotPrompt(userPrompt);
      break;
    case "zero-shot":
    default:
      finalPrompt = zeroShotPrompt(userPrompt);
  }

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt: finalPrompt,
        stream: false,
      }),
    });

    const data = await response.json();
    res.json({ response: data.response });
  } catch (error) {
    console.error("Ollama API error:", error);
    res.status(500).json({ error: "Ollama API call failed" });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
