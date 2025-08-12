import { useState } from 'react';
import axios from 'axios';

function App() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [mode, setMode] = useState('auto');
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.9);
  const [topK, setTopK] = useState(40);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setResponse('Loading...');

    try {
      const res = await axios.post('http://localhost:5000/api/query', {
        prompt,
        mode,
        temperature,
        top_p: topP,
        top_k: topK
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

        <form onSubmit={handleSubmit}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows="5"
            placeholder="Ask a research question..."
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '1rem',
              borderRadius: '8px',
              border: '1px solid #ccc',
              resize: 'vertical'
            }}
          />
          <br /><br />

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem'
          }}>
            <label>
              <strong>Prompting Mode:</strong><br />
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '8px',
                  border: '1px solid #ccc'
                }}
              >
                <option value="auto">Auto (Smart Detect)</option>
                <option value="zero-shot">Zero-Shot</option>
                <option value="one-shot">One-Shot</option>
                <option value="few-shot">Few-Shot</option>
              </select>
            </label>

            <label>
              <strong>Temperature:</strong><br />
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '8px',
                  border: '1px solid #ccc'
                }}
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
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '8px',
                  border: '1px solid #ccc'
                }}
              />
            </label>

            <label>
              <strong>Top K:</strong><br />
              <input
                type="number"
                min="1"
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '8px',
                  border: '1px solid #ccc'
                }}
              />
            </label>
          </div>

          <br />
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1.1rem',
              cursor: 'pointer',
              transition: 'background 0.3s'
            }}
            onMouseOver={(e) => e.target.style.background = '#1e40af'}
            onMouseOut={(e) => e.target.style.background = '#2563eb'}
          >
            Ask
          </button>
        </form>

        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ color: '#374151' }}>📄 Response:</h2>
          <pre style={{
            background: '#f9fafb',
            padding: '1rem',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            overflowX: 'auto',
            maxHeight: '300px'
          }}>{response}</pre>
        </div>
      </div>
    </div>
  );
}

export default App;
