// ============================================
// api.js — Direct HTTP layer for Google Apps Script
// Connects directly to CONFIG.API_URL with ZERO middleman or proxy
// ============================================

const API = {
  /**
   * Direct GET request to Google Apps Script Web App
   */
  async get(action, params = {}) {
    params._t = Date.now(); // Cache buster
    const query = new URLSearchParams({ action, ...params }).toString();
    
    let result = null;
    try {
      const res = await fetch(`${CONFIG.API_URL}?${query}`);
      const text = await res.text();
      result = JSON.parse(text);
    } catch (e) {
      console.error('[API.get] Error fetching from Google Apps Script:', e);
      return { 
        success: false, 
        message: 'تعذر الاتصال بقاعدة بيانات جوجل. يرجى التحقق من اتصال الإنترنت.' 
      };
    }

    // Process responses directly for account controls (frozen / deleted)
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

  /**
   * Direct POST request to Google Apps Script Web App
   * Uses text/plain to avoid browser CORS preflight issues
   */
  async post(action, data = {}) {
    // Map account management actions directly to the deployed updateUser endpoint
    // so no backend modification or redeployment is required!
    let targetAction = action;
    let targetPayload = { action, ...data };

    if (action === 'freezeUser') {
      targetAction = 'updateUser';
      targetPayload = {
        action: 'updateUser',
        username: data.username,
        role: 'frozen:' + (data.originalRole || 'student')
      };
    } else if (action === 'unfreezeUser') {
      targetAction = 'updateUser';
      targetPayload = {
        action: 'updateUser',
        username: data.username,
        role: data.role || 'student'
      };
    } else if (action === 'deleteUser') {
      targetAction = 'updateUser';
      targetPayload = {
        action: 'updateUser',
        username: data.username,
        new_username: '__deleted_' + Date.now() + '_' + data.username,
        role: 'deleted'
      };
    }

    const payload = JSON.stringify(targetPayload);

    try {
      const res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payload
      });
      const text = await res.text();
      const result = JSON.parse(text);

      // Enhance messages for mapped actions
      if (result && result.success) {
        if (action === 'freezeUser') result.message = 'تم تجميد الحساب بنجاح';
        if (action === 'unfreezeUser') result.message = 'تم إلغاء تجميد الحساب وتنشيطه بنجاح';
        if (action === 'deleteUser') result.message = 'تم حذف الحساب نهائياً بنجاح';
      }
      return result;
    } catch (e) {
      console.error('[API.post] Error communicating with Google Apps Script:', e);
      return { 
        success: false, 
        message: 'تعذر إتمام العملية بسبب انقطاع في الاتصال بقاعدة بيانات جوجل.' 
      };
    }
  }
};
