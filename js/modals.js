// ============================================
// modals.js — Modal display & all form submissions
// Depends on: api.js, state.js, utils.js, student.js, admin.js
// ============================================

function showModal(type, id = null) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'activeModal';

  let content = '';
  const isEdit = type.startsWith('edit');
  const data = isEdit ? id : null;

  if (type === 'deleteConfirm') {
    content = `
      <h3 style="margin-bottom: 20px; color: var(--danger);">تأكيد الحذف</h3>
      <p style="margin-bottom: 20px;">هل أنت متأكد أنك تريد حذف <strong>${id.name}</strong>؟<br>
      <span style="font-size: 0.85rem; color: var(--text-muted);">سيتم حذف جميع العناصر المرتبطة به نهائياً.</span></p>
      <div class="modal-footer">
        <button class="btn btn-primary" style="background: var(--danger); border-color: var(--danger);" onclick="submitDelete('${id.type}', '${id.id}')">نعم، احذف</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      </div>
    `;
  } else if (type === 'addUnit' || type === 'editUnit') {
    content = `
      <h3 style="margin-bottom: 20px;">${isEdit ? 'تعديل الوحدة' : 'إضافة وحدة جديدة'}</h3>
      <input type="hidden" id="unitId" value="${isEdit ? data.unit_id : ''}">
      <div class="input-group">
        <label>رقم الوحدة</label>
        <input type="number" id="unitNumber" value="${isEdit ? data.unit_number : ''}" placeholder="مثال: 1">
      </div>
      <div class="input-group">
        <label>اسم الوحدة</label>
        <input type="text" id="unitName" value="${isEdit ? data.unit_name : ''}" placeholder="مثال: مقدمة في البرمجة">
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="${isEdit ? 'submitEditUnit()' : 'submitUnit()'}">${isEdit ? 'حفظ التعديلات' : 'إضافة وحدة'}</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      </div>
    `;
  } else if (type === 'addLesson' || type === 'editLesson') {
    const targetUnitId = isEdit ? (data.unit_id || '') : (id || '');
    const unitLessons = state.lessons[targetUnitId] || [];
    const suggestedLessonNum = unitLessons.length + 1;
    content = `
      <h3 style="margin-bottom: 20px;">${isEdit ? 'تعديل الدرس' : 'إضافة درس جديد'}</h3>
      <input type="hidden" id="lessonId" value="${isEdit ? data.lesson_id : ''}">
      <div class="input-group">
        <label>الوحدة المستهدفة (اختياري)</label>
        <select id="lessonUnitId" onchange="onLessonUnitChange()">
          <option value="">-- بدون وحدة (درس مستقل) --</option>
          ${state.units.map(u => `<option value="${u.unit_id}" ${((isEdit && String(data.unit_id) === String(u.unit_id)) || (!isEdit && String(id) === String(u.unit_id))) ? 'selected' : ''}>${u.unit_name}</option>`).join('')}
        </select>
      </div>
      <div class="input-group">
        <label>رقم الدرس</label>
        <input type="number" id="lessonNumber" value="${isEdit ? data.lesson_number : suggestedLessonNum}" placeholder="مثال: 1">
      </div>
      <div class="input-group">
        <label>اسم الدرس</label>
        <input type="text" id="lessonName" value="${isEdit ? data.lesson_name : ''}" placeholder="مثال: الدرس الأول: مقدمة وشرح المفاهيم">
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="${isEdit ? 'submitEditLesson()' : 'submitLesson()'}">${isEdit ? 'حفظ التعديلات' : 'إضافة درس'}</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      </div>
    `;
  } else if (type === 'addMaterial' || type === 'editMaterial') {
    const targetMatch = String(id || '');
    content = `
      <h3 style="margin-bottom: 20px;">${isEdit ? 'تعديل المحتوى' : 'إضافة محتوى جديد'}</h3>
      <input type="hidden" id="materialId" value="${isEdit ? data.material_id : ''}">
      <div class="input-group">
        <label>الموقع المستهدف (الوحدة أو الدرس)</label>
        <select id="materialLessonIdSelect">
          <option value="">-- خارج الدروس والوحدات (مستقل) --</option>
          ${state.units.map(u => {
            const isUnitDirect = !isEdit && (targetMatch === `unit_${u.unit_id}` || targetMatch === String(u.unit_id));
            const isEditUnit = isEdit && String(data.lesson_id) === `unit_${u.unit_id}`;
            return `
            <optgroup label="${u.unit_name}">
              <option value="unit_${u.unit_id}" ${isUnitDirect || isEditUnit ? 'selected' : ''}>-- داخل الوحدة مباشرة (${u.unit_name}) --</option>
              ${(state.lessons[u.unit_id] || []).map(l => {
                const isLessonMatch = !isEdit && !isUnitDirect && targetMatch === String(l.lesson_id);
                const isEditLesson = isEdit && String(data.lesson_id) === String(l.lesson_id);
                return `<option value="${l.lesson_id}" ${isLessonMatch || isEditLesson ? 'selected' : ''}>الدرس: ${l.lesson_name}</option>`;
              }).join('')}
            </optgroup>
          `;}).join('')}
          <optgroup label="دروس مستقلة">
            ${(state.lessons[''] || []).map(l => `<option value="${l.lesson_id}" ${((isEdit && String(data.lesson_id) === String(l.lesson_id)) || (!isEdit && targetMatch === String(l.lesson_id))) ? 'selected' : ''}>الدرس: ${l.lesson_name}</option>`).join('')}
          </optgroup>
        </select>
      </div>
      <div class="input-group">
        <label>عنوان المحتوى</label>
        <input type="text" id="materialTitle" value="${isEdit ? data.title : ''}" placeholder="مثال: شرائح شرح الدرس الأول">
      </div>
      <div class="input-group">
        <label>نوع المحتوى</label>
        <select id="materialType" onchange="toggleMaterialFields()">
          <option value="link" ${isEdit && (data.type === 'link' || data.type === 'external') ? 'selected' : ''}>🔗 رابط خارجي / شرائح (Google Slides, Canva, Notion, إلخ)</option>
          <option value="pdf" ${isEdit && data.type === 'pdf' ? 'selected' : ''}>📄 PDF / مستند (جوجل درايف)</option>
          <option value="video" ${isEdit && data.type === 'video' ? 'selected' : ''}>🎥 فيديو (YouTube / Drive / مباشر)</option>
          <option value="quiz" ${isEdit && data.type === 'quiz' ? 'selected' : ''}>📝 اختبار تفاعلي</option>
          <option value="article" ${isEdit && data.type === 'article' ? 'selected' : ''}>🌐 مقال / صفحة ويب</option>
        </select>
      </div>
      <div class="input-group" id="contentField" style="display: ${isEdit && data.type === 'quiz' ? 'none' : 'block'}">
        <label id="materialContentLabel">${isEdit && data.type === 'pdf' ? 'رابط ملف PDF (Google Drive)' : (isEdit && data.type === 'video' ? 'رابط الفيديو' : 'رابط المحتوى / الشرائح')}</label>
        <input type="text" id="materialLinkInput" value="${isEdit ? (data.content || '') : ''}" placeholder="${isEdit && data.type === 'pdf' ? 'https://drive.google.com/file/d/...' : 'https://... (مثال: رابط شرائح Google Slides أو Canva)'}">
        <p id="materialContentHint" style="margin-top: 6px; font-size: 0.82rem; color: var(--text-muted); line-height: 1.6;">
          ${isEdit && data.type === 'pdf' ? '📌 يمكنك لصق رابط المشاركة من Google Drive كما هو — سيتم استخراج معرّف الملف تلقائياً.<br><strong style="color: var(--danger);">تنبيه:</strong> تأكد من إعداد المشاركة: "أي شخص لديه الرابط".' : '🔗 <strong>رابط خارجي:</strong> يمكنك وضع رابط شرائح Google Slides أو Canva أو Notion أو أي موقع خارجي.<br>سيتوفر للطالب زر بارز للانتقال للمحتوى مباشرة في نافذة جديدة مع إمكانية عرض معاينة.'}
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="${isEdit ? 'submitEditMaterial()' : 'submitMaterial()'}">${isEdit ? 'حفظ التعديلات' : 'إضافة محتوى'}</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      </div>
    `;
  } else if (type === 'addQuiz') {
    content = `
      <h3 style="margin-bottom: 20px;">إنشاء اختبار</h3>
      <p style="color: var(--text-muted); margin-bottom: 16px;">
        أولاً، أنشئ محتوى من نوع "اختبار" في قسم المحتوى، ثم انتقل إلى قسم الاختبارات وانقر على "إنشاء اختبار" بجانب المحتوى لتفعيله، ثم أضف الأسئلة.
      </p>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">إغلاق</button>
      </div>
    `;
  } else if (type === 'addQuestion' || type === 'editQuestion') {
    // FIX: options may come back as a JSON string from the backend — parse it first
    let parsedOptions = isEdit && data.options ? data.options : null;
    if (typeof parsedOptions === 'string') {
      try { parsedOptions = JSON.parse(parsedOptions); } catch { parsedOptions = null; }
    }
    const opts = Array.isArray(parsedOptions) ? parsedOptions.join('\n') : '';

    // correct_answer may also be a string
    let parsedCorrect = isEdit ? (data.correct_answer ?? 0) : 0;
    if (typeof parsedCorrect === 'string') {
      try { parsedCorrect = JSON.parse(parsedCorrect); } catch { parsedCorrect = 0; }
    }

    content = `
      <h3 style="margin-bottom: 20px;">${isEdit ? 'Edit Question' : 'Add Question'}</h3>
      <input type="hidden" id="questionId" value="${isEdit ? data.question_id : ''}">
      <input type="hidden" id="questionQuizId" value="${isEdit ? data.quiz_id : id}">
      <div class="input-group">
        <label>Question Type</label>
        <select id="questionType" onchange="toggleQuestionFields()">
          <option value="mcq"         ${isEdit && data.type === 'mcq'        ? 'selected' : ''}>Multiple Choice (MCQ)</option>
          <option value="true_false"  ${isEdit && data.type === 'true_false' ? 'selected' : ''}>True / False</option>
          <option value="matching"    ${isEdit && data.type === 'matching'   ? 'selected' : ''}>Matching</option>
          <option value="essay"       ${isEdit && data.type === 'essay'      ? 'selected' : ''}>Essay</option>
        </select>
      </div>
      <div class="input-group">
        <label>Question Text</label>
        <textarea id="questionText" rows="3" placeholder="Enter the question...">${isEdit ? data.question_text : ''}</textarea>
      </div>
      <div class="input-group">
        <label>Points</label>
        <input type="number" id="questionPoints" value="${isEdit ? (data.points || 1) : '1'}" min="1">
      </div>
      <div id="optionsContainer" style="display: ${isEdit && data.type === 'essay' ? 'none' : 'block'}">
        <div class="input-group">
          <label>Options (one per line)</label>
          <textarea id="questionOptions" rows="4" placeholder="Option A\nOption B\nOption C\nOption D">${opts}</textarea>
        </div>
        <div class="input-group">
          <label>Correct Answer (0-based index)</label>
          <input type="number" id="questionCorrect" value="${parsedCorrect}" min="0">
        </div>
      </div>
      <div class="input-group">
        <label>Explanation <span style="color:var(--text-muted); font-weight:400; font-size:0.85rem;">(shown to student after wrong answer)</span></label>
        <textarea id="questionExplanation" rows="2"
          placeholder="Why is this the correct answer? Shown to students after submission.">${isEdit ? (data.explanation || '') : ''}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="${isEdit ? 'submitEditQuestion()' : 'submitQuestion()'}">${isEdit ? 'Save Changes' : 'Add Question'}</button>
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    `;
  } else if (type === 'editQuizSettings') {
    // id = { material_id, title, settings }
    const qz = id;
    const settings = qz.settings || {};
    content = `
      <h3 style="margin-bottom: 4px;">إعدادات الاختبار</h3>
      <p style="color:var(--text-muted); margin-bottom:20px; font-size:0.85rem;">${qz.title || 'الاختبار'}</p>
      <input type="hidden" id="quizSettingsMaterialId" value="${qz.material_id}">
      <div class="input-group">
        <label>الوقت المحدد (بالدقائق) &nbsp;<span style="color:var(--text-muted); font-weight:400; font-size:0.85rem;">0 = مفتوح</span></label>
        <input type="number" id="quizTimeLimit" value="${settings.time_limit || 0}" min="0" max="180" step="1">
        <p style="margin-top:6px; font-size:0.82rem; color:var(--text-muted); line-height:1.6;">
          سيظهر للطلاب عداد تنازلي، وعند الانتهاء سيتم تسليم الاختبار تلقائياً.
        </p>
      </div>
      <div class="input-group" style="margin-top: 16px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="quizReviewMode" ${settings.is_review_mode ? 'checked' : ''} style="width:18px;height:18px;">
          <strong>فرض وضع المراجعة (بدون تقييم)</strong>
        </label>
        <p style="margin-top:6px; font-size:0.82rem; color:var(--text-muted); line-height:1.6;">
          إذا تم التفعيل، سيُجبر الطالب على أداء الاختبار في وضع المراجعة فقط (تظهر الإجابة الصحيحة فوراً ولا تسجل الدرجة).
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="submitQuizSettings()">حفظ الإعدادات</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      </div>
    `;
  } else if (type === 'importQuiz') {
    // Build quiz options from loaded state
    let quizOptions = '<option value="">-- اختر الاختبار المستهدف --</option>';
    
    for (const mat of state.allMaterials) {
      if (mat.type === 'quiz') {
        const quiz = state.quizzes[mat.material_id];
        if (quiz) {
          let unitName = '';
          let lessonName = '';
          if (mat.lesson_id) {
            if (mat.lesson_id.startsWith('unit_')) {
              const unitId = mat.lesson_id.replace('unit_', '');
              const unit = state.units.find(u => u.unit_id === unitId);
              if (unit) unitName = unit.unit_name + ' (مباشرة)';
            } else {
              for (const u of state.units) {
                if (state.lessons[u.unit_id]) {
                  const lesson = state.lessons[u.unit_id].find(l => l.lesson_id === mat.lesson_id);
                  if (lesson) { unitName = u.unit_name; lessonName = lesson.lesson_name; break; }
                }
              }
              if (!lessonName && state.lessons['']) {
                const lesson = state.lessons[''].find(l => l.lesson_id === mat.lesson_id);
                if (lesson) lessonName = 'مستقل: ' + lesson.lesson_name;
              }
            }
          }
          
          let locationStr = '';
          if (unitName && lessonName) locationStr = `${unitName} → ${lessonName}`;
          else if (unitName) locationStr = unitName;
          else if (lessonName) locationStr = lessonName;
          else locationStr = 'مستقل';
          
          quizOptions += `<option value="${quiz.quiz_id}" data-material="${mat.material_id}">${mat.title} (${locationStr})</option>`;
        }
      }
    }

    content = `
      <h3 style="margin-bottom: 4px;">استيراد أسئلة من JSON</h3>
      <p style="color: var(--text-muted); margin-bottom: 20px; font-size: 0.85rem;">اختر الاختبار ثم الصق أو ارفع ملف JSON بالأسئلة</p>

      <div class="input-group">
        <label>الاختبار المستهدف</label>
        <select id="importTargetQuiz" style="width:100%; padding:10px 14px; border-radius:10px; border:2px solid var(--border); font-family:'Tajawal',sans-serif; font-size:1rem; background:var(--surface);">
          ${quizOptions}
        </select>
      </div>

      <div class="input-group">
        <label>رفع ملف JSON (اختياري)</label>
        <input type="file" id="importFile" accept=".json,application/json"
          style="padding:10px; border-radius:10px; border:2px dashed var(--border); width:100%; cursor:pointer;"
          onchange="handleImportFile(event)">
      </div>

      <div class="glass" style="padding:12px; margin-bottom:16px; background:rgba(0,0,0,0.02); font-size:0.85rem;">
        <h4 style="margin-bottom:8px; display:flex; align-items:center; gap:6px;">${ICONS.info} دليل الصيغة (Syntax Guide)</h4>
        <pre id="jsonSyntaxGuide" style="direction:ltr; text-align:left; font-family:monospace; white-space:pre-wrap; background:#1e1e1e; color:#d4d4d4; padding:12px; border-radius:8px; overflow-x:auto; user-select:all; cursor:copy; font-size: 0.75rem;">
[
  {
    "type": "mcq",
    "question_text": "What is 2+2?",
    "options": ["3", "4", "5", "6"],
    "correct_answer": 1,
    "points": 1,
    "explanation": "Because 2+2=4"
  },
  {
    "type": "true_false",
    "question_text": "Is the sky blue?",
    "options": ["True", "False"],
    "correct_answer": 0,
    "points": 1
  },
  {
    "type": "essay",
    "question_text": "Explain quantum physics",
    "points": 5
  },
  {
    "type": "matching",
    "question_text": "Match the following",
    "options": [
      {"left": "Apple", "right": "Red"},
      {"left": "Banana", "right": "Yellow"}
    ],
    "points": 2
  }
]
        </pre>
        <button class="btn btn-secondary mt-2 w-full" style="padding: 6px;" onclick="copySyntaxGuide()">${ICONS.copy} انسخ الصيغة</button>
      </div>

      <div class="input-group">
        <label>أو الصق JSON مباشرةً</label>
        <textarea id="importJson" rows="8"
          style="font-family: monospace; font-size: 0.85rem; direction: ltr;"
          placeholder='[\n  {\n    "type": "mcq",\n    "question_text": "What is 2+2?",\n    "options": ["3", "4", "5", "6"],\n    "correct_answer": 1,\n    "points": 1\n  }\n]'
          oninput="previewImportJson()"></textarea>
      </div>

      <div id="importPreview" style="display:none; margin-bottom:16px;"></div>

      <div class="modal-footer">
        <button class="btn btn-primary" id="importSubmitBtn" onclick="submitImport()" disabled>استيراد</button>
        <button class="btn btn-secondary" onclick="previewImportJson()">معاينة</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      </div>
    `;
  }

  modal.innerHTML = `<div class="glass modal-content">${content}</div>`;
  document.body.appendChild(modal);
}

