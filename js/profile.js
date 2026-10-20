// ============================================
// profile.js — Student profile, stats, completed
//              lessons log & detailed quiz review
// Depends on: api.js, state.js, utils.js
// ============================================

let _cachedProfileAttempts = [];
let _cachedProfileTitleMap = { matById: {}, titleByQuizId: {} };

function switchProfileTab(tab) {
  const quizContainer = $('quizHistory');
  const lessonsContainer = $('lessonsHistory');
  const btnQuizzes = $('profileTabQuizzesBtn');
  const btnLessons = $('profileTabLessonsBtn');

  if (tab === 'lessons') {
    if (quizContainer) quizContainer.style.display = 'none';
    if (lessonsContainer) lessonsContainer.style.display = 'block';
    if (btnLessons) {
      btnLessons.className = 'btn btn-primary';
      btnLessons.style.cssText = 'padding: 8px 18px; font-size: 0.9rem; border-radius: 8px;';
    }
    if (btnQuizzes) {
      btnQuizzes.className = 'btn btn-secondary';
      btnQuizzes.style.cssText = 'padding: 8px 18px; font-size: 0.9rem; border-radius: 8px; border: none; background: transparent;';
    }
  } else {
    if (quizContainer) quizContainer.style.display = 'block';
    if (lessonsContainer) lessonsContainer.style.display = 'none';
    if (btnQuizzes) {
      btnQuizzes.className = 'btn btn-primary';
      btnQuizzes.style.cssText = 'padding: 8px 18px; font-size: 0.9rem; border-radius: 8px;';
    }
    if (btnLessons) {
      btnLessons.className = 'btn btn-secondary';
      btnLessons.style.cssText = 'padding: 8px 18px; font-size: 0.9rem; border-radius: 8px; border: none; background: transparent;';
    }
  }
}

