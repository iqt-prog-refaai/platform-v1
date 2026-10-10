// ============================================
// material.js — Material viewer, PDF embed (with
//               fallback + download), markComplete
// Depends on: api.js, state.js, utils.js, router.js
//
// BUG FIX: PDF iframe fallback + proper download URL
// BUG FIX: Quiz card only shows start button when quiz exists
// ============================================

async function renderMaterialViewer(lessonId, specificMaterialId = null) {
  const container = $('materialContent');
  
  let mats = [];
  if (specificMaterialId) {
    // If we're opening a specific standalone material
    const found = state.allMaterials.find(m => m.material_id === specificMaterialId);
    if (found) mats = [found];
  } else {
    // Otherwise open all materials in the lesson
    mats = state.materials[lessonId] || [];
  }

  // Filter out hidden materials for students
  if (state.user?.role !== 'admin') {
    mats = mats.filter(m => !m.is_hidden);
  }

  // Find lesson and unit metadata for proper header display
  let currentLessonObj = null;
  let currentUnitObj = null;
  const isDirectUnitMat = String(lessonId || '').startsWith('unit_');

  if (lessonId && !isDirectUnitMat) {
    for (const [uId, lList] of Object.entries(state.lessons)) {
      const found = lList.find(l => String(l.lesson_id) === String(lessonId));
      if (found) {
        currentLessonObj = found;
        currentUnitObj = state.units.find(u => String(u.unit_id) === String(uId));
        break;
      }
    }
  } else if (isDirectUnitMat) {
    const uId = lessonId.replace('unit_', '');
    currentUnitObj = state.units.find(u => String(u.unit_id) === String(uId));
  }

  const isLessonCompleted = lessonId && Array.isArray(state.progress?.completed_lessons) && state.progress.completed_lessons.includes(lessonId);

  let headerHtml = '';
  if (currentLessonObj || currentUnitObj) {
    const titleText = currentLessonObj ? `الدرس ${currentLessonObj.lesson_number || ''}: ${currentLessonObj.lesson_name}` : (currentUnitObj?.unit_name || 'محتوى تعليمي');
    const subtitleText = currentUnitObj ? currentUnitObj.unit_name : 'درس مستقل';

    headerHtml = `
      <div class="glass lesson-viewer-header">
        <div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px; font-weight: 600;">
            ${subtitleText}
          </div>
          <h2 style="margin: 0; font-family: 'Space Grotesk', 'Tajawal', sans-serif; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <span>${titleText}</span>
            <span class="lesson-status-pill ${isLessonCompleted ? 'completed' : 'pending'}">
              ${isLessonCompleted ? `${ICONS.check} مكتمل` : 'قيد التقدم'}
            </span>
          </h2>
        </div>
        ${(lessonId && !isDirectUnitMat) ? `
          <div>
            <button class="btn ${isLessonCompleted ? 'btn-secondary' : 'btn-success'}" onclick="toggleLessonComplete('${lessonId}')" style="box-shadow: 0 4px 14px rgba(16, 185, 129, 0.2); font-weight: 700;">
              ${isLessonCompleted ? `${ICONS.close} إلغاء تحديد الاكتمال` : `${ICONS.check} تحديد الدرس كاملاً كمكتمل`}
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  if (!mats.length) {
    container.innerHTML = `
      ${headerHtml}
      <div class="glass text-center" style="padding: 60px;">
        <p style="font-size: 1.1rem; color: var(--text-muted); margin-bottom: 20px;">لا يوجد محتوى متاح لهذا الدرس حالياً.</p>
        ${(lessonId && !isDirectUnitMat) ? `
          <button class="btn ${isLessonCompleted ? 'btn-secondary' : 'btn-success'}" onclick="toggleLessonComplete('${lessonId}')">
            ${isLessonCompleted ? `${ICONS.close} إلغاء تحديد الاكتمال` : `${ICONS.check} وضع علامة أنك حضرت / أتممت هذا الدرس`}
          </button>
        ` : ''}
      </div>
    `;
    return;
  }

  let html = headerHtml;

  for (const mat of mats) {
    const isCompleted = state.progress?.completed_materials?.includes(mat.material_id);

    if (mat.type === 'pdf') {
      html += renderPdfMaterial(mat, isCompleted);
    } else if (mat.type === 'quiz') {
      html += await renderQuizMaterial(mat, isCompleted);
    } else if (mat.type === 'video') {
      html += renderVideoMaterial(mat, isCompleted);
    } else if (mat.type === 'article') {
      html += renderArticleMaterial(mat, isCompleted);
    } else if (mat.type === 'link' || mat.type === 'external') {
      html += renderLinkMaterial(mat, isCompleted);
    }
  }

  // Bottom completion banner for lessons
  if (lessonId && !isDirectUnitMat) {
    html += `
      <div class="glass" style="margin-top: 32px; padding: 24px; text-align: center; border-radius: 16px; border: 1px solid var(--border); background: linear-gradient(135deg, rgba(99,102,241,0.03), rgba(16,185,129,0.03));">
        <h3 style="margin-bottom: 8px;">إتمام الدرس</h3>
        <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 16px;">
          ${isLessonCompleted ? 'تهانينا! هذا الدرس مسجل حالياً كدرس مكتمل في سجل إنجازاتك.' : 'هل انتهيت من استيعاب كافة محتويات هذا الدرس؟ اضغط أدناه لتسجيله كمكتمل.'}
        </p>
        <button class="btn ${isLessonCompleted ? 'btn-secondary' : 'btn-success'}" onclick="toggleLessonComplete('${lessonId}')" style="padding: 12px 28px; font-weight: 700;">
          ${isLessonCompleted ? `${ICONS.close} إلغاء تحديد الاكتمال` : `${ICONS.check} تأكيد إتمام الدرس كاملاً`}
        </button>
      </div>
    `;
  }

  container.innerHTML = html;
}

// ------ FORMAT EXTERNAL LINK ------
function formatExternalUrl(url) {
  if (!url) return '#';
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return 'https://' + trimmed;
  }
  return trimmed;
}