function closeModal() {
  const modal = $('activeModal');
  if (modal) modal.remove();
}

function onLessonUnitChange() {
  const selUnitId = $('lessonUnitId')?.value;
  const numInput = $('lessonNumber');
  if (numInput && !$('lessonId')?.value) {
    const count = (state.lessons[selUnitId] || []).length;
    numInput.value = count + 1;
  }
}

function toggleMaterialFields() {
  const type = $('materialType')?.value;
  const field = $('contentField');
  if (!field) return;

  if (type === 'quiz') {
    field.style.display = 'none';
    return;
  }
  field.style.display = 'block';

  const label = $('materialContentLabel');
  const input = $('materialLinkInput');
  const hint = $('materialContentHint');

  if (type === 'link') {
    if (label) label.textContent = 'رابط المحتوى الخارجي أو الشرائح (URL)';
    if (input) input.placeholder = 'مثال: https://docs.google.com/presentation/d/... أو https://canva.com/...';
    if (hint) hint.innerHTML = '🔗 <strong>رابط خارجي:</strong> يمكنك وضع رابط شرائح Google Slides أو Canva أو Notion أو أي موقع خارجي.<br>سيتوفر للطالب زر بارز للانتقال فوراً للمحتوى في صفحة جديدة بالإضافة لمعاينة مباشرة إن أمكن.';
  } else if (type === 'pdf') {
    if (label) label.textContent = 'رابط ملف PDF (Google Drive)';
    if (input) input.placeholder = 'رابط Google Drive (مثال: https://drive.google.com/file/d/FILE_ID/view)';
    if (hint) hint.innerHTML = '📌 يمكنك لصق رابط المشاركة من Google Drive كما هو — سيتم استخراج معرّف الملف تلقائياً.<br><strong style="color: var(--danger);">تنبيه هام:</strong> تأكد من جعل مشاركة الملف: <strong>"أي شخص لديه الرابط"</strong>.';
  } else if (type === 'video') {
    if (label) label.textContent = 'رابط الفيديو (YouTube / Drive / مباشر)';
    if (input) input.placeholder = 'مثال: https://www.youtube.com/watch?v=...';
    if (hint) hint.innerHTML = '🎥 يدعم روابط يوتيوب العادية، روابط Shorts، روابط Google Drive للمرئيات، وروابط mp4 المباشرة.';
  } else if (type === 'article') {
    if (label) label.textContent = 'رابط الصفحة أو المقال';
    if (input) input.placeholder = 'مثال: https://example.com/article';
    if (hint) hint.innerHTML = '🌐 سيتم عرض الصفحة داخل إطار تفاعلي مع إتاحة زر للفتح المباشر في صفحة جديدة.';
  }
}

