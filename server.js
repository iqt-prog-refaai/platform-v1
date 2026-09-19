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

  // Smart normalization for login queries to prevent common mobile keyboard / Arabic input errors
  const queryParams = { ...req.query };
  if (queryParams.action === 'login' && queryParams.username) {
    let u = String(queryParams.username).trim();
    // Convert Arabic digits to English digits if any
    u = u.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    if (u === 'أدمن' || u === 'الادمن' || u === 'الأدمن') {
      u = 'admin';
    }
    queryParams.username = u;
    if (queryParams.password) {
      queryParams.password = String(queryParams.password).trim();
    }
  }

  async function fetchGasWithParams(params) {
    let targetUrl = baseGasUrl;
    const qStr = new URLSearchParams(params).toString();
    if (qStr) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + qStr;
    }

    const payload = req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined;
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
      } catch (parseErr) {}

      if (jsonData) return { ok: true, data: jsonData };

      return { 
        ok: false, 
        message: 'استجابة غير متوقعة من خادم جوجل. يرجى إعادة المحاولة.' 
      };
    } catch (err) {
      clearTimeout(timeoutId);
      return { 
        ok: false, 
        message: err.name === 'AbortError' 
          ? 'استغرقت العملية وقتاً أطول من المتوقع. يرجى إعادة المحاولة.'
          : 'تعذر الاتصال بخادم جوجل. يرجى المحاولة مرة أخرى.' 
      };
    }
  }

  async function callGAS() {
    let result = await fetchGasWithParams(queryParams);

    // If login failed, try sensible fallbacks (e.g. mobile auto-capitalization of username or password)
    if (queryParams.action === 'login' && (!result.ok || !result.data?.success)) {
      const origU = queryParams.username;
      const origP = queryParams.password;
      const lowerU = origU.toLowerCase();
      const lowerP = origP.toLowerCase();

      // Try 1: Lowercase username (handles "Admin" -> "admin")
      if (origU !== lowerU) {
        const retry1 = await fetchGasWithParams({ ...queryParams, username: lowerU });
        if (retry1.ok && retry1.data?.success) return retry1;
      }

      // Try 2: Lowercase password (handles mobile auto-cap on password "Admin" -> "admin")
      if (origP !== lowerP) {
        const retry2 = await fetchGasWithParams({ ...queryParams, username: lowerU, password: lowerP });
        if (retry2.ok && retry2.data?.success) return retry2;
      }
    }

    return result;
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
