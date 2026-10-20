// ============================================
// student.js — Data loading, dashboard render,
//              unit/lesson navigation
// Depends on: api.js, state.js, utils.js, router.js
// ============================================

// ==========================================
// DATA LOADING & CACHING
// ==========================================

const CURRICULUM_CACHE_KEY = 'iqt_curriculum_cache';

/**
 * Persists current curriculum snapshot to localStorage for instantaneous loads
 */
function saveCurriculumToLocal() {
  try {
    const payload = {
      units: state.units,
      lessons: state.lessons,
      materials: state.materials,
      quizzes: state.quizzes,
      allMaterials: state.allMaterials,
      progress: state.progress,
      announcement: state.announcement,
      notifications: state.notifications,
      savedAt: Date.now()
    };
    localStorage.setItem(CURRICULUM_CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Failed to save curriculum to localStorage', e);
  }
}

/**
 * Restores curriculum from localStorage immediately on startup
 */
function restoreCurriculumFromLocal() {
  try {
    const raw = localStorage.getItem(CURRICULUM_CACHE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.units) || data.units.length === 0) return false;

    state.units = data.units || [];
    state.lessons = data.lessons || {};
    state.materials = data.materials || {};
    state.quizzes = data.quizzes || {};
    state.allMaterials = data.allMaterials || [];
    if (data.announcement !== undefined) {
      state.announcement = data.announcement;
    }
    if (Array.isArray(data.notifications)) {
      state.notifications = data.notifications;
    }
    if (data.progress && (!state.user || !data.progress.username || data.progress.username.toLowerCase() === (state.user?.username || '').toLowerCase())) {
      state.progress = data.progress;
    }
    syncReadNotificationsState();
    renderNavbarNotifications();
    return true;
  } catch (e) {
    console.warn('Failed to restore curriculum from localStorage', e);
    return false;
  }
}

/**
 * Re-fetches fresh data from the server.
 * Instead of wiping state before the request (which causes UI flicker),
 * it fetches fresh data in the background and swaps state seamlessly.
 */
async function refreshAllData() {
  API.clearCache();
  await loadStudentData(true);
}

/**
 * Loads all units → lessons → materials using single batch query if supported,
 * or fast parallel requests as fallback.
 * Also builds state.allMaterials for admin / profile lookups.
 */
