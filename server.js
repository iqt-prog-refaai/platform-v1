import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Persistent storage helper for frozen & deleted accounts
const ACCOUNTS_FILE = path.join(__dirname, 'data', 'accounts.json');

function getAccountControls() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        frozen: parsed.frozen || {},
        deleted: parsed.deleted || []
      };
    }
  } catch (e) {
    console.error('[AccountControls] Error reading file:', e);
  }
  return { frozen: {}, deleted: [] };
}

function saveAccountControls(data) {
  try {
    const dir = path.dirname(ACCOUNTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[AccountControls] Error saving file:', e);
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Dedicated REST endpoints for user management
app.post('/api/users/freeze', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const originalRole = req.body.originalRole || 'student';
  if (!username) return res.status(400).json({ success: false, message: 'اسم المستخدم مطلوب' });

  const controls = getAccountControls();
  controls.frozen[username.toLowerCase()] = {
    frozenAt: new Date().toISOString(),
    originalRole: originalRole,
    reason: req.body.reason || 'انتهت صلاحية الحساب'
  };
  saveAccountControls(controls);

  // Sync to GAS sheet in background
  try {
    const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxN3hqIWJMscT1C0K3KeiNtfo_OMpXpB8NDX23vbZ9CWPGIyk4TsfGZNHPQqrPjbsoeGg/exec';
    await fetch(DEFAULT_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'updateUser',
        username: username,
        role: 'frozen:' + originalRole
      })
    });
  } catch (e) {
    console.warn('[Sync] Background GAS update for freeze:', e.message);
  }

  return res.json({ success: true, message: 'تم تجميد الحساب بنجاح' });
});

app.post('/api/users/unfreeze', async (req, res) => {
  const username = String(req.body.username || '').trim();
  if (!username) return res.status(400).json({ success: false, message: 'اسم المستخدم مطلوب' });

  const controls = getAccountControls();
  const prevInfo = controls.frozen[username.toLowerCase()];
  delete controls.frozen[username.toLowerCase()];
  saveAccountControls(controls);

  const restoreRole = req.body.role || prevInfo?.originalRole || 'student';

  // Sync to GAS sheet in background
  try {
    const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxN3hqIWJMscT1C0K3KeiNtfo_OMpXpB8NDX23vbZ9CWPGIyk4TsfGZNHPQqrPjbsoeGg/exec';
    await fetch(DEFAULT_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'updateUser',
        username: username,
        role: restoreRole
      })
    });
  } catch (e) {
    console.warn('[Sync] Background GAS update for unfreeze:', e.message);
  }

  return res.json({ success: true, message: 'تم إلغاء تجميد الحساب وتنشيطه بنجاح' });
});

app.post('/api/users/delete', async (req, res) => {
  const username = String(req.body.username || '').trim();
  if (!username) return res.status(400).json({ success: false, message: 'اسم المستخدم مطلوب' });

  const controls = getAccountControls();
  if (!controls.deleted.includes(username.toLowerCase())) {
    controls.deleted.push(username.toLowerCase());
  }
  delete controls.frozen[username.toLowerCase()];
  saveAccountControls(controls);

  // Sync to GAS sheet: permanently mark row in Google Sheets as deleted
  try {
    const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxN3hqIWJMscT1C0K3KeiNtfo_OMpXpB8NDX23vbZ9CWPGIyk4TsfGZNHPQqrPjbsoeGg/exec';
    await fetch(DEFAULT_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'updateUser',
        username: username,
        new_username: '__deleted_' + Date.now() + '_' + username,
        role: 'deleted'
      })
    });
  } catch (e) {
    console.warn('[Sync] Background GAS update for delete:', e.message);
  }

  return res.json({ success: true, message: 'تم حذف الحساب نهائياً بنجاح' });
});