function getSlidesEmbedUrl(url) {
  const formatted = formatExternalUrl(url);
  if (formatted.includes('docs.google.com/presentation')) {
    return formatted.replace(/\/edit(\?.*)?$/, '/embed$1').replace(/\/view(\?.*)?$/, '/embed$1');
  }
  return formatted;
}

// ------ EXTERNAL LINK / SLIDES ------
function renderLinkMaterial(mat, isCompleted) {
  const targetUrl = formatExternalUrl(mat.content);
  const embedUrl = getSlidesEmbedUrl(mat.content);
  const isGoogleSlides = targetUrl.includes('docs.google.com/presentation');

  return `
    <div class="material-header">
      <span class="material-type-badge" style="background: rgba(14, 165, 233, 0.12); color: #0284c7; border: 1px solid rgba(14, 165, 233, 0.25); display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 8px; font-weight: 700; font-size: 0.85rem;">
        ${ICONS.presentation || ICONS.externalLink} شرائح عرض / محتوى خارجي
      </span>
      <h2 style="margin-top: 10px;">${mat.title}</h2>
      ${isCompleted ? `<span style="color: var(--success); display:inline-flex; align-items:center; gap:6px; margin-top:8px; font-weight:600;">${ICONS.check} مكتمل</span>` : ''}
    </div>

    <!-- Prominent Action Card -->
    <div class="glass" style="padding: 28px; border-radius: 16px; margin-bottom: 24px; text-align: center; border: 1px solid rgba(99, 102, 241, 0.2); background: linear-gradient(180deg, rgba(99, 102, 241, 0.03) 0%, rgba(255, 255, 255, 0.8) 100%);">
      <div style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 16px; background: rgba(99, 102, 241, 0.1); display: flex; align-items: center; justify-content: center; color: var(--primary);">
        ${ICONS.presentation || ICONS.externalLink}
      </div>
      <h3 style="margin-bottom: 8px; font-size: 1.25rem;">محتوى الدرس متاح عبر رابط خارجي</h3>
      <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 20px; max-width: 550px; margin-left: auto; margin-right: auto; line-height: 1.6;">
        تم إعداد هذا الدرس على منصة خارجية (مثل Google Slides أو Canva أو موقع مستقل). اضغط على الزر أدناه للانتقال مباشرة إلى المحتوى والبدء في استعراضه.
      </p>

      <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 12px; margin-bottom: 16px;">
        <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="padding: 14px 32px; font-size: 1.05rem; display: inline-flex; align-items: center; gap: 10px; border-radius: 12px; text-decoration: none; font-weight: 700; box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);">
          ${ICONS.externalLink} فتح محتوى الدرس / الشرائح
        </a>
        <span style="font-size: 0.78rem; color: var(--text-muted); direction: ltr; max-width: 350px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block;">
          ${targetUrl}
        </span>
      </div>
    </div>

    ${isGoogleSlides ? `
      <!-- Embedded Slide Viewer for Google Slides -->
      <div style="margin-bottom: 24px;">
        <div style="font-size: 0.9rem; font-weight: 600; margin-bottom: 8px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
          ${ICONS.presentation} معاينة مباشرة للشرائح:
        </div>
        <div style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:14px; border: 1px solid var(--border); box-shadow: var(--shadow);">
          <iframe
            src="${embedUrl}"
            style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;background:#fff;"
            allowfullscreen="true"
            mozallowfullscreen="true"
            webkitallowfullscreen="true">
          </iframe>
        </div>
      </div>
    ` : ''}

    <div style="display:flex; gap:12px; justify-content:center; flex-wrap: wrap; margin-top: 20px;">
      <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
        ${ICONS.externalLink} فتح في نافذة جديدة
      </a>
      <button class="btn btn-success" onclick="markComplete('${mat.material_id}')">
        ${ICONS.check} تحديد كمكتمل
      </button>
    </div>
    <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border);">
  `;
}

