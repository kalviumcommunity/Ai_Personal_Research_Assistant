import { useState } from 'react';
import axios from 'axios';

function App() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [mode, setMode] = useState('auto');
  const [temperature, setTemperature] = useState(0.2);
  const [topP, setTopP] = useState(1);
  const [topK, setTopK] = useState(40);
  const [useRAG, setUseRAG] = useState(false);
  const [file, setFile] = useState(null);
  const [ingestStatus, setIngestStatus] = useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleIngest = async () => {
    if (!file) {
      setIngestStatus('Please select a file first.');
      return;
    }
    setIngestStatus('Ingesting file, please wait...');
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post('http://localhost:5000/api/ingest', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setIngestStatus(`✅ Ingestion successful: ${file.name}`);
    } catch (error) {
      setIngestStatus('❌ Error ingesting file.');
      console.error(error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) {
      alert("Please enter a question before submitting.");
      return;
    }
    setResponse('Loading...');
    try {
      const res = await axios.post('http://localhost:5000/api/query', {
        prompt,
        mode,
        temperature,
        top_p: topP,
        top_k: topK,
        useRAG,
      });
      setResponse(JSON.stringify(res.data.response, null, 2));
    } catch (error) {
      setResponse('Error getting response.');
      console.error(error);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: '#f3f4f6',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{
        width: '90%',
        maxWidth: '800px',
        background: '#fff',
        padding: '2rem',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ textAlign: 'center', color: '#2563eb' }}>🧠 AI Personal Research Assistant</h1>
        
        <div style={{ background: '#eef2ff', padding: '1rem', borderRadius: '8px', marginBottom: '2rem' }}>
          <h2 style={{ marginTop: 0, color: '#4f46e5' }}>📚 Add to Knowledge Base</h2>
          <input type="file" onChange={handleFileChange} />
          <button onClick={handleIngest} style={{ marginLeft: '1rem', padding: '8px 12px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px' }}>
            Ingest Document
          </button>
          <p style={{ marginTop: '0.5rem', color: '#6366f1' }}>{ingestStatus}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <textarea
            rows="5"
            placeholder="Ask a research question..."
            style={{ width: '100%', padding: '12px', fontSize: '1rem', borderRadius: '8px', border: '1px solid #ccc', resize: 'vertical' }}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <br /><br />
          
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
            <input
              type="checkbox"
              id="ragToggle"
              checked={useRAG}
              onChange={(e) => setUseRAG(e.target.checked)}
              style={{ width: '18px', height: '18px', marginRight: '0.5rem' }}
            />
            <label htmlFor="ragToggle" style={{ fontWeight: 'bold' }}>
              Enable RAG (Query My Documents)
            </label>
          </div>
          
          {/* --- CONTROLS ADDED BACK IN --- */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            <label>
              <strong>Temperature:</strong><br />
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #ccc' }}
              />
            </label>

            <label>
              <strong>Top P:</strong><br />
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={topP}
                onChange={(e) => setTopP(parseFloat(e.target.value))}
                style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #ccc' }}
              />
            </label>

            <label>
              <strong>Top K:</strong><br />
              <input
                type="number"
                min="1"
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value))}
                style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #ccc' }}
              />
            </label>
          </div>
          {/* --- END OF ADDED CONTROLS --- */}
          
          <button type="submit" style={{ width: '100%', padding: '12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1.1rem', cursor: 'pointer' }}>
            Ask
          </button>
        </form>

        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ color: '#374151' }}>📄 Response:</h2>
          <pre style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {response}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default App;
