// ============================================
// router.js — Page navigation & hash routing
// Depends on: state.js, utils.js
// ============================================

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $(`page-${page}`).classList.add('active');
  window.location.hash = page;

  if (page === 'dashboard') renderDashboard();
  if (page === 'profile') renderProfile();
  if (page === 'admin') renderAdmin();
}

// Handle browser back/forward buttons
window.addEventListener('hashchange', () => {
  const page = window.location.hash.replace('#', '') || 'login';
  if (page !== 'login' && !state.user) {
    navigateTo('login');
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = $(`page-${page}`);
  if (el) el.classList.add('active');

  if (page === 'dashboard') renderDashboard();
  if (page === 'profile') renderProfile();
  if (page === 'admin') renderAdmin();
});