function toggleQuestionFields() {
  const type = $('questionType').value;
  const container = $('optionsContainer');
  container.style.display = type === 'essay' ? 'none' : 'block';
}

// ==========================================
// FORM SUBMISSIONS - CREATE
// ==========================================
async function submitUnit() {
  let num = $('unitNumber').value;
  const name = $('unitName').value.trim();
  if (!name) { showToast('يرجى إدخال اسم الوحدة', 'error'); return; }

  if (!num) {
    num = state.units.length + 1;
  }

  showLoading();
  try {
    if (!MOCK_MODE) {
      const res = await API.post('addUnit', { unit_number: parseInt(num), unit_name: name });
      if (!res || !res.success) {
        showToast('خطأ: ' + (res?.message || 'فشل في إضافة الوحدة'), 'error');
        return;
      }
    }
    showToast('تمت إضافة الوحدة بنجاح!');
    closeModal();
    await refreshAndRenderAdmin();
  } catch (err) {
    console.error(err);
    showToast('خطأ في الاتصال بالخادم', 'error');
  } finally {
    hideLoading();
  }
}

async function submitLesson() {
  const unitId = $('lessonUnitId')?.value || '';
  let num = $('lessonNumber')?.value;
  const name = $('lessonName')?.value.trim();
  if (!name) { showToast('يرجى كتابة اسم الدرس', 'error'); return; }

  if (!num) {
    const existing = state.lessons[unitId] || [];
    num = existing.length + 1;
  }

  showLoading();
  try {
    if (!MOCK_MODE) {
      const res = await API.post('addLesson', { unit_id: unitId, lesson_number: parseInt(num), lesson_name: name });
      if (!res || !res.success) {
        showToast('خطأ: ' + (res?.message || 'فشل في إضافة الدرس'), 'error');
        return;
      }
    }
    showToast('تمت إضافة الدرس بنجاح!');
    closeModal();
    await refreshAndRenderAdmin();
  } catch (err) {
    console.error(err);
    showToast('خطأ في الاتصال بالخادم أثناء إضافة الدرس', 'error');
  } finally {
    hideLoading();
  }
}

