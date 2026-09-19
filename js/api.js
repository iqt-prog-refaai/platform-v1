// ============================================
// api.js — HTTP layer for Google Apps Script
// Depends on: config.js (CONFIG)
// ============================================

const API = {
  async get(action, params = {}) {
    params._t = Date.now(); // Cache buster
    const query = new URLSearchParams({ action, ...params }).toString();
    
    // 1. Try local proxy
    if (CONFIG.API_URL && CONFIG.API_URL.startsWith('http')) {
      try {
        const proxyRes = await fetch(`/api/gas?${query}`, {
          headers: { 'X-Target-GAS-URL': CONFIG.API_URL }
        });
        const text = await proxyRes.text();
        try {
          const json = JSON.parse(text);
          return json;
        } catch (e) {
          console.warn('[API.get] Proxy returned non-JSON, attempting direct fallback...');
        }
      } catch (err) {
        console.warn('[API.get] Proxy fetch failed, attempting direct fallback...', err);
      }
    }

    // 2. Direct fetch fallback
    try {
      const res = await fetch(`${CONFIG.API_URL}?${query}`);
      const text = await res.text();
      return JSON.parse(text);
    } catch (e) {
      return { 
        success: false, 
        message: 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.' 
      };
    }
  },

  async post(action, data = {}) {
    const payload = JSON.stringify({ action, ...data });

    // 1. Try local proxy first
    if (CONFIG.API_URL && CONFIG.API_URL.startsWith('http')) {
      try {
        const proxyRes = await fetch('/api/gas', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json; charset=utf-8',
            'X-Target-GAS-URL': CONFIG.API_URL
          },
          body: payload
        });
        const text = await proxyRes.text();
        try {
          const json = JSON.parse(text);
          return json;
        } catch (e) {
          console.warn('[API.post] Proxy returned non-JSON, falling back to direct request...');
        }
      } catch (err) {
        console.warn('[API.post] Proxy network error, falling back to direct request...', err);
      }
    }

    // 2. Direct fetch fallback (if proxy is down or returns non-JSON 502/504)
    try {
      const res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: payload
      });
      const text = await res.text();
      return JSON.parse(text);
    } catch (e) {
      return { 
        success: false, 
        message: 'تعذر إتمام العملية بسبب انقطاع مؤقت في الاتصال بقاعدة بيانات جوجل. يرجى إعادة المحاولة.' 
      };
    }
  }
};