// Proxy to Google Apps Script backend to handle all actions seamlessly
app.all('/api/gas', async (req, res) => {
  const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxN3hqIWJMscT1C0K3KeiNtfo_OMpXpB8NDX23vbZ9CWPGIyk4TsfGZNHPQqrPjbsoeGg/exec';
  const customUrl = req.headers['x-target-gas-url'];
  const baseGasUrl = (customUrl && typeof customUrl === 'string' && customUrl.startsWith('https://script.google.com/')) ? customUrl : DEFAULT_GAS_URL;

  // Intercept freezeUser action
  if (req.method === 'POST' && req.body?.action === 'freezeUser') {
    const username = String(req.body.username || '').trim();
    const originalRole = req.body.originalRole || 'student';
    if (!username) return res.json({ success: false, message: 'اسم المستخدم مطلوب' });

    const controls = getAccountControls();
    controls.frozen[username.toLowerCase()] = {
      frozenAt: new Date().toISOString(),
      originalRole: originalRole,
      reason: req.body.reason || 'انتهت صلاحية الحساب'
    };
    saveAccountControls(controls);

    try {
      await fetch(baseGasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updateUser',
          username: username,
          role: 'frozen:' + originalRole
        })
      });
    } catch(e) {}

    return res.json({ success: true, message: 'تم تجميد الحساب بنجاح' });
  }

  // Intercept unfreezeUser action
  if (req.method === 'POST' && req.body?.action === 'unfreezeUser') {
    const username = String(req.body.username || '').trim();
    if (!username) return res.json({ success: false, message: 'اسم المستخدم مطلوب' });

    const controls = getAccountControls();
    const prevInfo = controls.frozen[username.toLowerCase()];
    delete controls.frozen[username.toLowerCase()];
    saveAccountControls(controls);

    const restoreRole = req.body.role || prevInfo?.originalRole || 'student';

    try {
      await fetch(baseGasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updateUser',
          username: username,
          role: restoreRole
        })
      });
    } catch(e) {}

    return res.json({ success: true, message: 'تم إلغاء تجميد الحساب وتنشيطه بنجاح' });
  }

  // Intercept deleteUser action
  if (req.method === 'POST' && req.body?.action === 'deleteUser') {
    const username = String(req.body.username || '').trim();
    if (!username) return res.json({ success: false, message: 'اسم المستخدم مطلوب' });

    const controls = getAccountControls();
    if (!controls.deleted.includes(username.toLowerCase())) {
      controls.deleted.push(username.toLowerCase());
    }
    delete controls.frozen[username.toLowerCase()];
    saveAccountControls(controls);

    // Call GAS to mark row in Google Sheets
    try {
      await fetch(baseGasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updateUser',
          username: username,
          new_username: '__deleted_' + Date.now() + '_' + username,
          role: 'deleted'
        })
      });
    } catch(e) {}

    return res.json({ success: true, message: 'تم حذف الحساب نهائياً بنجاح' });
  }

  // Smart normalization for login queries
  const queryParams = { ...req.query };
  const controls = getAccountControls();

  if (queryParams.action === 'login' && queryParams.username) {
    let u = String(queryParams.username).trim();
    u = u.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    if (u === 'أدمن' || u === 'الادمن' || u === 'الأدمن') {
      u = 'admin';
    }
    queryParams.username = u;
    if (queryParams.password) {
      queryParams.password = String(queryParams.password).trim();
    }

    // Check if account is deleted
    if (controls.deleted.includes(u.toLowerCase())) {
      return res.json({ success: false, message: 'بيانات الاعتماد غير صحيحة' });
    }

    // Check if account is frozen
    if (controls.frozen[u.toLowerCase()]) {
      return res.json({ 
        success: false, 
        frozen: true, 
        message: 'انتهت صلاحية هذا الحساب. يرجى التواصل مع إدارة المنصة لتجديد الاشتراك.' 
      });
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

    // If login failed, try sensible fallbacks
    if (queryParams.action === 'login' && (!result.ok || !result.data?.success)) {
      const origU = queryParams.username;
      const origP = queryParams.password;
      const lowerU = origU.toLowerCase();
      const lowerP = origP.toLowerCase();

      if (origU !== lowerU) {
        const retry1 = await fetchGasWithParams({ ...queryParams, username: lowerU });
        if (retry1.ok && retry1.data?.success) return retry1;
      }

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

    if (result.ok && result.data) {
      // Check login outcome for frozen or deleted users
      if (queryParams.action === 'login' && result.data.success && result.data.user) {
        const u = result.data.user;
        const uName = String(u.username || '').toLowerCase();
        const role = String(u.role || '').toLowerCase();

        if (controls.deleted.includes(uName) || role === 'deleted' || String(u.username).startsWith('__deleted_')) {
          return res.status(200).json({ success: false, message: 'بيانات الاعتماد غير صحيحة' });
        }

        if (controls.frozen[uName] || role.startsWith('frozen')) {
          return res.status(200).json({ 
            success: false, 
            frozen: true, 
            message: 'انتهت صلاحية هذا الحساب. يرجى التواصل مع إدارة المنصة لتجديد الاشتراك.' 
          });
        }
      }

      // Filter and format getAllUsers / getAllStudents
      if ((queryParams.action === 'getAllUsers' || queryParams.action === 'getAllStudents') && result.data.success) {
        const rawList = result.data.users || result.data.students || [];
        const filtered = rawList.filter(user => {
          const uName = String(user.username || '').toLowerCase();
          const role = String(user.role || '').toLowerCase();
          if (controls.deleted.includes(uName)) return false;
          if (role === 'deleted' || String(user.username).startsWith('__deleted_')) return false;
          return true;
        }).map(user => {
          const uName = String(user.username || '').toLowerCase();
          const role = String(user.role || '');
          const isFrozen = !!controls.frozen[uName] || role.toLowerCase().startsWith('frozen');
          const originalRole = controls.frozen[uName]?.originalRole || role.replace(/^frozen:?/i, '') || 'student';

          return {
            ...user,
            is_frozen: isFrozen,
            status: isFrozen ? 'frozen' : 'active',
            role: isFrozen ? originalRole : role,
            originalRole: originalRole
          };
        });

        if (result.data.users) result.data.users = filtered;
        if (result.data.students) result.data.students = filtered;
      }

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