async function submitMaterial() {
  const lessonId = $('materialLessonIdSelect')?.value || $('materialLessonId')?.value || '';
  const title = $('materialTitle').value.trim();
  const type = $('materialType').value;
  const rawContent = $('materialLinkInput')?.value?.trim() || '';

  if (!title) { showToast('يرجى كتابة عنوان المحتوى', 'error'); return; }
  if (type !== 'quiz' && !rawContent) {
    showToast('يرجى إدخال الرابط أو محتوى الدرس', 'error');
    return;
  }

  showLoading();
  try {
    if (!MOCK_MODE) {
      const res = await API.post('addMaterial', { lesson_id: lessonId, title, type, content: rawContent });
      if (!res || !res.success) {
        showToast('خطأ: ' + (res?.message || 'فشل في إضافة المحتوى'), 'error');
        return;
      }
    }
    showToast('تمت إضافة المحتوى بنجاح!');
    closeModal();
    await refreshAndRenderAdmin();
  } catch (err) {
    console.error(err);
    showToast('خطأ في الاتصال بالخادم أثناء إضافة المحتوى', 'error');
  } finally {
    hideLoading();
  }
}

async function submitQuestion() {
  const type = $('questionType').value;
  let options = null;
  let correct = null;

  if (type !== 'essay') {
    options = $('questionOptions').value.split('\n').map(s => s.trim()).filter(s => s);
    correct = parseInt($('questionCorrect').value);
    if (!options.length) { showToast('يرجى إدخال الخيارات', 'error'); return; }
  }

  const text = $('questionText').value.trim();
  if (!text) { showToast('يرجى إدخال نص السؤال', 'error'); return; }

  const data = {
    quiz_id: $('questionQuizId').value,
    type,
    question_text: text,
    options,
    correct_answer: correct,
    points: parseInt($('questionPoints').value) || 1,
    order_index: 0,
    explanation: $('questionExplanation')?.value?.trim() || null
  };

  const questionId = $('questionId').value;

  if (!MOCK_MODE) {
    if (questionId) {
      await API.post('editItem', { 
        itemType: 'question', 
        id: questionId, 
        updates: { 
          2: type, 
          3: text, 
          4: JSON.stringify(options), 
          5: JSON.stringify(correct), 
          6: data.points,
          8: data.explanation || ''
        } 
      });
      showToast('تم تعديل السؤال!');
    } else {
      await API.post('addQuestion', data);
      showToast('تمت إضافة السؤال!');
    }
  } else {
    showToast(questionId ? 'تم تعديل السؤال!' : 'تمت إضافة السؤال!');
  }
  closeModal();
  await refreshAndRenderAdmin();
}

