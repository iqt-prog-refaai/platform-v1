// ============================================
// auth.js — Login, logout, session, navigation setup
// Depends on: api.js, state.js, utils.js, router.js, student.js
// ============================================

function togglePasswordVisibility() {
  const passInput = $('loginPassword');
  const eyeOpen = $('eyeIconOpen');
  const eyeClosed = $('eyeIconClosed');
  if (!passInput) return;

  if (passInput.type === 'password') {
    passInput.type = 'text';
    if (eyeOpen) eyeOpen.style.display = 'none';
    if (eyeClosed) eyeClosed.style.display = 'block';
  } else {
    passInput.type = 'password';
    if (eyeOpen) eyeOpen.style.display = 'block';
    if (eyeClosed) eyeClosed.style.display = 'none';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  let username = ($('loginUsername')?.value || '').trim();
  const password = ($('loginPassword')?.value || '').trim();

  // Convert Arabic numerals if typed
  username = username.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  // If user entered Arabic word for admin
  if (username === 'أدمن' || username === 'الادمن' || username === 'الأدمن') {
    username = 'admin';
  }

  showLoading();

  try {
    let result;
    if (MOCK_MODE) {
      if (username.toLowerCase() === 'admin' && password.toLowerCase() === 'admin') {
        result = { success: true, user: { name: 'مدير المنصة', username: 'admin', role: 'admin' } };
      } else if (username.toLowerCase() === 'student' && password.toLowerCase() === 'student') {
        result = { success: true, user: { name: 'طالب تجريبي', username: 'student', role: 'student' } };
      } else {
        result = { success: false, message: 'بيانات الاعتماد غير صحيحة' };
      }
    } else {
      result = await API.get('login', { username, password });
      // Client-side fallback if user typed uppercase "Admin" or password was capitalized by mobile keyboard
      if ((!result || !result.success) && (username !== username.toLowerCase() || password !== password.toLowerCase())) {
        const retryResult = await API.get('login', { username: username.toLowerCase(), password: password.toLowerCase() });
        if (retryResult && retryResult.success) {
          result = retryResult;
        }
      }
    }

    if (result && result.success) {
      if (result.user.is_frozen || String(result.user.role || '').toLowerCase().startsWith('frozen')) {
        state.user = null;
        localStorage.removeItem('iqt_user');
        showToast('انتهت صلاحية هذا الحساب. يرجى التواصل مع إدارة المنصة لتجديد الاشتراك.', 'error');
        return;
      }

      state.user = result.user;
      localStorage.setItem('iqt_user', JSON.stringify(result.user));
      setupNavigation();
      startPresenceHeartbeat(true);
      showToast(`مرحباً بعودتك، ${result.user.name || result.user.username}!`);

      const targetHash = ['student', 'guest'].includes(result.user.role) ? 'dashboard' : 'admin';
      const hasCached = typeof restoreCurriculumFromLocal === 'function' && restoreCurriculumFromLocal();

      if (hasCached) {
        navigateTo(targetHash);
        hideLoading();
        loadStudentData(true).then(() => {
          const currentHash = window.location.hash.replace('#', '') || targetHash;
          if (currentHash === 'dashboard') renderDashboard();
          else if (currentHash === 'admin') renderAdmin();
        }).catch(console.error);
        return;
      }

      if (result.user.role === 'admin') {
        await refreshAllData();
        navigateTo('admin');
      } else {
        await loadStudentData();
        navigateTo('dashboard');
      }
    } else {
      if (result && result.frozen) {
        showToast(result.message || 'انتهت صلاحية هذا الحساب. يرجى التواصل مع إدارة المنصة لتجديد الاشتراك.', 'error');
      } else if (username.toLowerCase() === 'admin') {
        showToast('بيانات الدخول غير صحيحة. تأكد من إدخال اسم المستخدم: admin وكلمة المرور: admin باللغة الإنجليزية', 'error');
      } else {
        showToast(result?.message || 'فشل تسجيل الدخول. تحقق من اسم المستخدم وكلمة المرور', 'error');
      }
    }
  } catch(err) {
    showToast('خطأ في الاتصال. تحقق من رابط API.', 'error');
    console.error(err);
  } finally {
    hideLoading();
  }
}

function setupNavigation() {
  $('navbar').classList.remove('hidden');
  
  const avatarHtml = state.user.avatar 
    ? `<img src="${state.user.avatar}" id="navAvatar" class="avatar" alt="Avatar" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">`
    : `<div class="avatar" id="navAvatar">${state.user.name.charAt(0).toUpperCase()}</div>`;

  $('navUsername').innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:flex-end;">
      <span>${state.user.name}</span>
      <div style="margin-top: 4px;">${getRoleBadgeSVG(state.user.role)}</div>
    </div>
  `;
  const existingAvatar = document.getElementById('navAvatar');
  if (existingAvatar) {
    existingAvatar.outerHTML = avatarHtml;
  }

  const links = $('navLinks');
  links.innerHTML = '';

  if (['student', 'guest'].includes(state.user.role)) {
    links.innerHTML = `
      <a class="nav-link active" onclick="navigateTo('dashboard')">الرئيسية</a>
      <a class="nav-link" onclick="navigateTo('profile')">الملف الشخصي</a>
    `;
  } else {
    // Admin, VIP, Manager
    links.innerHTML = `
      <a class="nav-link active" onclick="navigateTo('admin')">الإدارة</a>
      <a class="nav-link" onclick="navigateTo('dashboard')">استعراض المنصة</a>
      <a class="nav-link" onclick="navigateTo('profile')">الملف الشخصي</a>
    `;
  }

  if (typeof renderNavbarNotifications === 'function') {
    renderNavbarNotifications();
  }
}

// ==========================================
// PRESENCE HEARTBEAT & ACTIVITY TELEMETRY
// ==========================================
let _presenceIntervalId = null;
let _currentActivityLabel = 'متصل في الصفحة الرئيسية';
let _lastMinuteCreditedAt = 0;

function logStudentActivity(type, title, detail = '', customCurrentActivity = '') {
  if (customCurrentActivity) {
    _currentActivityLabel = customCurrentActivity;
  } else if (title) {
    _currentActivityLabel = title;
  }

  if (!state.user || !state.user.username || MOCK_MODE) return;

  API.post('recordPresenceHeartbeat', {
    username: state.user.username,
    is_online: true,
    study_minutes_delta: 0,
    current_activity: _currentActivityLabel,
    event: title ? {
      type: type || 'view',
      title: String(title),
      detail: String(detail || ''),
      timestamp: new Date().toISOString()
    } : null
  }).catch(() => {});
}

function startPresenceHeartbeat(isSessionStart = false) {
  if (_presenceIntervalId) {
    clearInterval(_presenceIntervalId);
    _presenceIntervalId = null;
  }
  if (!state.user || !state.user.username || MOCK_MODE) return;

  _lastMinuteCreditedAt = Date.now();

  // Immediate online ping when session starts or restores
  API.post('recordPresenceHeartbeat', {
    username: state.user.username,
    is_online: true,
    is_session_start: Boolean(isSessionStart),
    study_minutes_delta: isSessionStart ? 1 : 0,
    current_activity: _currentActivityLabel
  }).then(res => {
    if (res && res.success) {
      if (typeof res.total_study_minutes === 'number') {
        if (state.progress) state.progress.total_study_minutes = res.total_study_minutes;
        if (state.user) state.user.total_study_minutes = res.total_study_minutes;
      }
      if (typeof res.login_count === 'number' && state.user) {
        state.user.login_count = res.login_count;
      }
    }
  }).catch(() => {});

  // Every 25 seconds, keep online presence fresh and credit 1 study minute every ~60s of active tab visibility
  _presenceIntervalId = setInterval(() => {
    if (!state.user || !state.user.username || MOCK_MODE) return;
    const isVisible = document.visibilityState === 'visible';
    if (!isVisible) return;

    const now = Date.now();
    let deltaMinutes = 0;
    if (now - _lastMinuteCreditedAt >= 55000) {
      deltaMinutes = 1;
      _lastMinuteCreditedAt = now;
    }

    API.post('recordPresenceHeartbeat', {
      username: state.user.username,
      is_online: true,
      study_minutes_delta: deltaMinutes,
      current_activity: _currentActivityLabel
    }).then(res => {
      if (res && res.success && typeof res.total_study_minutes === 'number') {
        if (state.progress) state.progress.total_study_minutes = res.total_study_minutes;
        if (state.user) state.user.total_study_minutes = res.total_study_minutes;
      }
    }).catch(() => {});
  }, 25000);
}

function stopPresenceHeartbeat(markOffline = true) {
  if (_presenceIntervalId) {
    clearInterval(_presenceIntervalId);
    _presenceIntervalId = null;
  }
  if (markOffline && state.user && state.user.username && !MOCK_MODE) {
    API.post('recordPresenceHeartbeat', {
      username: state.user.username,
      is_online: false,
      study_minutes_delta: 0,
      current_activity: 'غير متصل'
    }).catch(() => {});
  }
}

document.addEventListener('visibilitychange', () => {
  if (!state.user || !state.user.username || MOCK_MODE) return;
  if (document.visibilityState === 'visible') {
    API.post('recordPresenceHeartbeat', {
      username: state.user.username,
      is_online: true,
      study_minutes_delta: 0,
      current_activity: _currentActivityLabel
    }).catch(() => {});
  }
});

// Listen for activity messages from embedded interactive web lessons
window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'IQT_LESSON_ACTIVITY') {
    if (e.data.activityLabel) {
      _currentActivityLabel = String(e.data.activityLabel);
    }
    if (e.data.eventTitle) {
      logStudentActivity(
        e.data.eventType || 'interactive',
        e.data.eventTitle,
        e.data.eventDetail || '',
        e.data.activityLabel || e.data.eventTitle
      );
    }
  }
});

function logout() {
  stopPresenceHeartbeat(true);
  state.user = null;
  state.notifDropdownOpen = false;
  $('navNotifDropdown')?.classList.add('hidden');
  localStorage.removeItem('iqt_user');
  localStorage.removeItem('iqt_curriculum_cache');
  if (typeof API !== 'undefined' && API.clearCache) API.clearCache();
  $('navbar').classList.add('hidden');
  navigateTo('login');
  showToast('تم تسجيل الخروج بنجاح');
}

async function checkAuth() {
  const saved = localStorage.getItem('iqt_user');
  if (saved) {
    try {
      state.user = JSON.parse(saved);
      if (state.user && (state.user.is_frozen || String(state.user.role || '').toLowerCase().startsWith('frozen'))) {
        state.user = null;
        localStorage.removeItem('iqt_user');
        $('navbar').classList.add('hidden');
        navigateTo('login');
        showToast('انتهت صلاحية هذا الحساب. يرجى التواصل مع إدارة المنصة لتجديد الاشتراك.', 'error');
        hideLoading();
        return;
      }

      setupNavigation();
      startPresenceHeartbeat(true);

      const defaultPage = ['student', 'guest'].includes(state.user.role) ? 'dashboard' : 'admin';
      const targetHash = window.location.hash.replace('#', '') || defaultPage;
      const hasCached = typeof restoreCurriculumFromLocal === 'function' && restoreCurriculumFromLocal();

      if (hasCached) {
        // Render cached curriculum instantly without waiting for network!
        navigateTo(targetHash);
        hideLoading();

        // Background non-blocking sync
        loadStudentData(true).then(() => {
          const currentHash = window.location.hash.replace('#', '') || targetHash;
          if (currentHash === 'dashboard') renderDashboard();
          else if (currentHash === 'admin') renderAdmin();
        }).catch(console.error);
        return;
      }

      // First time loading (no local cache yet)
      if (state.user.role === 'admin') {
        await refreshAllData();
      } else {
        await loadStudentData();
      }
      navigateTo(targetHash);
    } catch (e) {
      console.error('Error parsing stored user:', e);
    }
  }
  hideLoading();
}

