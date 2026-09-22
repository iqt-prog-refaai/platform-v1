import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Health check endpoint for AI Studio runtime
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend static files directly (no proxy or middleware)
app.use(express.static(__dirname));

// Fallback to index.html for Single Page Application routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server serving static files on port ${PORT}`);
});