// ==========================================
// IMPORT QUIZ HELPERS
// ==========================================

/** Called when admin picks a .json file — loads it into the textarea and previews */
function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    $('importJson').value = e.target.result;
    previewImportJson();
  };
  reader.readAsText(file);
}

/** Validates and renders a live preview of the questions that will be imported */
function previewImportJson() {
  const previewEl = $('importPreview');
  const btn = $('importSubmitBtn');
  const raw = $('importJson').value.trim();

  if (!raw) {
    previewEl.style.display = 'none';
    btn.disabled = true;
    return;
  }

  let questions;
  try {
    const parsed = JSON.parse(raw);
    // Accept either an array directly OR an object with a "questions" key
    questions = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(questions) || !questions.length) throw new Error('empty');
  } catch {
    previewEl.style.display = 'block';
    previewEl.innerHTML = `
      <div style="padding:12px 16px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.3); border-radius:10px; color:var(--danger);">
        ⚠️ تنسيق JSON غير صالح. تأكد أن المحتوى مصفوفة [ ] من الأسئلة أو كائن { "questions": [...] }.
      </div>`;
    btn.disabled = true;
    return;
  }

  const VALID_TYPES = ['mcq', 'true_false', 'matching', 'essay'];
  const errors = [];
  const valid = [];

  questions.forEach((q, i) => {
    const idx = i + 1;
    if (!q.type || !VALID_TYPES.includes(q.type)) {
      errors.push(`سؤال ${idx}: نوع غير صالح "${q.type}". الأنواع المسموحة: mcq, true_false, matching, essay`);
      return;
    }
    if (!q.question_text || !q.question_text.trim()) {
      errors.push(`سؤال ${idx}: نص السؤال (question_text) مطلوب`);
      return;
    }
    if (q.type !== 'essay' && q.type !== 'matching') {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        errors.push(`سؤال ${idx}: options يجب أن تكون مصفوفة بها خيارين على الأقل`);
        return;
      }
      if (typeof q.correct_answer !== 'number' || q.correct_answer < 0 || q.correct_answer >= q.options.length) {
        errors.push(`سؤال ${idx}: correct_answer يجب أن يكون رقم index صالح في نطاق options`);
        return;
      }
    } else if (q.type === 'matching') {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        errors.push(`سؤال ${idx}: options لأسئلة التوصيل يجب أن تكون مصفوفة بها زوجين على الأقل`);
        return;
      }
      // Matching questions don't use a single correct_answer index, so set it to 0 or null
      if (q.correct_answer === undefined) q.correct_answer = null;
    }
    valid.push(q);
  });

  const typeLabel = { mcq: 'اختيار متعدد', true_false: 'صح/خطأ', matching: 'توصيل', essay: 'مقالي' };

  previewEl.style.display = 'block';
  previewEl.innerHTML = `
    <div style="border:1px solid var(--border); border-radius:12px; overflow:hidden;">
      <div style="padding:12px 16px; background:rgba(0,0,0,0.03); border-bottom:1px solid var(--border); font-weight:600;">
        معاينة: ${valid.length} سؤال صالح ${errors.length ? `<span style="color:var(--danger); margin-right:8px;">(${errors.length} خطأ)</span>` : '<span style="color:var(--success); margin-right:8px;">✓ جميعها صالحة</span>'}
      </div>
      ${errors.map(e => `<div style="padding:8px 16px; background:rgba(239,68,68,0.06); color:var(--danger); font-size:0.82rem; border-bottom:1px solid rgba(239,68,68,0.15);">${e}</div>`).join('')}
      ${valid.slice(0, 5).map((q, i) => `
        <div style="padding:10px 16px; border-bottom:1px solid var(--border); font-size:0.88rem;">
          <span style="color:var(--text-muted); font-size:0.78rem; margin-left:8px;">${typeLabel[q.type] || q.type}</span>
          <strong>${i + 1}.</strong> ${q.question_text.substring(0, 70)}${q.question_text.length > 70 ? '...' : ''}
        </div>`).join('')}
      ${valid.length > 5 ? `<div style="padding:8px 16px; color:var(--text-muted); font-size:0.82rem;">... و${valid.length - 5} أسئلة أخرى</div>` : ''}
    </div>`;

  btn.disabled = valid.length === 0;
  btn.dataset.validCount = valid.length;
  // Store parsed questions on the button for submitImport to use
  window._importQuestions = valid;
}

