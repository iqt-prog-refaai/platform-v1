// ============================================
// utils.js — DOM helpers, toasts, particles,
//             confetti, formatting
// Depends on: config.js (ICONS)
// ============================================

/** Shorthand for getElementById */
function $(id) { return document.getElementById(id); }

function translateRole(role) {
  if (role === 'admin') return 'مدير النظام';
  if (role === 'manager') return 'المدير';
  if (role === 'vip') return 'الأب الروحي';
  if (role === 'guest') return 'ضيف';
  if (role === 'student') return 'طالب';
  return role;
}

function getRoleBadgeSVG(role) {
  const badgeMap = {
    'admin': { color: 'linear-gradient(135deg, #ef4444, #991b1b)', label: 'مدير النظام', icon: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>' },
    'vip': { color: 'linear-gradient(135deg, #f59e0b, #b45309)', label: 'الأب الروحي', icon: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>' },
    'manager': { color: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', label: 'المدير', icon: '<circle cx="12" cy="8" r="5"/><path d="M3 21v-2a7 7 0 0 1 14 0v2"/>' },
    'guest': { color: 'linear-gradient(135deg, #8b5cf6, #5b21b6)', label: 'ضيف', icon: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' },
    'student': { color: 'linear-gradient(135deg, #10b981, #047857)', label: 'طالب', icon: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>' }
  };
  
  const b = badgeMap[role] || badgeMap['student'];
  return `
    <div style="display:inline-flex; align-items:center; gap:6px; background:${b.color}; color:white; padding:4px 10px; border-radius:99px; font-size:0.8rem; font-weight:700; box-shadow:0 2px 8px rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1);">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${b.icon}</svg>
      <span>${b.label}</span>
    </div>
  `;
}

function showToast(message, type = 'success') {
  const container = $('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? ICONS.check : ICONS.alert}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function hideLoading() {
  $('loadingScreen').style.display = 'none';
}

function showLoading() {
  $('loadingScreen').style.display = 'flex';
}

function formatDate(dateStr) {
  if (!dateStr) return 'غير متاح';
  return new Date(dateStr).toLocaleDateString('ar-SA', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

function generateParticles() {
  const container = $('particles');
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.right = Math.random() * 100 + '%';
    p.style.animationDuration = (10 + Math.random() * 20) + 's';
    p.style.animationDelay = Math.random() * 15 + 's';
    p.style.width = p.style.height = (2 + Math.random() * 4) + 'px';
    container.appendChild(p);
  }
}

function createConfetti() {
  const colors = ['#6366f1', '#ec4899', '#8b5cf6', '#10b981', '#f59e0b'];
  for (let i = 0; i < 50; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.right = Math.random() * 100 + 'vw';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDuration = (2 + Math.random() * 2) + 's';
    c.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4000);
  }
}

/**
 * Extracts the Google Drive file ID from various URL formats:
 *   /file/d/FILE_ID/view
 *   /file/d/FILE_ID/preview
 *   /d/FILE_ID/
 *   id=FILE_ID  (query param)
 */
function extractDriveFileId(url) {
  if (!url) return null;
  // Match /d/FILE_ID/ or /file/d/FILE_ID/
  let m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  // Match id=FILE_ID query param
  m = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  return null;
}

/**
 * Returns a reliable Google Drive embed (preview) URL from any Drive URL/ID.
 */
function getDrivePreviewUrl(urlOrId) {
  const id = extractDriveFileId(urlOrId) || urlOrId;
  return `https://drive.google.com/file/d/${id}/preview`;
}

/**
 * Returns a Google Drive direct download URL from any Drive URL/ID.
 */
function getDriveDownloadUrl(urlOrId) {
  const id = extractDriveFileId(urlOrId) || urlOrId;
  return `https://drive.google.com/uc?export=download&id=${id}`;
}

function copySyntaxGuide() {
  const code = document.getElementById('jsonSyntaxGuide')?.innerText;
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    showToast('تم نسخ دليل الصيغة إلى الحافظة', 'success');
  }).catch(err => {
    showToast('فشل في نسخ النص', 'error');
  });
}