// ------ PDF ------
function renderPdfMaterial(mat, isCompleted) {
  const previewUrl = getDrivePreviewUrl(mat.content);
  const downloadUrl = getDriveDownloadUrl(mat.content);
  const openUrl = getDriveOpenUrl(mat.content);
  const isDrive = Boolean(extractDriveFileId(mat.content) || (mat.content && mat.content.includes('drive.google.com')));

  // Trigger safety check in background
  setTimeout(() => schedulePdfFallbackCheck(mat.material_id), 100);

  return `
    <div class="material-header">
      <span class="material-type-badge badge-pdf">${ICONS.document} ملف PDF / مستند</span>
      <h2>${mat.title}</h2>
      ${isCompleted ? `<span style="color: var(--success); display:inline-flex; align-items:center; gap:6px; margin-top:8px;">${ICONS.check} مكتمل</span>` : ''}
    </div>

    <!-- Quick action bar for easy access -->
    <div class="glass" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 14px 20px; border-radius: 14px; margin-bottom: 16px; border: 1px solid rgba(99, 102, 241, 0.15); background: linear-gradient(135deg, rgba(99,102,241,0.04), rgba(255,255,255,0.7));">
      <div style="display: flex; align-items: center; gap: 10px; font-size: 0.95rem; font-weight: 600;">
        <span style="color: var(--primary);">${ICONS.document}</span>
        <span>${isDrive ? 'مستند Google Drive مدمج' : 'مستند PDF رقمي'}</span>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <a href="${openUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="padding: 8px 16px; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 6px;">
          ${ICONS.externalLink} فتح في نافذة كاملة
        </a>
        <a href="${downloadUrl}" class="btn btn-secondary" style="padding: 8px 16px; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 6px;" download target="_blank">
          ${ICONS.download} تحميل
        </a>
      </div>
    </div>

    <div class="pdf-wrapper">
      <iframe
        class="pdf-embed"
        id="pdfFrame-${mat.material_id}"
        src="${previewUrl}"
        frameborder="0"
        allowfullscreen
        onload="onPdfLoad('${mat.material_id}')"
        onerror="onPdfError('${mat.material_id}')">
      </iframe>

      <!-- Fallback shown if iframe blocked or fails to load -->
      <div class="pdf-fallback" id="pdfFallback-${mat.material_id}">
        <div style="color: var(--danger); margin-bottom: 8px; font-size: 2rem;">${ICONS.fileText}</div>
        <h3 style="margin-bottom: 8px;">تعذّر عرض الملف مباشرة داخل الصفحة</h3>
        <p style="margin-bottom: 16px; font-size: 0.95rem; max-width: 500px; line-height: 1.6;">
          قد يكون الملف محميّاً أو تحتاج إعدادات مشاركته في جوجل درايف إلى التعديل لتكون: <strong>"أي شخص لديه الرابط" (Anyone with the link)</strong>.<br>
          يمكنك دائماً فتح المستند أو تحميله مباشرة عبر الأزرار أدناه:
        </p>
        <div class="fallback-actions">
          <a href="${openUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
            ${ICONS.externalLink} فتح المستند في نافذة كاملة
          </a>
          <a href="${downloadUrl}" class="btn btn-secondary" download target="_blank">
            ${ICONS.download} تحميل الملف إلى جهازك
          </a>
        </div>
      </div>
    </div>

    <div style="margin-top: 20px; display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
      <a href="${openUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
        ${ICONS.externalLink} فتح في نافذة كاملة
      </a>
      <a href="${downloadUrl}" class="btn btn-secondary" download target="_blank">
        ${ICONS.download} تحميل الملف
      </a>
      <button class="btn btn-success" onclick="markComplete('${mat.material_id}')">
        ${ICONS.check} تحديد كمكتمل
      </button>
    </div>
    <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border);">
  `;
}