/** Submits the validated questions one-by-one (or bulk if API supports importQuiz) */
async function submitImport() {
  const quizSelect = $('importTargetQuiz');
  const quizId = quizSelect?.value;

  if (!quizId) {
    showToast('يرجى اختيار الاختبار المستهدف أولاً', 'error');
    return;
  }

  const questions = window._importQuestions;
  if (!questions || !questions.length) {
    showToast('لا توجد أسئلة صالحة للاستيراد', 'error');
    return;
  }

  const btn = $('importSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'جاري الاستيراد...';

  if (MOCK_MODE) {
    // In mock mode: add questions to local state only
    if (!state.questions[quizId]) state.questions[quizId] = [];
    questions.forEach((q, i) => {
      state.questions[quizId].push({
        question_id: 'mock_import_' + Date.now() + '_' + i,
        quiz_id: quizId,
        type: q.type,
        question_text: q.question_text,
        options: q.options || null,
        correct_answer: q.correct_answer ?? null,
        points: q.points || 1,
        order_index: state.questions[quizId].length,
        explanation: q.explanation || ''
      });
    });
    showToast(`✓ تم استيراد ${questions.length} أسئلة! (وضع تجريبي)`);
    closeModal();
    await refreshAndRenderAdmin();
    return;
  }

  // Try bulk import first, fall back to adding one by one
  try {
    const bulkRes = await API.post('importQuiz', { quiz_id: quizId, questions });
    if (bulkRes && bulkRes.success) {
      showToast(`✓ تم استيراد ${questions.length} أسئلة بنجاح!`);
      closeModal();
      refreshAndRenderAdmin().catch(console.error);
      return;
    }
  } catch (err) {
    console.error("Bulk import error:", err);
    // If it was a network error but the request reached the server, 
    // falling through might duplicate. We rely on the proxy now.
  }

  // Fallback: add questions one by one using addQuestion
  let successCount = 0;
  let failCount = 0;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    try {
      const res = await API.post('addQuestion', {
        quiz_id: quizId,
        type: q.type,
        question_text: q.question_text,
        options: q.options || null,
        correct_answer: q.correct_answer ?? null,
        points: q.points || 1,
        order_index: i,
        explanation: q.explanation || ''
      });
      if (res && res.success) successCount++;
      else failCount++;
    } catch {
      failCount++;
    }
  }

  if (successCount > 0) {
    showToast(`✓ تم استيراد ${successCount} أسئلة${failCount > 0 ? ` (${failCount} فشل)` : ''}!`);
    closeModal();
    await refreshAndRenderAdmin();
  } else {
    showToast(`فشل الاستيراد. تأكد من إعدادات الباك اند.`, 'error');
    btn.disabled = false;
    btn.textContent = 'استيراد';
  }
}

