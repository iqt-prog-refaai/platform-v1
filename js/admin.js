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
  document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
  event.target.closest('.admin-nav-item').classList.add('active');
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
    case 'overview':  renderAdminOverview(container);          break;
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

// ==========================================
// OVERVIEW
// ==========================================
function renderAdminOverview(container) {
  const totalUnits = state.units.length;
  const totalLessons = Object.values(state.lessons).flat().length;
  const totalMaterials = Object.values(state.materials).flat().length;

  container.innerHTML = `
    <h2 style="margin-bottom: 24px; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">نظرة عامة على لوحة التحكم</h2>
    <div class="stats-grid">
      <div class="glass stat-card blue">
        <div class="stat-label">إجمالي الوحدات</div>
        <div class="stat-value">${totalUnits}</div>
      </div>
      <div class="glass stat-card pink">
        <div class="stat-label">إجمالي الدروس</div>
        <div class="stat-value">${totalLessons}</div>
      </div>
      <div class="glass stat-card green">
        <div class="stat-label">إجمالي المحتويات</div>
        <div class="stat-value">${totalMaterials}</div>
      </div>
    </div>
    <div class="glass" style="padding: 32px;">
      <h3 style="margin-bottom: 16px;">إجراءات سريعة</h3>
      <div class="flex gap-4" style="flex-wrap: wrap;">
        <button class="btn btn-primary" onclick="showModal('addUnit')">${ICONS.plus} إضافة وحدة</button>
        <button class="btn btn-primary" onclick="showModal('addLesson')">${ICONS.plus} إضافة درس</button>
        <button class="btn btn-primary" onclick="showModal('addMaterial')">${ICONS.plus} إضافة محتوى</button>
      </div>
    </div>
  `;
}

