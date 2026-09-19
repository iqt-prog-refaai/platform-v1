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
  const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxN3hqIWJMscT1C0K3KeiNtfo_OMpXpB8NDX23vbZ9CWPGIyk4TsfGZNHPQqrPjbsoeGg/exec';
  const customUrl = req.headers['x-target-gas-url'];
  const baseGasUrl = (customUrl && typeof customUrl === 'string' && customUrl.startsWith('https://script.google.com/')) ? customUrl : DEFAULT_GAS_URL;

  let targetUrl = baseGasUrl;
  const query = new URLSearchParams(req.query).toString();
  if (query) {
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + query;
  }

  const payload = req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined;

  async function callGAS(attempt = 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: payload,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const rawText = await response.text();
      let jsonData = null;
      try {
        jsonData = JSON.parse(rawText);
      } catch (parseErr) {
        // Not JSON - likely an HTML error page from Google Apps Script
      }

      if (jsonData) {
        return { ok: true, data: jsonData };
      }

      // If it returned non-JSON and we can retry, try once more
      if (attempt < 2) {
        console.warn(`[GAS Proxy] Attempt ${attempt} returned non-JSON response. Retrying in 1s...`);
        await new Promise(r => setTimeout(r, 1000));
        return callGAS(attempt + 1);
      }

      console.error(`[GAS Proxy] GAS returned non-JSON response: ${rawText.substring(0, 300)}`);
      return { 
        ok: false, 
        message: 'استجابة غير متوقعة من خادم جوجل (Google Apps Script). يرجى إعادة المحاولة.' 
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt < 2) {
        console.warn(`[GAS Proxy] Attempt ${attempt} failed (${err.message}). Retrying in 1s...`);
        await new Promise(r => setTimeout(r, 1000));
        return callGAS(attempt + 1);
      }
      console.error('[GAS Proxy] Error after retries:', err);
      return { 
        ok: false, 
        message: err.name === 'AbortError' 
          ? 'استغرقت العملية وقتاً أطول من المتوقع لدى خادم جوجل. يرجى إعادة المحاولة.'
          : 'تعذر الاتصال بخادم جوجل (Google Apps Script). يرجى المحاولة مرة أخرى.' 
      };
    }
  }

  try {
    const result = await callGAS();
    res.set('Content-Type', 'application/json; charset=utf-8');
    if (result.ok) {
      res.status(200).json(result.data);
    } else {
      res.status(200).json({ success: false, message: result.message });
    }
  } catch (fatalErr) {
    console.error('[GAS Proxy] Fatal route handler error:', fatalErr);
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ 
      success: false, 
      message: 'حدث خطأ غير متوقع أثناء معالجة الطلب. يرجى المحاولة ثانية.' 
    });
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