// ==========================================
// FORM SUBMISSIONS - EDIT
// ==========================================
async function submitEditUnit() {
  const id = $('unitId').value;
  const num = $('unitNumber').value;
  const name = $('unitName').value.trim();
  if (!num || !name) { showToast('يرجى ملء جميع الحقول', 'error'); return; }

  if (!MOCK_MODE) {
    const res = await API.post('editItem', { itemType: 'unit', id, updates: { 1: parseInt(num), 2: name } });
    if (!res.success) { showToast('حدث خطأ: ' + res.message, 'error'); return; }
  }
  showToast('تم تعديل الوحدة!');
  closeModal();
  await refreshAndRenderAdmin();
}

async function submitEditLesson() {
  const id = $('lessonId').value;
  const unitId = $('lessonUnitId')?.value;
  const num = $('lessonNumber').value;
  const name = $('lessonName').value.trim();
  if (!num || !name) { showToast('يرجى ملء جميع الحقول', 'error'); return; }

  showLoading();
  try {
    if (!MOCK_MODE) {
      const updates = { 2: parseInt(num), 3: name };
      if (unitId !== undefined) {
        updates[1] = unitId;
      }
      const res = await API.post('editItem', { itemType: 'lesson', id, updates });
      if (!res || !res.success) {
        showToast('حدث خطأ: ' + (res?.message || 'فشل في تعديل الدرس'), 'error');
        return;
      }
    }
    showToast('تم تعديل الدرس بنجاح!');
    closeModal();
    await refreshAndRenderAdmin();
  } catch (err) {
    console.error(err);
    showToast('خطأ في حفظ تعديلات الدرس', 'error');
  } finally {
    hideLoading();
  }
}