// ==========================================
// CONTENT MANAGEMENT
// ==========================================
async function renderAdminContent(container) {
  container.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;">جاري تحميل المحتوى...</div>';

  if (!MOCK_MODE) {
    const res = await API.get('getAllMaterials');
    if (res.success) {
      state.allMaterials = (res.materials || []).map(m => ({
        ...m,
        material_id: String(m.material_id != null ? m.material_id : ''),
        lesson_id: String(m.lesson_id != null ? m.lesson_id : '')
      }));
      if (typeof groupMaterials === 'function') groupMaterials();
    }
  }

  container.innerHTML = `
    <div class="flex justify-between items-center" style="margin-bottom: 24px;">
      <h2 style="font-family: 'Space Grotesk', 'Tajawal', sans-serif;">إدارة المحتوى</h2>
      <div class="flex gap-2">
        <button class="btn btn-secondary" onclick="showModal('addUnit')">${ICONS.plus} إضافة وحدة</button>
        <button class="btn btn-secondary" onclick="showModal('addLesson')">${ICONS.plus} إضافة درس</button>
        <button class="btn btn-primary" onclick="showModal('addMaterial')">${ICONS.plus} إضافة محتوى</button>
      </div>
    </div>

    <div style="margin-bottom: 32px;">
      <h3 style="margin-bottom: 16px; color: var(--text-muted);">الوحدات والدروس</h3>
      ${state.units.map(unit => `
        <div class="glass" style="padding: 20px; margin-bottom: 16px; border-right: 4px solid var(--primary);">
          <div class="flex justify-between items-center" style="border-bottom: 1px solid rgba(0,0,0,0.06); padding-bottom: 12px;">
            <div>
              <span class="unit-number">الوحدة ${unit.unit_number}</span>
              <h4 style="margin-top: 4px;">${unit.unit_name}</h4>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-secondary" style="padding: 6px 10px;" onclick='showModal("editUnit", ${JSON.stringify(unit).replace(/'/g, "&#39;")})' title="تعديل">${ICONS.edit}</button>
              <button class="btn btn-secondary" style="padding: 6px 10px; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'unit', id: '${unit.unit_id}', name: '${unit.unit_name}'})" title="حذف">${ICONS.trash}</button>
              <button class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.85rem;" onclick="showModal('addLesson', '${unit.unit_id}')">${ICONS.plus} درس</button>
              <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="showModal('addMaterial', 'unit_${unit.unit_id}')">${ICONS.plus} محتوى بالوحدة</button>
            </div>
          </div>

          <div style="margin-top: 16px; padding-right: 12px;">
            <!-- Unit-direct materials -->
            ${(state.materials[`unit_${unit.unit_id}`] || []).map(mat => `
              <div class="flex justify-between items-center" style="padding: 8px 12px; margin-bottom: 8px; border-radius: 8px; background: rgba(99,102,241,0.04); border-right: 3px solid var(--primary);">
                <div class="flex items-center gap-2">
                  <span style="color: var(--primary);">${mat.type === 'video' ? ICONS.video : mat.type === 'quiz' ? ICONS.quiz : (mat.type === 'link' || mat.type === 'external') ? ICONS.presentation : ICONS.file}</span>
                  <span style="font-weight: 500;">${mat.title}</span>
                  <span style="font-size: 0.75rem; color: var(--text-muted); background: rgba(0,0,0,0.05); padding: 1px 6px; border-radius: 4px;">محتوى بالوحدة (${(mat.type === 'link' || mat.type === 'external') ? 'شرائح / رابط' : mat.type})</span>
                </div>
                <div class="flex gap-2">
                  ${(mat.type === 'link' || mat.type === 'external') && mat.content ? `<a href="${mat.content}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" title="فتح الرابط">${ICONS.externalLink}</a>` : ''}
                  <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" onclick='showModal("editMaterial", ${JSON.stringify(mat).replace(/'/g, "&#39;")})' title="تعديل">${ICONS.edit}</button>
                  <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'material', id: '${mat.material_id}', name: '${mat.title}'})" title="حذف">${ICONS.trash}</button>
                </div>
              </div>
            `).join('')}

            <!-- Lessons in unit -->
            ${(state.lessons[unit.unit_id] || []).map(lesson => {
              const lessonMats = state.materials[String(lesson.lesson_id)] || [];
              return `
                <div style="margin-bottom: 12px; background: rgba(0,0,0,0.015); border: 1px solid rgba(0,0,0,0.05); border-radius: 10px; padding: 12px;">
                  <div class="flex justify-between items-center">
                    <span style="font-weight: 700; font-size: 0.95rem;">الدرس ${lesson.lesson_number}: ${lesson.lesson_name}</span>
                    <div class="flex gap-2">
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
                    ${lessonMats.map(mat => `
                      <div class="flex justify-between items-center" style="padding: 6px 10px; background: var(--bg-card, #fff); border: 1px solid rgba(0,0,0,0.05); border-radius: 6px; font-size: 0.88rem;">
                        <div class="flex items-center gap-2">
                          <span style="color: var(--primary);">${mat.type === 'video' ? ICONS.video : mat.type === 'quiz' ? ICONS.quiz : (mat.type === 'link' || mat.type === 'external') ? ICONS.presentation : ICONS.file}</span>
                          <span>${mat.title}</span>
                          <span style="font-size: 0.72rem; color: var(--text-muted); background: rgba(0,0,0,0.04); padding: 1px 6px; border-radius: 4px;">${mat.type === 'quiz' ? 'اختبار' : mat.type === 'video' ? 'فيديو' : mat.type === 'pdf' ? 'PDF' : (mat.type === 'link' || mat.type === 'external') ? 'شرائح / رابط' : mat.type}</span>
                        </div>
                        <div class="flex gap-2">
                          ${(mat.type === 'link' || mat.type === 'external') && mat.content ? `<a href="${mat.content}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" title="فتح الرابط">${ICONS.externalLink}</a>` : ''}
                          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" onclick='showModal("editMaterial", ${JSON.stringify(mat).replace(/'/g, "&#39;")})' title="تعديل">${ICONS.edit}</button>
                          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'material', id: '${mat.material_id}', name: '${mat.title}'})" title="حذف">${ICONS.trash}</button>
                        </div>
                      </div>
                    `).join('')}
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
      `).join('')}

      <!-- Standalone lessons (no unit) -->
      ${(state.lessons[''] || []).length ? `
        <div class="glass" style="padding: 20px; margin-bottom: 16px; border-right: 4px solid var(--secondary);">
          <h4 style="margin-bottom: 14px; color: var(--text-muted);">دروس مستقلة (خارج الوحدات)</h4>
          ${(state.lessons[''] || []).map(lesson => {
            const lessonMats = state.materials[String(lesson.lesson_id)] || [];
            return `
              <div style="margin-bottom: 12px; background: rgba(0,0,0,0.015); border: 1px solid rgba(0,0,0,0.05); border-radius: 10px; padding: 12px;">
                <div class="flex justify-between items-center">
                  <span style="font-weight: 700; font-size: 0.95rem;">الدرس ${lesson.lesson_number}: ${lesson.lesson_name}</span>
                  <div class="flex gap-2">
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
                  ${lessonMats.map(mat => `
                    <div class="flex justify-between items-center" style="padding: 6px 10px; background: var(--bg-card, #fff); border: 1px solid rgba(0,0,0,0.05); border-radius: 6px; font-size: 0.88rem;">
                      <div class="flex items-center gap-2">
                        <span style="color: var(--primary);">${mat.type === 'video' ? ICONS.video : mat.type === 'quiz' ? ICONS.quiz : (mat.type === 'link' || mat.type === 'external') ? ICONS.presentation : ICONS.file}</span>
                        <span>${mat.title}</span>
                        <span style="font-size: 0.72rem; color: var(--text-muted); background: rgba(0,0,0,0.04); padding: 1px 6px; border-radius: 4px;">${mat.type === 'quiz' ? 'اختبار' : mat.type === 'video' ? 'فيديو' : mat.type === 'pdf' ? 'PDF' : (mat.type === 'link' || mat.type === 'external') ? 'شرائح / رابط' : mat.type}</span>
                      </div>
                      <div class="flex gap-2">
                        ${(mat.type === 'link' || mat.type === 'external') && mat.content ? `<a href="${mat.content}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" title="فتح الرابط">${ICONS.externalLink}</a>` : ''}
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" onclick='showModal("editMaterial", ${JSON.stringify(mat).replace(/'/g, "&#39;")})' title="تعديل">${ICONS.edit}</button>
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'material', id: '${mat.material_id}', name: '${mat.title}'})" title="حذف">${ICONS.trash}</button>
                      </div>
                    </div>
                  `).join('')}
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
          ${(state.materials[''] || []).map(mat => `
            <div class="flex justify-between items-center" style="padding: 10px 12px; margin-bottom: 6px; border-radius: 8px; background: rgba(139,92,246,0.04); border-right: 3px solid #8b5cf6;">
              <div class="flex items-center gap-2">
                <span style="color: #8b5cf6;">${mat.type === 'video' ? ICONS.video : mat.type === 'quiz' ? ICONS.quiz : ICONS.file}</span>
                <span style="font-weight: 500;">${mat.title}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted); background: rgba(0,0,0,0.05); padding: 1px 6px; border-radius: 4px;">(${mat.type})</span>
              </div>
              <div class="flex gap-2">
                <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" onclick='showModal("editMaterial", ${JSON.stringify(mat).replace(/'/g, "&#39;")})' title="تعديل">${ICONS.edit}</button>
                <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'material', id: '${mat.material_id}', name: '${mat.title}'})" title="حذف">${ICONS.trash}</button>
              </div>
            </div>
          `).join('')}
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
    html += `
      <div class="glass" style="padding: 20px; margin-bottom: 12px;">
        <div class="flex justify-between items-center">
          <div>
            <h4 style="margin-bottom:4px;">${mat.title}</h4>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin:0;">
              ${unit && lesson ? `${unit.unit_name} → ${lesson.lesson_name}` : (unit ? `${unit.unit_name} (مباشرة)` : (lesson ? `درس مستقل: ${lesson.lesson_name}` : 'مستقل'))}
              ${quiz
                ? `<span style="color: var(--success); margin-right: 6px;">✓ جاهز</span>${timerBadge}${reviewBadge}`
                : `<span style="color: var(--warning); margin-right: 8px;">⚠ لا يوجد سجل اختبار بعد</span>`}
            </p>
          </div>
          <div class="flex gap-2" style="flex-wrap:wrap; justify-content:flex-end;">
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
              <button class="btn btn-secondary" style="padding: 8px; font-size: 0.85rem;" title="إعدادات الاختبار"
                onclick='showModal("editQuizSettings", ${JSON.stringify({
                  material_id: mat.material_id, 
                  title: mat.title, 
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
    const res = await API.post('addQuiz', {
      material_id: materialId,
      title: title,
      description: ''
    });
    if (res.success) {
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
  container.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;">جاري تحميل المستخدمين...</div>';

  let users = [];
  if (MOCK_MODE) {
    users = [{ name: 'طالب تجريبي', username: 'student', role: 'student' }];
  } else {
    const res = await API.get('getAllStudents');
    if (res.success) users = res.students || [];
  }

  // Determine what they can see based on role
  const isManager = state.user.role === 'manager';
  const isVIP = state.user.role === 'vip';
  const isAdmin = state.user.role === 'admin';

  let html = `<h2 style="margin-bottom: 24px; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">إدارة المستخدمين</h2>`;
  
  // Show stats card for everyone with access to this tab
  const studentCount = users.filter(u => u.role === 'student').length;
  html += `
    <div class="glass text-center" style="padding: 24px; margin-bottom: 24px;">
      <h3 style="margin-bottom: 12px; font-size: 1.1rem; color: var(--text-muted);">إحصائيات الطلاب</h3>
      <div style="font-size: 2.5rem; font-weight: 800; color: var(--primary);">${studentCount}</div>
      <div style="color: var(--text-muted); font-size: 0.9rem;">إجمالي عدد الطلاب المسجلين</div>
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
          <input type="text" id="newUserUsername" placeholder="اسم المستخدم" class="w-full" style="padding:8px 12px; border:2px solid var(--border); border-radius:8px; direction:ltr;" pattern="[a-zA-Z0-9_]+">
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

  html += `<div id="studentsList">`;
  
  users.forEach(s => {
    html += `
      <div class="glass student-card flex justify-between items-center" style="margin-bottom:12px;">
        <div class="student-info flex items-center gap-4">
          <div class="avatar" style="width:40px; height:40px; font-size:1.2rem;">
             ${s.avatar ? `<img src="${s.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : s.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 style="margin:0;">${s.name} ${s.full_name ? `<span style="font-size:0.8rem;color:var(--text-muted);font-weight:normal;">(${s.full_name})</span>` : ''}</h3>
            <p style="margin:0; font-size:0.85rem; color:var(--text-muted);">@${s.username}</p>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap: 12px;">
          ${getRoleBadgeSVG(s.role)}
          ${s.role === 'student' ? `<button class="btn btn-secondary" style="padding: 6px 12px; font-size:0.85rem;" onclick="viewStudentDetails('${s.username}')">عرض السجل</button>` : ''}
        </div>
      </div>
    `;
  });
  html += `</div>`;
  container.innerHTML = html;
}

async function adminAddUser() {
  const name = $('newUserName').value.trim();
  const full_name = $('newUserFull').value.trim();
  const username = $('newUserUsername').value.trim();
  const password = $('newUserPassword').value;
  const role = $('newUserRole').value;

  if (!name || !username || !password) return showToast('يرجى ملء الحقول الأساسية', 'error');
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return showToast('اسم المستخدم: حروف وأرقام إنجليزية فقط', 'error');

  showLoading();
  try {
    const res = await API.post('addUser', { name, full_name, username, password, role });
    if (res.success) {
      showToast('تمت إضافة المستخدم بنجاح');
      await refreshAndRenderAdmin();
    } else {
      showToast(res.message || 'فشل إضافة المستخدم', 'error');
    }
  } catch(e) {
    showToast('حدث خطأ', 'error');
  }
  hideLoading();
}

async function viewStudentDetails(username) {
  let details;
  if (MOCK_MODE) {
    details = {
      username,
      progress: { completed_lessons: ['l1'], completed_materials: ['m1'] },
      attempts: [
        { quiz_id: 'quiz1', material_id: 'm2', score: 8, max_score: 10, is_graded: true,  attempt_date: new Date().toISOString() },
        { quiz_id: 'quiz2', material_id: 'm3', score: 0, max_score: 5,  is_graded: false, attempt_date: new Date().toISOString() }
      ]
    };
  } else {
    const res = await API.get('getStudentDetails', { username });
    details = res;
  }

  // Build a lookup: material_id → material title
  const matTitleById = {};
  state.allMaterials.forEach(m => { matTitleById[m.material_id] = m.title; });
  // Also check quizzes map: quiz_id → material title
  const titleByQuizId = {};
  Object.entries(state.quizzes).forEach(([matId, quiz]) => {
    titleByQuizId[quiz.quiz_id] = matTitleById[matId] || quiz.title || 'اختبار';
  });

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
    <div class="glass modal-content" style="max-width:560px;">
      <div class="flex justify-between items-center" style="margin-bottom: 20px;">
        <h2>@${details.username}</h2>
        <button class="btn btn-secondary" style="padding: 8px 12px;" onclick="this.closest('.modal-overlay').remove()">${ICONS.close}</button>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:24px;">
        <div class="glass" style="padding:16px; text-align:center;">
          <div style="font-size:1.8rem; font-weight:800; color:var(--primary);">${details.progress?.completed_lessons?.length || 0}</div>
          <div style="color:var(--text-muted); font-size:0.85rem;">دروس مكتملة</div>
        </div>
        <div class="glass" style="padding:16px; text-align:center;">
          <div style="font-size:1.8rem; font-weight:800; color:var(--secondary);">${details.progress?.completed_materials?.length || 0}</div>
          <div style="color:var(--text-muted); font-size:0.85rem;">محتويات مكتملة</div>
        </div>
      </div>

      <h3 style="margin-bottom: 12px;">سجل الاختبارات</h3>
      ${(details.attempts || []).length === 0
        ? '<p style="color: var(--text-muted);">لا توجد محاولات بعد.</p>'
        : (details.attempts || []).map(att => {
            const title = titleByQuizId[att.quiz_id] || matTitleById[att.material_id] || 'اختبار';
            const color = att.is_graded ? scoreColor(att.score, att.max_score) : 'var(--warning)';
            const pct   = att.is_graded && att.max_score ? Math.round((att.score / att.max_score) * 100) : null;
            return `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:rgba(0,0,0,0.02); border-radius:10px; margin-bottom:8px;">
                <div>
                  <div style="font-weight:600; margin-bottom:2px;">${title}</div>
                  <div style="font-size:0.8rem; color:var(--text-muted);">${formatDate(att.attempt_date)}</div>
                </div>
                <div style="text-align:center;">
                  <div style="font-size:1.2rem; font-weight:800; color:${color};">
                    ${att.is_graded ? `${att.score}/${att.max_score}` : 'معلق'}
                  </div>
                  ${pct !== null ? `<div style="font-size:0.75rem; color:${color};">${pct}%</div>` : ''}
                </div>
              </div>`;
          }).join('')}
    </div>
  `;
  document.body.appendChild(modal);
}

// ==========================================
// GRADING
// ==========================================
async function renderAdminGrading(container) {
  container.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;">جاري تحميل الدرجات المعلقة...</div>';

  let attempts = [];
  if (!MOCK_MODE) {
    const res = await API.get('getQuizAttempts', { username: '', quizId: '' });
    if (res.success) {
      attempts = res.attempts.filter(a => !a.is_graded && a.answers.some(ans => ans.type === 'essay'));
    }
  }

  container.innerHTML = `
    <h2 style="margin-bottom: 24px; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">بانتظار التصحيح</h2>
    ${attempts.length
      ? attempts.map(att => `
        <div class="glass" style="padding: 24px; margin-bottom: 16px;">
          <div class="flex justify-between items-center" style="margin-bottom: 16px;">
            <div>
              <h4>@${att.username}</h4>
              <p style="color: var(--text-muted); font-size: 0.85rem;">${formatDate(att.attempt_date)}</p>
            </div>
            <span style="color: var(--warning); display:inline-flex; align-items:center; gap:6px;">${ICONS.clock} معلق</span>
          </div>
          ${att.answers.filter(a => a.type === 'essay').map((ans, i) => `
            <div style="margin-bottom: 16px; padding: 16px; background: rgba(0,0,0,0.02); border-radius: 10px;">
              <p style="font-weight: 700; margin-bottom: 8px;">إجابة مقالية ${i + 1}:</p>
              <p style="color: var(--text-muted);">${ans.answer}</p>
            </div>
          `).join('')}
          <div class="flex gap-2" style="margin-top: 16px;">
            <input type="number" style="width: 100px; padding: 10px 14px; border-radius: 10px; border: 2px solid var(--border); font-family: 'Tajawal', sans-serif; font-size: 1rem;" placeholder="الدرجة" id="grade-${att.attempt_id}">
            <button class="btn btn-success" onclick="submitGrade('${att.attempt_id}')">تسليم الدرجة</button>
          </div>
        </div>
      `).join('')
      : '<div class="glass text-center" style="padding: 40px;"><p>لا توجد درجات معلقة. عمل رائع!</p></div>'}
  `;
}

async function submitGrade(attemptId) {
  const score = $(`grade-${attemptId}`).value;
  if (!score) {
    showToast('يرجى إدخال درجة', 'error');
    return;
  }

  if (!MOCK_MODE) {
    await API.post('gradeEssay', {
      attempt_id: attemptId,
      score: parseFloat(score),
      graded_by: state.user.username,
      feedback: ''
    });
  }

  showToast('تم تسليم الدرجة!');
  await refreshAndRenderAdmin();
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