async function loadStudentData(forceFresh = false) {
  if (MOCK_MODE) {
    state.units = [
      { unit_id: 'u1', unit_number: 1, unit_name: 'مقدمة في البرمجة' },
      { unit_id: 'u2', unit_number: 2, unit_name: 'هياكل البيانات' }
    ];
    state.lessons['u1'] = [
      { lesson_id: 'l1', unit_id: 'u1', lesson_number: 1, lesson_name: 'المتغيرات والأنواع' },
      { lesson_id: 'l2', unit_id: 'u1', lesson_number: 2, lesson_name: 'التدفقات المنطقية' },
      { lesson_id: 'l3', unit_id: 'u1', lesson_number: 3, lesson_name: 'الدوال' }
    ];
    state.materials['l1'] = [
      { material_id: 'm1', lesson_id: 'l1', title: 'شرائح العرض', type: 'pdf', content: 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs78OgVE2upms/preview', order_index: 0 },
      { material_id: 'm2', lesson_id: 'l1', title: 'اختبار 1', type: 'quiz', content: '', order_index: 1 }
    ];
    state.quizzes['m2'] = { quiz_id: 'quiz1', material_id: 'm2', title: 'اختبار 1' };
    state.progress = {
      username: state.user?.username,
      current_unit_id: 'u1',
      current_lesson_id: 'l2',
      completed_lessons: ['l1'],
      completed_materials: ['m1', 'm2']
    };
    state.allMaterials = [
      { material_id: 'm1', lesson_id: 'l1', title: 'شرائح العرض', type: 'pdf' },
      { material_id: 'm2', lesson_id: 'l1', title: 'اختبار 1',    type: 'quiz' }
    ];
    return;
  }

  try {
    const username = state.user?.username || '';
    
    // 1. FAST SINGLE-BATCH ATTEMPT
    // Retrieves units, lessons, materials, quizzes, and progress in 1 single HTTP call
    const initialRes = await API.get('getInitialData', { username }, { forceFresh });
    if (initialRes && initialRes.success && Array.isArray(initialRes.units)) {
      state.units = (initialRes.units || []).map(u => ({ ...u, unit_id: String(u.unit_id) }));
      state.allMaterials = (initialRes.materials || []).map(m => ({
        ...m,
        material_id: String(m.material_id != null ? m.material_id : ''),
        lesson_id: String(m.lesson_id != null ? m.lesson_id : '')
      }));

      // Group lessons by unit_id
      state.lessons = {};
      (initialRes.lessons || []).forEach(l => {
        const uid = String(l.unit_id != null ? l.unit_id : '');
        if (!state.lessons[uid]) state.lessons[uid] = [];
        state.lessons[uid].push({
          ...l,
          lesson_id: String(l.lesson_id != null ? l.lesson_id : ''),
          unit_id: uid
        });
      });

      // Map quizzes
      state.quizzes = {};
      (initialRes.quizzes || []).forEach(q => {
        const matId = String(q.material_id != null ? q.material_id : '');
        state.quizzes[matId] = {
          ...q,
          quiz_id: String(q.quiz_id),
          material_id: matId
        };
      });

      if (initialRes.announcement !== undefined) {
        state.announcement = initialRes.announcement;
      }

      if (Array.isArray(initialRes.notifications)) {
        state.notifications = initialRes.notifications;
      }

      if (initialRes.progress) {
        state.progress = initialRes.progress;
      } else if (state.user && state.user.role === 'student') {
        state.progress = {
          username: state.user.username,
          completed_lessons: [],
          completed_materials: [],
          completed_lesson_details: [],
          read_notifications: []
        };
      }

      groupMaterials();
      syncReadNotificationsState();
      renderNavbarNotifications();
      saveCurriculumToLocal();
      return;
    }

    // 2. PARALLEL FALLBACK (for backward compatibility with older GAS deployments)
    const [unitsRes, progressRes, allMaterialsRes, notifsRes] = await Promise.all([
      API.get('getUnits', {}, { forceFresh }),
      state.user?.role !== 'admin' && username
        ? API.get('getStudentProgress', { username }, { forceFresh })
        : Promise.resolve({ success: false }),
      API.get('getAllMaterials', {}, { forceFresh }),
      API.get('getNotifications', {}, { forceFresh }).catch(() => ({ success: false }))
    ]);

    if (unitsRes && unitsRes.success) {
      state.units = (unitsRes.units || []).map(u => ({ ...u, unit_id: String(u.unit_id) }));
    }
    if (progressRes && progressRes.success) {
      state.progress = progressRes.progress;
    }
    if (notifsRes && notifsRes.success && Array.isArray(notifsRes.notifications)) {
      state.notifications = notifsRes.notifications;
    }

    if (allMaterialsRes && allMaterialsRes.success) {
      state.allMaterials = (allMaterialsRes.materials || []).map(m => ({
        ...m,
        material_id: String(m.material_id != null ? m.material_id : ''),
        lesson_id: String(m.lesson_id != null ? m.lesson_id : '')
      }));
    } else {
      state.allMaterials = [];
    }

    // Fetch lessons in parallel for all units + standalone
    const lessonPromises = state.units.map(unit => API.get('getLessons', { unitId: unit.unit_id }, { forceFresh }));
    lessonPromises.push(API.get('getLessons', { unitId: '' }, { forceFresh }));
    
    const lessonResults = await Promise.all(lessonPromises);
    state.lessons = {};
    lessonResults.forEach((res, i) => {
      if (res && res.success) {
        const normalizedLessons = (res.lessons || []).map(l => ({
          ...l,
          lesson_id: String(l.lesson_id != null ? l.lesson_id : ''),
          unit_id: String(l.unit_id != null ? l.unit_id : '')
        }));
        if (i < state.units.length) {
          state.lessons[state.units[i].unit_id] = normalizedLessons;
        } else {
          state.lessons[''] = normalizedLessons; // standalone lessons
        }
      }
    });

    // Populate materials grouped by lesson_id
    groupMaterials();
    syncReadNotificationsState();
    renderNavbarNotifications();
    saveCurriculumToLocal();

  } catch(err) {
    console.error('خطأ في تحميل البيانات:', err);
  }
}

function groupMaterials() {
  state.materials = {};
  (state.allMaterials || []).forEach(m => {
    m.material_id = String(m.material_id != null ? m.material_id : '');
    m.lesson_id = String(m.lesson_id != null ? m.lesson_id : '');
    const lid = m.lesson_id;
    if (!state.materials[lid]) state.materials[lid] = [];
    state.materials[lid].push(m);
  });

  // Sort materials within each lesson_id by order_index
  for (const lid in state.materials) {
    state.materials[lid].sort((a,b) => (a.order_index || 0) - (b.order_index || 0));
  }
}

function dismissStudentAnnouncement() {
  if (state.announcement) {
    state.dismissedAnnouncementTime = state.announcement.updated_at || 'dismissed';
  }
  const bannerEl = $('studentAnnouncementBanner');
  if (bannerEl) bannerEl.innerHTML = '';
}

function renderStudentAnnouncementBanner() {
  const bannerEl = $('studentAnnouncementBanner');
  if (!bannerEl) return;

  const ann = state.announcement;
  if (!ann || !ann.is_active || (!ann.title && !ann.message)) {
    bannerEl.innerHTML = '';
    return;
  }

  if (state.dismissedAnnouncementTime && state.dismissedAnnouncementTime === (ann.updated_at || 'dismissed')) {
    bannerEl.innerHTML = '';
    return;
  }

  const typeStyles = {
    info: {
      bg: 'rgba(99, 102, 241, 0.08)',
      border: 'rgba(99, 102, 241, 0.28)',
      color: 'var(--primary)',
      label: 'تنبيه عام'
    },
    warning: {
      bg: 'rgba(245, 158, 11, 0.09)',
      border: 'rgba(245, 158, 11, 0.35)',
      color: '#d97706',
      label: 'تنبيه هام'
    },
    success: {
      bg: 'rgba(16, 185, 129, 0.08)',
      border: 'rgba(16, 185, 129, 0.3)',
      color: '#059669',
      label: 'تحديث جديد'
    },
    urgent: {
      bg: 'rgba(239, 68, 68, 0.08)',
      border: 'rgba(239, 68, 68, 0.32)',
      color: 'var(--danger)',
      label: 'إعلان عاجل'
    }
  };

  const st = typeStyles[ann.type] || typeStyles.info;
  const hasLink = ann.link_url && ann.link_url.trim() !== '';
  const safeLink = hasLink ? formatExternalUrl(ann.link_url) : '';

  bannerEl.innerHTML = `
    <div class="glass" style="padding: 18px 22px; margin-bottom: 24px; border-radius: 16px; background: ${st.bg}; border: 1px solid ${st.border}; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px;">
          <span style="font-size: 0.78rem; font-weight: 700; color: ${st.color};">${st.label}</span>
          ${ann.updated_at ? `<span style="color: var(--text-muted); font-size: 0.78rem;">· ${formatDate(ann.updated_at)}</span>` : ''}
        </div>
        ${ann.title ? `<h3 style="margin: 0 0 6px 0; font-size: 1.1rem; color: var(--text-primary);">${ann.title}</h3>` : ''}
        ${ann.message ? `<p style="margin: 0; font-size: 0.95rem; color: var(--text-secondary); line-height: 1.65; white-space: pre-line;">${ann.message}</p>` : ''}
        ${hasLink ? `
          <div style="margin-top: 12px;">
            <a href="${safeLink}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="padding: 6px 16px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px; text-decoration: none;">
              ${ICONS.externalLink} ${ann.link_text || 'التفاصيل والرابط'}
            </a>
          </div>
        ` : ''}
      </div>
      <button type="button" onclick="dismissStudentAnnouncement()" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 8px;" title="إخفاء الإعلان">
        ${ICONS.close}
      </button>
    </div>
  `;
}

// ==========================================
// STUDENT DASHBOARD
// ==========================================
function renderDashboard() {
  const container = $('unitsContainer');
  const statsContainer = $('studentStats');
  $('studentName').textContent = state.user?.name || 'طالب';

  renderStudentAnnouncementBanner();

  const isStudent = state.user?.role !== 'admin';
  const visibleUnits = isStudent ? state.units.filter(u => !u.is_hidden) : state.units;
  const rawStandaloneLessons = state.lessons[''] || [];
  const standaloneLessons = isStudent ? rawStandaloneLessons.filter(l => !l.is_hidden) : rawStandaloneLessons;
  const rawStandaloneMaterials = state.materials[''] || [];
  const standaloneMaterials = isStudent ? rawStandaloneMaterials.filter(m => !m.is_hidden) : rawStandaloneMaterials;

  if (!visibleUnits.length && !standaloneLessons.length && !standaloneMaterials.length) {
    container.innerHTML = '<div class="glass text-center" style="padding: 60px;"><p>لا توجد وحدات أو دروس متاحة حالياً.</p></div>';
    statsContainer.innerHTML = '';
    return;
  }

  const allVisibleLessons = Object.values(state.lessons).flat().filter(l => !isStudent || !l.is_hidden);
  const totalLessons = allVisibleLessons.length;
  const completedLessons = state.progress?.completed_lessons?.length || 0;
  const completedMaterials = state.progress?.completed_materials?.length || 0;

  statsContainer.innerHTML = `
    <div class="glass stat-card blue">
      <div class="stat-label">الدروس المكتملة</div>
      <div class="stat-value" style="font-variant-numeric: tabular-nums;">${completedLessons}/${totalLessons}</div>
    </div>
    <div class="glass stat-card pink">
      <div class="stat-label">المحتويات المشاهدة</div>
      <div class="stat-value" style="font-variant-numeric: tabular-nums;">${completedMaterials}</div>
    </div>
    <div class="glass stat-card green">
      <div class="stat-label">الوحدة الحالية</div>
      <div class="stat-value" style="font-size: 1.4rem;">${visibleUnits.find(u => u.unit_id === state.progress?.current_unit_id)?.unit_name || 'لم يبدأ'}</div>
    </div>
  `;

  container.innerHTML = visibleUnits.map(unit => {
    const rawLessons = state.lessons[unit.unit_id] || [];
    const lessons = isStudent ? rawLessons.filter(l => !l.is_hidden) : rawLessons;
    const rawUnitMaterials = state.materials[`unit_${unit.unit_id}`] || [];
    const unitMaterials = isStudent ? rawUnitMaterials.filter(m => !m.is_hidden) : rawUnitMaterials;
    const isExpanded = unit.unit_id === state.progress?.current_unit_id;

    return `
      <div class="glass unit-card glass-hover">
        <div class="unit-header" onclick="toggleUnit('${unit.unit_id}')">
          <div>
            <span class="unit-number">الوحدة ${unit.unit_number}</span>
            <h2 class="unit-title">${unit.unit_name}</h2>
          </div>
          <div class="unit-toggle ${isExpanded ? 'rotated' : ''}" id="toggle-${unit.unit_id}">
            ${ICONS.chevronDown}
          </div>
        </div>
        <div class="lessons-container" id="lessons-${unit.unit_id}" style="display: ${isExpanded ? 'grid' : 'none'};">
          ${unitMaterials.map(mat => {
            const isCompleted = state.progress?.completed_materials?.includes(mat.material_id);
            return `
              <div class="lesson-item ${isCompleted ? 'completed' : ''}" onclick="openMaterialDirectly('${mat.material_id}', 'unit_${unit.unit_id}')" style="background: rgba(99,102,241,0.02); border: 1px solid rgba(99,102,241,0.1);">
                <div class="lesson-icon ${isCompleted ? 'completed' : ''}">
                  ${isCompleted ? ICONS.check : (mat.type === 'video' ? ICONS.video : mat.type === 'quiz' ? ICONS.quiz : (mat.type === 'link' || mat.type === 'external') ? ICONS.presentation : ICONS.file)}
                </div>
                <div class="lesson-info">
                  <div class="lesson-title">${mat.title}</div>
                  <div class="lesson-meta">${(mat.type === 'link' || mat.type === 'external') ? 'شرائح عرض / رابط' : 'محتوى مستقل في الوحدة'}</div>
                </div>
                <button type="button" class="lesson-check-btn ${isCompleted ? 'completed' : ''}" onclick="event.stopPropagation(); markComplete('${mat.material_id}')" title="${isCompleted ? 'مكتمل' : 'تحديد كمكتمل'}">
                  ${ICONS.check}
                </button>
              </div>
            `;
          }).join('')}
          ${lessons.map(lesson => {
            const isCompleted = state.progress?.completed_lessons?.includes(lesson.lesson_id);
            const isActive = lesson.lesson_id === state.progress?.current_lesson_id;
            const rawMats = state.materials[lesson.lesson_id] || [];
            const mats = isStudent ? rawMats.filter(m => !m.is_hidden) : rawMats;

            return `
              <div class="lesson-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}" onclick="openLesson('${lesson.lesson_id}')">
                <div class="lesson-icon ${isCompleted ? 'completed' : ''}">
                  ${isCompleted ? ICONS.check : lesson.lesson_number}
                </div>
                <div class="lesson-info">
                  <div class="lesson-title">${lesson.lesson_name}</div>
                  <div class="lesson-meta">${mats.length} محتوى ${isCompleted ? '• <span style="color:var(--success); font-weight:700;">مكتمل ✓</span>' : ''}</div>
                </div>
                <button type="button" class="lesson-check-btn ${isCompleted ? 'completed' : ''}" onclick="event.stopPropagation(); toggleLessonComplete('${lesson.lesson_id}')" title="${isCompleted ? 'إلغاء تحديد الدرس كمكتمل' : 'تحديد الدرس كاملاً كمكتمل'}">
                  ${ICONS.check}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Add Standalone lessons
  if (standaloneLessons.length > 0 || standaloneMaterials.length > 0) {
    container.innerHTML += `
      <div style="margin-top: 16px;">
        <div class="lessons-container" style="display: grid;">
          ${standaloneMaterials.map(mat => {
            const isCompleted = state.progress?.completed_materials?.includes(mat.material_id);
            return `
              <div class="glass lesson-item ${isCompleted ? 'completed' : ''}" onclick="openMaterialDirectly('${mat.material_id}', '')" style="padding:16px; margin-bottom:12px; background:var(--bg-glass);">
                <div class="lesson-icon ${isCompleted ? 'completed' : ''}">
                  ${isCompleted ? ICONS.check : (mat.type === 'video' ? ICONS.video : mat.type === 'quiz' ? ICONS.quiz : (mat.type === 'link' || mat.type === 'external') ? ICONS.presentation : ICONS.file)}
                </div>
                <div class="lesson-info">
                  <div class="lesson-title" style="font-size:1.1rem; margin-bottom:4px;">${mat.title}</div>
                  <div class="lesson-meta">${mat.type === 'quiz' ? 'اختبار' : (mat.type === 'link' || mat.type === 'external') ? 'شرائح عرض / رابط خارجي' : 'محتوى'}</div>
                </div>
                <button type="button" class="lesson-check-btn ${isCompleted ? 'completed' : ''}" onclick="event.stopPropagation(); markComplete('${mat.material_id}')" title="${isCompleted ? 'مكتمل' : 'تحديد كمكتمل'}">
                  ${ICONS.check}
                </button>
              </div>
            `;
          }).join('')}
          ${standaloneLessons.map(lesson => {
            const isCompleted = state.progress?.completed_lessons?.includes(lesson.lesson_id);
            const isActive = lesson.lesson_id === state.progress?.current_lesson_id;
            const rawMats = state.materials[lesson.lesson_id] || [];
            const mats = isStudent ? rawMats.filter(m => !m.is_hidden) : rawMats;
            return `
              <div class="glass lesson-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}" onclick="openLesson('${lesson.lesson_id}')" style="padding:16px; margin-bottom:12px; background:var(--bg-glass);">
                <div class="lesson-icon ${isCompleted ? 'completed' : ''}">
                  ${isCompleted ? ICONS.check : lesson.lesson_number}
                </div>
                <div class="lesson-info">
                  <div class="lesson-title" style="font-size:1.1rem; margin-bottom:4px;">${lesson.lesson_name}</div>
                  <div class="lesson-meta">${mats.length} محتوى ${isCompleted ? '• <span style="color:var(--success); font-weight:700;">مكتمل ✓</span>' : ''}</div>
                </div>
                <button type="button" class="lesson-check-btn ${isCompleted ? 'completed' : ''}" onclick="event.stopPropagation(); toggleLessonComplete('${lesson.lesson_id}')" title="${isCompleted ? 'إلغاء تحديد الدرس كمكتمل' : 'تحديد الدرس كاملاً كمكتمل'}">
                  ${ICONS.check}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
}

function toggleUnit(unitId) {
  const el = $(`lessons-${unitId}`);
  const toggle = $(`toggle-${unitId}`);
  const isHidden = el.style.display === 'none';
  el.style.display = isHidden ? 'grid' : 'none';
  toggle.classList.toggle('rotated', isHidden);
}

function openLesson(lessonId) {
  state.currentLesson = lessonId;
  
  // Find unit id
  let unitId = null;
  for (const [uId, lessons] of Object.entries(state.lessons)) {
    if (lessons.some(l => l.lesson_id === lessonId)) {
      unitId = uId;
      break;
    }
  }

  // Update progress tracking
  if (!state.progress) {
    state.progress = { username: state.user.username, completed_lessons: [], completed_materials: [] };
  }
  state.progress.current_lesson_id = lessonId;
  if (unitId) state.progress.current_unit_id = unitId;

  if (!MOCK_MODE) {
    API.post('updateStudentProgress', state.progress);
  }
  saveCurriculumToLocal();

  renderMaterialViewer(lessonId);
  navigateTo('material');
}

function openMaterialDirectly(materialId, fakeLessonId) {
  // We mock a lesson environment for this standalone material
  state.currentLesson = fakeLessonId;
  if (!state.progress) {
    state.progress = { username: state.user.username, completed_lessons: [], completed_materials: [], completed_lesson_details: [] };
  }
  
  if (!MOCK_MODE) {
    API.post('updateStudentProgress', state.progress);
  }
  saveCurriculumToLocal();

  renderMaterialViewer(fakeLessonId, materialId);
  navigateTo('material');
}

// ==========================================
// NAVBAR NOTIFICATIONS BELL & DEEP NAVIGATION
// ==========================================

function _getReadNotifsStorageKey() {
  const uname = String(state.user?.username || 'guest').trim().toLowerCase();
  return `iqt_read_notifs_${uname}`;
}

function syncReadNotificationsState() {
  try {
    const key = _getReadNotifsStorageKey();
    const localRaw = localStorage.getItem(key);
    const localIds = localRaw ? JSON.parse(localRaw) : [];
    const progIds = Array.isArray(state.progress?.read_notifications) ? state.progress.read_notifications : [];
    const merged = Array.from(new Set([...(Array.isArray(localIds) ? localIds : []), ...progIds].map(String)));
    state.readNotifications = merged;
    localStorage.setItem(key, JSON.stringify(merged));
    if (state.progress) {
      state.progress.read_notifications = merged;
    }
  } catch (e) {
    console.warn('Error syncing read notifications:', e);
  }
}

function persistReadNotifications() {
  try {
    const key = _getReadNotifsStorageKey();
    const list = Array.from(new Set((state.readNotifications || []).map(String)));
    state.readNotifications = list;
    localStorage.setItem(key, JSON.stringify(list));

    if (state.user && state.user.role === 'student') {
      if (!state.progress) {
        state.progress = {
          username: state.user.username,
          completed_lessons: [],
          completed_materials: [],
          completed_lesson_details: [],
          read_notifications: list
        };
      } else {
        state.progress.read_notifications = list;
      }
      if (!MOCK_MODE) {
        API.post('updateStudentProgress', state.progress).catch(() => {});
      }
      saveCurriculumToLocal();
    }
  } catch (e) {
    console.warn('Error persisting read notifications:', e);
  }
}

function getVisibleNotificationsForUser() {
  const all = Array.isArray(state.notifications) ? state.notifications : [];
  const isStudent = state.user?.role !== 'admin';
  if (!isStudent) return all;

  // For students, hide notifications pointing to a currently hidden material, lesson, or unit
  const hiddenUnitIds = new Set((state.units || []).filter(u => u.is_hidden).map(u => String(u.unit_id)));
  const hiddenLessonIds = new Set();
  Object.values(state.lessons || {}).flat().forEach(l => {
    if (l.is_hidden || (l.unit_id && hiddenUnitIds.has(String(l.unit_id)))) {
      hiddenLessonIds.add(String(l.lesson_id));
    }
  });
  const hiddenMaterialIds = new Set();
  (state.allMaterials || []).forEach(m => {
    const lid = String(m.lesson_id || '');
    const uidFromMat = lid.startsWith('unit_') ? lid.replace(/^unit_/, '') : '';
    if (m.is_hidden || (lid && hiddenLessonIds.has(lid)) || (uidFromMat && hiddenUnitIds.has(uidFromMat))) {
      hiddenMaterialIds.add(String(m.material_id));
    }
  });

  return all.filter(n => {
    if (!n) return false;
    if (n.unit_id && hiddenUnitIds.has(String(n.unit_id))) return false;
    if (n.lesson_id) {
      const lid = String(n.lesson_id);
      if (lid.startsWith('unit_')) {
        if (hiddenUnitIds.has(lid.replace(/^unit_/, ''))) return false;
      } else if (hiddenLessonIds.has(lid)) {
        return false;
      }
    }
    if ((n.target_type === 'material' || n.target_type === 'quiz') && n.target_id) {
      if (hiddenMaterialIds.has(String(n.target_id))) return false;
    }
    if (n.target_type === 'lesson' && n.target_id) {
      if (hiddenLessonIds.has(String(n.target_id))) return false;
    }
    return true;
  });
}

function _getNotifTypeVisual(type) {
  const map = {
    pdf: {
      icon: ICONS.document,
      bg: 'rgba(239, 68, 68, 0.1)',
      color: '#dc2626',
      label: 'ملف PDF'
    },
    video: {
      icon: ICONS.video,
      bg: 'rgba(139, 92, 246, 0.12)',
      color: '#7c3aed',
      label: 'فيديو'
    },
    link: {
      icon: ICONS.presentation || ICONS.externalLink,
      bg: 'rgba(2, 132, 199, 0.1)',
      color: '#0284c7',
      label: 'شرائح / رابط'
    },
    external: {
      icon: ICONS.presentation || ICONS.externalLink,
      bg: 'rgba(2, 132, 199, 0.1)',
      color: '#0284c7',
      label: 'شرائح / رابط'
    },
    quiz: {
      icon: ICONS.quiz,
      bg: 'rgba(16, 185, 129, 0.12)',
      color: '#059669',
      label: 'اختبار'
    },
    lesson: {
      icon: ICONS.document,
      bg: 'rgba(79, 70, 229, 0.1)',
      color: '#4f46e5',
      label: 'درس جديد'
    },
    article: {
      icon: ICONS.file,
      bg: 'rgba(14, 165, 233, 0.1)',
      color: '#0284c7',
      label: 'مقال'
    },
    announcement: {
      icon: ICONS.megaphone || ICONS.bell,
      bg: 'rgba(245, 158, 11, 0.12)',
      color: '#d97706',
      label: 'إعلان'
    }
  };
  return map[type] || map.announcement;
}

function renderNavbarNotifications() {
  const badgeEl = $('navNotifBadge');
  const listEl = $('navNotifList');
  const headerCountEl = $('navNotifHeaderCount');
  const markAllBtn = $('navNotifMarkAllBtn');
  if (!badgeEl || !listEl) return;

  const visibleNotifs = getVisibleNotificationsForUser();
  const readSet = new Set((state.readNotifications || []).map(String));
  const unreadNotifs = visibleNotifs.filter(n => !readSet.has(String(n.notification_id)));
  const unreadCount = unreadNotifs.length;

  if (unreadCount > 0) {
    badgeEl.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    badgeEl.classList.remove('hidden');
  } else {
    badgeEl.textContent = '0';
    badgeEl.classList.add('hidden');
  }

  if (headerCountEl) {
    headerCountEl.textContent = unreadCount > 0 ? `(${unreadCount} غير مقروء)` : `(${visibleNotifs.length})`;
  }
  if (markAllBtn) {
    markAllBtn.style.display = unreadCount > 0 ? 'inline-block' : 'none';
  }

  if (visibleNotifs.length === 0) {
    listEl.innerHTML = `<div class="notif-empty">لا توجد إشعارات أو تنبيهات حالياً</div>`;
    return;
  }

  listEl.innerHTML = visibleNotifs.map(n => {
    const id = String(n.notification_id || '');
    const isUnread = !readSet.has(id);
    const vis = _getNotifTypeVisual(n.type);
    const actionHint = n.target_type === 'quiz'
      ? 'اضغط لفتح الاختبار'
      : n.target_type === 'material'
        ? 'اضغط لفتح المحتوى'
        : n.target_type === 'lesson'
          ? 'اضغط لفتح الدرس'
          : 'اضغط لعرض التفاصيل';

    return `
      <button type="button" class="notif-item ${isUnread ? 'unread' : ''}" onclick="handleNotificationClick('${id.replace(/'/g, "\\'")}')">
        <div class="notif-icon-box" style="background:${vis.bg}; color:${vis.color};">
          ${vis.icon}
        </div>
        <div class="notif-content">
          <div class="notif-title-row">
            <span class="notif-title">${n.title || vis.label}</span>
            ${isUnread ? `<span class="notif-unread-indicator">جديد</span>` : ''}
          </div>
          ${n.message ? `<div class="notif-msg">${n.message}</div>` : ''}
          <div class="notif-meta">
            <span>${vis.label}</span>
            <span>·</span>
            <span>${formatDate(n.created_at)}</span>
            <span>·</span>
            <span style="color:var(--primary); font-weight:700;">${actionHint}</span>
          </div>
        </div>
      </button>
    `;
  }).join('');
}

function toggleNotificationsDropdown(event) {
  if (event) event.stopPropagation();
  const dropdown = $('navNotifDropdown');
  const btn = $('navNotifBtn');
  if (!dropdown) return;

  const isCurrentlyHidden = dropdown.classList.contains('hidden');
  if (isCurrentlyHidden) {
    state.notifDropdownOpen = true;
    dropdown.classList.remove('hidden');
    btn?.classList.add('active');
    renderNavbarNotifications();

    // Background refresh to pick up any brand-new notifications immediately
    if (!MOCK_MODE && typeof API !== 'undefined') {
      API.get('getNotifications', {}, { forceFresh: true }).then(res => {
        if (res && res.success && Array.isArray(res.notifications)) {
          state.notifications = res.notifications;
          saveCurriculumToLocal();
          renderNavbarNotifications();
        }
      }).catch(() => {});
    }
  } else {
    closeNotificationsDropdown();
  }
}

function closeNotificationsDropdown() {
  state.notifDropdownOpen = false;
  $('navNotifDropdown')?.classList.add('hidden');
  $('navNotifBtn')?.classList.remove('active');
}

document.addEventListener('click', (e) => {
  if (!state.notifDropdownOpen) return;
  const wrapper = $('navNotifWrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    closeNotificationsDropdown();
  }
});

function markAllNotificationsRead(event) {
  if (event) event.stopPropagation();
  const visible = getVisibleNotificationsForUser();
  const readSet = new Set((state.readNotifications || []).map(String));
  visible.forEach(n => {
    if (n && n.notification_id) readSet.add(String(n.notification_id));
  });
  state.readNotifications = Array.from(readSet);
  persistReadNotifications();
  renderNavbarNotifications();
  showToast('تم تحديد جميع الإشعارات كمقروءة');
}

async function handleNotificationClick(notificationId) {
  const idStr = String(notificationId || '');
  const notif = (state.notifications || []).find(n => String(n.notification_id) === idStr);

  // Mark as read immediately
  if (idStr && !state.readNotifications.includes(idStr)) {
    state.readNotifications.push(idStr);
    persistReadNotifications();
  }
  renderNavbarNotifications();
  closeNotificationsDropdown();

  if (!notif) return;

  // 1. Material or Quiz notification -> open the exact material/quiz viewer
  if (notif.target_type === 'material' || notif.target_type === 'quiz') {
    let mat = (state.allMaterials || []).find(m => String(m.material_id) === String(notif.target_id));

    // If not in local state yet, refresh data once
    if (!mat && !MOCK_MODE) {
      showLoading();
      await loadStudentData(true);
      hideLoading();
      mat = (state.allMaterials || []).find(m => String(m.material_id) === String(notif.target_id));
    }

    if (mat) {
      const lid = String(mat.lesson_id || '');
      if (!lid || lid.startsWith('unit_')) {
        openMaterialDirectly(mat.material_id, lid);
      } else {
        state.currentLesson = lid;
        if (!state.progress && state.user) {
          state.progress = { username: state.user.username, completed_lessons: [], completed_materials: [], completed_lesson_details: [], read_notifications: state.readNotifications };
        }
        if (state.progress) {
          state.progress.current_lesson_id = lid;
          if (notif.unit_id) state.progress.current_unit_id = String(notif.unit_id);
          if (!MOCK_MODE && state.user?.role === 'student') {
            API.post('updateStudentProgress', state.progress).catch(() => {});
          }
        }
        saveCurriculumToLocal();
        await renderMaterialViewer(lid, mat.material_id);
        navigateTo('material');
      }
      return;
    }

    // Fallback if material was deleted or only lesson_id exists
    if (notif.lesson_id && !String(notif.lesson_id).startsWith('unit_')) {
      openLesson(String(notif.lesson_id));
      return;
    }
    showToast('هذا المحتوى لم يعد متوفراً أو تم نقله', 'warning');
    navigateTo('dashboard');
    return;
  }

  // 2. Lesson notification -> open the lesson directly
  if (notif.target_type === 'lesson') {
    const targetLessonId = String(notif.target_id || notif.lesson_id || '');
    let foundLesson = Object.values(state.lessons || {}).flat().find(l => String(l.lesson_id) === targetLessonId);
    if (!foundLesson && !MOCK_MODE) {
      showLoading();
      await loadStudentData(true);
      hideLoading();
      foundLesson = Object.values(state.lessons || {}).flat().find(l => String(l.lesson_id) === targetLessonId);
    }
    if (foundLesson) {
      openLesson(String(foundLesson.lesson_id));
      return;
    }
    showToast('هذا الدرس لم يعد متوفراً', 'warning');
    navigateTo('dashboard');
    return;
  }

  // 3. Announcement notification -> show full announcement modal (with external link if any)
  showNotificationAnnouncementModal(notif);
}

function showNotificationAnnouncementModal(notif) {
  const existing = document.getElementById('notifAnnouncementModal');
  if (existing) existing.remove();

  const hasLink = notif.link_url && String(notif.link_url).trim() !== '';
  const safeLink = hasLink ? formatExternalUrl(notif.link_url) : '';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'notifAnnouncementModal';
  modal.innerHTML = `
    <div class="glass modal-content" style="max-width: 520px;">
      <div class="flex justify-between items-center" style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(245, 158, 11, 0.12); color: #d97706; display: flex; align-items: center; justify-content: center;">
            ${ICONS.megaphone || ICONS.bell}
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.1rem;">${notif.title || 'إعلان وتنبيه'}</h3>
            <span style="font-size: 0.78rem; color: var(--text-muted); font-variant-numeric: tabular-nums;">${formatDate(notif.created_at)}</span>
          </div>
        </div>
        <button type="button" class="btn btn-secondary" style="padding: 6px 10px;" onclick="document.getElementById('notifAnnouncementModal')?.remove()">
          ${ICONS.close}
        </button>
      </div>
      <div style="font-size: 0.96rem; color: var(--text); line-height: 1.75; white-space: pre-line; margin-bottom: 20px;">
        ${notif.message || ''}
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap;">
        ${hasLink ? `
          <a href="${safeLink}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px;" onclick="document.getElementById('notifAnnouncementModal')?.remove()">
            ${ICONS.externalLink} ${notif.link_text || 'فتح الرابط المرفق'}
          </a>
        ` : ''}
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('notifAnnouncementModal')?.remove()">إغلاق</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