async function renderProfile() {
  $('profileName').textContent = state.user.name;

  // Use SVG Badge
  $('profileRoleBadge').innerHTML = getRoleBadgeSVG(state.user.role);

  if (state.user.avatar) {
    $('profileAvatar').innerHTML = `<img src="${state.user.avatar}" alt="avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    if ($('deleteAvatarBtn')) $('deleteAvatarBtn').style.display = 'inline-flex';
  } else {
    $('profileAvatar').textContent = state.user.name.charAt(0).toUpperCase();
    if ($('deleteAvatarBtn')) $('deleteAvatarBtn').style.display = 'none';
  }

  // Pre-fill fields
  if ($('profileUsername')) $('profileUsername').value = state.user.username || '';

  const historyContainer = $('quizHistory');
  const lessonsContainer = $('lessonsHistory');
  const statsContainer = $('profileStatsSummary');

  historyContainer.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;">جاري تحميل السجل...</div>';
  if (lessonsContainer) {
    lessonsContainer.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;">جاري تحميل سجل الدروس...</div>';
  }

  // Build title lookup: quiz_id → material title
  function buildTitleMap() {
    const matById = {};
    (state.allMaterials || []).forEach(m => { matById[m.material_id] = m.title; });
    const titleByQuizId = {};
    Object.entries(state.quizzes || {}).forEach(([matId, quiz]) => {
      titleByQuizId[quiz.quiz_id] = matById[matId] || quiz.title || 'اختبار';
    });
    return { matById, titleByQuizId };
  }

  function scoreColor(score, max) {
    if (!max) return 'var(--text-muted)';
    const pct = score / max;
    if (pct >= 0.7) return 'var(--success)';
    if (pct >= 0.5) return 'var(--warning)';
    return 'var(--danger)';
  }

  function renderProfileStats(attempts) {
    if (!statsContainer) return;
    const isStudent = state.user?.role !== 'admin';
    const allVisibleLessons = Object.values(state.lessons || {}).flat().filter(l => !isStudent || !l.is_hidden);
    const totalLessons = allVisibleLessons.length;
    const completedLessonsCount = Array.isArray(state.progress?.completed_lessons) ? state.progress.completed_lessons.length : 0;
    const completedMaterialsCount = Array.isArray(state.progress?.completed_materials) ? state.progress.completed_materials.length : 0;

    const graded = (attempts || []).filter(a => a.is_graded && Number(a.max_score) > 0);
    const avgScore = graded.length
      ? Math.round(graded.reduce((acc, a) => acc + (Number(a.score) / Number(a.max_score)) * 100, 0) / graded.length)
      : null;

    const completionPct = totalLessons > 0 ? Math.min(100, Math.round((completedLessonsCount / totalLessons) * 100)) : 0;

    statsContainer.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
        <div class="glass" style="padding: 20px; text-align: center; border-radius: 16px;">
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px; font-weight: 600;">الدروس المكتملة</div>
          <div style="font-size: 2rem; font-weight: 800; color: var(--primary); font-variant-numeric: tabular-nums;">
            ${completedLessonsCount}<span style="font-size: 1rem; color: var(--text-muted); font-weight: 500;">/${totalLessons}</span>
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; font-variant-numeric: tabular-nums;">نسبة الإنجاز: ${completionPct}%</div>
        </div>
        <div class="glass" style="padding: 20px; text-align: center; border-radius: 16px;">
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px; font-weight: 600;">المحتويات المنجزة</div>
          <div style="font-size: 2rem; font-weight: 800; color: var(--secondary); font-variant-numeric: tabular-nums;">${completedMaterialsCount}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">ملفات وشرائح وفيديوهات</div>
        </div>
        <div class="glass" style="padding: 20px; text-align: center; border-radius: 16px;">
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px; font-weight: 600;">محاولات الاختبارات</div>
          <div style="font-size: 2rem; font-weight: 800; color: #0284c7; font-variant-numeric: tabular-nums;">${(attempts || []).length}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">إجمالي الاختبارات المسلمة</div>
        </div>
        <div class="glass" style="padding: 20px; text-align: center; border-radius: 16px;">
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px; font-weight: 600;">متوسط الدرجات</div>
          <div style="font-size: 2rem; font-weight: 800; color: ${avgScore !== null ? (avgScore >= 70 ? 'var(--success)' : avgScore >= 50 ? 'var(--warning)' : 'var(--danger)') : 'var(--text-muted)'}; font-variant-numeric: tabular-nums;">
            ${avgScore !== null ? `${avgScore}%` : '—'}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">في الاختبارات المصححة</div>
        </div>
      </div>
    `;
  }

  function renderCompletedLessonsLog() {
    if (!lessonsContainer) return;

    const lessonLookup = {};
    (state.units || []).forEach(u => {
      (state.lessons[u.unit_id] || []).forEach(l => {
        lessonLookup[l.lesson_id] = {
          lesson_id: l.lesson_id,
          lesson_name: l.lesson_name,
          lesson_number: l.lesson_number,
          unit_name: u.unit_name
        };
      });
    });
    (state.lessons[''] || []).forEach(l => {
      lessonLookup[l.lesson_id] = {
        lesson_id: l.lesson_id,
        lesson_name: l.lesson_name,
        lesson_number: l.lesson_number,
        unit_name: 'درس مستقل'
      };
    });

    const completedIds = Array.isArray(state.progress?.completed_lessons) ? state.progress.completed_lessons : [];
    const detailsList = Array.isArray(state.progress?.completed_lesson_details) ? state.progress.completed_lesson_details : [];

    if (!completedIds.length) {
      lessonsContainer.innerHTML = `
        <div class="glass text-center" style="padding: 40px;">
          <p style="color: var(--text-muted); margin-bottom: 12px;">لم تقم بتحديد أي درس كمكتمل حتى الآن.</p>
          <button type="button" class="btn btn-primary" onclick="navigateTo('dashboard')">الذهاب إلى الدروس</button>
        </div>
      `;
      return;
    }

    const detailByLessonId = {};
    detailsList.forEach(d => {
      if (d && d.lesson_id) detailByLessonId[d.lesson_id] = d;
    });

    const itemsHtml = completedIds.map(lid => {
      const info = lessonLookup[lid] || detailByLessonId[lid] || { lesson_id: lid, lesson_name: 'درس تعليمي', unit_name: 'المنهج الدراسي' };
      const completedAt = detailByLessonId[lid]?.completed_at;
      return `
        <div class="glass" style="padding: 18px 22px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 38px; height: 38px; border-radius: 50%; background: rgba(16, 185, 129, 0.12); color: var(--success); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              ${ICONS.check}
            </div>
            <div>
              <h4 style="margin: 0 0 4px 0; font-size: 1rem;">${info.lesson_name || 'درس'}</h4>
              <div style="font-size: 0.84rem; color: var(--text-muted);">
                <span>${info.unit_name || 'وحدة دراسية'}</span>
                ${completedAt ? `<span> · أُنجز في ${formatDate(completedAt)}</span>` : ''}
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-secondary" style="padding: 8px 14px; font-size: 0.85rem;" onclick="openLesson('${lid}')">
            فتح الدرس
          </button>
        </div>
      `;
    }).join('');

    lessonsContainer.innerHTML = itemsHtml;
  }

  function renderAttempts(attempts, titleByQuizId, matById) {
    if (!attempts.length) {
      return '<div class="glass text-center" style="padding: 40px;"><p style="color: var(--text-muted);">لا توجد محاولات اختبار مسجلة بعد.</p></div>';
    }
    return attempts.map((att, idx) => {
      const title = titleByQuizId[att.quiz_id] || matById?.[att.material_id] || 'اختبار';
      const color = att.is_graded ? scoreColor(att.score, att.max_score) : 'var(--warning)';
      const pct   = att.is_graded && att.max_score ? Math.round((att.score / att.max_score) * 100) : null;
      const hasAnswers = Array.isArray(att.answers) && att.answers.length > 0;

      return `
        <div class="glass" style="padding: 20px; margin-bottom: 12px; display:flex; justify-content:space-between; align-items:center; gap: 16px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 200px;">
            <h4 style="margin-bottom: 4px; font-size: 1.05rem;">${title}</h4>
            <div style="color: var(--text-muted); font-size: 0.85rem;">
              <span>${formatDate(att.attempt_date)}</span>
              ${!att.is_graded ? `<span style="color:var(--warning); font-weight:600;"> · بانتظار تصحيح المقالي</span>` : ''}
              ${att.feedback ? `<span style="color:var(--primary); font-weight:600;"> · يوجد تعليق من المعلم</span>` : ''}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
            <div style="text-align:center; min-width:72px; font-variant-numeric: tabular-nums;">
              <div style="font-size:1.5rem; font-weight:800; color:${color}; line-height:1;">
                ${att.is_graded ? `${att.score}<span style="font-size:0.9rem;font-weight:500;">/${att.max_score}</span>` : 'قيد التصحيح'}
              </div>
              ${pct !== null ? `<div style="font-size:0.78rem; color:${color}; margin-top:2px; font-weight:700;">${pct}%</div>` : ''}
            </div>
            <button type="button" class="btn btn-secondary" style="padding: 8px 14px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;" onclick="openStudentAttemptReview(${idx})">
              ${ICONS.eye} ${hasAnswers ? 'مراجعة الإجابات' : 'التفاصيل'}
            </button>
          </div>
        </div>`;
    }).join('');
  }

  if (MOCK_MODE) {
    const { titleByQuizId, matById } = buildTitleMap();
    const mockAttempts = [
      { quiz_id: 'quiz1', score: 8, max_score: 10, is_graded: true,  attempt_date: new Date(Date.now() - 172800000).toISOString(), answers: [] },
      { quiz_id: 'quiz2', score: 3, max_score: 5,  is_graded: false, attempt_date: new Date().toISOString(), answers: [] }
    ];
    _cachedProfileAttempts = mockAttempts;
    _cachedProfileTitleMap = { titleByQuizId, matById };
    renderProfileStats(mockAttempts);
    renderCompletedLessonsLog();
    historyContainer.innerHTML = renderAttempts(mockAttempts, titleByQuizId, matById);
    return;
  }

  try {
    // Ensure curriculum and student progress are loaded
    if (!state.allMaterials?.length || !state.progress) {
      await loadStudentData(true);
    } else {
      // Refresh student progress silently so completed lessons are always current
      const progRes = await API.get('getStudentProgress', { username: state.user.username }, { forceFresh: true });
      if (progRes && progRes.success && progRes.progress) {
        state.progress = progRes.progress;
      }
    }

    const res = await API.get('getQuizAttempts', { username: state.user.username, quizId: '' }, { forceFresh: true });
    const attempts = (res && res.success && Array.isArray(res.attempts)) ? res.attempts : [];

    const { titleByQuizId, matById } = buildTitleMap();
    _cachedProfileAttempts = attempts;
    _cachedProfileTitleMap = { titleByQuizId, matById };

    renderProfileStats(attempts);
    renderCompletedLessonsLog();
    historyContainer.innerHTML = renderAttempts(attempts, titleByQuizId, matById);

  } catch(err) {
    historyContainer.innerHTML = '<p style="color:var(--danger);">خطأ في تحميل السجل.</p>';
    console.error(err);
  }
}

