import { useState } from 'react';
import axios from 'axios';

function App() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [mode, setMode] = useState('auto');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setResponse('Loading...');

    try {
      const res = await axios.post('http://localhost:5000/api/query', { prompt, mode });
      setResponse(res.data.response);
    } catch (error) {
      setResponse('Error getting response.');
      console.error(error);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <h1>🧠 AI Personal Research Assistant</h1>

      <form onSubmit={handleSubmit}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows="5"
          cols="70"
          placeholder="Ask a research question..."
          style={{ padding: '10px' }}
        />
        <br /><br />
        <label>
          Prompting Mode:&nbsp;
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="auto">Auto (Smart Detect)</option>
            <option value="zero-shot">Zero-Shot</option>
            <option value="one-shot">One-Shot</option>
            <option value="few-shot">Few-Shot</option>
          </select>
        </label>
        <br /><br />
        <button type="submit">Ask</button>
      </form>

      <div style={{ marginTop: '2rem' }}>
        <h2>📄 Response:</h2>
        <pre>{response}</pre>
      </div>
    </div>
  );
}

export default App;
