## 🧠 AI Personal Research Assistant
This is a full-stack AI-powered research assistant that leverages local Large Language Models (LLMs) to provide structured, context-aware answers. The application is capable of answering questions from its general knowledge, retrieving information from user-provided documents (RAG), and accessing real-time information from the internet using tools (Function Calling).


# ✨ Key Features
Multi-Modal Reasoning: The assistant can operate in several modes:

Standard Mode: Utilizes various prompting techniques (Zero-shot, One-shot, Few-shot) for general knowledge questions.

Retrieval-Augmented Generation (RAG): Ingests user-uploaded PDF documents into a vector database to provide answers based only on the provided text, mitigating hallucinations.

Function Calling: Can access external tools, such as a real-time web search (Tavily API), to answer questions about recent events and overcome its knowledge cutoff.

Chain-of-Thought (CoT): Can be enabled to force the model to "think step-by-step," improving its reasoning on complex, multi-step questions.

Structured Output: All responses are delivered in a clean, predictable JSON format, making the assistant suitable for API integrations.

Local-First AI: Runs powerful models like Llama 3 locally using Ollama, ensuring data privacy and full control over the AI stack.

Vector Database Integration: Uses ChromaDB to store document embeddings and perform efficient similarity searches for the RAG pipeline.

Advanced Parameter Control: The UI allows for fine-tuning of model parameters like temperature, top_p, and top_k.

# 🛠️ Tech Stack
Frontend: React.js, Axios

Backend: Node.js, Express.js

AI/ML:

Models & Inference: Ollama (Llama 3, nomic-embed-text)

Core Concepts: RAG, Function Calling, Chain-of-Thought, Prompt Engineering

Vector Database: ChromaDB

Tools & DevOps: Docker, Git, GitHub, Postman

# 🚀 Getting Started: Local Setup
This project is designed to run locally. Please follow these steps to set up the environment.

Prerequisites
Node.js (v18 or higher)

Docker Desktop

Ollama

1. Clone the Repository
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name

2. Install AI Models with Ollama
You need to pull the two models used by this project. Open a terminal and run:

# Pull the main language model
ollama pull llama3

# Pull the embedding model for RAG
ollama pull nomic-embed-text

Ensure the Ollama application is running in the background.

3. Start the Vector Database with Docker
Make sure Docker Desktop is running. Then, start the ChromaDB container in detached mode:

docker run -d -p 8000:8000 --name my-research-db chromadb/chroma

This command only needs to be run once. In the future, you can start/stop the container from Docker Desktop.

4. Configure Backend Environment
Navigate to the backend directory: cd backend

Create a .env file by copying the example: cp .env.example .env

Open the .env file and add your free API key from Tavily AI for the web search functionality:

TAVILY_API_KEY=your_tavily_api_key_here

5. Install Dependencies
In the backend directory, run:

npm install

In a separate terminal, navigate to the frontend directory and run:

npm install

6. Run the Application
You will need two separate terminals running simultaneously.

Terminal 1 (Backend):

cd backend
node server.js

You should see "Server running on port 5000".

Terminal 2 (Frontend):

cd frontend
npm run dev

Your browser should automatically open to the application, typically at http://localhost:5173.

# 📖 How to Use
Ingest a Document: Click "Choose File," select a PDF, and click "Ingest Document" to add it to the knowledge base.

Ask a Question: Type your research question into the text area.

Select a Mode:

For general questions, leave all boxes unchecked.

To ask about your uploaded document, check "Enable RAG".

For questions about recent events, check "Enable Web Search".

For complex questions that require reasoning, check "Enable Chain of Thought".

Get a Response: Click "Ask" and wait for the structured JSON response to appear.

