// ============================================
// api.js — HTTP layer for Google Apps Script
// Depends on: config.js (CONFIG)
// ============================================

const API = {
  async get(action, params = {}) {
    params._t = Date.now(); // Cache buster
    const query = new URLSearchParams({ action, ...params }).toString();
    
    if (CONFIG.API_URL.startsWith('http')) {
      let proxyRes;
      try {
        proxyRes = await fetch(`/api/gas?${query}`);
      } catch (err) {
        // Network error reaching proxy, fall through
      }
      
      if (proxyRes) {
        if (proxyRes.status !== 404) {
          try {
            return await proxyRes.json();
          } catch(e) {
            return { success: false, message: 'Server returned invalid response' };
          }
        }
      }
    }

    try {
      const res = await fetch(`${CONFIG.API_URL}?${query}`);
      return await res.json();
    } catch (e) {
      return { success: false, message: 'Network or parsing error' };
    }
  },

  async post(action, data = {}) {
    const payload = JSON.stringify({ action, ...data });

    if (CONFIG.API_URL.startsWith('http')) {
      let proxyRes;
      try {
        proxyRes = await fetch('/api/gas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });
      } catch (err) {
        // Network error reaching proxy (e.g. offline), fall through
      }
      
      if (proxyRes) {
        if (proxyRes.status !== 404) {
          // We reached the proxy, so DO NOT fall through to direct call.
          // This prevents double-execution on the backend if GAS returns a 500.
          try {
            return await proxyRes.json();
          } catch(e) {
            return { success: false, message: 'Server returned invalid response (possibly 500)' };
          }
        }
      }
    }

    try {
      const res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        body: payload
      });
      return await res.json();
    } catch (e) {
      return { success: false, message: 'Network or parsing error' };
    }
  }
};