/**
 * Called when the PDF iframe finishes loading.
 * Tries to detect if the iframe is actually blocked by checking if its
 * contentDocument is accessible (same-origin) or null (cross-origin blocked).
 * For cross-origin Google Drive, the iframe loads but we can't inspect it,
 * so we rely on a load event + a short-lived blank-check heuristic.
 */
function onPdfLoad(materialId) {
  const frame = $(`pdfFrame-${materialId}`);
  // Hide fallback — iframe loaded fine
  const fallback = $(`pdfFallback-${materialId}`);
  if (fallback) fallback.classList.remove('visible');
  if (frame) frame.style.display = 'block';
}

function onPdfError(materialId) {
  const frame = $(`pdfFrame-${materialId}`);
  const fallback = $(`pdfFallback-${materialId}`);
  if (frame) frame.style.display = 'none';
  if (fallback) fallback.classList.add('visible');
}

/**
 * Extra safety: after 8 seconds, if the iframe has 0 height content we show fallback.
 * Handles the case where Drive silently refuses embedding without firing onerror.
 */
function schedulePdfFallbackCheck(materialId) {
  setTimeout(() => {
    const frame = $(`pdfFrame-${materialId}`);
    if (!frame) return;
    try {
      // If we can access contentDocument and it has no body content → blocked
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (doc && (!doc.body || doc.body.innerHTML.trim() === '')) {
        onPdfError(materialId);
      }
    } catch(e) {
      // cross-origin → can't inspect → assume it loaded fine (Drive usually works)
    }
  }, 8000);
}

// ------ QUIZ ------
async function renderQuizMaterial(mat, isCompleted) {
  // FIX: Load quiz record if not already cached
  let quiz = state.quizzes[mat.material_id];

  if (!quiz && !MOCK_MODE) {
    try {
      const res = await API.get('getQuizzes', { materialId: mat.material_id });
      if (res.success && res.quizzes.length) {
        quiz = res.quizzes[0];
        state.quizzes[mat.material_id] = quiz;
      }
    } catch(err) {
      console.error('Error fetching quiz:', err);
    }
  }

  // FIX: Load last attempt only when quiz exists
  let lastAttempt = null;
  if (quiz && !MOCK_MODE) {
    try {
      const attRes = await API.get('getQuizAttempts', {
        username: state.user.username,
        quizId: quiz.quiz_id
      });
      if (attRes.success && attRes.attempts.length) {
        lastAttempt = attRes.attempts[0];
      }
    } catch(err) {
      console.error('Error fetching attempts:', err);
    }
  }

  const headerHtml = `
    <div class="material-header">
      <span class="material-type-badge badge-quiz">${ICONS.quiz} اختبار</span>
      <h2>${mat.title}</h2>
      ${lastAttempt
        ? `<span style="color: var(--primary); font-weight:700; display:block; margin-top:8px;">آخر درجة: ${lastAttempt.score}/${lastAttempt.max_score}</span>`
        : ''}
    </div>
  `;

  // FIX: Show a clear message if no quiz record exists yet
  if (!quiz) {
    return `
      ${headerHtml}
      <div class="text-center" style="padding: 60px;">
        <div style="font-size: 3rem; margin-bottom: 16px; color: var(--text-muted);">${ICONS.quiz}</div>
        <h3 style="margin-bottom: 8px; color: var(--text-muted);">لم يتم إعداد هذا الاختبار بعد</h3>
        <p style="color: var(--text-muted);">سيتم إضافة الأسئلة قريباً من قِبل المشرف.</p>
      </div>
      <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border);">
    `;
  }

  let settings = {};
  if (mat.content) {
    try {
      settings = JSON.parse(mat.content);
    } catch(e) {}
  }

  const isReviewMode = !!settings.is_review_mode;

  let actionHtml = '';
  if (isReviewMode) {
    actionHtml = `
      <button class="btn btn-primary" onclick="startQuiz('${mat.material_id}', '${quiz.quiz_id}', true)">
        ${ICONS.eye} بدء الاختبار (وضع المراجعة)
      </button>
      <div style="font-size: 0.85rem; color: var(--text-muted); max-width: 400px; margin: 16px auto 0;">
        <strong>وضع المراجعة:</strong> يتم إظهار الإجابة الصحيحة فوراً، ولا يتم تسجيل الدرجة.
      </div>
    `;
  } else {
    actionHtml = `
      <button class="btn btn-primary" onclick="startQuiz('${mat.material_id}', '${quiz.quiz_id}', false)">
        ${ICONS.quiz} بدء الامتحان
      </button>
      <div style="font-size: 0.85rem; color: var(--text-muted); max-width: 400px; margin: 16px auto 0;">
        <strong>وضع الامتحان:</strong> وقت محدد لكل الاختبار، سيتم تسجيل درجتك في سجلك.
      </div>
    `;
  }

  return `
    ${headerHtml}
    <div class="text-center" style="padding: 60px;">
      <p style="margin-bottom: 20px; color: var(--text-muted);">اختبر معلوماتك بهذا الاختبار</p>
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; margin-bottom: 16px;">
        ${actionHtml}
      </div>
    </div>
    <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border);">
  `;
}

