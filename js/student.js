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
    if (data.progress && (!state.user || !data.progress.username || data.progress.username.toLowerCase() === (state.user?.username || '').toLowerCase())) {
      state.progress = data.progress;
    }
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

      if (initialRes.progress) {
        state.progress = initialRes.progress;
      } else if (state.user && state.user.role === 'student') {
        state.progress = {
          username: state.user.username,
          completed_lessons: [],
          completed_materials: [],
          completed_lesson_details: []
        };
      }

      groupMaterials();
      saveCurriculumToLocal();
      return;
    }

    // 2. PARALLEL FALLBACK (for backward compatibility with older GAS deployments)
    const [unitsRes, progressRes, allMaterialsRes] = await Promise.all([
      API.get('getUnits', {}, { forceFresh }),
      state.user?.role !== 'admin' && username
        ? API.get('getStudentProgress', { username }, { forceFresh })
        : Promise.resolve({ success: false }),
      API.get('getAllMaterials', {}, { forceFresh })
    ]);

    if (unitsRes && unitsRes.success) {
      state.units = (unitsRes.units || []).map(u => ({ ...u, unit_id: String(u.unit_id) }));
    }
    if (progressRes && progressRes.success) {
      state.progress = progressRes.progress;
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