async function submitEditMaterial() {
  const id = $('materialId').value;
  const targetLessonId = $('materialLessonIdSelect')?.value;
  const title = $('materialTitle').value.trim();
  const type = $('materialType').value;
  const rawContent = $('materialLinkInput')?.value?.trim() || '';
  if (!title) { showToast('يرجى ملء العنوان', 'error'); return; }

  showLoading();
  try {
    if (!MOCK_MODE) {
      const updates = { 2: title, 3: type, 4: rawContent };
      if (targetLessonId !== undefined) {
        updates[1] = targetLessonId;
      }
      const res = await API.post('editItem', { itemType: 'material', id, updates });
      if (!res || !res.success) {
        showToast('حدث خطأ: ' + (res?.message || 'فشل في تعديل المحتوى'), 'error');
        return;
      }
    }
    showToast('تم تعديل المحتوى بنجاح!');
    closeModal();
    await refreshAndRenderAdmin();
  } catch (err) {
    console.error(err);
    showToast('خطأ في حفظ تعديلات المحتوى', 'error');
  } finally {
    hideLoading();
  }
}

async function submitEditQuestion() {
  const id = $('questionId').value;
  const type = $('questionType').value;
  let options = null;
  let correct = null;

  if (type !== 'essay') {
    options = $('questionOptions').value.split('\n').map(s => s.trim()).filter(s => s);
    correct = parseInt($('questionCorrect').value);
    if (!options.length) { showToast('يرجى إدخال الخيارات', 'error'); return; }
  }

  const text = $('questionText').value.trim();
  if (!text) { showToast('يرجى إدخال نص السؤال', 'error'); return; }

  if (!MOCK_MODE) {
    const res = await API.post('editItem', { 
      itemType: 'question', 
      id, 
      updates: { 
        2: type, 
        3: text, 
        4: JSON.stringify(options), 
        5: JSON.stringify(correct),
        6: parseInt($('questionPoints').value) || 1,
        7: $('questionExplanation')?.value?.trim() || ''
      } 
    });
    if (!res.success) { showToast('حدث خطأ: ' + res.message, 'error'); return; }
  }
  showToast('تم تعديل السؤال!');
  closeModal();
  await refreshAndRenderAdmin();
}

// ==========================================
// FORM SUBMISSIONS - QUIZ SETTINGS
// ==========================================
async function submitQuizSettings() {
  const materialId = $('quizSettingsMaterialId').value;
  const timeLimit  = Math.max(0, parseInt($('quizTimeLimit').value) || 0);
  const isReviewMode = $('quizReviewMode').checked;

  const settingsStr = JSON.stringify({
    time_limit: timeLimit,
    is_review_mode: isReviewMode
  });

  if (!MOCK_MODE) {
    try {
      const res = await API.post('editItem', {
        itemType: 'material',
        id: materialId,
        updates: { 4: settingsStr } // Column 4 is 'content'
      });
      if (!res || !res.success) {
        showToast('خطأ: ' + (res?.message || 'فشل في حفظ الإعدادات'), 'error');
        return;
      }
    } catch(err) {
      console.error('Quiz settings error:', err);
      showToast('خطأ في الاتصال بالخادم!', 'error');
      return;
    }
  }

  // Update local cache
  const mat = state.allMaterials.find(m => m.material_id === materialId);
  if (mat) {
    mat.content = settingsStr;
  }
  
  if (state.quizzes[materialId]) {
    state.quizzes[materialId].time_limit = timeLimit;
    state.quizzes[materialId].is_review_mode = isReviewMode;
  }

  showToast('تم حفظ إعدادات الاختبار بنجاح');
  closeModal();
  if (typeof refreshAndRenderAdmin === 'function') await refreshAndRenderAdmin();
}

// ==========================================
// FORM SUBMISSIONS - DELETE
// ==========================================
async function submitDelete(type, id) {
  if (!MOCK_MODE) {
    const res = await API.post('deleteItem', { itemType: type, id });
    if (!res.success) { 
      showToast('خطأ: ' + res.message + ' (هل قمت بتحديث رابط الباك اند؟)', 'error'); 
      return; 
    }
  }
  showToast('تم الحذف بنجاح!');
  closeModal();
  await refreshAndRenderAdmin();
}
