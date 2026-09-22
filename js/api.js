// ============================================
// api.js — HTTP layer for Google Apps Script
// Depends on: config.js (CONFIG)
// ============================================

const API = {
  async get(action, params = {}) {
    params._t = Date.now(); // Cache buster
    const query = new URLSearchParams({ action, ...params }).toString();
    
    let result = null;

    // 1. Try local proxy
    if (CONFIG.API_URL && CONFIG.API_URL.startsWith('http')) {
      try {
        const proxyRes = await fetch(`/api/gas?${query}`, {
          headers: { 'X-Target-GAS-URL': CONFIG.API_URL }
        });
        const text = await proxyRes.text();
        try {
          result = JSON.parse(text);
        } catch (e) {
          console.warn('[API.get] Proxy returned non-JSON, attempting direct fallback...');
        }
      } catch (err) {
        console.warn('[API.get] Proxy fetch failed, attempting direct fallback...', err);
      }
    }

    // 2. Direct fetch fallback
    if (!result) {
      try {
        const res = await fetch(`${CONFIG.API_URL}?${query}`);
        const text = await res.text();
        result = JSON.parse(text);
      } catch (e) {
        return { 
          success: false, 
          message: 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.' 
        };
      }
    }

    // Post-process responses for consistency across all environments (proxy and direct GAS)
    if (result && result.success) {
      if (action === 'login' && result.user) {
        const r = String(result.user.role || '').toLowerCase();
        const u = String(result.user.username || '');
        if (r === 'deleted' || u.startsWith('__deleted_')) {
          return { success: false, message: 'بيانات الاعتماد غير صحيحة' };
        }
        if (r === 'frozen' || r.startsWith('frozen')) {
          return {
            success: false,
            frozen: true,
            message: 'انتهت صلاحية هذا الحساب. يرجى التواصل مع إدارة المنصة لتجديد الاشتراك.'
          };
        }
      }

      if (action === 'getAllUsers' || action === 'getAllStudents') {
        const rawList = result.users || result.students || [];
        const processed = rawList.filter(user => {
          const r = String(user.role || '').toLowerCase();
          const u = String(user.username || '');
          if (r === 'deleted' || u.startsWith('__deleted_')) return false;
          return true;
        }).map(user => {
          const r = String(user.role || '');
          const isFrozen = !!user.is_frozen || r.toLowerCase().startsWith('frozen:') || r.toLowerCase() === 'frozen';
          const originalRole = user.originalRole || r.replace(/^frozen:?/i, '') || 'student';
          return {
            ...user,
            is_frozen: isFrozen,
            status: isFrozen ? 'frozen' : 'active',
            role: isFrozen ? originalRole : r,
            originalRole: originalRole
          };
        });
        if (result.users) result.users = processed;
        if (result.students) result.students = processed;
      }
    }

    return result;
  },

  async post(action, data = {}) {
    const payload = JSON.stringify({ action, ...data });
    let result = null;

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
          result = JSON.parse(text);
        } catch (e) {
          console.warn('[API.post] Proxy returned non-JSON, falling back to direct request...');
        }
      } catch (err) {
        console.warn('[API.post] Proxy network error, falling back to direct request...', err);
      }
    }

    // 2. Direct fetch fallback
    if (!result) {
      try {
        const res = await fetch(CONFIG.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: payload
        });
        const text = await res.text();
        result = JSON.parse(text);
      } catch (e) {
        result = { 
          success: false, 
          message: 'تعذر إتمام العملية بسبب انقطاع مؤقت في الاتصال بقاعدة بيانات جوجل. يرجى إعادة المحاولة.' 
        };
      }
    }

    // Smart fallback if direct GAS returned "Unknown action" for delete or freeze
    if (result && !result.success && result.message === 'Unknown action') {
      if (action === 'deleteUser') {
        const fallbackRes = await API.post('updateUser', {
          username: data.username,
          new_username: '__deleted_' + Date.now() + '_' + data.username,
          role: 'deleted'
        });
        if (fallbackRes && fallbackRes.success) {
          return { success: true, message: 'تم حذف الحساب نهائياً بنجاح' };
        }
      } else if (action === 'freezeUser') {
        const fallbackRes = await API.post('updateUser', {
          username: data.username,
          role: 'frozen:' + (data.originalRole || 'student')
        });
        if (fallbackRes && fallbackRes.success) {
          return { success: true, message: 'تم تجميد الحساب بنجاح' };
        }
      } else if (action === 'unfreezeUser') {
        const fallbackRes = await API.post('updateUser', {
          username: data.username,
          role: data.role || 'student'
        });
        if (fallbackRes && fallbackRes.success) {
          return { success: true, message: 'تم إلغاء تجميد الحساب وتنشيطه بنجاح' };
        }
      }
    }

    return result;
  }
};

