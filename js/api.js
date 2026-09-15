// ============================================
// api.js — HTTP layer for Google Apps Script
// Depends on: config.js (CONFIG)
// ============================================

const API = {
  async get(action, params = {}) {
    const query = new URLSearchParams({ action, ...params }).toString();
    try {
      const res = await fetch(`${CONFIG.API_URL}?${query}`);
      return await res.json();
    } catch (err) {
      // Fallback to local server proxy if direct call was blocked or failed
      if (CONFIG.API_URL.startsWith('http')) {
        try {
          const res = await fetch(`/api/gas?${query}`);
          return await res.json();
        } catch (e2) {
          throw err;
        }
      }
      throw err;
    }
  },

  async post(action, data = {}) {
    const payload = JSON.stringify({ action, ...data });
    try {
      const res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        body: payload
      });
      return await res.json();
    } catch (err) {
      // Fallback to local server proxy if direct call was blocked or failed
      if (CONFIG.API_URL.startsWith('http')) {
        try {
          const res = await fetch('/api/gas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
          });
          return await res.json();
        } catch (e2) {
          throw err;
        }
      }
      throw err;
    }
  }
};
