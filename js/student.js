// ============================================
// student.js — Data loading, dashboard render,
//              unit/lesson navigation
// Depends on: api.js, state.js, utils.js, router.js
// ============================================

// ==========================================
// DATA LOADING
// ==========================================

/**
 * Wipes all cached data from state, then re-fetches everything
 * fresh from the API. Call this after any create / edit / delete
 * operation so the UI is always in sync with the server.
 */
async function refreshAllData() {
  // Clear all cached state
  state.units        = [];
  state.lessons      = {};
  state.materials    = {};
  state.quizzes      = {};
  state.allMaterials = [];
  state.questions    = {};

  await loadStudentData();
}

/**
 * Loads all units → lessons → materials in parallel batches.
 * Also builds state.allMaterials for admin / profile lookups.
 */
async function loadStudentData() {
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
      username: state.user.username,
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
    // Step 1 — units + student progress in parallel
    const [unitsRes, progressRes] = await Promise.all([
      API.get('getUnits'),
      state.user?.role !== 'admin'
        ? API.get('getStudentProgress', { username: state.user.username })
        : Promise.resolve({ success: false })
    ]);

    if (unitsRes.success) {
      state.units = (unitsRes.units || []).map(u => ({ ...u, unit_id: String(u.unit_id) }));
    }
    if (progressRes.success) state.progress = progressRes.progress;

    // Load all materials once to cover standalone materials, unit-materials, and lesson-materials
    const allMaterialsRes = await API.get('getAllMaterials');
    if (allMaterialsRes.success) {
      state.allMaterials = (allMaterialsRes.materials || []).map(m => ({
        ...m,
        material_id: String(m.material_id != null ? m.material_id : ''),
        lesson_id: String(m.lesson_id != null ? m.lesson_id : '')
      }));
    } else {
      state.allMaterials = [];
    }

    // Step 2 — all lessons. We can get them by querying getLessons with empty unitId to get standalone lessons
    // Or we can just get all lessons if the API supported it.
    // Wait, getLessons(unitId) filters by unitId. If unitId is empty, it returns standalone lessons.
    const lessonPromises = state.units.map(unit => API.get('getLessons', { unitId: unit.unit_id }));
    lessonPromises.push(API.get('getLessons', { unitId: '' })); // Fetch standalone lessons
    
    const lessonResults = await Promise.all(lessonPromises);
    
    lessonResults.forEach((res, i) => {
      if (res.success) {
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