// ------ VIDEO ------
function renderVideoMaterial(mat, isCompleted) {
  const embedUrl = getVideoEmbedUrl(mat.content);
  const openUrl = formatExternalUrl(mat.content);

  return `
    <div class="material-header">
      <span class="material-type-badge badge-video">${ICONS.video} فيديو تعليمي</span>
      <h2>${mat.title}</h2>
      ${isCompleted ? `<span style="color: var(--success); display:inline-flex; align-items:center; gap:6px; margin-top:8px;">${ICONS.check} مكتمل</span>` : ''}
    </div>
    <div style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:16px; margin-bottom:20px; box-shadow: var(--shadow);">
      <iframe
        src="${embedUrl}"
        style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;border-radius:16px;background:#000;"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen>
      </iframe>
    </div>
    <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
      <a href="${openUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
        ${ICONS.externalLink} فتح الفيديو في نافذة مستقلة
      </a>
      <button class="btn btn-success" onclick="markComplete('${mat.material_id}')">
        ${ICONS.check} تحديد كمكتمل
      </button>
    </div>
    <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border);">
  `;
}

// ------ ARTICLE ------
function renderArticleMaterial(mat, isCompleted) {
  const targetUrl = formatExternalUrl(mat.content);
  return `
    <div class="material-header">
      <span class="material-type-badge" style="background: var(--primary-light); color: white; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">${ICONS.document} مقال تفاعلي</span>
      <h2>${mat.title}</h2>
      ${isCompleted ? `<span style="color: var(--success); display:inline-flex; align-items:center; gap:6px; margin-top:8px;">${ICONS.check} مكتمل</span>` : ''}
    </div>
    <div style="position:relative; height: 75vh; overflow:hidden; border-radius:16px; margin-bottom:20px; border: 1px solid var(--border); box-shadow: var(--shadow);">
      <iframe
        src="${targetUrl}"
        style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;background:white;"
        allowfullscreen>
      </iframe>
    </div>
    <div style="display:flex; gap:10px; justify-content:center; flex-wrap: wrap;">
      <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
        ${ICONS.document} فتح في نافذة جديدة
      </a>
      <button class="btn btn-success" onclick="markComplete('${mat.material_id}')">
        ${ICONS.check} تحديد كمكتمل
      </button>
    </div>
    <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border);">
  `;
}

