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
    if (data.progress) state.progress = data.progress;
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

      if (initialRes.progress) {
        state.progress = initialRes.progress;
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

// ==========================================
// STUDENT DASHBOARD
// ==========================================
function renderDashboard() {
  const container = $('unitsContainer');
  const statsContainer = $('studentStats');
  $('studentName').textContent = state.user?.name || 'طالب';

  if (!state.units.length) {
    container.innerHTML = '<div class="glass text-center" style="padding: 60px;"><p>لا توجد وحدات متاحة بعد.</p></div>';
    return;
  }

  const completedLessons = state.progress?.completed_lessons?.length || 0;
  const totalLessons = Object.values(state.lessons).flat().length;
  const completedMaterials = state.progress?.completed_materials?.length || 0;

  statsContainer.innerHTML = `
    <div class="glass stat-card blue">
      <div class="stat-label">الدروس المكتملة</div>
      <div class="stat-value">${completedLessons}/${totalLessons}</div>
    </div>
    <div class="glass stat-card pink">
      <div class="stat-label">المحتويات المشاهدة</div>
      <div class="stat-value">${completedMaterials}</div>
    </div>
    <div class="glass stat-card green">
      <div class="stat-label">الوحدة الحالية</div>
      <div class="stat-value" style="font-size: 1.4rem;">${state.units.find(u => u.unit_id === state.progress?.current_unit_id)?.unit_name || 'لم يبدأ'}</div>
    </div>
  `;

  container.innerHTML = state.units.map(unit => {
    const lessons = state.lessons[unit.unit_id] || [];
    const unitMaterials = state.materials[`unit_${unit.unit_id}`] || [];
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
                ${isCompleted ? `<div class="check-icon">${ICONS.check}</div>` : ''}
              </div>
            `;
          }).join('')}
          ${lessons.map(lesson => {
            const isCompleted = state.progress?.completed_lessons?.includes(lesson.lesson_id);
            const isActive = lesson.lesson_id === state.progress?.current_lesson_id;
            const mats = state.materials[lesson.lesson_id] || [];

            return `
              <div class="lesson-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}" onclick="openLesson('${lesson.lesson_id}')">
                <div class="lesson-icon ${isCompleted ? 'completed' : ''}">
                  ${isCompleted ? ICONS.check : lesson.lesson_number}
                </div>
                <div class="lesson-info">
                  <div class="lesson-title">${lesson.lesson_name}</div>
                  <div class="lesson-meta">${mats.length} محتوى</div>
                </div>
                ${isCompleted ? `<div class="check-icon">${ICONS.check}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Add Standalone lessons
  const standaloneLessons = state.lessons[''] || [];
  const standaloneMaterials = state.materials[''] || [];
  
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
                ${isCompleted ? `<div class="check-icon">${ICONS.check}</div>` : ''}
              </div>
            `;
          }).join('')}
          ${standaloneLessons.map(lesson => {
            const isCompleted = state.progress?.completed_lessons?.includes(lesson.lesson_id);
            const isActive = lesson.lesson_id === state.progress?.current_lesson_id;
            const mats = state.materials[lesson.lesson_id] || [];
            return `
              <div class="glass lesson-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}" onclick="openLesson('${lesson.lesson_id}')" style="padding:16px; margin-bottom:12px; background:var(--bg-glass);">
                <div class="lesson-icon ${isCompleted ? 'completed' : ''}">
                  ${isCompleted ? ICONS.check : lesson.lesson_number}
                </div>
                <div class="lesson-info">
                  <div class="lesson-title" style="font-size:1.1rem; margin-bottom:4px;">${lesson.lesson_name}</div>
                  <div class="lesson-meta">${mats.length} محتوى</div>
                </div>
                ${isCompleted ? `<div class="check-icon">${ICONS.check}</div>` : ''}
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

  renderMaterialViewer(lessonId);
  navigateTo('material');
}

function openMaterialDirectly(materialId, fakeLessonId) {
  // We mock a lesson environment for this standalone material
  state.currentLesson = fakeLessonId;
  if (!state.progress) {
    state.progress = { username: state.user.username, completed_lessons: [], completed_materials: [] };
  }
  
  if (!MOCK_MODE) {
    API.post('updateStudentProgress', state.progress);
  }

  renderMaterialViewer(fakeLessonId, materialId);
  navigateTo('material');
}
