## AI Personal Research Assistant

🧠 What it does:
A user gives a natural language question like:
“Compare the 2024 Indian election results with 2019 and summarize key policy differences.”

This app will:
Retrieve relevant documents (e.g., Wikipedia, News, PDFs)
Use Prompting to clarify user intent if needed
Generate a structured output: bullet points, tables, summaries
Use Function Calling to:
   -Call web search APIs (or a local DB)
   -Summarize PDFs
   -Plot charts if needed
   

🧱 Tech Stack Breakdown
💡 Prompting:
Smart prompt templates:
“You are a research expert. Answer in a structured JSON format.”
"Ask clarification if the user’s query is ambiguous."

🔍 RAG (Retrieval-Augmented Generation):
Use LangChain or LlamaIndex
Load documents (PDFs, websites, YouTube transcripts)
Vector DB: FAISS or Pinecone

📦 Structured Output:
Ask LLM to return:
json
Copy
Edit
{
  "summary": "...",
  "key_points": ["...", "..."],
  "source_links": ["..."]
}
Display in clean UI with sections

🛠️ Function Calling (Tool Use):

Use OpenAI's function_call or LangChain tools
Sample functions:
   -search_web(query)
   -load_pdf(url)
   -generate_chart(data_type, range)

📱 User Interface (React frontend):
    -Query input
    -Response section (summary, key points, table)
    -Source viewer

