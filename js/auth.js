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
      state.user = result.user;
      localStorage.setItem('iqt_user', JSON.stringify(result.user));
      setupNavigation();
      showToast(`مرحباً بعودتك، ${result.user.name || result.user.username}!`);

      if (result.user.role === 'admin') {
        await refreshAllData();   // populate units/lessons/materials for admin panel
        navigateTo('admin');
      } else {
        await loadStudentData();
        navigateTo('dashboard');
      }
    } else {
      if (username.toLowerCase() === 'admin') {
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
}

function logout() {
  state.user = null;
  localStorage.removeItem('iqt_user');
  $('navbar').classList.add('hidden');
  navigateTo('login');
  showToast('تم تسجيل الخروج بنجاح');
}

async function checkAuth() {
  const saved = localStorage.getItem('iqt_user');
  if (saved) {
    state.user = JSON.parse(saved);
    setupNavigation();
    if (state.user.role === 'admin') {
      await refreshAllData();
    } else {
      await loadStudentData();
    }
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    navigateTo(hash);
  }
  hideLoading();
}