async function openStudentAttemptReview(attemptIndex) {
  const att = _cachedProfileAttempts[attemptIndex];
  if (!att) return;

  const title = _cachedProfileTitleMap.titleByQuizId?.[att.quiz_id]
    || _cachedProfileTitleMap.matById?.[att.material_id]
    || 'مراجعة الاختبار';

  showLoading();
  let questions = [];
  try {
    if (!MOCK_MODE && att.quiz_id) {
      const qRes = await API.get('getQuestions', { quizId: att.quiz_id });
      if (qRes && qRes.success && Array.isArray(qRes.questions)) {
        questions = qRes.questions.map(q => {
          let options = q.options;
          let correct = q.correct_answer;
          if (typeof options === 'string') {
            try { options = JSON.parse(options); } catch { options = []; }
          }
          if (typeof correct === 'string' && correct !== '') {
            try { correct = JSON.parse(correct); } catch {}
          }
          return { ...q, options, correct_answer: correct };
        });
      }
    }
  } catch (e) {
    console.error('Error loading questions for review:', e);
  }
  hideLoading();

  const answers = Array.isArray(att.answers) ? att.answers : [];
  const pct = att.is_graded && att.max_score ? Math.round((Number(att.score) / Number(att.max_score)) * 100) : null;
  const scoreColor = !att.is_graded ? 'var(--warning)' : (pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)');

  let questionsHtml = '';
  if (!questions.length && !answers.length) {
    questionsHtml = `
      <div class="text-center" style="padding: 32px; color: var(--text-muted);">
        لا تتوفر تفاصيل إضافية للأسئلة في هذه المحاولة.
      </div>
    `;
  } else if (questions.length > 0) {
    questionsHtml = questions.map((q, idx) => {
      const ans = answers.find(a => String(a?.question_id) === String(q.question_id)) || answers[idx] || null;
      const isEssay = q.type === 'essay';
      const isPending = isEssay && !att.is_graded;
      const isCorrect = isEssay ? (att.is_graded ? true : null) : Boolean(ans?.isCorrect);

      const borderCol = isPending ? 'rgba(245,158,11,0.35)' : isCorrect ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)';
      const bgCol = isPending ? 'rgba(245,158,11,0.04)' : isCorrect ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)';
      const statusCol = isPending ? 'var(--warning)' : isCorrect ? 'var(--success)' : 'var(--danger)';
      const statusLabel = isPending ? 'بانتظار التصحيح' : isEssay ? 'تم التقييم' : isCorrect ? 'إجابة صحيحة' : 'إجابة خاطئة';

      let studentAnswerText = 'لم يتم تقديم إجابة';
      let correctAnswerText = '';

      if (q.type === 'mcq' || q.type === 'true_false') {
        if (ans && ans.answer !== null && ans.answer !== undefined) {
          studentAnswerText = Array.isArray(q.options) ? (q.options[ans.answer] ?? `الخيار ${ans.answer + 1}`) : String(ans.answer);
        }
        correctAnswerText = Array.isArray(q.options) ? (q.options[q.correct_answer] ?? `الخيار ${Number(q.correct_answer) + 1}`) : String(q.correct_answer ?? '');
      } else if (q.type === 'essay') {
        studentAnswerText = ans?.answer || '(لم يتم تقديم إجابة)';
      } else if (q.type === 'matching') {
        if (ans && Array.isArray(ans.answer) && ans.answer.length) {
          studentAnswerText = ans.answer.map(pair => {
            const leftItem = q.options?.[pair.left]?.left || `#${pair.left + 1}`;
            const rightItem = q.options?.[pair.right]?.right || `#${pair.right + 1}`;
            return `${leftItem} ← ${rightItem}`;
          }).join(' ، ');
        }
        if (Array.isArray(q.options)) {
          correctAnswerText = q.options.map(p => `${p.left} ← ${p.right}`).join(' ، ');
        }
      }

      return `
        <div style="border: 1.5px solid ${borderCol}; background: ${bgCol}; border-radius: 14px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px;">
            <div style="font-weight: 700; font-size: 0.96rem; line-height: 1.5;">
              ${idx + 1}. ${q.question_text}
            </div>
            <span style="color: ${statusCol}; font-size: 0.8rem; font-weight: 700; white-space: nowrap; flex-shrink: 0;">
              ${statusLabel} (${q.points || 1} درجة)
            </span>
          </div>
          <div style="font-size: 0.88rem; display: flex; flex-direction: column; gap: 6px;">
            <div>
              <span style="color: var(--text-muted);">إجابتك: </span>
              <strong style="color: ${statusCol};">${studentAnswerText}</strong>
            </div>
            ${!isCorrect && !isEssay && correctAnswerText ? `
              <div>
                <span style="color: var(--text-muted);">الإجابة الصحيحة: </span>
                <strong style="color: var(--success);">${correctAnswerText}</strong>
              </div>
            ` : ''}
            ${q.explanation ? `
              <div style="margin-top: 6px; padding: 10px 14px; background: rgba(99, 102, 241, 0.06); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 10px; font-size: 0.84rem; color: var(--text-secondary); line-height: 1.6;">
                <strong style="color: var(--primary);">التعليل والشرح:</strong> ${q.explanation}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } else {
    questionsHtml = answers.map((ans, idx) => {
      const isCorrect = Boolean(ans?.isCorrect);
      return `
        <div style="border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 10px;">
          <div style="font-weight: 700; margin-bottom: 4px;">السؤال ${idx + 1}</div>
          <div style="font-size: 0.88rem; color: var(--text-muted);">إجابتك المسجلة: <strong>${ans?.answer ?? '—'}</strong> · ${isCorrect ? '<span style="color:var(--success);">صحيحة</span>' : '<span style="color:var(--danger);">خاطئة / مقالي</span>'}</div>
        </div>
      `;
    }).join('');
  }

  const existing = document.getElementById('studentAttemptReviewModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'studentAttemptReviewModal';
  modal.innerHTML = `
    <div class="glass modal-content" style="max-width: 680px; max-height: 90vh; overflow-y: auto;">
      <div class="flex justify-between items-center" style="margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--border);">
        <div>
          <h3 style="margin: 0; font-size: 1.2rem;">${title}</h3>
          <div style="font-size: 0.84rem; color: var(--text-muted); margin-top: 4px;">
            تاريخ المحاولة: ${formatDate(att.attempt_date)}
          </div>
        </div>
        <button type="button" class="btn btn-secondary" style="padding: 6px 12px;" onclick="document.getElementById('studentAttemptReviewModal')?.remove()">
          ${ICONS.close}
        </button>
      </div>

      <div class="glass" style="padding: 16px 20px; margin-bottom: 18px; border-radius: 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; background: rgba(99, 102, 241, 0.04);">
        <div>
          <div style="font-size: 0.85rem; color: var(--text-muted);">النتيجة النهائية</div>
          <div style="font-size: 1.6rem; font-weight: 800; color: ${scoreColor}; font-variant-numeric: tabular-nums;">
            ${att.is_graded ? `${att.score} / ${att.max_score} (${pct}%)` : 'قيد التصحيح والمراجعة'}
          </div>
        </div>
        ${att.graded_by ? `<div style="font-size: 0.84rem; color: var(--text-muted);">تم التقييم بواسطة: <strong>${att.graded_by}</strong></div>` : ''}
      </div>

      ${att.feedback ? `
        <div style="padding: 14px 18px; margin-bottom: 18px; border-radius: 12px; background: rgba(16, 185, 129, 0.07); border: 1px solid rgba(16, 185, 129, 0.28); font-size: 0.92rem; line-height: 1.6;">
          <strong style="color: #059669; display: block; margin-bottom: 4px;">ملاحظات وتعليق المعلم:</strong>
          <span>${att.feedback}</span>
        </div>
      ` : ''}

      <h4 style="margin-bottom: 12px;">تفاصيل الأسئلة والإجابات</h4>
      <div>${questionsHtml}</div>

      <div style="margin-top: 20px; text-align: left;">
        <button type="button" class="btn btn-primary" onclick="document.getElementById('studentAttemptReviewModal')?.remove()">إغلاق المراجعة</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function updateUsername() {
  const newUsername = $('profileUsername')?.value?.trim();
  if (!newUsername) return showToast('يرجى إدخال اسم المستخدم', 'error');
  if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) return showToast('اسم المستخدم يجب أن يحتوي على حروف إنجليزية وأرقام فقط', 'error');
  if (newUsername === state.user.username) return showToast('اسم المستخدم مطابق للاسم الحالي', 'info');
  
  showLoading();
  try {
    const res = await API.post('updateUser', {
      username: state.user.username,
      new_username: newUsername
    });
    if (res && res.success) {
      state.user.username = newUsername;
      localStorage.setItem('iqt_user', JSON.stringify(state.user));
      if ($('navUsername')) $('navUsername').textContent = state.user.name || newUsername;
      showToast('تم تحديث اسم المستخدم بنجاح!');
    } else {
      showToast(res?.message || 'اسم المستخدم مستخدم بالفعل', 'error');
    }
  } catch(e) {
    showToast('حدث خطأ أثناء الاتصال بقاعدة البيانات', 'error');
  }
  hideLoading();
}

async function updatePassword() {
  const newPassword = $('profilePassword')?.value?.trim();
  if (!newPassword) return showToast('يرجى إدخال كلمة المرور الجديدة', 'error');
  if (newPassword.length < 4) return showToast('كلمة المرور يجب أن تكون 4 أحرف أو أرقام على الأقل', 'error');

  showLoading();
  try {
    const res = await API.post('updateUser', {
      username: state.user.username,
      password: newPassword
    });
    if (res && res.success) {
      showToast('تم تحديث كلمة المرور بنجاح!');
      if ($('profilePassword')) $('profilePassword').value = '';
    } else {
      showToast(res?.message || 'فشل تحديث كلمة المرور', 'error');
    }
  } catch(e) {
    showToast('حدث خطأ أثناء الاتصال بقاعدة البيانات', 'error');
  }
  hideLoading();
}

function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const imgSrc = e.target.result;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'cropModal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 400px; text-align: center;">
        <h3 style="margin-bottom: 20px;">تحديد وتعديل الصورة</h3>
        
        <div style="position: relative; width: 250px; height: 250px; margin: 0 auto 20px; overflow: hidden; border-radius: 50%; border: 3px dashed var(--primary); background: #000; touch-action: none;" id="cropContainer">
          <img id="cropImg" src="${imgSrc}" style="position: absolute; top: 0; left: 0; transform-origin: 0 0; cursor: grab;">
        </div>
        
        <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
          <span>🔍</span>
          <input type="range" id="cropZoom" min="1" max="3" step="0.01" value="1" style="flex: 1;">
          <span>+</span>
        </div>
        
        <div style="display: flex; gap: 12px;">
          <button class="btn btn-secondary w-full" onclick="document.getElementById('cropModal').remove()">إلغاء</button>
          <button class="btn btn-primary w-full" id="cropSaveBtn">حفظ الصورة</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const img = modal.querySelector('#cropImg');
    const container = modal.querySelector('#cropContainer');
    const zoomSlider = modal.querySelector('#cropZoom');
    const saveBtn = modal.querySelector('#cropSaveBtn');

    let baseScale = 1;
    let currentScale = 1;
    let posX = 0;
    let posY = 0;
    let isDragging = false;
    let startX, startY;

    const handleLoad = function() {
      const containerSize = 250;
      const scaleX = containerSize / img.naturalWidth;
      const scaleY = containerSize / img.naturalHeight;
      baseScale = Math.max(scaleX, scaleY);
      
      currentScale = baseScale;
      zoomSlider.min = baseScale;
      zoomSlider.max = baseScale * 4;
      zoomSlider.value = baseScale;
      
      posX = (containerSize - (img.naturalWidth * baseScale)) / 2;
      posY = (containerSize - (img.naturalHeight * baseScale)) / 2;
      
      updateImageTransform();
    };

    if (img.complete) {
      handleLoad();
    } else {
      img.onload = handleLoad;
    }

    function updateImageTransform() {
      img.style.transform = `translate(${posX}px, ${posY}px) scale(${currentScale})`;
    }

    zoomSlider.addEventListener('input', function() {
      const oldScale = currentScale;
      currentScale = parseFloat(this.value);
      
      const containerSize = 250;
      const centerX = containerSize / 2;
      const centerY = containerSize / 2;

      posX = centerX - (centerX - posX) * (currentScale / oldScale);
      posY = centerY - (centerY - posY) * (currentScale / oldScale);

      updateImageTransform();
    });

    const startDrag = (clientX, clientY) => {
      isDragging = true;
      startX = clientX - posX;
      startY = clientY - posY;
      img.style.cursor = 'grabbing';
    };

    const doDrag = (clientX, clientY) => {
      if (!isDragging) return;
      posX = clientX - startX;
      posY = clientY - startY;
      updateImageTransform();
    };

    const endDrag = () => {
      isDragging = false;
      img.style.cursor = 'grab';
    };

    container.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => doDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup', endDrag);

    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, {passive: true});
    window.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches.length === 1) {
        e.preventDefault(); 
        doDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, {passive: false});
    window.addEventListener('touchend', endDrag);

    saveBtn.onclick = async function() {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 250; 
      canvas.width = MAX_SIZE;
      canvas.height = MAX_SIZE;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, MAX_SIZE, MAX_SIZE);
      ctx.drawImage(img, posX, posY, img.naturalWidth * currentScale, img.naturalHeight * currentScale);

      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);

      modal.remove();

      // Optimistic UI update
      $('profileAvatar').innerHTML = `<img src="${compressedBase64}" alt="avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
      
      showLoading();
      try {
        const res = await API.post('updateUser', {
          username: state.user.username,
          avatar: compressedBase64
        });
        if (res.success) {
          state.user.avatar = compressedBase64;
          localStorage.setItem('iqt_user', JSON.stringify(state.user));
          if ($('navAvatar')) {
            $('navAvatar').innerHTML = `<img src="${compressedBase64}" alt="avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
          }
          showToast('تم تحديث الصورة بنجاح');
        } else {
          showToast(res.message || 'فشل التحديث', 'error');
          renderProfile(); 
        }
      } catch(err) {
        showToast('حدث خطأ أثناء الاتصال بالخادم', 'error');
        console.error(err);
        renderProfile();
      }
      hideLoading();
    };
  };
  reader.readAsDataURL(file);
}

async function deleteAvatar() {
  if (!confirm('هل أنت متأكد من رغبتك في حذف الصورة الشخصية؟')) return;
  
  showLoading();
  try {
    const res = await API.post('updateUser', {
      username: state.user.username,
      avatar: ''
    });
    
    if (res.success) {
      state.user.avatar = '';
      localStorage.setItem('iqt_user', JSON.stringify(state.user));
      
      if ($('navAvatar')) {
        $('navAvatar').outerHTML = `<div class="avatar" id="navAvatar">${state.user.name.charAt(0).toUpperCase()}</div>`;
      }
      
      renderProfile();
      showToast('تم حذف الصورة بنجاح');
    } else {
      showToast(res.message || 'فشل الحذف', 'error');
    }
  } catch(err) {
    showToast('حدث خطأ أثناء الاتصال بالخادم', 'error');
    console.error(err);
  }
  hideLoading();
}
