import { useState } from 'react';
import axios from 'axios';

function App() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setResponse('Loading...');

    try {
      const res = await axios.post('http://localhost:5000/api/query', { prompt });
      setResponse(res.data.response);
    } catch (error) {
      setResponse('Error getting response.');
      console.error(error);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>AI Personal Research Assistant</h1>
      <form onSubmit={handleSubmit}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows="4"
          cols="50"
          placeholder="Ask a research question..."
        />
        <br />
        <button type="submit">Ask</button>
      </form>
      <div>
        <h2>Response:</h2>
        <p>{response}</p>
      </div>
    </div>
  );
}

export default App;
