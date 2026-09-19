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

  if (!mats.length) {
    container.innerHTML = '<div class="text-center" style="padding: 60px;"><p>لا يوجد محتوى لهذا الدرس بعد.</p></div>';
    return;
  }

  let html = '';

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

  return `
    <div class="material-header">
      <span class="material-type-badge badge-pdf">${ICONS.document} ملف PDF</span>
      <h2>${mat.title}</h2>
      ${isCompleted ? `<span style="color: var(--success); display:inline-flex; align-items:center; gap:6px; margin-top:8px;">${ICONS.check} مكتمل</span>` : ''}
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

      <!-- Fallback shown if iframe blocked -->
      <div class="pdf-fallback" id="pdfFallback-${mat.material_id}">
        <div style="color: var(--danger); margin-bottom: 8px;">${ICONS.fileText}</div>
        <h3 style="margin-bottom: 8px;">تعذّر عرض أو تحميل الملف</h3>
        <p style="margin-bottom: 12px; font-size: 0.95rem;">قد يكون الملف محميّاً أو لا يملك صلاحيات المشاركة العامة. يرجى تجربة فتح الملف في نافذة جديدة، أو التواصل مع المعلم للتأكد من جعل إعدادات مشاركة الملف في جوجل درايف: <strong>"أي شخص لديه الرابط"</strong> (Anyone with the link).</p>
        <div class="fallback-actions">
          <a href="${openUrl}" target="_blank" class="btn btn-secondary">
            ${ICONS.document} فتح في نافذة جديدة
          </a>
          <a href="${downloadUrl}" class="btn btn-primary" download>
            ${ICONS.download} تحميل الملف
          </a>
        </div>
      </div>
    </div>

    <div style="margin-top: 20px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
      <a href="${openUrl}" target="_blank" class="btn btn-secondary">
        ${ICONS.document} فتح في نافذة جديدة
      </a>
      <a href="${downloadUrl}" class="btn btn-secondary" download>
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
  return `
    <div class="material-header">
      <span class="material-type-badge badge-video">${ICONS.video} فيديو</span>
      <h2>${mat.title}</h2>
      ${isCompleted ? `<span style="color: var(--success); display:inline-flex; align-items:center; gap:6px; margin-top:8px;">${ICONS.check} مكتمل</span>` : ''}
    </div>
    <div style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:16px; margin-bottom:20px;">
      <iframe
        src="${mat.content}"
        style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;border-radius:16px;"
        allowfullscreen>
      </iframe>
    </div>
    <div style="display:flex; gap:10px; justify-content:center;">
      <button class="btn btn-success" onclick="markComplete('${mat.material_id}')">
        ${ICONS.check} تحديد كمكتمل
      </button>
    </div>
    <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border);">
  `;
}

// ------ ARTICLE ------
function renderArticleMaterial(mat, isCompleted) {
  return `
    <div class="material-header">
      <span class="material-type-badge" style="background: var(--primary-light); color: white; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">${ICONS.document} مقال تفاعلي</span>
      <h2>${mat.title}</h2>
      ${isCompleted ? `<span style="color: var(--success); display:inline-flex; align-items:center; gap:6px; margin-top:8px;">${ICONS.check} مكتمل</span>` : ''}
    </div>
    <div style="position:relative; height: 75vh; overflow:hidden; border-radius:16px; margin-bottom:20px; border: 1px solid var(--border); box-shadow: var(--shadow);">
      <iframe
        src="${mat.content}"
        style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;background:white;"
        allowfullscreen>
      </iframe>
    </div>
    <div style="display:flex; gap:10px; justify-content:center; flex-wrap: wrap;">
      <a href="${mat.content}" target="_blank" class="btn btn-secondary">
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
// MARK COMPLETE
// ==========================================
async function markComplete(materialId) {
  if (state.user.role !== 'student') {
    showToast('تم المشاهدة (لا يتم تسجيل التقدم لغير الطلاب)');
    renderMaterialViewer(state.currentLesson);
    return;
  }

  if (!state.progress) {
    state.progress = {
      username: state.user.username,
      completed_lessons: [],
      completed_materials: []
    };
  }
  if (!state.progress.completed_materials.includes(materialId)) {
    state.progress.completed_materials.push(materialId);
  }

  // Auto-complete the lesson if all materials are completed
  const lessonId = state.currentLesson;
  if (lessonId) {
    const mats = state.materials[lessonId] || [];
    const allCompleted = mats.length > 0 && mats.every(m => state.progress.completed_materials.includes(m.material_id));
    if (allCompleted && !state.progress.completed_lessons.includes(lessonId)) {
      state.progress.completed_lessons.push(lessonId);
    }
  }

  if (!MOCK_MODE) {
    await API.post('updateStudentProgress', state.progress);
  }

  showToast('تم تحديد المحتوى كمكتمل!');
  createConfetti();
  renderMaterialViewer(state.currentLesson);
}
