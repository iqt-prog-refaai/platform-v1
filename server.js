import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Optional proxy to Google Apps Script backend to prevent any browser CORS/mixed-content issues
app.all('/api/gas', async (req, res) => {
  try {
    const GAS_URL = 'https://script.google.com/macros/s/AKfycbxN3hqIWJMscT1C0K3KeiNtfo_OMpXpB8NDX23vbZ9CWPGIyk4TsfGZNHPQqrPjbsoeGg/exec';
    let targetUrl = GAS_URL;
    const query = new URLSearchParams(req.query).toString();
    if (query) {
      targetUrl += `?${query}`;
    }

    const options = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    };

    const response = await fetch(targetUrl, options);
    const data = await response.text();
    res.status(response.status).send(data);
  } catch (err) {
    console.error('GAS proxy error:', err);
    res.status(500).json({ success: false, message: 'Proxy request failed' });
  }
});

// Serve static assets from the current directory
app.use(express.static(__dirname, {
  extensions: ['html', 'htm']
}));

// Fallback to index.html for all non-file routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`IQT Platform server running on http://0.0.0.0:${PORT}`);
});