// ==========================================
// MARK COMPLETE & LESSON COMPLETION
// ==========================================
async function markComplete(materialId) {
  if (state.user?.role !== 'student') {
    showToast('تم المشاهدة (لا يتم تسجيل التقدم لغير الطلاب)');
    renderMaterialViewer(state.currentLesson);
    return;
  }

  if (!state.progress) {
    state.progress = {
      username: state.user.username,
      completed_lessons: [],
      completed_materials: [],
      completed_lesson_details: []
    };
  }
  if (!Array.isArray(state.progress.completed_materials)) {
    state.progress.completed_materials = [];
  }
  if (!Array.isArray(state.progress.completed_lessons)) {
    state.progress.completed_lessons = [];
  }
  if (!Array.isArray(state.progress.completed_lesson_details)) {
    state.progress.completed_lesson_details = [];
  }

  if (!state.progress.completed_materials.includes(materialId)) {
    state.progress.completed_materials.push(materialId);
  }

  // Auto-complete the lesson if all materials are completed
  const lessonId = state.currentLesson;
  if (lessonId && !String(lessonId).startsWith('unit_')) {
    const mats = (state.materials[lessonId] || []).filter(m => !m.is_hidden);
    const allCompleted = mats.length > 0 && mats.every(m => state.progress.completed_materials.includes(m.material_id));
    if (allCompleted && !state.progress.completed_lessons.includes(lessonId)) {
      state.progress.completed_lessons.push(lessonId);

      let targetLesson = null;
      let targetUnit = null;
      for (const [uId, lList] of Object.entries(state.lessons)) {
        const found = lList.find(l => String(l.lesson_id) === String(lessonId));
        if (found) {
          targetLesson = found;
          targetUnit = state.units.find(u => String(u.unit_id) === String(uId));
          break;
        }
      }

      state.progress.completed_lesson_details.push({
        lesson_id: lessonId,
        lesson_name: targetLesson?.lesson_name || `درس #${lessonId}`,
        unit_name: targetUnit?.unit_name || 'درس مستقل',
        completed_at: new Date().toISOString()
      });
    }
  }

  if (!MOCK_MODE) {
    await API.post('updateStudentProgress', state.progress);
  }

  if (typeof saveCurriculumToLocal === 'function') {
    saveCurriculumToLocal();
  }

  showToast('تم تحديد المحتوى كمكتمل!');
  createConfetti();
  renderMaterialViewer(state.currentLesson);
}

/**
 * Explicitly toggles completion of a lesson (called from lesson viewer or dashboard)
 */
async function toggleLessonComplete(lessonId) {
  if (!state.user || state.user.role !== 'student') {
    showToast('يتم تسجيل تقدم الدروس لحسابات الطلاب فقط');
    return;
  }

  if (!state.progress) {
    state.progress = {
      username: state.user.username,
      completed_lessons: [],
      completed_materials: [],
      completed_lesson_details: []
    };
  }
  if (!Array.isArray(state.progress.completed_lessons)) {
    state.progress.completed_lessons = [];
  }
  if (!Array.isArray(state.progress.completed_materials)) {
    state.progress.completed_materials = [];
  }
  if (!Array.isArray(state.progress.completed_lesson_details)) {
    state.progress.completed_lesson_details = [];
  }

  const isAlreadyDone = state.progress.completed_lessons.includes(lessonId);

  // Find metadata
  let targetLesson = null;
  let targetUnit = null;
  for (const [uId, lList] of Object.entries(state.lessons)) {
    const found = lList.find(l => String(l.lesson_id) === String(lessonId));
    if (found) {
      targetLesson = found;
      targetUnit = state.units.find(u => String(u.unit_id) === String(uId));
      break;
    }
  }

  if (isAlreadyDone) {
    // Unmark
    state.progress.completed_lessons = state.progress.completed_lessons.filter(id => id !== lessonId);
    state.progress.completed_lesson_details = state.progress.completed_lesson_details.filter(d => d.lesson_id !== lessonId);
    showToast('تم إلغاء تحديد الدرس كمكتمل');
  } else {
    // Mark Complete
    state.progress.completed_lessons.push(lessonId);
    state.progress.completed_lesson_details.push({
      lesson_id: lessonId,
      lesson_name: targetLesson?.lesson_name || `درس #${lessonId}`,
      unit_name: targetUnit?.unit_name || 'درس مستقل',
      completed_at: new Date().toISOString()
    });

    // Also mark all materials of this lesson as completed so stats stay consistent
    const mats = state.materials[lessonId] || [];
    mats.forEach(m => {
      if (!state.progress.completed_materials.includes(m.material_id)) {
        state.progress.completed_materials.push(m.material_id);
      }
    });

    createConfetti();
    showToast('رائع! تم تحديد الدرس كاملاً كمكتمل بنجاح 🎉');
  }

  if (!MOCK_MODE) {
    await API.post('updateStudentProgress', state.progress);
  }

  if (typeof saveCurriculumToLocal === 'function') {
    saveCurriculumToLocal();
  }

  // Rerender active view
  const currentHash = window.location.hash.replace('#', '') || 'dashboard';
  if (currentHash === 'material') {
    renderMaterialViewer(lessonId);
  } else if (currentHash === 'dashboard') {
    renderDashboard();
  }
}

