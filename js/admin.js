// ============================================
// admin.js — Admin panel: overview, content,
//             quizzes, students, grading
// Depends on: api.js, state.js, utils.js
// ============================================

// ==========================================
// SECTION ROUTING
// ==========================================
function showAdminSection(section) {
  state.adminSection = section;
  document.querySelectorAll('.admin-nav-item').forEach(el => {
    const onclickAttr = el.getAttribute('onclick') || '';
    if (onclickAttr.includes(`'${section}'`)) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
  renderAdmin();
}

async function renderAdmin() {
  const container = $('adminContent');
  
  // Hide specific admin sidebar items for VIP and Manager
  if (state.user && state.user.role !== 'admin') {
    if ($('adminNav-overview')) $('adminNav-overview').style.display = 'none';
    if ($('adminNav-content')) $('adminNav-content').style.display = 'none';
    if ($('adminNav-quizzes')) $('adminNav-quizzes').style.display = 'none';
    if ($('adminNav-grading')) $('adminNav-grading').style.display = 'none';
    
    // Force to 'students' if they are on a hidden section
    if (state.adminSection !== 'students' && state.adminSection !== 'users') {
      state.adminSection = 'students';
      document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
      if ($('adminNav-students')) $('adminNav-students').classList.add('active');
    }
  }

  switch(state.adminSection) {
    case 'overview':  await renderAdminOverview(container);    break;
    case 'content':   await renderAdminContent(container);     break;
    case 'quizzes':   await renderAdminQuizzes(container);     break;
    case 'users':     
    case 'students':  // Fallback map in case section name gets mixed up
      await renderAdminUsers(container);       break;
    case 'grading':   await renderAdminGrading(container);     break;
  }
}

/**
 * Call this after ANY create / edit / delete operation in the admin panel.
 * Shows a brief spinner, fetches fresh data from the server, then re-renders
 * the current admin section so the UI always reflects the real database.
 */
async function refreshAndRenderAdmin() {
  const container = $('adminContent');
  if (container) {
    container.innerHTML = '<div class="loading-text" style="text-align:center;padding:60px;">🔄 جاري تحديث البيانات...</div>';
  }
  await refreshAllData();
  await renderAdmin();
}

/**
 * Toggles visibility (is_hidden) for units, lessons, materials, or quizzes.
 */
async function toggleItemVisibility(itemType, id, currentHidden) {
  const newHidden = !currentHidden;
  const actionText = newHidden ? 'إخفاء' : 'إظهار';
  showLoading();
  try {
    const res = await API.post('editItem', {
      itemType,
      id,
      updates: { is_hidden: newHidden }
    });
    if (res && res.success) {
      showToast(`تم ${actionText} العنصر للطلاب بنجاح!`);
      // Update in-memory state immediately
      if (itemType === 'unit') {
        const u = state.units.find(x => String(x.unit_id) === String(id));
        if (u) u.is_hidden = newHidden;
      } else if (itemType === 'lesson') {
        for (const list of Object.values(state.lessons)) {
          const l = list.find(x => String(x.lesson_id) === String(id));
          if (l) l.is_hidden = newHidden;
        }
      } else if (itemType === 'material') {
        const m = state.allMaterials.find(x => String(x.material_id) === String(id));
        if (m) m.is_hidden = newHidden;
        for (const list of Object.values(state.materials)) {
          const m2 = list.find(x => String(x.material_id) === String(id));
          if (m2) m2.is_hidden = newHidden;
        }
      }
      await refreshAndRenderAdmin();
    } else {
      showToast('فشل تحديث حالة الرؤية: ' + (res?.message || ''), 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('حدث خطأ أثناء تعديل حالة الرؤية', 'error');
  } finally {
    hideLoading();
  }
}

// ==========================================
// OVERVIEW, ANALYTICS, ANNOUNCEMENTS & EXPORT
// ==========================================
async function renderAdminOverview(container) {
  const totalUnits = state.units.length;
  const totalLessons = Object.values(state.lessons).flat().length;
  const totalMaterials = Object.values(state.materials).flat().length;

  container.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;">جاري تحميل إحصائيات المنصة...</div>';

  let users = [];
  let allProgress = [];
  let allAttempts = [];
  let announcement = state.announcement || null;

  if (!MOCK_MODE) {
    try {
      const res = await API.get('getAdminAnalytics', {}, { forceFresh: true });
      if (res && res.success) {
        users = res.users || [];
        allProgress = res.allProgress || [];
        allAttempts = res.allAttempts || [];
        if (res.announcement !== undefined) {
          announcement = res.announcement;
          state.announcement = announcement;
        }
      }
    } catch (e) {
      console.error('Error loading admin analytics:', e);
    }
  }

  // Filter active students
  const activeStudents = users.filter(u => {
    const r = String(u.role || '').toLowerCase();
    const uname = String(u.username || '');
    if (r === 'deleted' || uname.startsWith('__deleted_')) return false;
    const isFrozen = !!u.is_frozen || u.status === 'frozen' || r.startsWith('frozen');
    const effRole = isFrozen ? (u.originalRole || r.replace(/^frozen:?/i, '') || 'student') : r;
    return effRole === 'student' && !isFrozen;
  });

  // Cache students for details lookup
  state.students = activeStudents;

  const pendingGradingCount = allAttempts.filter(a => !a.is_graded).length;
  const gradedAttempts = allAttempts.filter(a => a.is_graded && Number(a.max_score) > 0);
  const avgPlatformScore = gradedAttempts.length
    ? Math.round(gradedAttempts.reduce((acc, a) => acc + (Number(a.score) / Number(a.max_score)) * 100, 0) / gradedAttempts.length)
    : null;

  // Map progress & attempts by lowercase username for leaderboard
  const progByUser = {};
  allProgress.forEach(p => {
    if (p && p.username) progByUser[String(p.username).trim().toLowerCase()] = p;
  });

  const attemptsByUser = {};
  allAttempts.forEach(a => {
    if (!a || !a.username) return;
    const k = String(a.username).trim().toLowerCase();
    if (!attemptsByUser[k]) attemptsByUser[k] = [];
    attemptsByUser[k].push(a);
  });

  // Build student rankings
  const leaderboard = activeStudents.map(st => {
    const uKey = String(st.username || '').trim().toLowerCase();
    const prog = progByUser[uKey] || {};
    const stAttempts = attemptsByUser[uKey] || [];
    const stGraded = stAttempts.filter(a => a.is_graded && Number(a.max_score) > 0);
    const stAvg = stGraded.length
      ? Math.round(stGraded.reduce((acc, a) => acc + (Number(a.score) / Number(a.max_score)) * 100, 0) / stGraded.length)
      : null;

    const compLessons = Array.isArray(prog.completed_lessons) ? prog.completed_lessons.length : 0;
    const compMaterials = Array.isArray(prog.completed_materials) ? prog.completed_materials.length : 0;
    // Composite activity score for ranking
    const activityScore = (compLessons * 15) + (compMaterials * 5) + (stAttempts.length * 10) + (stAvg || 0);

    return {
      username: st.username,
      name: st.full_name || st.name || st.username,
      compLessons,
      compMaterials,
      attemptsCount: stAttempts.length,
      avgScore: stAvg,
      activityScore
    };
  }).filter(s => s.compLessons > 0 || s.compMaterials > 0 || s.attemptsCount > 0)
    .sort((a, b) => b.activityScore - a.activityScore)
    .slice(0, 8);

  const annTitle = announcement?.title || '';
  const annMessage = announcement?.message || '';
  const annType = announcement?.type || 'info';
  const annActive = Boolean(announcement?.is_active);
  const annLinkUrl = announcement?.link_url || '';
  const annLinkText = announcement?.link_text || '';

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 24px;">
      <h2 style="margin: 0; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">نظرة عامة وإحصائيات المنصة</h2>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button type="button" class="btn btn-secondary" onclick="exportFullCurriculumJSON()" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 700;">
          ${ICONS.download} تصدير كل المحتوى (JSON)
        </button>
        <button type="button" class="btn btn-secondary" onclick="exportStudentsReportCSV()" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 700;">
          ${ICONS.download} تصدير تقرير الطلاب (CSV / Excel)
        </button>
      </div>
    </div>

    <!-- Primary Stats Grid -->
    <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div class="glass stat-card blue" style="padding: 20px;">
        <div class="stat-label">الطلاب النشطين</div>
        <div class="stat-value" style="font-variant-numeric: tabular-nums;">${activeStudents.length}</div>
        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">حساب طالب فعال</div>
      </div>
      <div class="glass stat-card green" style="padding: 20px;">
        <div class="stat-label">الوحدات والدروس</div>
        <div class="stat-value" style="font-variant-numeric: tabular-nums;">${totalLessons}<span style="font-size: 1rem; color: var(--text-muted); font-weight: 500;"> درس</span></div>
        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; font-variant-numeric: tabular-nums;">ضمن ${totalUnits} وحدات و ${totalMaterials} محتوى</div>
      </div>
      <div class="glass stat-card pink" style="padding: 20px;">
        <div class="stat-label">محاولات الاختبارات</div>
        <div class="stat-value" style="font-variant-numeric: tabular-nums;">${allAttempts.length}</div>
        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; font-variant-numeric: tabular-nums;">
          متوسط الدرجات: ${avgPlatformScore !== null ? `${avgPlatformScore}%` : '—'}
        </div>
      </div>
      <div class="glass stat-card" style="padding: 20px; border: 1px solid ${pendingGradingCount > 0 ? 'rgba(245, 158, 11, 0.45)' : 'var(--border)'}; background: ${pendingGradingCount > 0 ? 'rgba(245, 158, 11, 0.05)' : 'var(--bg-glass)'};">
        <div class="stat-label" style="color: ${pendingGradingCount > 0 ? '#d97706' : 'var(--text-muted)'};">مقالي بانتظار التصحيح</div>
        <div class="stat-value" style="color: ${pendingGradingCount > 0 ? '#f59e0b' : 'var(--success)'}; font-variant-numeric: tabular-nums;">${pendingGradingCount}</div>
        <div style="margin-top: 6px;">
          ${pendingGradingCount > 0
            ? `<button type="button" class="btn btn-primary" style="padding: 4px 12px; font-size: 0.78rem; background: #f59e0b; border-color: #f59e0b;" onclick="showAdminSection('grading')">الانتقال للتصحيح</button>`
            : `<span style="font-size: 0.78rem; color: var(--success);">تم تصحيح كافة المحاولات</span>`
          }
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="glass" style="padding: 24px; margin-bottom: 24px;">
      <h3 style="margin-bottom: 14px; font-size: 1.05rem;">إجراءات سريعة</h3>
      <div class="flex gap-4" style="flex-wrap: wrap;">
        <button class="btn btn-primary" onclick="showModal('addUnit')">${ICONS.plus} إضافة وحدة</button>
        <button class="btn btn-primary" onclick="showModal('addLesson')">${ICONS.plus} إضافة درس</button>
        <button class="btn btn-primary" onclick="showModal('addMaterial')">${ICONS.plus} إضافة محتوى</button>
        <button class="btn btn-secondary" onclick="showAdminSection('users')">إدارة الطلاب والمستخدمين</button>
      </div>
    </div>

    <!-- Two-Column Layout: Announcement Manager & Top Students Leaderboard -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; align-items: start;">
      
      <!-- Announcement Manager -->
      <div class="glass" style="padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0; font-size: 1.1rem;">نشر إعلان أو تنبيه للطلاب</h3>
          <span style="font-size: 0.8rem; font-weight: 700; color: ${annActive ? 'var(--success)' : 'var(--text-muted)'};">
            ${annActive ? 'مفعّل حالياً للطلاب' : 'غير مفعّل'}
          </span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.5;">
          يظهر هذا الإعلان في شريط بارز أعلى الصفحة الرئيسية لجميع الطلاب فور دخولهم للمنصة.
        </p>

        <div class="input-group" style="margin-bottom: 12px;">
          <label>عنوان الإعلان</label>
          <input type="text" id="annTitleInput" value="${annTitle.replace(/"/g, '&quot;')}" placeholder="مثال: موعد الاختبار الشامل للوحدة الأولى">
        </div>

        <div class="input-group" style="margin-bottom: 12px;">
          <label>تفاصيل الإعلان أو التنبيه</label>
          <textarea id="annMessageInput" rows="3" placeholder="اكتب تفاصيل التنبيه هنا...">${annMessage}</textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div class="input-group" style="margin: 0;">
            <label>نوع التنبيه</label>
            <select id="annTypeSelect">
              <option value="info" ${annType === 'info' ? 'selected' : ''}>تنبيه عام (أزرق)</option>
              <option value="warning" ${annType === 'warning' ? 'selected' : ''}>تنبيه هام (برتقالي)</option>
              <option value="success" ${annType === 'success' ? 'selected' : ''}>تحديث جديد (أخضر)</option>
              <option value="urgent" ${annType === 'urgent' ? 'selected' : ''}>إعلان عاجل (أحمر)</option>
            </select>
          </div>
          <div class="input-group" style="margin: 0;">
            <label>نص الزر الإضافي (اختياري)</label>
            <input type="text" id="annLinkTextInput" value="${annLinkText.replace(/"/g, '&quot;')}" placeholder="مثال: فتح جدول المراجعة">
          </div>
        </div>

        <div class="input-group" style="margin-bottom: 14px;">
          <label>رابط خارجي مرفق بالإعلان (اختياري)</label>
          <input type="text" id="annLinkUrlInput" value="${annLinkUrl.replace(/"/g, '&quot;')}" placeholder="https://..." style="direction: ltr;">
        </div>

        <div style="margin-bottom: 18px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; font-size: 0.92rem;">
            <input type="checkbox" id="annIsActiveCheckbox" ${annActive ? 'checked' : ''} style="width: 18px; height: 18px;">
            <span>تفعيل وإظهار الإعلان في لوحة تحكم الطلاب</span>
          </label>
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button type="button" class="btn btn-primary" onclick="saveAdminAnnouncement()">
            ${ICONS.check} حفظ وتحديث الإعلان
          </button>
          ${annActive ? `
            <button type="button" class="btn btn-secondary" style="color: var(--danger);" onclick="deactivateAdminAnnouncement()">
              إيقاف عرض الإعلان
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Top Students Leaderboard -->
      <div class="glass" style="padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0; font-size: 1.1rem;">أفضل الطلاب التزاماً وأداءً</h3>
          <button type="button" class="btn btn-secondary" style="padding: 5px 12px; font-size: 0.8rem;" onclick="showAdminSection('users')">عرض الكل</button>
        </div>

        ${leaderboard.length === 0 ? `
          <div class="text-center" style="padding: 40px 20px; color: var(--text-muted);">
            لا توجد بيانات نشاط كافية للطلاب حتى الآن.
          </div>
        ` : `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem;">
              <thead>
                <tr style="border-bottom: 1px solid var(--border); color: var(--text-muted); text-align: right;">
                  <th style="padding: 10px 6px;">#</th>
                  <th style="padding: 10px 6px;">الطالب</th>
                  <th style="padding: 10px 6px; text-align: center;">الدروس</th>
                  <th style="padding: 10px 6px; text-align: center;">الاختبارات</th>
                  <th style="padding: 10px 6px; text-align: center;">المتوسط</th>
                  <th style="padding: 10px 6px;"></th>
                </tr>
              </thead>
              <tbody>
                ${leaderboard.map((st, idx) => `
                  <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
                    <td style="padding: 10px 6px; font-weight: 800; color: ${idx < 3 ? 'var(--primary)' : 'var(--text-muted)'}; font-variant-numeric: tabular-nums;">
                      ${idx + 1}
                    </td>
                    <td style="padding: 10px 6px;">
                      <div style="font-weight: 700;">${st.name}</div>
                      <div style="font-size: 0.76rem; color: var(--text-muted); direction: ltr; text-align: right;">@${st.username}</div>
                    </td>
                    <td style="padding: 10px 6px; text-align: center; font-weight: 700; color: var(--primary); font-variant-numeric: tabular-nums;">
                      ${st.compLessons}/${totalLessons}
                    </td>
                    <td style="padding: 10px 6px; text-align: center; font-variant-numeric: tabular-nums;">
                      ${st.attemptsCount}
                    </td>
                    <td style="padding: 10px 6px; text-align: center; font-weight: 700; color: ${st.avgScore !== null ? (st.avgScore >= 70 ? 'var(--success)' : st.avgScore >= 50 ? 'var(--warning)' : 'var(--danger)') : 'var(--text-muted)'}; font-variant-numeric: tabular-nums;">
                      ${st.avgScore !== null ? `${st.avgScore}%` : '—'}
                    </td>
                    <td style="padding: 10px 6px; text-align: left;">
                      <button type="button" class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.78rem;" onclick="viewStudentDetails('${st.username}')">
                        السجل
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

    </div>
  `;
}

async function saveAdminAnnouncement() {
  const title = $('annTitleInput')?.value?.trim() || '';
  const message = $('annMessageInput')?.value?.trim() || '';
  const type = $('annTypeSelect')?.value || 'info';
  const link_url = $('annLinkUrlInput')?.value?.trim() || '';
  const link_text = $('annLinkTextInput')?.value?.trim() || '';
  const is_active = $('annIsActiveCheckbox')?.checked || false;

  if (is_active && !title && !message) {
    showToast('يرجى كتابة عنوان أو نص الإعلان قبل تفعيله', 'error');
    return;
  }

  showLoading();
  try {
    const payload = { title, message, type, link_url, link_text, is_active };
    const res = await API.post('saveAnnouncement', payload);
    if (res && res.success) {
      state.announcement = res.announcement || payload;
      saveCurriculumToLocal();
      showToast(is_active ? 'تم حفظ وتفعيل الإعلان لجميع الطلاب بنجاح!' : 'تم حفظ إعدادات الإعلان بنجاح');
      await renderAdminOverview($('adminContent'));
    } else {
      showToast('فشل في حفظ الإعلان', 'error');
    }
  } catch (e) {
    console.error(e);
    showToast('حدث خطأ أثناء حفظ الإعلان', 'error');
  } finally {
    hideLoading();
  }
}

async function deactivateAdminAnnouncement() {
  if ($('annIsActiveCheckbox')) $('annIsActiveCheckbox').checked = false;
  await saveAdminAnnouncement();
}

async function exportStudentsReportCSV() {
  showLoading();
  try {
    const res = await API.get('getAdminAnalytics', {}, { forceFresh: true });
    if (!res || !res.success) {
      showToast('تعذر تحميل بيانات التقرير', 'error');
      return;
    }

    const users = res.users || [];
    const allProgress = res.allProgress || [];
    const allAttempts = res.allAttempts || [];
    const totalLessons = Object.values(state.lessons || {}).flat().length;

    const progByUser = {};
    allProgress.forEach(p => {
      if (p && p.username) progByUser[String(p.username).trim().toLowerCase()] = p;
    });

    const attemptsByUser = {};
    allAttempts.forEach(a => {
      if (!a || !a.username) return;
      const k = String(a.username).trim().toLowerCase();
      if (!attemptsByUser[k]) attemptsByUser[k] = [];
      attemptsByUser[k].push(a);
    });

    const studentsList = users.filter(u => {
      const r = String(u.role || '').toLowerCase();
      const uname = String(u.username || '');
      if (r === 'deleted' || uname.startsWith('__deleted_')) return false;
      const isFrozen = !!u.is_frozen || u.status === 'frozen' || r.startsWith('frozen');
      const effRole = isFrozen ? (u.originalRole || r.replace(/^frozen:?/i, '') || 'student') : r;
      return effRole === 'student';
    });

    if (!studentsList.length) {
      showToast('لا يوجد طلاب مسجلون لتصدير بياناتهم', 'warning');
      return;
    }

    function escapeCsv(val) {
      const s = String(val ?? '').replace(/"/g, '""');
      return `"${s}"`;
    }

    const headers = [
      'الاسم الظاهر',
      'الاسم بالكامل',
      'اسم المستخدم',
      'حالة الحساب',
      'الدروس المكتملة',
      'إجمالي الدروس',
      'نسبة إنجاز الدروس',
      'المحتويات المنجزة',
      'إجمالي محاولات الاختبارات',
      'متوسط درجات الاختبارات',
      'أعلى درجة اختبار',
      'آخر نشاط مسجل'
    ];

    const rows = [headers.map(escapeCsv).join(',')];

    studentsList.forEach(st => {
      const uKey = String(st.username || '').trim().toLowerCase();
      const isFrozen = !!st.is_frozen || st.status === 'frozen' || String(st.role || '').toLowerCase().startsWith('frozen');
      const prog = progByUser[uKey] || {};
      const stAttempts = attemptsByUser[uKey] || [];
      const compLessons = Array.isArray(prog.completed_lessons) ? prog.completed_lessons.length : 0;
      const compMaterials = Array.isArray(prog.completed_materials) ? prog.completed_materials.length : 0;
      const lessonPct = totalLessons > 0 ? Math.min(100, Math.round((compLessons / totalLessons) * 100)) + '%' : '0%';

      const graded = stAttempts.filter(a => a.is_graded && Number(a.max_score) > 0);
      const avgScore = graded.length
        ? Math.round(graded.reduce((acc, a) => acc + (Number(a.score) / Number(a.max_score)) * 100, 0) / graded.length) + '%'
        : 'لا يوجد';

      const bestScore = graded.length
        ? Math.max(...graded.map(a => Math.round((Number(a.score) / Number(a.max_score)) * 100))) + '%'
        : 'لا يوجد';

      const lastActive = prog.updated_at || stAttempts[0]?.attempt_date || st.created_at || '';
      const formattedLastActive = lastActive ? formatDate(lastActive) : 'غير مسجل';

      rows.push([
        st.name || '',
        st.full_name || st.name || '',
        st.username || '',
        isFrozen ? 'مجمد' : 'نشط',
        compLessons,
        totalLessons,
        lessonPct,
        compMaterials,
        stAttempts.length,
        avgScore,
        bestScore,
        formattedLastActive
      ].map(escapeCsv).join(','));
    });

    // Prepend UTF-8 BOM so Microsoft Excel opens Arabic characters properly
    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `تقرير_طلاب_IQT_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast('تم تصدير وتحميل تقرير الطلاب بصيغة CSV بنجاح!');
  } catch (e) {
    console.error('Error exporting CSV:', e);
    showToast('حدث خطأ أثناء تصدير التقرير', 'error');
  } finally {
    hideLoading();
  }
}

// ==========================================
// FULL CURRICULUM EXPORT, IMPORT & CLEAR ALL
// ==========================================
async function _fetchFullCurriculumSnapshot() {
  if (MOCK_MODE) {
    return {
      units: state.units || [],
      lessons: Object.values(state.lessons || {}).flat(),
      materials: state.allMaterials || [],
      quizzes: Object.values(state.quizzes || {}),
      questions: []
    };
  }
  const res = await API.get('exportAllCurriculum', {}, { forceFresh: true });
  if (!res || !res.success) {
    throw new Error(res?.message || 'تعذر جلب بيانات محتوى المنصة');
  }
  return {
    units: res.units || [],
    lessons: res.lessons || [],
    materials: res.materials || [],
    quizzes: res.quizzes || [],
    questions: res.questions || []
  };
}

function _buildStructuredCurriculumTree(data) {
  const { units, lessons, materials, quizzes, questions } = data;

  const quizByMatId = {};
  quizzes.forEach(q => {
    quizByMatId[String(q.material_id || '')] = q;
  });

  const questionsByQuizId = {};
  questions.forEach(qn => {
    const qid = String(qn.quiz_id || '');
    if (!questionsByQuizId[qid]) questionsByQuizId[qid] = [];
    questionsByQuizId[qid].push(qn);
  });

  function enrichMaterial(mat) {
    const item = {
      material_id: mat.material_id,
      lesson_id: mat.lesson_id,
      title: mat.title,
      type: mat.type,
      content: mat.content || '',
      order_index: mat.order_index || 0,
      is_hidden: Boolean(mat.is_hidden)
    };
    if (mat.type === 'quiz') {
      let quizSettings = {};
      try { quizSettings = JSON.parse(mat.content || '{}'); } catch {}
      const quizObj = quizByMatId[String(mat.material_id)] || null;
      const qList = quizObj ? (questionsByQuizId[String(quizObj.quiz_id)] || []) : [];
      item.quiz_details = {
        quiz_id: quizObj?.quiz_id || '',
        title: quizObj?.title || mat.title,
        description: quizObj?.description || '',
        settings: quizSettings,
        questions_count: qList.length,
        questions: qList.map(qn => ({
          question_id: qn.question_id,
          type: qn.type,
          question_text: qn.question_text,
          options: qn.options,
          correct_answer: qn.correct_answer,
          points: qn.points,
          order_index: qn.order_index,
          explanation: qn.explanation || ''
        }))
      };
    }
    return item;
  }

  const matsByLessonId = {};
  materials.forEach(m => {
    const lid = String(m.lesson_id != null ? m.lesson_id : '');
    if (!matsByLessonId[lid]) matsByLessonId[lid] = [];
    matsByLessonId[lid].push(enrichMaterial(m));
  });

  const lessonsByUnitId = {};
  lessons.forEach(l => {
    const uid = String(l.unit_id != null ? l.unit_id : '');
    if (!lessonsByUnitId[uid]) lessonsByUnitId[uid] = [];
    lessonsByUnitId[uid].push({
      lesson_id: l.lesson_id,
      unit_id: uid,
      lesson_number: l.lesson_number,
      lesson_name: l.lesson_name,
      is_hidden: Boolean(l.is_hidden),
      materials: matsByLessonId[String(l.lesson_id)] || []
    });
  });

  const structuredUnits = units.map(u => ({
    unit_id: u.unit_id,
    unit_number: u.unit_number,
    unit_name: u.unit_name,
    is_hidden: Boolean(u.is_hidden),
    unit_direct_materials: matsByLessonId[`unit_${u.unit_id}`] || [],
    lessons: lessonsByUnitId[String(u.unit_id)] || []
  }));

  return {
    units: structuredUnits,
    standalone_lessons: lessonsByUnitId[''] || [],
    standalone_materials: matsByLessonId[''] || []
  };
}

async function exportFullCurriculumJSON() {
  showLoading();
  try {
    const data = await _fetchFullCurriculumSnapshot();
    const tree = _buildStructuredCurriculumTree(data);

    const exportPayload = {
      platform: 'IQT Educational Platform',
      exported_at: new Date().toISOString(),
      summary: {
        total_units: data.units.length,
        total_lessons: data.lessons.length,
        total_materials: data.materials.length,
        total_quizzes: data.quizzes.length,
        total_questions: data.questions.length
      },
      curriculum_tree: tree,
      raw_data: data
    };

    const jsonString = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `نسخة_محتوى_منصة_IQT_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast(`تم تصدير كامل محتوى المنصة (${data.units.length} وحدة، ${data.lessons.length} درس، ${data.materials.length} محتوى، ${data.questions.length} سؤال) بنجاح!`);
  } catch (e) {
    console.error('Error exporting curriculum JSON:', e);
    showToast('حدث خطأ أثناء تصدير محتوى المنصة', 'error');
  } finally {
    hideLoading();
  }
}

async function exportFullCurriculumCSV() {
  showLoading();
  try {
    const data = await _fetchFullCurriculumSnapshot();
    const { units, lessons, materials, quizzes, questions } = data;

    if (!units.length && !lessons.length && !materials.length) {
      showToast('لا يوجد محتوى مسجل حالياً لتصديره', 'warning');
      return;
    }

    const unitMap = {};
    units.forEach(u => { unitMap[String(u.unit_id)] = u; });

    const lessonMap = {};
    lessons.forEach(l => { lessonMap[String(l.lesson_id)] = l; });

    const quizByMatId = {};
    quizzes.forEach(q => { quizByMatId[String(q.material_id)] = q; });

    const questionsByQuizId = {};
    questions.forEach(qn => {
      const qid = String(qn.quiz_id || '');
      if (!questionsByQuizId[qid]) questionsByQuizId[qid] = [];
      questionsByQuizId[qid].push(qn);
    });

    function escapeCsv(val) {
      const s = String(val ?? '').replace(/"/g, '""');
      return `"${s}"`;
    }

    function typeLabelAr(type) {
      if (type === 'pdf') return 'ملف PDF';
      if (type === 'video') return 'فيديو';
      if (type === 'link' || type === 'external') return 'شرائح عرض / رابط خارجي';
      if (type === 'article') return 'مقالة / قراءة';
      if (type === 'quiz') return 'اختبار (كويز)';
      return type || 'محتوى';
    }

    const headers = [
      'رقم الوحدة',
      'اسم الوحدة',
      'رقم الدرس',
      'اسم الدرس',
      'عنوان المحتوى',
      'نوع المحتوى',
      'الرابط / المحتوى / الإعدادات',
      'حالة الظهور',
      'عدد أسئلة الكويز',
      'أسئلة الكويز أو السورس كود (JSON)'
    ];

    const rows = [headers.map(escapeCsv).join(',')];

    materials.forEach(mat => {
      const lid = String(mat.lesson_id || '');
      let unitNumber = '—';
      let unitName = 'محتوى مستقل';
      let lessonNumber = '—';
      let lessonName = '—';

      if (lid.startsWith('unit_')) {
        const uid = lid.replace(/^unit_/, '');
        const u = unitMap[uid];
        unitNumber = u ? u.unit_number : '—';
        unitName = u ? u.unit_name : 'وحدة';
        lessonName = 'محتوى مباشر بالوحدة';
      } else if (lid && lessonMap[lid]) {
        const l = lessonMap[lid];
        lessonNumber = l.lesson_number ?? '—';
        lessonName = l.lesson_name || '';
        if (l.unit_id && unitMap[String(l.unit_id)]) {
          unitNumber = unitMap[String(l.unit_id)].unit_number ?? '—';
          unitName = unitMap[String(l.unit_id)].unit_name || '';
        } else {
          unitName = 'درس مستقل خارج الوحدات';
        }
      }

      const quizObj = mat.type === 'quiz' ? quizByMatId[String(mat.material_id)] : null;
      const qList = quizObj ? (questionsByQuizId[String(quizObj.quiz_id)] || []) : [];
      const cleanQuestionsJson = qList.length ? JSON.stringify(qList.map(qn => ({
        type: qn.type,
        question_text: qn.question_text,
        options: qn.options,
        correct_answer: qn.correct_answer,
        points: qn.points,
        explanation: qn.explanation || ''
      }))) : '';

      rows.push([
        unitNumber,
        unitName,
        lessonNumber,
        lessonName,
        mat.title || '',
        typeLabelAr(mat.type),
        mat.content || '',
        mat.is_hidden ? 'مخفي عن الطلاب' : 'ظاهر للطلاب',
        mat.type === 'quiz' ? qList.length : '—',
        cleanQuestionsJson
      ].map(escapeCsv).join(','));
    });

    // Also include empty lessons or units that have no materials yet so nothing is missed
    const coveredLessonIds = new Set(materials.map(m => String(m.lesson_id || '')));
    lessons.forEach(l => {
      if (!coveredLessonIds.has(String(l.lesson_id))) {
        const u = l.unit_id ? unitMap[String(l.unit_id)] : null;
        rows.push([
          u ? u.unit_number : '—',
          u ? u.unit_name : 'درس مستقل',
          l.lesson_number ?? '—',
          l.lesson_name || '',
          '(درس بدون محتويات مرفقة)',
          'درس فارغ',
          '',
          l.is_hidden ? 'مخفي عن الطلاب' : 'ظاهر للطلاب',
          '—',
          ''
        ].map(escapeCsv).join(','));
      }
    });

    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `جدول_محتوى_منصة_IQT_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast('تم تصدير جدول المحتوى والروابط والكويزات بصيغة CSV / Excel بنجاح!');
  } catch (e) {
    console.error('Error exporting curriculum CSV:', e);
    showToast('حدث خطأ أثناء تصدير جدول المحتوى', 'error');
  } finally {
    hideLoading();
  }
}

function openClearAllContentModal() {
  const existing = document.getElementById('clearAllContentModal');
  if (existing) existing.remove();

  const totalUnits = state.units?.length || 0;
  const totalLessons = Object.values(state.lessons || {}).flat().length;
  const totalMaterials = state.allMaterials?.length || 0;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'clearAllContentModal';
  modal.innerHTML = `
    <div class="glass modal-content" style="max-width: 540px;">
      <div class="flex justify-between items-center" style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
        <h3 style="margin: 0; color: var(--danger); display: flex; align-items: center; gap: 8px;">
          ${ICONS.trash} مسح كل محتوى المنصة بالكامل
        </h3>
        <button type="button" class="btn btn-secondary" style="padding: 6px 10px;" onclick="document.getElementById('clearAllContentModal')?.remove()">
          ${ICONS.close}
        </button>
      </div>

      <div style="background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.28); border-radius: 12px; padding: 16px; margin-bottom: 18px; line-height: 1.65; font-size: 0.92rem;">
        <strong>تنبيه هام قبل المسح:</strong>
        <p style="margin: 6px 0 0 0; color: var(--text-secondary);">
          سيقوم هذا الإجراء بحذف جميع الوحدات (<strong>${totalUnits}</strong>)، والدروس (<strong>${totalLessons}</strong>)، والمحتويات والملفات والروابط (<strong>${totalMaterials}</strong>)، وكافة الاختبارات وأسئلتها الحالية لكي تتمكن من رفع المنهج الجديد على نظافة.
          <br><span style="color: var(--success); font-weight: 600;">(لن يتم مسح حسابات الطلاب أو المشرفين).</span>
        </p>
      </div>

      <div style="background: rgba(99, 102, 241, 0.06); border: 1px solid rgba(99, 102, 241, 0.22); border-radius: 12px; padding: 14px 16px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
        <div style="font-size: 0.88rem;">
          <strong>الاحتفاظ بنسخة احتياطية أولاً:</strong>
          <div style="color: var(--text-muted); font-size: 0.8rem;">احفظ ملفاً شاملاً لكل الروابط والملفات والكويزات الحالية قبل الحذف</div>
        </div>
        <button type="button" class="btn btn-primary" style="padding: 8px 14px; font-size: 0.84rem;" onclick="exportFullCurriculumJSON()">
          ${ICONS.download} تحميل نسخة احتياطية (JSON)
        </button>
      </div>

      <div style="margin-bottom: 18px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">
          <input type="checkbox" id="resetStudentsProgressOnClear" checked style="width: 18px; height: 18px;">
          <span>تصفير عداد الدروس والمحتويات المكتملة للطلاب ليبدأوا المحتوى الجديد من الصفر</span>
        </label>
      </div>

      <div class="input-group" style="margin-bottom: 20px;">
        <label>لتأكيد الحذف النهائي، اكتب كلمة <strong>مسح</strong> في الحقل التالي:</label>
        <input type="text" id="confirmClearAllInput" placeholder="اكتب: مسح" autocomplete="off">
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('clearAllContentModal')?.remove()">إلغاء</button>
        <button type="button" class="btn btn-primary" style="background: var(--danger); border-color: var(--danger);" onclick="executeClearAllCurriculum()">
          ${ICONS.trash} تأكيد مسح كل المحتوى
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function executeClearAllCurriculum() {
  const confirmVal = $('confirmClearAllInput')?.value?.trim();
  if (confirmVal !== 'مسح') {
    showToast('يرجى كتابة كلمة "مسح" بشكل صحيح لتأكيد العملية', 'error');
    return;
  }

  const resetStudentProgress = $('resetStudentsProgressOnClear')?.checked !== false;
  document.getElementById('clearAllContentModal')?.remove();

  showLoading();
  try {
    const res = await API.post('clearAllCurriculum', { resetStudentProgress });
    if (res && res.success) {
      state.units = [];
      state.lessons = {};
      state.materials = {};
      state.allMaterials = [];
      state.quizzes = {};
      localStorage.removeItem('iqt_curriculum_cache');

      showToast('تم مسح جميع الوحدات والدروس والمحتويات والاختبارات بنجاح! المنصة جاهزة للمحتوى الجديد.');
      await refreshAndRenderAdmin();
    } else {
      showToast(res?.message || 'فشل في مسح المحتوى', 'error');
    }
  } catch (e) {
    console.error('Error clearing curriculum:', e);
    showToast('حدث خطأ أثناء مسح المحتوى', 'error');
  } finally {
    hideLoading();
  }
}

function openImportCurriculumModal() {
  const existing = document.getElementById('importCurriculumModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'importCurriculumModal';
  modal.innerHTML = `
    <div class="glass modal-content" style="max-width: 540px;">
      <div class="flex justify-between items-center" style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
        <h3 style="margin: 0;">استيراد نسخة محتوى للمنصة (JSON)</h3>
        <button type="button" class="btn btn-secondary" style="padding: 6px 10px;" onclick="document.getElementById('importCurriculumModal')?.remove()">
          ${ICONS.close}
        </button>
      </div>

      <p style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 16px;">
        يمكنك رفع ملف النسخة الاحتياطية (<code>.json</code>) الذي قمت بتصديره مسبقاً من المنصة لاستعادة الوحدات والدروس والملفات والروابط والاختبارات دفعة واحدة.
      </p>

      <div class="input-group" style="margin-bottom: 18px;">
        <label>اختر ملف النسخة الاحتياطية (JSON)</label>
        <input type="file" id="importCurriculumFileInput" accept=".json,application/json" style="padding: 10px;">
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('importCurriculumModal')?.remove()">إلغاء</button>
        <button type="button" class="btn btn-primary" onclick="executeImportCurriculumJSON()">
          استيراد المحتوى الآن
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function executeImportCurriculumJSON() {
  const fileInput = $('importCurriculumFileInput');
  const file = fileInput?.files?.[0];
  if (!file) {
    showToast('يرجى اختيار ملف JSON أولاً', 'error');
    return;
  }

  showLoading();
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const raw = parsed.raw_data || parsed;

    if (!raw || (!Array.isArray(raw.units) && !Array.isArray(raw.lessons) && !Array.isArray(raw.materials))) {
      showToast('ملف JSON غير صالح أو لا يحتوي على هيكل محتوى المنصة', 'error');
      hideLoading();
      return;
    }

    document.getElementById('importCurriculumModal')?.remove();
    const res = await API.post('importAllCurriculum', { raw_data: raw });
    if (res && res.success) {
      const c = res.imported_counts || {};
      showToast(`تم استيراد المحتوى بنجاح (${c.units || 0} وحدة، ${c.lessons || 0} درس، ${c.materials || 0} محتوى، ${c.questions || 0} سؤال)!`);
      await refreshAndRenderAdmin();
    } else {
      showToast(res?.message || 'فشل في استيراد المحتوى', 'error');
    }
  } catch (e) {
    console.error('Error importing curriculum JSON:', e);
    showToast('تأكد من صحة ملف الـ JSON المختار', 'error');
  } finally {
    hideLoading();
  }
}

// ==========================================
// CONTENT MANAGEMENT
// ==========================================
async function renderAdminContent(container) {
  // If state doesn't have materials loaded yet, fetch them
  if (!state.allMaterials || !state.allMaterials.length) {
    container.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;">جاري تحميل المحتوى...</div>';

    if (!MOCK_MODE) {
      const res = await API.get('getAllMaterials');
      if (res && res.success) {
        state.allMaterials = (res.materials || []).map(m => ({
          ...m,
          material_id: String(m.material_id != null ? m.material_id : ''),
          lesson_id: String(m.lesson_id != null ? m.lesson_id : '')
        }));
        if (typeof groupMaterials === 'function') groupMaterials();
      }
    }
  }

  container.innerHTML = `
    <div class="flex justify-between items-center" style="margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
      <h2 style="margin: 0; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">إدارة المحتوى</h2>
      <div class="flex gap-2" style="flex-wrap: wrap;">
        <button class="btn btn-secondary" onclick="showModal('addUnit')">${ICONS.plus} إضافة وحدة</button>
        <button class="btn btn-secondary" onclick="showModal('addLesson')">${ICONS.plus} إضافة درس</button>
        <button class="btn btn-primary" onclick="showModal('addMaterial')">${ICONS.plus} إضافة محتوى</button>
      </div>
    </div>

    <!-- Backup, Export, Import & Reset Curriculum Toolbar -->
    <div class="glass" style="padding: 18px 22px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; background: rgba(99, 102, 241, 0.04); border: 1px solid rgba(99, 102, 241, 0.18);">
      <div>
        <h4 style="margin: 0 0 4px 0; font-size: 1rem;">تصدير، استيراد، وإعادة تهيئة محتوى المنصة</h4>
        <p style="margin: 0; font-size: 0.84rem; color: var(--text-muted);">
          احفظ نسخة شاملة من كل الوحدات والدروس والروابط وملفات الدرايف والكويزات (JSON أو Excel)، أو امسح المحتوى الحالي لرفع منهج جديد.
        </p>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button type="button" class="btn btn-primary" style="padding: 8px 14px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;" onclick="exportFullCurriculumJSON()">
          ${ICONS.download} تصدير كل المحتوى (JSON شامل)
        </button>
        <button type="button" class="btn btn-secondary" style="padding: 8px 14px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;" onclick="exportFullCurriculumCSV()">
          ${ICONS.download} تصدير جدول المحتوى والروابط (Excel / CSV)
        </button>
        <button type="button" class="btn btn-secondary" style="padding: 8px 14px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;" onclick="openImportCurriculumModal()">
          استيراد نسخة محتوى (JSON)
        </button>
        <button type="button" class="btn btn-secondary" style="padding: 8px 14px; font-size: 0.85rem; color: var(--danger); border-color: rgba(239, 68, 68, 0.35); display: inline-flex; align-items: center; gap: 6px;" onclick="openClearAllContentModal()">
          ${ICONS.trash} مسح كل المحتوى
        </button>
      </div>
    </div>

    <div style="margin-bottom: 32px;">
      <h3 style="margin-bottom: 16px; color: var(--text-muted);">الوحدات والدروس</h3>
      ${state.units.map(unit => {
        const isUnitHidden = !!unit.is_hidden;
        return `
        <div class="glass" style="padding: 20px; margin-bottom: 16px; border-right: 4px solid ${isUnitHidden ? 'var(--warning, #f59e0b)' : 'var(--primary)'}; ${isUnitHidden ? 'background: rgba(245, 158, 11, 0.03); opacity: 0.9;' : ''}">
          <div class="flex justify-between items-center" style="border-bottom: 1px solid rgba(0,0,0,0.06); padding-bottom: 12px;">
            <div>
              <span class="unit-number">الوحدة ${unit.unit_number}</span>
              <h4 style="margin-top: 4px; display: inline-flex; align-items: center; gap: 8px;">
                ${unit.unit_name}
                ${isUnitHidden ? `<span style="font-size: 0.72rem; color: #d97706; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); padding: 2px 8px; border-radius: 6px; font-weight: 700;">👁‍🗨 مخفية عن الطلاب</span>` : ''}
              </h4>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-secondary" style="padding: 6px 10px; ${isUnitHidden ? 'color: #d97706; border-color: rgba(245,158,11,0.4);' : ''}" onclick="toggleItemVisibility('unit', '${unit.unit_id}', ${isUnitHidden})" title="${isUnitHidden ? 'إظهار الوحدة للطلاب' : 'إخفاء الوحدة عن الطلاب'}">${isUnitHidden ? ICONS.eye : ICONS.eyeOff}</button>
              <button class="btn btn-secondary" style="padding: 6px 10px;" onclick='showModal("editUnit", ${JSON.stringify(unit).replace(/'/g, "&#39;")})' title="تعديل">${ICONS.edit}</button>
              <button class="btn btn-secondary" style="padding: 6px 10px; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'unit', id: '${unit.unit_id}', name: '${unit.unit_name}'})" title="حذف">${ICONS.trash}</button>
              <button class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.85rem;" onclick="showModal('addLesson', '${unit.unit_id}')">${ICONS.plus} درس</button>
              <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="showModal('addMaterial', 'unit_${unit.unit_id}')">${ICONS.plus} محتوى بالوحدة</button>
            </div>
          </div>

          <div style="margin-top: 16px; padding-right: 12px;">
            <!-- Unit-direct materials -->
            ${(state.materials[`unit_${unit.unit_id}`] || []).map(mat => {
              const isMatHidden = !!mat.is_hidden;
              return `
              <div class="flex justify-between items-center" style="padding: 8px 12px; margin-bottom: 8px; border-radius: 8px; background: ${isMatHidden ? 'rgba(245, 158, 11, 0.05)' : 'rgba(99,102,241,0.04)'}; border-right: 3px solid ${isMatHidden ? '#f59e0b' : 'var(--primary)'}; ${isMatHidden ? 'opacity: 0.85;' : ''}">
                <div class="flex items-center gap-2">
                  <span style="color: ${isMatHidden ? '#d97706' : 'var(--primary)'};">${mat.type === 'video' ? ICONS.video : mat.type === 'quiz' ? ICONS.quiz : (mat.type === 'link' || mat.type === 'external') ? ICONS.presentation : ICONS.file}</span>
                  <span style="font-weight: 500;">${mat.title}</span>
                  <span style="font-size: 0.75rem; color: var(--text-muted); background: rgba(0,0,0,0.05); padding: 1px 6px; border-radius: 4px;">محتوى بالوحدة (${(mat.type === 'link' || mat.type === 'external') ? 'شرائح / رابط' : mat.type})</span>
                  ${isMatHidden ? `<span style="font-size: 0.72rem; color: #d97706; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700;">👁‍🗨 مخفي عن الطلاب</span>` : ''}
                </div>
                <div class="flex gap-2">
                  <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; ${isMatHidden ? 'color: #d97706; border-color: rgba(245,158,11,0.4);' : ''}" onclick="toggleItemVisibility('material', '${mat.material_id}', ${isMatHidden})" title="${isMatHidden ? 'إظهار للطلاب' : 'إخفاء عن الطلاب'}">${isMatHidden ? ICONS.eye : ICONS.eyeOff}</button>
                  ${(mat.type === 'link' || mat.type === 'external') && mat.content ? `<a href="${mat.content}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" title="فتح الرابط">${ICONS.externalLink}</a>` : ''}
                  <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" onclick='showModal("editMaterial", ${JSON.stringify(mat).replace(/'/g, "&#39;")})' title="تعديل">${ICONS.edit}</button>
                  <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'material', id: '${mat.material_id}', name: '${mat.title}'})" title="حذف">${ICONS.trash}</button>
                </div>
              </div>
            `;}).join('')}

            <!-- Lessons in unit -->
            ${(state.lessons[unit.unit_id] || []).map(lesson => {
              const isLesHidden = !!lesson.is_hidden;
              const lessonMats = state.materials[String(lesson.lesson_id)] || [];
              return `
                <div style="margin-bottom: 12px; background: rgba(0,0,0,0.015); border: 1px solid ${isLesHidden ? 'rgba(245, 158, 11, 0.3)' : 'rgba(0,0,0,0.05)'}; border-radius: 10px; padding: 12px; ${isLesHidden ? 'opacity: 0.88; background: rgba(245, 158, 11, 0.02);' : ''}">
                  <div class="flex justify-between items-center">
                    <span style="font-weight: 700; font-size: 0.95rem; display: inline-flex; align-items: center; gap: 8px;">
                      الدرس ${lesson.lesson_number}: ${lesson.lesson_name}
                      ${isLesHidden ? `<span style="font-size: 0.72rem; color: #d97706; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700;">👁‍🗨 درس مخفي عن الطلاب</span>` : ''}
                    </span>
                    <div class="flex gap-2">
                      <button class="btn btn-secondary" style="padding: 4px 8px; ${isLesHidden ? 'color: #d97706; border-color: rgba(245,158,11,0.4);' : ''}" onclick="toggleItemVisibility('lesson', '${lesson.lesson_id}', ${isLesHidden})" title="${isLesHidden ? 'إظهار الدرس للطلاب' : 'إخفاء الدرس عن الطلاب'}">${isLesHidden ? ICONS.eye : ICONS.eyeOff}</button>
                      <button class="btn btn-secondary" style="padding: 4px 8px;" onclick='showModal("editLesson", ${JSON.stringify(lesson).replace(/'/g, "&#39;")})' title="تعديل">${ICONS.edit}</button>
                      <button class="btn btn-secondary" style="padding: 4px 8px; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'lesson', id: '${lesson.lesson_id}', name: '${lesson.lesson_name}'})" title="حذف">${ICONS.trash}</button>
                      <button class="btn btn-secondary" style="padding: 4px 12px; font-size: 0.8rem;"
                        onclick="showModal('addMaterial', '${lesson.lesson_id}')">
                        ${ICONS.plus} محتوى
                      </button>
                    </div>
                  </div>

                  <!-- Materials list inside lesson -->
                  <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px; padding-right: 12px; border-right: 2px solid rgba(0,0,0,0.08);">
                    ${lessonMats.map(mat => {
                      const isMatHidden = !!mat.is_hidden;
                      return `
                      <div class="flex justify-between items-center" style="padding: 6px 10px; background: var(--bg-card, #fff); border: 1px solid ${isMatHidden ? 'rgba(245, 158, 11, 0.3)' : 'rgba(0,0,0,0.05)'}; border-radius: 6px; font-size: 0.88rem; ${isMatHidden ? 'opacity: 0.85;' : ''}">
                        <div class="flex items-center gap-2">
                          <span style="color: ${isMatHidden ? '#d97706' : 'var(--primary)'};">${mat.type === 'video' ? ICONS.video : mat.type === 'quiz' ? ICONS.quiz : (mat.type === 'link' || mat.type === 'external') ? ICONS.presentation : ICONS.file}</span>
                          <span>${mat.title}</span>
                          <span style="font-size: 0.72rem; color: var(--text-muted); background: rgba(0,0,0,0.04); padding: 1px 6px; border-radius: 4px;">${mat.type === 'quiz' ? 'اختبار' : mat.type === 'video' ? 'فيديو' : mat.type === 'pdf' ? 'PDF' : (mat.type === 'link' || mat.type === 'external') ? 'شرائح / رابط' : mat.type}</span>
                          ${isMatHidden ? `<span style="font-size: 0.72rem; color: #d97706; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700;">👁‍🗨 مخفي عن الطلاب</span>` : ''}
                        </div>
                        <div class="flex gap-2">
                          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; ${isMatHidden ? 'color: #d97706; border-color: rgba(245,158,11,0.4);' : ''}" onclick="toggleItemVisibility('material', '${mat.material_id}', ${isMatHidden})" title="${isMatHidden ? 'إظهار للطلاب' : 'إخفاء عن الطلاب'}">${isMatHidden ? ICONS.eye : ICONS.eyeOff}</button>
                          ${(mat.type === 'link' || mat.type === 'external') && mat.content ? `<a href="${mat.content}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" title="فتح الرابط">${ICONS.externalLink}</a>` : ''}
                          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" onclick='showModal("editMaterial", ${JSON.stringify(mat).replace(/'/g, "&#39;")})' title="تعديل">${ICONS.edit}</button>
                          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'material', id: '${mat.material_id}', name: '${mat.title}'})" title="حذف">${ICONS.trash}</button>
                        </div>
                      </div>
                    `;}).join('')}
                    ${!lessonMats.length ? `
                      <div style="font-size: 0.8rem; color: var(--text-muted); padding: 4px 0;">لا يوجد محتوى في هذا الدرس بعد</div>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
            ${!(state.lessons[unit.unit_id] || []).length && !(state.materials[`unit_${unit.unit_id}`] || []).length ? `
              <div style="background: rgba(0,0,0,0.02); border: 1px dashed rgba(0,0,0,0.12); border-radius: 10px; padding: 18px; text-align: center; margin-top: 10px;">
                <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 12px;">الوحدة فارغة حالياً. يمكنك البدء بإضافة أول درس أو إضافة محتوى مباشر إليها:</p>
                <div class="flex gap-2 justify-center">
                  <button class="btn btn-primary" style="padding: 6px 14px; font-size: 0.85rem;" onclick="showModal('addLesson', '${unit.unit_id}')">${ICONS.plus} إضافة درس</button>
                  <button class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.85rem;" onclick="showModal('addMaterial', 'unit_${unit.unit_id}')">${ICONS.plus} إضافة محتوى بالوحدة</button>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;}).join('')}

      <!-- Standalone lessons (no unit) -->
      ${(state.lessons[''] || []).length ? `
        <div class="glass" style="padding: 20px; margin-bottom: 16px; border-right: 4px solid var(--secondary);">
          <h4 style="margin-bottom: 14px; color: var(--text-muted);">دروس مستقلة (خارج الوحدات)</h4>
          ${(state.lessons[''] || []).map(lesson => {
            const isLesHidden = !!lesson.is_hidden;
            const lessonMats = state.materials[String(lesson.lesson_id)] || [];
            return `
              <div style="margin-bottom: 12px; background: rgba(0,0,0,0.015); border: 1px solid ${isLesHidden ? 'rgba(245, 158, 11, 0.3)' : 'rgba(0,0,0,0.05)'}; border-radius: 10px; padding: 12px; ${isLesHidden ? 'opacity: 0.88; background: rgba(245, 158, 11, 0.02);' : ''}">
                <div class="flex justify-between items-center">
                  <span style="font-weight: 700; font-size: 0.95rem; display: inline-flex; align-items: center; gap: 8px;">
                    الدرس ${lesson.lesson_number}: ${lesson.lesson_name}
                    ${isLesHidden ? `<span style="font-size: 0.72rem; color: #d97706; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700;">👁‍🗨 درس مخفي عن الطلاب</span>` : ''}
                  </span>
                  <div class="flex gap-2">
                    <button class="btn btn-secondary" style="padding: 4px 8px; ${isLesHidden ? 'color: #d97706; border-color: rgba(245,158,11,0.4);' : ''}" onclick="toggleItemVisibility('lesson', '${lesson.lesson_id}', ${isLesHidden})" title="${isLesHidden ? 'إظهار الدرس للطلاب' : 'إخفاء الدرس عن الطلاب'}">${isLesHidden ? ICONS.eye : ICONS.eyeOff}</button>
                    <button class="btn btn-secondary" style="padding: 4px 8px;" onclick='showModal("editLesson", ${JSON.stringify(lesson).replace(/'/g, "&#39;")})' title="تعديل">${ICONS.edit}</button>
                    <button class="btn btn-secondary" style="padding: 4px 8px; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'lesson', id: '${lesson.lesson_id}', name: '${lesson.lesson_name}'})" title="حذف">${ICONS.trash}</button>
                    <button class="btn btn-secondary" style="padding: 4px 12px; font-size: 0.8rem;"
                      onclick="showModal('addMaterial', '${lesson.lesson_id}')">
                      ${ICONS.plus} محتوى
                    </button>
                  </div>
                </div>

                <!-- Materials list inside standalone lesson -->
                <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px; padding-right: 12px; border-right: 2px solid rgba(0,0,0,0.08);">
                  ${lessonMats.map(mat => {
                    const isMatHidden = !!mat.is_hidden;
                    return `
                    <div class="flex justify-between items-center" style="padding: 6px 10px; background: var(--bg-card, #fff); border: 1px solid ${isMatHidden ? 'rgba(245, 158, 11, 0.3)' : 'rgba(0,0,0,0.05)'}; border-radius: 6px; font-size: 0.88rem; ${isMatHidden ? 'opacity: 0.85;' : ''}">
                      <div class="flex items-center gap-2">
                        <span style="color: ${isMatHidden ? '#d97706' : 'var(--primary)'};">${mat.type === 'video' ? ICONS.video : mat.type === 'quiz' ? ICONS.quiz : (mat.type === 'link' || mat.type === 'external') ? ICONS.presentation : ICONS.file}</span>
                        <span>${mat.title}</span>
                        <span style="font-size: 0.72rem; color: var(--text-muted); background: rgba(0,0,0,0.04); padding: 1px 6px; border-radius: 4px;">${mat.type === 'quiz' ? 'اختبار' : mat.type === 'video' ? 'فيديو' : mat.type === 'pdf' ? 'PDF' : (mat.type === 'link' || mat.type === 'external') ? 'شرائح / رابط' : mat.type}</span>
                        ${isMatHidden ? `<span style="font-size: 0.72rem; color: #d97706; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700;">👁‍🗨 مخفي عن الطلاب</span>` : ''}
                      </div>
                      <div class="flex gap-2">
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; ${isMatHidden ? 'color: #d97706; border-color: rgba(245,158,11,0.4);' : ''}" onclick="toggleItemVisibility('material', '${mat.material_id}', ${isMatHidden})" title="${isMatHidden ? 'إظهار للطلاب' : 'إخفاء عن الطلاب'}">${isMatHidden ? ICONS.eye : ICONS.eyeOff}</button>
                        ${(mat.type === 'link' || mat.type === 'external') && mat.content ? `<a href="${mat.content}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" title="فتح الرابط">${ICONS.externalLink}</a>` : ''}
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" onclick='showModal("editMaterial", ${JSON.stringify(mat).replace(/'/g, "&#39;")})' title="تعديل">${ICONS.edit}</button>
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'material', id: '${mat.material_id}', name: '${mat.title}'})" title="حذف">${ICONS.trash}</button>
                      </div>
                    </div>
                  `;}).join('')}
                  ${!lessonMats.length ? `
                    <div style="font-size: 0.8rem; color: var(--text-muted); padding: 4px 0;">لا يوجد محتوى في هذا الدرس بعد</div>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

      <!-- Standalone materials (no unit and no lesson) -->
      ${(state.materials[''] || []).length ? `
        <div class="glass" style="padding: 20px; margin-bottom: 16px; border-right: 4px solid #8b5cf6;">
          <h4 style="margin-bottom: 14px; color: var(--text-muted);">محتويات مستقلة تماماً (خارج الدروس والوحدات)</h4>
          ${(state.materials[''] || []).map(mat => {
            const isMatHidden = !!mat.is_hidden;
            return `
            <div class="flex justify-between items-center" style="padding: 10px 12px; margin-bottom: 6px; border-radius: 8px; background: ${isMatHidden ? 'rgba(245, 158, 11, 0.05)' : 'rgba(139,92,246,0.04)'}; border-right: 3px solid ${isMatHidden ? '#f59e0b' : '#8b5cf6'}; ${isMatHidden ? 'opacity: 0.85;' : ''}">
              <div class="flex items-center gap-2">
                <span style="color: ${isMatHidden ? '#d97706' : '#8b5cf6'};">${mat.type === 'video' ? ICONS.video : mat.type === 'quiz' ? ICONS.quiz : ICONS.file}</span>
                <span style="font-weight: 500;">${mat.title}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted); background: rgba(0,0,0,0.05); padding: 1px 6px; border-radius: 4px;">(${mat.type})</span>
                ${isMatHidden ? `<span style="font-size: 0.72rem; color: #d97706; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700;">👁‍🗨 مخفي عن الطلاب</span>` : ''}
              </div>
              <div class="flex gap-2">
                <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; ${isMatHidden ? 'color: #d97706; border-color: rgba(245,158,11,0.4);' : ''}" onclick="toggleItemVisibility('material', '${mat.material_id}', ${isMatHidden})" title="${isMatHidden ? 'إظهار للطلاب' : 'إخفاء عن الطلاب'}">${isMatHidden ? ICONS.eye : ICONS.eyeOff}</button>
                <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" onclick='showModal("editMaterial", ${JSON.stringify(mat).replace(/'/g, "&#39;")})' title="تعديل">${ICONS.edit}</button>
                <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'material', id: '${mat.material_id}', name: '${mat.title}'})" title="حذف">${ICONS.trash}</button>
              </div>
            </div>
          `;}).join('')}
        </div>
      ` : ''}
    </div>

    <div>
      <h3 style="margin-bottom: 16px; color: var(--text-muted);">إعادة ترتيب المحتويات (سحب وإفلات)</h3>
      <div class="glass" style="padding: 20px;">
        <p style="color: var(--text-muted); margin-bottom: 16px; font-size: 0.9rem;">
          اسحب العناصر لإعادة ترتيبها. ستنعكس التغييرات على عرض الطلاب.
        </p>
        <div class="sortable-list" id="sortableMaterials">
          ${state.allMaterials.map((mat, i) => `
            <div class="sortable-item" draggable="true" data-id="${mat.material_id}" data-index="${i}">
              <span class="drag-handle">${ICONS.grip}</span>
              <span style="flex: 1;">${mat.title}</span>
              <span style="color: var(--text-muted); font-size: 0.85rem; margin-left: 12px;">${mat.type}</span>
              <div class="flex gap-2">
                <button class="btn btn-secondary" style="padding: 4px;" onclick='showModal("editMaterial", ${JSON.stringify(mat).replace(/'/g, "&#39;")})' title="تعديل">${ICONS.edit}</button>
                <button class="btn btn-secondary" style="padding: 4px; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'material', id: '${mat.material_id}', name: '${mat.title}'})" title="حذف">${ICONS.trash}</button>
              </div>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-primary mt-4" onclick="saveMaterialOrder()">حفظ الترتيب</button>
      </div>
    </div>
  `;

  setupDragAndDrop();
}

// ==========================================
// QUIZ MANAGEMENT
// ==========================================
async function renderAdminQuizzes(container) {
  container.innerHTML = `
    <div class="flex justify-between items-center" style="margin-bottom: 24px;">
      <h2 style="font-family: 'Space Grotesk', 'Tajawal', sans-serif;">إدارة الاختبارات</h2>
      <div class="flex gap-2">
        <button class="btn btn-secondary" onclick="showModal('importQuiz')">${ICONS.import} استيراد اختبار</button>
        <button class="btn btn-primary" onclick="showModal('addQuiz')">${ICONS.plus} إنشاء اختبار</button>
      </div>
    </div>
    <div id="quizList"><div class="loading-text" style="text-align:center;padding:40px;">جاري تحميل الاختبارات...</div></div>
  `;

  // Collect all quiz-type materials across all units/lessons/standalone
  const quizMaterials = [];
  
  // From state.allMaterials directly is safer since we already flattened it
  for (const mat of state.allMaterials) {
    if (mat.type === 'quiz') {
      let unit = null;
      let lesson = null;
      
      // Find the unit and lesson this material belongs to
      if (mat.lesson_id) {
        const lidStr = String(mat.lesson_id);
        if (lidStr.startsWith('unit_')) {
          const unitId = lidStr.replace('unit_', '');
          unit = state.units.find(u => String(u.unit_id) === unitId);
        } else {
          for (const u of state.units) {
            if (state.lessons[u.unit_id]) {
              lesson = state.lessons[u.unit_id].find(l => String(l.lesson_id) === lidStr);
              if (lesson) { unit = u; break; }
            }
          }
          if (!lesson && state.lessons['']) {
            lesson = state.lessons[''].find(l => String(l.lesson_id) === lidStr);
          }
        }
      }
      
      quizMaterials.push({ mat, unit, lesson });
    }
  }

  // Load all quiz records in parallel (only for those not yet cached)
  if (!MOCK_MODE) {
    const uncached = quizMaterials.filter(({ mat }) => !state.quizzes[String(mat.material_id)]);
    const results = await Promise.all(
      uncached.map(({ mat }) => API.get('getQuizzes', { materialId: String(mat.material_id) }))
    );
    results.forEach((res, i) => {
      if (res.success && res.quizzes && res.quizzes.length) {
        state.quizzes[String(uncached[i].mat.material_id)] = res.quizzes[0];
      }
    });
  }

  const quizList = $('quizList');
  let html = '';

  for (const { mat, unit, lesson } of quizMaterials) {
    const quiz = state.quizzes[String(mat.material_id)];
    let settings = {};
    if (mat.content) {
      try { settings = JSON.parse(mat.content); } catch(e) {}
    }
    const timeLimit = settings.time_limit || 0;
    const isReview = settings.is_review_mode || false;
    const isQuizHidden = !!mat.is_hidden;

    const timerBadge = timeLimit > 0
      ? `<span style="font-size:0.78rem; color:var(--primary); background:rgba(99,102,241,0.1);
                      padding:2px 8px; border-radius:10px; margin-right:6px;">
           ⏱ ${timeLimit} دقيقة
         </span>`
      : '';
      
    const reviewBadge = isReview 
      ? `<span style="font-size:0.78rem; color:var(--warning); background:rgba(245,158,11,0.1);
                      padding:2px 8px; border-radius:10px; margin-right:6px;">
           ${ICONS.eye} وضع المراجعة
         </span>`
      : '';

    const visibilityBadge = isQuizHidden
      ? `<span style="font-size:0.78rem; color:#d97706; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3);
                      padding:2px 8px; border-radius:10px; margin-right:6px; font-weight:700;">
           👁‍🗨 مخفي عن الطلاب
         </span>`
      : `<span style="font-size:0.78rem; color:#059669; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.25);
                      padding:2px 8px; border-radius:10px; margin-right:6px; font-weight:700;">
           👁 متاح للطلاب
         </span>`;

    html += `
      <div class="glass" style="padding: 20px; margin-bottom: 12px; border-right: 4px solid ${isQuizHidden ? 'var(--warning, #f59e0b)' : 'var(--primary)'}; ${isQuizHidden ? 'background: rgba(245, 158, 11, 0.02); opacity: 0.9;' : ''}">
        <div class="flex justify-between items-center">
          <div>
            <h4 style="margin-bottom:4px; display:inline-flex; align-items:center; gap:8px;">
              ${mat.title}
              ${visibilityBadge}
            </h4>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin:0;">
              ${unit && lesson ? `${unit.unit_name} → ${lesson.lesson_name}` : (unit ? `${unit.unit_name} (مباشرة)` : (lesson ? `درس مستقل: ${lesson.lesson_name}` : 'مستقل'))}
              ${quiz
                ? `<span style="color: var(--success); margin-right: 6px;">✓ جاهز</span>${timerBadge}${reviewBadge}`
                : `<span style="color: var(--warning); margin-right: 8px;">⚠ لا يوجد سجل اختبار بعد</span>`}
            </p>
          </div>
          <div class="flex gap-2" style="flex-wrap:wrap; justify-content:flex-end;">
            <button class="btn btn-secondary" style="padding: 8px 14px; font-size: 0.85rem; ${isQuizHidden ? 'color:#d97706; border-color:rgba(245,158,11,0.4); font-weight:700;' : ''}"
              onclick="toggleItemVisibility('material', '${mat.material_id}', ${isQuizHidden})"
              title="${isQuizHidden ? 'إظهار الاختبار للطلاب الآن' : 'إخفاء الاختبار عن الطلاب'}">
              ${isQuizHidden ? `${ICONS.eye} إظهار للطلاب الآن` : `${ICONS.eyeOff} إخفاء عن الطلاب`}
            </button>
            ${!quiz ? `
              <button class="btn btn-secondary" style="padding: 8px 16px; font-size: 0.85rem;"
                onclick="createQuizForMaterial('${mat.material_id}', '${mat.title}')">
                إنشاء اختبار
              </button>
            ` : ''}
            ${quiz ? `
              <button class="btn btn-primary" style="padding: 8px 16px; font-size: 0.85rem;"
                onclick="showModal('addQuestion', '${quiz.quiz_id}')">
                ${ICONS.plus} إضافة سؤال
              </button>
              <button class="btn btn-secondary" style="padding: 8px 16px; font-size: 0.85rem;"
                onclick="toggleQuizQuestions('${quiz.quiz_id}')">
                عرض الأسئلة
              </button>
              <button class="btn btn-success" style="padding: 8px 16px; font-size: 0.85rem; background: var(--success); color: white; border-color: var(--success);"
                onclick="startQuiz('${mat.material_id}', '${quiz.quiz_id}', ${(() => { try { return !!JSON.parse(mat.content || '{}').is_review_mode; } catch(e){ return false; } })()})">
                ▶ معاينة الاختبار
              </button>
              <button class="btn btn-secondary" style="padding: 8px 14px; font-size: 0.85rem;"
                onclick="copyQuizJsonSource('${quiz.quiz_id}', '${mat.material_id}')"
                title="نسخ السورس كود JSON لهذا الاختبار بالكامل لنسخه أو استيراده من جديد">
                ${ICONS.copy} نسخ سورس كود JSON
              </button>
              <button class="btn btn-secondary" style="padding: 8px; font-size: 0.85rem;" title="إعدادات الاختبار"
                onclick='showModal("editQuizSettings", ${JSON.stringify({
                  material_id: mat.material_id, 
                  title: mat.title,
                  is_hidden: isQuizHidden,
                  settings: (function(){ try { return JSON.parse(mat.content || "{}"); } catch(e){ return {}; } })() 
                }).replace(/'/g, "&#39;")})'>
                ⚙
              </button>
            ` : ''}
          </div>
        </div>
        <div id="quiz-questions-${quiz?.quiz_id}" style="display:none; margin-top: 16px; padding-right: 16px;"></div>
      </div>
    `;
  }

  quizList.innerHTML = html || '<div class="glass text-center" style="padding: 40px;"><p>لا توجد اختبارات. أنشئ محتوى من نوع "اختبار" أولاً.</p></div>';
}

/**
 * FIX: Explicitly create the quiz record for a material_id that doesn't have one yet.
 * This was the missing link — admin adds a "quiz" material but the quiz record
 * in the quizzes sheet was never created automatically.
 */
async function createQuizForMaterial(materialId, title) {
  if (MOCK_MODE) {
    state.quizzes[materialId] = { quiz_id: 'mock_' + materialId, material_id: materialId, title };
    showToast('تم إنشاء الاختبار!');
    await refreshAndRenderAdmin();
    return;
  }
  try {
    let res = await API.post('addQuiz', {
      material_id: String(materialId),
      title: title,
      description: ''
    });

    // Safeguard: If backend returns a purely numeric ID (e.g. older GAS deployment),
    // delete and re-create so Google Sheets will never treat it as a number.
    let retries = 0;
    while (res && res.success && /^\d+$/.test(String(res.quiz_id)) && retries < 5) {
      await API.post('deleteItem', { itemType: 'quiz', id: res.quiz_id });
      res = await API.post('addQuiz', {
        material_id: String(materialId),
        title: title,
        description: ''
      });
      retries++;
    }

    if (res && res.success) {
      showToast('تم إنشاء الاختبار! يمكنك الآن إضافة الأسئلة.');
      await refreshAndRenderAdmin();
    }
  } catch(err) {
    showToast('خطأ في إنشاء الاختبار', 'error');
  }
}

// ==========================================
// USERS
// ==========================================
async function renderAdminUsers(container) {
  let users = [];
  if (MOCK_MODE) {
    users = [{ name: 'طالب تجريبي', username: 'student', role: 'student' }];
  } else if (state.cachedAdminUsers && state.cachedAdminUsers.length) {
    users = state.cachedAdminUsers;
    // Silently revalidate in background without blocking UI
    API.get('getAllUsers').then(res => {
      if (res && res.success && Array.isArray(res.users)) {
        state.cachedAdminUsers = res.users;
      }
    }).catch(console.error);
  } else {
    container.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;">جاري تحميل المستخدمين...</div>';
    const res = await API.get('getAllUsers');
    if (res && res.success && Array.isArray(res.users)) {
      users = res.users;
    } else {
      const fallback = await API.get('getAllStudents');
      if (fallback && fallback.success) users = fallback.students || [];
    }
  }

  // Cache users in state for client-side search & filtering
  state.cachedAdminUsers = users;
  state.adminUserFilterType = state.adminUserFilterType || 'all';

  // Determine what they can see based on role
  const isManager = state.user.role === 'manager';
  const isVIP = state.user.role === 'vip';
  const isAdmin = state.user.role === 'admin';

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 24px;">
      <h2 style="margin: 0; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">إدارة الحسابات والمستخدمين</h2>
      <button type="button" class="btn btn-primary" onclick="exportStudentsReportCSV()" style="display: inline-flex; align-items: center; gap: 8px;">
        ${ICONS.download} تصدير تقرير الطلاب (CSV / Excel)
      </button>
    </div>
  `;
  
  // Calculate counts
  const totalCount = users.length;
  const frozenCount = users.filter(u => u.is_frozen || u.status === 'frozen' || String(u.role).startsWith('frozen')).length;
  const studentCount = users.filter(u => (u.role === 'student' || u.originalRole === 'student') && !u.is_frozen && u.status !== 'frozen').length;
  const staffCount = users.filter(u => ['admin', 'manager', 'vip'].includes(u.role)).length;

  html += `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:24px;">
      <div class="glass text-center" style="padding: 20px;">
        <h3 style="margin-bottom: 8px; font-size: 0.95rem; color: var(--text-muted);">إجمالي المستخدمين</h3>
        <div style="font-size: 2.2rem; font-weight: 800; color: var(--primary);">${totalCount}</div>
        <div style="color: var(--text-muted); font-size: 0.85rem;">جميع الحسابات المسجلة</div>
      </div>
      <div class="glass text-center" style="padding: 20px;">
        <h3 style="margin-bottom: 8px; font-size: 0.95rem; color: var(--text-muted);">الطلاب النشطين</h3>
        <div style="font-size: 2.2rem; font-weight: 800; color: #10b981;">${studentCount}</div>
        <div style="color: var(--text-muted); font-size: 0.85rem;">حسابات الطلاب الفعالة</div>
      </div>
      <div class="glass text-center" style="padding: 20px; border: 1.5px solid rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.04);">
        <h3 style="margin-bottom: 8px; font-size: 0.95rem; color: #d97706;">الحسابات المجمدة</h3>
        <div style="font-size: 2.2rem; font-weight: 800; color: #f59e0b;">${frozenCount}</div>
        <div style="color: var(--text-muted); font-size: 0.85rem;">منتهية الصلاحية / معطلة</div>
      </div>
    </div>
  `;

  if (isManager) {
    container.innerHTML = html;
    return;
  }

  // Admin and VIP can see users. Admin can add users.
  if (isAdmin) {
    html += `
      <div class="glass" style="padding: 24px; margin-bottom: 24px;">
        <h3 style="margin-bottom: 16px;">إضافة مستخدم جديد</h3>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:12px;">
          <input type="text" id="newUserName" placeholder="الاسم الظاهر" class="w-full" style="padding:8px 12px; border:2px solid var(--border); border-radius:8px;">
          <input type="text" id="newUserFull" placeholder="الاسم بالكامل" class="w-full" style="padding:8px 12px; border:2px solid var(--border); border-radius:8px;">
          <input type="text" id="newUserUsername" placeholder="اسم المستخدم (إنجليزي)" class="w-full" style="padding:8px 12px; border:2px solid var(--border); border-radius:8px; direction:ltr;" pattern="[a-zA-Z0-9_]+">
          <input type="password" id="newUserPassword" placeholder="كلمة المرور" class="w-full" style="padding:8px 12px; border:2px solid var(--border); border-radius:8px;">
          <select id="newUserRole" class="w-full" style="padding:8px 12px; border:2px solid var(--border); border-radius:8px;">
            <option value="student">طالب</option>
            <option value="guest">ضيف</option>
            <option value="manager">المدير</option>
            <option value="vip">الأب الروحي</option>
            <option value="admin">مدير النظام</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="adminAddUser()">إضافة مستخدم</button>
      </div>
    `;
  }

  // Filter chips and search bar
  html += `
    <div class="glass" style="padding: 16px 20px; margin-bottom: 20px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px;">
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <span style="font-size:0.9rem; font-weight:700; color:var(--text-muted); margin-left:6px;">التصفية:</span>
        <button class="btn ${state.adminUserFilterType === 'all' ? 'btn-primary' : 'btn-secondary'}" style="padding:6px 14px; font-size:0.85rem;" onclick="adminSetUserFilter('all')">الكل (${totalCount})</button>
        <button class="btn ${state.adminUserFilterType === 'students' ? 'btn-primary' : 'btn-secondary'}" style="padding:6px 14px; font-size:0.85rem;" onclick="adminSetUserFilter('students')">الطلاب النشطين (${studentCount})</button>
        <button class="btn ${state.adminUserFilterType === 'frozen' ? 'btn-primary' : 'btn-secondary'}" style="padding:6px 14px; font-size:0.85rem; border-color:rgba(245,158,11,0.5); ${state.adminUserFilterType === 'frozen' ? 'background:#f59e0b; border-color:#f59e0b;' : 'color:#d97706;'}" onclick="adminSetUserFilter('frozen')">المجمدة (${frozenCount})</button>
        <button class="btn ${state.adminUserFilterType === 'staff' ? 'btn-primary' : 'btn-secondary'}" style="padding:6px 14px; font-size:0.85rem;" onclick="adminSetUserFilter('staff')">الإدارة (${staffCount})</button>
      </div>
      <div style="flex:1; min-width:220px; max-width:320px;">
        <input type="text" id="adminUserSearchInput" oninput="adminFilterUsersLive()" placeholder="بحث بالاسم أو @اسم المستخدم..." style="width:100%; padding:8px 12px; border:2px solid var(--border); border-radius:8px; font-size:0.88rem;">
      </div>
    </div>
  `;

  html += `<div id="studentsList">`;
  html += adminBuildUserCardsHtml(users, isAdmin);
  html += `</div>`;
  
  container.innerHTML = html;
}

function adminBuildUserCardsHtml(users, isAdmin) {
  if (!users || users.length === 0) {
    return `<div class="glass text-center" style="padding:40px; color:var(--text-muted);">لا يوجد مستخدمين مطابقين لخيارات البحث أو التصفية الحالية.</div>`;
  }

  let html = '';
  users.forEach(s => {
    const isCurrentUser = s.username === state.user.username;
    const isFrozen = !!s.is_frozen || s.status === 'frozen' || String(s.role || '').toLowerCase().startsWith('frozen');
    const effectiveRole = isFrozen ? (s.originalRole || String(s.role || '').replace(/^frozen:?/i, '') || 'student') : (s.role || 'student');
    const safeDisplayName = (s.name || s.username || '').replace(/'/g, "\\'");

    html += `
      <div class="glass student-card flex justify-between items-center" style="margin-bottom:12px; padding:16px; ${isFrozen ? 'border: 1.5px dashed rgba(245, 158, 11, 0.7); background: rgba(245, 158, 11, 0.04);' : ''}">
        <div class="student-info flex items-center gap-4">
          <div class="avatar" style="width:40px; height:40px; font-size:1.2rem; ${isFrozen ? 'opacity:0.8; filter:grayscale(30%);' : ''}">
             ${s.avatar ? `<img src="${s.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : (s.name ? s.name.charAt(0).toUpperCase() : '؟')}
          </div>
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <h3 style="margin:0; font-size:1.05rem;">${s.name || 'بدون اسم'} ${s.full_name ? `<span style="font-size:0.8rem;color:var(--text-muted);font-weight:normal;">(${s.full_name})</span>` : ''}</h3>
              ${isFrozen ? `
                <span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.4); font-weight: 800; padding: 2px 8px; border-radius: 6px; font-size: 0.76rem;">
                  مجمد (انتهت الصلاحية)
                </span>
              ` : ''}
            </div>
            <p style="margin:2px 0 0 0; font-size:0.85rem; color:var(--text-muted); direction:ltr; text-align:right;">@${s.username}</p>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap: 8px; flex-wrap:wrap;">
          ${getRoleBadgeSVG(isFrozen ? 'frozen' : effectiveRole)}
          ${effectiveRole === 'student' ? `<button class="btn btn-secondary" style="padding: 6px 12px; font-size:0.85rem;" onclick="viewStudentDetails('${s.username}')">عرض السجل</button>` : ''}
          ${isAdmin ? `
            <button class="btn btn-secondary" style="padding: 6px 10px; font-size:0.82rem;" onclick="adminPromptResetPassword('${s.username}', '${safeDisplayName}')" title="تعديل كلمة المرور">
              كلمة المرور
            </button>
          ` : ''}
          ${isAdmin && !isCurrentUser ? `
            ${isFrozen ? `
              <button class="btn btn-primary" style="padding: 6px 12px; font-size:0.82rem; background:#10b981; border-color:#10b981;" onclick="adminToggleFreezeUser('${s.username}', true, '${effectiveRole}', '${safeDisplayName}')" title="إلغاء التجميد وتنشيط الحساب">
                إلغاء التجميد (تنشيط)
              </button>
            ` : `
              <button class="btn btn-secondary" style="padding: 6px 12px; font-size:0.82rem; color:#d97706; border-color:rgba(217,119,6,0.4);" onclick="adminToggleFreezeUser('${s.username}', false, '${effectiveRole}', '${safeDisplayName}')" title="تجميد الحساب (تعطيل الدخول مع الاحتفاظ بالبيانات)">
                تجميد الحساب
              </button>
            `}
            <button class="btn btn-secondary" style="padding: 6px 12px; font-size:0.82rem; color:var(--danger); border-color:rgba(239,68,68,0.35);" onclick="adminPromptDeleteUser('${s.username}', '${safeDisplayName}')" title="حذف الحساب نهائياً">
              حذف نهائي
            </button>
          ` : ''}
        </div>
      </div>
    `;
  });
  return html;
}

function adminSetUserFilter(filterType) {
  state.adminUserFilterType = filterType;
  adminFilterUsersLive();
  // Update active state on buttons
  const buttons = document.querySelectorAll('.glass button[onclick^="adminSetUserFilter"]');
  buttons.forEach(b => {
    if (b.getAttribute('onclick').includes(`'${filterType}'`)) {
      b.className = 'btn btn-primary';
    } else {
      b.className = 'btn btn-secondary';
    }
  });
}

function adminFilterUsersLive() {
  const query = ($('adminUserSearchInput')?.value || '').trim().toLowerCase();
  const filterType = state.adminUserFilterType || 'all';
  const allUsers = state.cachedAdminUsers || [];

  const filtered = allUsers.filter(u => {
    const isFrozen = !!u.is_frozen || u.status === 'frozen' || String(u.role || '').toLowerCase().startsWith('frozen');
    const effectiveRole = isFrozen ? (u.originalRole || String(u.role || '').replace(/^frozen:?/i, '') || 'student') : (u.role || 'student');

    // Filter by type
    if (filterType === 'students' && (effectiveRole !== 'student' || isFrozen)) return false;
    if (filterType === 'frozen' && !isFrozen) return false;
    if (filterType === 'staff' && !['admin', 'manager', 'vip'].includes(effectiveRole)) return false;

    // Filter by search query
    if (query) {
      const nameMatch = (u.name || '').toLowerCase().includes(query);
      const userMatch = (u.username || '').toLowerCase().includes(query);
      const fullMatch = (u.full_name || '').toLowerCase().includes(query);
      if (!nameMatch && !userMatch && !fullMatch) return false;
    }
    return true;
  });

  const listContainer = $('studentsList');
  if (listContainer) {
    const isAdmin = state.user.role === 'admin';
    listContainer.innerHTML = adminBuildUserCardsHtml(filtered, isAdmin);
  }
}

async function adminToggleFreezeUser(username, isCurrentlyFrozen, role, displayName) {
  if (isCurrentlyFrozen) {
    const confirmed = confirm(`هل تريد تنشيط وإلغاء تجميد حساب (${displayName} - @${username})؟\n\nسيتمكن المستخدم من تسجيل الدخول للمنصة مرة أخرى بصورة طبيعية.`);
    if (!confirmed) return;

    showLoading();
    try {
      const res = await API.post('unfreezeUser', { username, role: role || 'student' });
      if (res && res.success) {
        showToast(`تم تنشيط وإلغاء تجميد حساب @${username} بنجاح`);
        await refreshAndRenderAdmin();
      } else {
        showToast(res?.message || 'فشل تنشيط الحساب', 'error');
      }
    } catch (e) {
      showToast('حدث خطأ أثناء تنشيط الحساب', 'error');
    }
    hideLoading();
  } else {
    const confirmed = confirm(`هل تريد تجميد حساب (${displayName} - @${username})؟\n\n- لن يتمكن المستخدم من تسجيل الدخول وستظهر له رسالة: "انتهت صلاحية هذا الحساب".\n- ستبقى كافة بيانات الطالب وسجلاته محفوظة بالكامل.`);
    if (!confirmed) return;

    showLoading();
    try {
      const res = await API.post('freezeUser', { username, originalRole: role || 'student' });
      if (res && res.success) {
        showToast(`تم تجميد حساب @${username} بنجاح. لن يتمكن من الدخول حتى يتم تنشيطه.`);
        await refreshAndRenderAdmin();
      } else {
        showToast(res?.message || 'فشل تجميد الحساب', 'error');
      }
    } catch (e) {
      showToast('حدث خطأ أثناء تجميد الحساب', 'error');
    }
    hideLoading();
  }
}

async function adminAddUser() {
  const name = $('newUserName')?.value?.trim();
  const full_name = $('newUserFull')?.value?.trim() || '';
  const username = $('newUserUsername')?.value?.trim();
  const password = $('newUserPassword')?.value;
  const role = $('newUserRole')?.value || 'student';

  if (!name || !username || !password) return showToast('يرجى ملء الحقول الأساسية (الاسم، اسم المستخدم، كلمة المرور)', 'error');
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return showToast('اسم المستخدم: حروف وأرقام إنجليزية فقط', 'error');

  showLoading();
  try {
    const res = await API.post('addUser', { name, full_name, username, password, role });
    if (res && res.success) {
      showToast('تمت إضافة المستخدم بنجاح في النظام وشيت جوجل');
      if ($('newUserName')) $('newUserName').value = '';
      if ($('newUserFull')) $('newUserFull').value = '';
      if ($('newUserUsername')) $('newUserUsername').value = '';
      if ($('newUserPassword')) $('newUserPassword').value = '';
      await refreshAndRenderAdmin();
    } else {
      showToast(res?.message || 'فشل إضافة المستخدم', 'error');
    }
  } catch(e) {
    showToast('حدث خطأ أثناء الاتصال بالخادم', 'error');
  }
  hideLoading();
}

async function adminPromptResetPassword(username, displayName) {
  const newPass = prompt(`أدخل كلمة المرور الجديدة للمستخدم (${displayName} - @${username}):`);
  if (!newPass || !newPass.trim()) return;
  if (newPass.trim().length < 4) return showToast('كلمة المرور يجب ألا تقل عن 4 خانات', 'error');

  showLoading();
  try {
    const res = await API.post('updateUser', {
      username: username,
      password: newPass.trim()
    });
    if (res && res.success) {
      showToast(`تم تغيير كلمة المرور للمستخدم @${username} بنجاح في شيت جوجل`);
    } else {
      showToast(res?.message || 'فشل تحديث كلمة المرور', 'error');
    }
  } catch(e) {
    showToast('حدث خطأ أثناء تحديث كلمة المرور', 'error');
  }
  hideLoading();
}

async function adminPromptDeleteUser(username, displayName) {
  if (!confirm(`هل أنت متأكد من رغبتك في حذف المستخدم (${displayName} - @${username}) نهائياً؟\n\nتنبيه: سيتم حذف الحساب بشكل دائم ومباشر من المنصة وقاعدة البيانات.`)) return;

  showLoading();
  try {
    const res = await API.post('deleteUser', { username });
    if (res && res.success) {
      showToast(`تم حذف المستخدم @${username} نهائياً بنجاح`);
      await refreshAndRenderAdmin();
    } else {
      showToast(res?.message || 'فشل حذف المستخدم من الخادم', 'error');
    }
  } catch(e) {
    showToast('حدث خطأ أثناء حذف المستخدم', 'error');
  }
  hideLoading();
}

// ==========================================
// QUIZ JSON EXPORT
// ==========================================
async function copyQuizJsonSource(quizId, materialId) {
  const mat = state.allMaterials.find(m => String(m.material_id) === String(materialId));
  const title = mat?.title || 'اختبار';

  let settings = {};
  if (mat?.content) {
    try { settings = JSON.parse(mat.content); } catch(e) {}
  }
  const timeLimit = settings.time_limit || 0;
  const isReview = settings.is_review_mode || false;

  showLoading();
  let questions = [];

  try {
    if (quizId) {
      if (state.questions[quizId] && state.questions[quizId].length) {
        questions = state.questions[quizId];
      } else {
        const res = await API.get('getQuestions', { quizId }, { forceFresh: true });
        if (res && res.success && Array.isArray(res.questions)) {
          questions = res.questions;
          state.questions[quizId] = questions;
        }
      }
    }

    if (!questions.length) {
      showToast('لا توجد أسئلة مسجلة في هذا الاختبار بعد', 'warning');
    }

    // Format clean questions array for export / import
    const cleanQuestions = questions.map((q, idx) => {
      let options = q.options;
      if (typeof options === 'string') {
        try { options = JSON.parse(options); } catch(e) {}
      }
      return {
        type: q.type || 'mcq',
        question_text: q.question_text || '',
        options: Array.isArray(options) ? options : (options ? [options] : []),
        correct_answer: q.correct_answer != null ? q.correct_answer : '',
        points: Number(q.points) || 1,
        order_index: idx,
        explanation: q.explanation || ''
      };
    });

    const fullExport = {
      title: title,
      quiz_id: quizId || '',
      material_id: materialId || '',
      time_limit: timeLimit,
      is_review_mode: isReview,
      questions_count: cleanQuestions.length,
      questions: cleanQuestions
    };

    const questionsJsonText = JSON.stringify(cleanQuestions, null, 2);
    const fullJsonText = JSON.stringify(fullExport, null, 2);

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(questionsJsonText);
      showToast('تم نسخ سورس كود JSON للأسئلة إلى الحافظة بنجاح! 📋');
    } catch (clipErr) {
      console.warn('Clipboard write failed, showing modal:', clipErr);
    }

    showQuizJsonModal(title, questionsJsonText, fullJsonText);
  } catch(err) {
    console.error('Error copying quiz JSON:', err);
    showToast('حدث خطأ أثناء نسخ كود الاختبار', 'error');
  } finally {
    hideLoading();
  }
}

function showQuizJsonModal(title, questionsJson, fullJson) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="glass modal-content" style="max-width: 650px; max-height: 90vh; display: flex; flex-direction: column;">
      <div class="flex justify-between items-center" style="margin-bottom: 16px;">
        <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">
          ${ICONS.copy} سورس كود JSON: ${title}
        </h3>
        <button class="btn btn-secondary" style="padding: 6px 10px;" onclick="this.closest('.modal-overlay').remove()">${ICONS.close}</button>
      </div>

      <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); color: #047857; padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; font-size: 0.9rem; display: flex; align-items: center; gap: 8px;">
        ${ICONS.check} تم نسخ كود مصفوفة الأسئلة تلقائياً إلى الحافظة! يمكنك لصقه مباشرة في أداة "استيراد اختبار" لإعادة إنشائه من الصفر.
      </div>

      <div style="margin-bottom: 12px; display: flex; gap: 8px;">
        <button id="tabQuestionsBtn" class="btn btn-primary" style="padding: 6px 14px; font-size: 0.85rem;" onclick="switchJsonTab('questions')">
          كود الأسئلة (المتوافق مع الاستيراد)
        </button>
        <button id="tabFullBtn" class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.85rem;" onclick="switchJsonTab('full')">
          حزمة الاختبار الكاملة
        </button>
      </div>

      <pre id="quizJsonCodeArea" style="direction: ltr; text-align: left; background: #1e1e1e; color: #4ec9b0; padding: 16px; border-radius: 10px; overflow: auto; max-height: 340px; font-family: monospace; font-size: 0.8rem; border: 1px solid #333; user-select: all; cursor: text; margin: 0 0 16px 0; white-space: pre-wrap; word-break: break-all;">${questionsJson.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>

      <div class="flex justify-between items-center" style="gap: 10px; flex-wrap: wrap;">
        <div class="flex gap-2">
          <button class="btn btn-primary" style="font-size: 0.85rem;" onclick="navigator.clipboard.writeText(window.__CURRENT_QUIZ_JSON__).then(() => showToast('تم النسخ إلى الحافظة! 📋'))">
            ${ICONS.copy} نسخ الكود المعروض
          </button>
          <button class="btn btn-secondary" style="font-size: 0.85rem;" onclick="downloadJsonFile('${title.replace(/'/g, '')}.json', window.__CURRENT_QUIZ_JSON__)">
            ${ICONS.download} تحميل ملف JSON
          </button>
        </div>
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
      </div>
    </div>
  `;

  window.__CURRENT_QUIZ_JSON__ = questionsJson;
  window.switchJsonTab = function(type) {
    const codeArea = $('quizJsonCodeArea');
    const tabQ = $('tabQuestionsBtn');
    const tabF = $('tabFullBtn');
    if (!codeArea) return;

    if (type === 'questions') {
      window.__CURRENT_QUIZ_JSON__ = questionsJson;
      codeArea.textContent = questionsJson;
      tabQ?.classList.remove('btn-secondary');
      tabQ?.classList.add('btn-primary');
      tabF?.classList.remove('btn-primary');
      tabF?.classList.add('btn-secondary');
    } else {
      window.__CURRENT_QUIZ_JSON__ = fullJson;
      codeArea.textContent = fullJson;
      tabF?.classList.remove('btn-secondary');
      tabF?.classList.add('btn-primary');
      tabQ?.classList.remove('btn-primary');
      tabQ?.classList.add('btn-secondary');
    }
  };

  window.downloadJsonFile = function(filename, content) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('تم تحميل الملف بنجاح!');
  };

  document.body.appendChild(modal);
}

// ==========================================
// STUDENT DETAILS & HISTORY
// ==========================================
async function viewStudentDetails(username) {
  showLoading();
  let details;
  try {
    if (MOCK_MODE) {
      details = {
        username,
        progress: { completed_lessons: ['l1'], completed_materials: ['m1'], completed_lesson_details: [{ lesson_id: 'l1', lesson_name: 'المتغيرات والأنواع', unit_name: 'مقدمة في البرمجة', completed_at: new Date().toISOString() }] },
        attempts: [
          { quiz_id: 'quiz1', material_id: 'm2', score: 8, max_score: 10, is_graded: true, attempt_date: new Date().toISOString() },
          { quiz_id: 'quiz2', material_id: 'm3', score: 0, max_score: 5, is_graded: false, attempt_date: new Date().toISOString() }
        ]
      };
    } else {
      const res = await API.get('getStudentDetails', { username }, { forceFresh: true });
      details = res;
    }
  } catch (err) {
    console.error('Error fetching student details:', err);
    hideLoading();
    showToast('حدث خطأ أثناء تحميل سجل الطالب', 'error');
    return;
  }
  hideLoading();

  // Find student in local users/students list for proper full name
  const studentUser = (state.students || []).find(s => String(s.username || '').toLowerCase() === String(username).toLowerCase());
  const displayName = studentUser?.full_name || studentUser?.name || details?.username || username;

  // Build lookups
  const matTitleById = {};
  state.allMaterials.forEach(m => { matTitleById[m.material_id] = m.title; });

  const titleByQuizId = {};
  Object.entries(state.quizzes).forEach(([matId, quiz]) => {
    titleByQuizId[quiz.quiz_id] = matTitleById[matId] || quiz.title || 'اختبار';
  });

  // Build lesson dictionary: lesson_id -> { lesson_name, lesson_number, unit_name }
  const lessonLookup = {};
  const allLessonsList = [];
  state.units.forEach(u => {
    const unitLessons = state.lessons[u.unit_id] || [];
    unitLessons.forEach(l => {
      const info = {
        lesson_id: l.lesson_id,
        lesson_name: l.lesson_name,
        lesson_number: l.lesson_number,
        unit_name: u.unit_name
      };
      lessonLookup[l.lesson_id] = info;
      allLessonsList.push(info);
    });
  });
  // Standalone lessons
  (state.lessons[''] || []).forEach(l => {
    const info = {
      lesson_id: l.lesson_id,
      lesson_name: l.lesson_name,
      lesson_number: l.lesson_number,
      unit_name: 'درس مستقل'
    };
    lessonLookup[l.lesson_id] = info;
    allLessonsList.push(info);
  });

  const completedLessonIds = Array.isArray(details?.progress?.completed_lessons) ? details.progress.completed_lessons : [];
  const completedMaterialIds = Array.isArray(details?.progress?.completed_materials) ? details.progress.completed_materials : [];
  const completedLessonDetails = Array.isArray(details?.progress?.completed_lesson_details) ? details.progress.completed_lesson_details : [];
  const attempts = Array.isArray(details?.attempts) ? details.attempts : [];

  // Calculate Average Quiz Score
  const gradedAttempts = attempts.filter(a => a.is_graded && Number(a.max_score) > 0);
  const avgScore = gradedAttempts.length
    ? Math.round(gradedAttempts.reduce((acc, a) => acc + (Number(a.score) / Number(a.max_score)) * 100, 0) / gradedAttempts.length)
    : null;

  function scoreColor(score, max) {
    if (!max) return 'var(--text-muted)';
    const pct = score / max;
    if (pct >= 0.7) return 'var(--success)';
    if (pct >= 0.5) return 'var(--warning)';
    return 'var(--danger)';
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="glass modal-content" style="max-width: 640px; max-height: 90vh; overflow-y: auto;">
      <div class="flex justify-between items-center" style="margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 14px;">
        <div>
          <h2 style="margin: 0; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">${displayName}</h2>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px; display: flex; align-items: center; gap: 8px;">
            <span>@${details.username}</span>
            <span>•</span>
            <span style="color: var(--success); font-weight: 600;">طالب مسجل</span>
          </div>
        </div>
        <button class="btn btn-secondary" style="padding: 8px 12px;" onclick="this.closest('.modal-overlay').remove()">${ICONS.close}</button>
      </div>

      <!-- Stats Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 24px;">
        <div class="glass" style="padding: 14px; text-align: center; border-radius: 12px; background: rgba(99,102,241,0.04); border: 1px solid rgba(99,102,241,0.15);">
          <div style="font-size: 1.8rem; font-weight: 800; color: var(--primary);">${completedLessonIds.length}</div>
          <div style="color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">دروس مكتملة</div>
        </div>
        <div class="glass" style="padding: 14px; text-align: center; border-radius: 12px; background: rgba(236,72,153,0.04); border: 1px solid rgba(236,72,153,0.15);">
          <div style="font-size: 1.8rem; font-weight: 800; color: var(--secondary);">${completedMaterialIds.length}</div>
          <div style="color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">محتويات مكتملة</div>
        </div>
        <div class="glass" style="padding: 14px; text-align: center; border-radius: 12px; background: rgba(16,185,129,0.04); border: 1px solid rgba(16,185,129,0.15);">
          <div style="font-size: 1.8rem; font-weight: 800; color: var(--success);">${attempts.length}</div>
          <div style="color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">اختبارات مُجابة</div>
        </div>
        <div class="glass" style="padding: 14px; text-align: center; border-radius: 12px; background: rgba(245,158,11,0.04); border: 1px solid rgba(245,158,11,0.15);">
          <div style="font-size: 1.8rem; font-weight: 800; color: #d97706;">${avgScore !== null ? `${avgScore}%` : '—'}</div>
          <div style="color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">متوسط الدرجات</div>
        </div>
      </div>

      <!-- Section: Completed Lessons Log -->
      <div style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
          <span style="display: flex; align-items: center; gap: 8px;">${ICONS.document} سجل إتمام الدروس (${completedLessonIds.length})</span>
        </h3>
        ${completedLessonIds.length === 0
          ? '<div style="padding: 16px; background: rgba(0,0,0,0.02); border-radius: 10px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">لم يقم الطالب بتسجيل إتمام أي دروس بعد.</div>'
          : `
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${completedLessonIds.map(lId => {
                const info = lessonLookup[lId];
                const detail = completedLessonDetails.find(d => d.lesson_id === lId);
                const lessonTitle = info?.lesson_name || detail?.lesson_name || `درس #${lId}`;
                const unitTitle = info?.unit_name || detail?.unit_name || 'درس';
                const dateStr = detail?.completed_at ? formatDate(detail.completed_at) : 'مكتمل';

                return `
                  <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(16,185,129,0.04); border: 1px solid rgba(16,185,129,0.15); border-radius: 10px;">
                    <div>
                      <div style="font-weight: 700; color: var(--text);">${lessonTitle}</div>
                      <div style="font-size: 0.8rem; color: var(--text-muted);">${unitTitle} • ${dateStr}</div>
                    </div>
                    <span style="color: var(--success); font-weight: 700; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 4px;">
                      ${ICONS.check} مكتمل
                    </span>
                  </div>
                `;
              }).join('')}
            </div>
          `}
      </div>

      <!-- Section: Completed Materials -->
      <div style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <span>${ICONS.file} المحتويات المشاهدة (${completedMaterialIds.length})</span>
        </h3>
        ${completedMaterialIds.length === 0
          ? '<div style="padding: 16px; background: rgba(0,0,0,0.02); border-radius: 10px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">لا توجد محتويات محددة كمشاهدة بعد.</div>'
          : `
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${completedMaterialIds.map(mId => {
                const title = matTitleById[mId] || `محتوى #${mId}`;
                return `
                  <span style="padding: 6px 12px; background: rgba(99,102,241,0.08); border-radius: 8px; font-size: 0.82rem; font-weight: 600; color: var(--primary); display: inline-flex; align-items: center; gap: 4px;">
                    ${ICONS.check} ${title}
                  </span>
                `;
              }).join('')}
            </div>
          `}
      </div>

      <!-- Section: Quizzes History -->
      <div>
        <h3 style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <span>${ICONS.quiz} سجل الاختبارات (${attempts.length})</span>
        </h3>
        ${attempts.length === 0
          ? '<div style="padding: 16px; background: rgba(0,0,0,0.02); border-radius: 10px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">لا توجد محاولات اختبارات مسجلة لهذا الطالب بعد.</div>'
          : attempts.map(att => {
              const title = titleByQuizId[att.quiz_id] || matTitleById[att.material_id] || 'اختبار';
              const color = att.is_graded ? scoreColor(att.score, att.max_score) : 'var(--warning)';
              const pct = att.is_graded && att.max_score ? Math.round((att.score / att.max_score) * 100) : null;
              return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(0,0,0,0.02); border-radius: 10px; margin-bottom: 8px; border: 1px solid var(--border);">
                  <div>
                    <div style="font-weight: 700; margin-bottom: 2px;">${title}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">${formatDate(att.attempt_date)}</div>
                  </div>
                  <div style="text-align: center;">
                    <div style="font-size: 1.2rem; font-weight: 800; color: ${color};">
                      ${att.is_graded ? `${att.score}/${att.max_score}` : 'معلق'}
                    </div>
                    ${pct !== null ? `<div style="font-size: 0.75rem; color: ${color}; font-weight: 700;">${pct}%</div>` : ''}
                  </div>
                </div>`;
            }).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// ==========================================
// GRADING
// ==========================================
async function renderAdminGrading(container) {
  container.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;">جاري تحميل الإجابات المقالية بانتظار التصحيح...</div>';

  try {
    let attempts = [];
    let usersList = state.cachedAdminUsers || state.students || [];

    if (!MOCK_MODE) {
      const [attRes, usersRes] = await Promise.all([
        API.get('getQuizAttempts', { username: '', quizId: '' }, { forceFresh: true }),
        usersList.length ? Promise.resolve({ success: true, users: usersList }) : API.get('getAllUsers').catch(() => ({ success: false }))
      ]);

      if (usersRes && usersRes.success && Array.isArray(usersRes.users)) {
        usersList = usersRes.users;
        state.cachedAdminUsers = usersList;
      }

      if (attRes && attRes.success && Array.isArray(attRes.attempts)) {
        attempts = attRes.attempts.filter(a => {
          if (!a || a.is_graded) return false;
          let ansList = a.answers;
          if (typeof ansList === 'string') {
            try { ansList = JSON.parse(ansList); } catch { ansList = []; }
          }
          if (!Array.isArray(ansList)) ansList = [];
          a.answers = ansList;
          // Show any attempt marked !is_graded (whether essay answers are answered or left blank)
          return true;
        });
      }
    }

    // Build student name lookup
    const userByUsername = {};
    (usersList || []).forEach(u => {
      if (u && u.username) {
        userByUsername[String(u.username).trim().toLowerCase()] = u.full_name || u.name || u.username;
      }
    });

    // Build quiz title lookup
    const matTitleById = {};
    (state.allMaterials || []).forEach(m => {
      if (m && m.material_id) matTitleById[String(m.material_id)] = m.title;
    });
    const quizTitleByQuizId = {};
    Object.entries(state.quizzes || {}).forEach(([matId, qz]) => {
      if (qz && qz.quiz_id) {
        quizTitleByQuizId[String(qz.quiz_id)] = matTitleById[String(matId)] || qz.title || 'اختبار';
      }
    });

    // Fetch questions for all unique quizIds present in ungraded attempts
    const uniqueQuizIds = [...new Set(attempts.map(a => String(a.quiz_id || '')).filter(Boolean))];
    const questionsByQuizId = {};
    if (!MOCK_MODE && uniqueQuizIds.length > 0) {
      await Promise.all(uniqueQuizIds.map(async qid => {
        try {
          const qRes = await API.get('getQuestions', { quizId: qid });
          if (qRes && qRes.success && Array.isArray(qRes.questions)) {
            questionsByQuizId[qid] = qRes.questions;
          }
        } catch (e) {
          console.warn('Could not load questions for quiz:', qid, e);
        }
      }));
    }

    if (!attempts.length) {
      container.innerHTML = `
        <h2 style="margin-bottom: 24px; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">بانتظار التصحيح</h2>
        <div class="glass text-center" style="padding: 48px 24px;">
          <p style="font-size: 1.05rem; color: var(--text-muted); margin: 0;">لا توجد إجابات مقالية معلقة بانتظار التصحيح حالياً. عمل رائع!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 24px;">
        <h2 style="margin: 0; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">
          إجابات مقالية بانتظار التصحيح (${attempts.length})
        </h2>
      </div>
      ${attempts.map(att => {
        const uKey = String(att.username || '').trim().toLowerCase();
        const studentName = userByUsername[uKey] || att.username || 'طالب';
        const quizTitle = quizTitleByQuizId[String(att.quiz_id)] || matTitleById[String(att.material_id)] || 'اختبار';
        const quizQuestions = questionsByQuizId[String(att.quiz_id)] || [];
        const qById = {};
        quizQuestions.forEach(q => {
          if (q && q.question_id != null) qById[String(q.question_id)] = q;
        });

        const safeAnswers = Array.isArray(att.answers) ? att.answers : [];
        // Collect essay items from both the quiz questions and the student's submitted answers
        const essayItems = [];
        const seenQuestionIds = new Set();

        safeAnswers.forEach((ans, idx) => {
          if (!ans || typeof ans !== 'object') return;
          const qObj = (ans.question_id != null && qById[String(ans.question_id)]) || quizQuestions[idx] || null;
          if (ans.type === 'essay' || (qObj && qObj.type === 'essay')) {
            if (ans.question_id != null) seenQuestionIds.add(String(ans.question_id));
            essayItems.push({
              question_id: ans.question_id || qObj?.question_id || `idx_${idx}`,
              question_text: qObj?.question_text || `سؤال مقالي رقم ${essayItems.length + 1}`,
              points: Number(qObj?.points) || 1,
              explanation: qObj?.explanation || qObj?.correct_answer || '',
              student_answer: ans.answer
            });
          }
        });

        // Also include any essay questions from the quiz that the student left completely unanswered (null slot)
        quizQuestions.forEach((qObj, idx) => {
          if (qObj && qObj.type === 'essay' && !seenQuestionIds.has(String(qObj.question_id))) {
            const rawSlot = safeAnswers[idx];
            essayItems.push({
              question_id: qObj.question_id,
              question_text: qObj.question_text || `سؤال مقالي رقم ${essayItems.length + 1}`,
              points: Number(qObj.points) || 1,
              explanation: qObj.explanation || qObj.correct_answer || '',
              student_answer: (rawSlot && typeof rawSlot === 'object') ? rawSlot.answer : ''
            });
          }
        });

        const autoObjectiveScore = Number(att.score) || 0;
        const maxQuizScore = Number(att.max_score) || 0;
        const totalEssayMaxPoints = essayItems.reduce((sum, item) => sum + (Number(item.points) || 1), 0);

        return `
          <div class="glass" style="padding: 24px; margin-bottom: 20px; border-radius: 16px;">
            <!-- Header: Student & Quiz Info -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; padding-bottom: 16px; margin-bottom: 18px; border-bottom: 1px solid var(--border);">
              <div>
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                  <h3 style="margin: 0; font-size: 1.15rem;">${studentName}</h3>
                  <span style="font-size: 0.84rem; color: var(--text-muted); direction: ltr;">@${att.username}</span>
                </div>
                <div style="font-size: 0.9rem; color: var(--primary); font-weight: 700; margin-top: 4px;">
                  ${quizTitle}
                  <span style="color: var(--text-muted); font-weight: 400; font-size: 0.82rem;"> · ${formatDate(att.attempt_date)}</span>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <div style="background: rgba(99, 102, 241, 0.07); border: 1px solid rgba(99, 102, 241, 0.2); padding: 8px 14px; border-radius: 10px; font-size: 0.85rem; font-variant-numeric: tabular-nums;">
                  <span style="color: var(--text-muted);">درجة الأسئلة الموضوعية (تلقائي): </span>
                  <strong style="color: var(--primary); font-size: 1rem;">${autoObjectiveScore}</strong>
                  <span style="color: var(--text-muted);"> / الدرجة الكلية للاختبار: ${maxQuizScore}</span>
                </div>
                <span style="color: #d97706; background: rgba(245, 158, 11, 0.12); padding: 6px 12px; border-radius: 8px; font-size: 0.82rem; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
                  ${ICONS.clock} بانتظار التقييم
                </span>
              </div>
            </div>

            <!-- Essay Questions List -->
            <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 20px;">
              ${essayItems.length ? essayItems.map((item, idx) => {
                const hasText = item.student_answer !== null && item.student_answer !== undefined && String(item.student_answer).trim() !== '';
                return `
                  <div style="padding: 18px; background: rgba(0, 0, 0, 0.02); border: 1px solid var(--border); border-radius: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 10px;">
                      <div style="font-weight: 700; font-size: 0.98rem; line-height: 1.5; flex: 1;">
                        <span style="color: var(--primary);">سؤال مقالي ${idx + 1}:</span> ${item.question_text}
                      </div>
                      <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; font-variant-numeric: tabular-nums;">
                        <label style="font-size: 0.82rem; color: var(--text-muted); font-weight: 600;">درجة السؤال (من ${item.points}):</label>
                        <input
                          type="number"
                          min="0"
                          max="${item.points}"
                          step="0.5"
                          placeholder="0 - ${item.points}"
                          class="essay-part-score-${att.attempt_id}"
                          oninput="recalculateAttemptTotalGrade('${att.attempt_id}', ${autoObjectiveScore}, ${maxQuizScore})"
                          style="width: 85px; padding: 6px 10px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 700; text-align: center;"
                        >
                      </div>
                    </div>

                    <div style="padding: 12px 14px; background: var(--bg-card, #fff); border: 1px solid rgba(0,0,0,0.06); border-radius: 10px; margin-bottom: ${item.explanation ? '10px' : '0'};">
                      <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 4px; font-weight: 600;">إجابة الطالب:</div>
                      <div style="font-size: 0.95rem; line-height: 1.65; white-space: pre-line; color: ${hasText ? 'var(--text-primary)' : 'var(--danger)'};">
                        ${hasText ? item.student_answer : '(لم يقم الطالب بكتابة إجابة لهذا السؤال)'}
                      </div>
                    </div>

                    ${item.explanation ? `
                      <div style="padding: 10px 14px; background: rgba(16, 185, 129, 0.06); border: 1px solid rgba(16, 185, 129, 0.22); border-radius: 8px; font-size: 0.84rem; color: var(--text-secondary);">
                        <strong style="color: #059669;">الإجابة النموذجية / معيار التصحيح:</strong> ${item.explanation}
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('') : `
                <div style="padding: 16px; background: rgba(0,0,0,0.02); border-radius: 10px; color: var(--text-muted);">
                  هذه المحاولة مسجلة كغير مصححة (الدرجة الحالية: ${autoObjectiveScore} من ${maxQuizScore}). يمكنك اعتماد الدرجة النهائية بالأسفل.
                </div>
              `}
            </div>

            <!-- Final Score & Feedback Controls -->
            <div style="padding-top: 16px; border-top: 1px solid var(--border); display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; align-items: end;">
              <div class="input-group" style="margin: 0;">
                <label style="font-size: 0.85rem; font-weight: 700;">
                  الدرجة النهائية الكلية للاختبار (من ${maxQuizScore})
                  ${totalEssayMaxPoints > 0 ? `<span style="font-weight: 400; color: var(--text-muted);"> — تشمل ${autoObjectiveScore} موضوعي + درجة المقالي</span>` : ''}
                </label>
                <input
                  type="number"
                  min="0"
                  max="${maxQuizScore || 1000}"
                  step="0.5"
                  value="${autoObjectiveScore}"
                  id="grade-${att.attempt_id}"
                  style="padding: 10px 14px; border-radius: 10px; border: 2px solid var(--primary); font-weight: 800; font-size: 1.05rem; font-variant-numeric: tabular-nums;"
                >
              </div>

              <div class="input-group" style="margin: 0;">
                <label style="font-size: 0.85rem; font-weight: 700;">ملاحظات وتعليق المعلم للطالب (اختياري)</label>
                <input
                  type="text"
                  id="feedback-${att.attempt_id}"
                  placeholder="مثال: إجابة ممتازة، يرجى التركيز على النقطة الثانية..."
                  style="padding: 10px 14px; border-radius: 10px; border: 1.5px solid var(--border); font-size: 0.92rem;"
                >
              </div>

              <div style="display: flex; justify-content: flex-end;">
                <button type="button" class="btn btn-primary" style="width: 100%; padding: 11px 20px; background: var(--success); border-color: var(--success); font-weight: 700;" onclick="submitGrade('${att.attempt_id}')">
                  ${ICONS.check} اعتماد وتسليم الدرجة النهائية
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    `;
  } catch (err) {
    console.error('Error rendering grading section:', err);
    container.innerHTML = `
      <h2 style="margin-bottom: 24px; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">بانتظار التصحيح</h2>
      <div class="glass text-center" style="padding: 40px; color: var(--danger);">
        حدث خطأ أثناء تحميل الإجابات المعلقة. يرجى تحديث الصفحة والمحاولة مرة أخرى.
      </div>
    `;
  }
}

function recalculateAttemptTotalGrade(attemptId, autoObjectiveScore, maxQuizScore) {
  const inputs = document.querySelectorAll(`.essay-part-score-${attemptId}`);
  let essaySum = 0;
  inputs.forEach(inp => {
    const val = parseFloat(inp.value);
    if (!isNaN(val) && val >= 0) {
      essaySum += val;
    }
  });
  const totalInput = $(`grade-${attemptId}`);
  if (totalInput) {
    const computed = Number(autoObjectiveScore || 0) + essaySum;
    totalInput.value = maxQuizScore > 0 ? Math.min(maxQuizScore, computed) : computed;
  }
}

async function submitGrade(attemptId) {
  const scoreVal = $(`grade-${attemptId}`)?.value;
  const feedbackVal = $(`feedback-${attemptId}`)?.value?.trim() || '';

  if (scoreVal === '' || scoreVal === null || scoreVal === undefined || isNaN(parseFloat(scoreVal))) {
    showToast('يرجى إدخال الدرجة النهائية', 'error');
    return;
  }

  showLoading();
  try {
    if (!MOCK_MODE) {
      await API.post('gradeEssay', {
        attempt_id: attemptId,
        score: parseFloat(scoreVal),
        graded_by: state.user?.name || state.user?.username || 'admin',
        feedback: feedbackVal
      });
    }

    showToast('تم اعتماد وتسليم الدرجة للطالب بنجاح!');
    await refreshAndRenderAdmin();
  } catch (err) {
    console.error('Error submitting grade:', err);
    showToast('حدث خطأ أثناء حفظ الدرجة', 'error');
  } finally {
    hideLoading();
  }
}

// ==========================================
// DRAG AND DROP (reorder materials)
// ==========================================
function setupDragAndDrop() {
  const list = $('sortableMaterials');
  if (!list) return;

  let draggedItem = null;

  list.querySelectorAll('.sortable-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedItem = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedItem = null;
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (item === draggedItem) return;
      const rect = item.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        list.insertBefore(draggedItem, item);
      } else {
        list.insertBefore(draggedItem, item.nextSibling);
      }
    });
  });
}

async function saveMaterialOrder() {
  const items = document.querySelectorAll('.sortable-item');
  const materials = Array.from(items).map((item, index) => ({
    material_id: item.dataset.id,
    order_index: index
  }));

  if (!MOCK_MODE) {
    await API.post('updateMaterialOrder', { materials });
  }

  showToast('تم حفظ ترتيب المحتويات!');
}

async function toggleQuizQuestions(quizId) {
  const container = $(`quiz-questions-${quizId}`);
  if (container.style.display === 'block') {
    container.style.display = 'none';
    return;
  }
  container.innerHTML = '<div class="loading-text">جاري تحميل الأسئلة...</div>';
  container.style.display = 'block';

  let questions = [];
  if (!MOCK_MODE) {
    const res = await API.get('getQuestions', { quizId });
    if (res.success) questions = res.questions;
  }

  if (!questions.length) {
    container.innerHTML = '<p style="color: var(--text-muted);">لا توجد أسئلة في هذا الاختبار.</p>';
    return;
  }

  container.innerHTML = questions.map((q, i) => `
    <div class="flex justify-between items-center" style="padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.04);">
      <div>
        <strong>${i+1}. ${q.type === 'mcq' ? 'خيارات' : q.type === 'true_false' ? 'صح/خطأ' : q.type === 'essay' ? 'مقالي' : 'توصيل'}</strong>: ${q.question_text.substring(0, 50)}...
      </div>
      <div class="flex gap-2">
        <button class="btn btn-secondary" style="padding: 6px; font-size: 0.8rem;" onclick='showModal("editQuestion", ${JSON.stringify(q).replace(/'/g, "&#39;")})' title="تعديل">${ICONS.edit}</button>
        <button class="btn btn-secondary" style="padding: 6px; font-size: 0.8rem; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'question', id: '${q.question_id}', name: 'السؤال ${i+1}'})" title="حذف">${ICONS.trash}</button>
      </div>
    </div>
  `).join('');
}
