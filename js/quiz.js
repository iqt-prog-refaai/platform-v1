// ============================================
// quiz.js — Quiz engine: start, render, answer,
//            submit, timer, answer review
// Depends on: api.js, state.js, utils.js, router.js
// ============================================

// ==========================================
// START QUIZ
// ==========================================
async function startQuiz(materialId, quizId, isReviewMode = false) {
  if (!quizId) {
    showToast('هذا الاختبار غير مجهز بعد. تواصل مع المعلم.', 'error');
    return;
  }

  // Clear any timer left over from a previous attempt
  if (state.currentQuiz?.timerInterval) {
    clearInterval(state.currentQuiz.timerInterval);
  }

  showLoading();

  try {
    let questions = [];

    if (MOCK_MODE) {
      questions = [
        {
          question_id: 'q1', type: 'mcq',
          question_text: 'What is a variable?',
          options: ['A data container', 'A function', 'A loop', 'Nothing'],
          correct_answer: 0, points: 2,
          explanation: 'A variable is a named storage location in memory used to hold a value that can change during program execution.'
        },
        {
          question_id: 'q2', type: 'true_false',
          question_text: 'Python is a compiled language.',
          options: ['True', 'False'],
          correct_answer: 1, points: 1,
          explanation: 'Python is an interpreted language — its code is executed line by line at runtime without a separate compilation step.'
        },
        {
          question_id: 'q3', type: 'mcq',
          question_text: 'Which data structure uses LIFO order?',
          options: ['Queue', 'Stack', 'Array', 'Tree'],
          correct_answer: 1, points: 2,
          explanation: 'A Stack follows Last-In First-Out (LIFO) — the last element added is the first one removed.'
        },
        {
          question_id: 'q4', type: 'essay',
          question_text: 'Explain recursion in your own words and give one real-world example.',
          options: null, correct_answer: null, points: 5, explanation: null
        }
      ];
    } else {
      const res = await API.get('getQuestions', { quizId });
      if (res.success) questions = res.questions;
    }

    // -------------------------------------------------------
    // FIX: Google Sheets stores arrays as JSON strings.
    // Parse options / correct_answer if they come back as strings.
    // -------------------------------------------------------
    questions = questions.map(q => {
      let options = q.options;
      let correct = q.correct_answer;
      if (typeof options === 'string') {
        try { options = JSON.parse(options); } catch { options = null; }
      }
      if (typeof correct === 'string' && correct !== '') {
        try { correct = JSON.parse(correct); } catch { /* keep as-is */ }
      }
      return { ...q, options, correct_answer: correct };
    });

    if (!questions.length) {
      hideLoading();
      showToast('لا توجد أسئلة في هذا الاختبار بعد.', 'error');
      return;
    }

    // Get time limit (minutes → seconds) from cached quiz record or material content
    const quizRecord = state.quizzes[materialId];
    const mat = state.allMaterials.find(m => m.material_id === materialId);
    let timeLimitMins = quizRecord?.time_limit ? parseInt(quizRecord.time_limit) : 0;
    
    if (mat && mat.content) {
      try {
        const settings = JSON.parse(mat.content);
        if (settings.time_limit !== undefined) {
          timeLimitMins = parseInt(settings.time_limit);
        }
      } catch(e) {}
    }

    const timeLimitSecs = timeLimitMins > 0 ? timeLimitMins * 60 : 0;

    state.currentQuiz = {
      materialId,
      quizId,
      questions,
      currentIndex: 0,
      // Pre-fill answers array with nulls so prev/next pre-selection works
      answers: new Array(questions.length).fill(null),
      score: 0,
      maxScore: questions.reduce((acc, q) => acc + (q.points || 1), 0),
      timeLeft: isReviewMode ? 60 : timeLimitSecs,
      timerInterval: null,
      isReviewMode,
      answerConfirmed: false
    };

    navigateTo('quiz');
    renderQuizQuestion();
    if (timeLimitSecs > 0 || isReviewMode) startQuizTimer();

  } catch (err) {
    showToast('خطأ في تحميل الاختبار', 'error');
    console.error(err);
  } finally {
    hideLoading();
  }
}

// ==========================================
// TIMER
// ==========================================
function startQuizTimer() {
  const quiz = state.currentQuiz;
  if (quiz.timerInterval) clearInterval(quiz.timerInterval);

  quiz.timerInterval = setInterval(() => {
    if (quiz.timeLeft > 0) {
      quiz.timeLeft--;
      updateTimerDisplay();
    }
    
    if (quiz.timeLeft <= 0) {
      clearInterval(quiz.timerInterval);
      quiz.timerInterval = null;
      if (!quiz.isReviewMode) {
        showToast('⏰ انتهى الوقت! جاري تسليم الاختبار...', 'error');
        submitQuiz();
      } else {
        showToast('⏰ انتهى الوقت المخصص للسؤال', 'error');
        if (!quiz.answerConfirmed) {
          nextQuestion(true); // force advance with no answer
        }
      }
    }
  }, 1000);
}

function _fmtTime(totalSecs) {
  const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
  const s = (totalSecs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateTimerDisplay() {
  const el = document.getElementById('quizTimerEl');
  if (!el || !state.currentQuiz) return;
  const t = state.currentQuiz.timeLeft;
  el.textContent = _fmtTime(t);
  if (t <= 60) {
    el.style.color = 'var(--danger)';
    el.style.fontWeight = '900';
    el.style.animation = 'pulse 0.8s infinite';
  } else if (t <= 180) {
    el.style.color = 'var(--warning)';
  }
}

// ==========================================
// RENDER QUESTION
// ==========================================
function renderQuizQuestion() {
  const quiz = state.currentQuiz;

  if (!quiz || !quiz.questions.length) {
    $('quizContent').innerHTML = `
      <div class="glass text-center" style="padding: 60px;">
        <p>لا توجد أسئلة في هذا الاختبار بعد.</p>
        <button class="btn btn-primary mt-4" onclick="navigateTo('dashboard')">العودة للوحة التحكم</button>
      </div>`;
    return;
  }

  const q = quiz.questions[quiz.currentIndex];
  const prevAns = quiz.answers[quiz.currentIndex]; // previously recorded answer (for going back/jumping)

  if (quiz.isReviewMode && !quiz.answerConfirmed) {
    quiz.timeLeft = 60;
    startQuizTimer();
  }

  // Answered count calculation
  const answeredCount = quiz.questions.filter((_, i) => {
    const a = quiz.answers[i];
    if (!a || a.answer === null || a.answer === undefined || a.answer === '') return false;
    if (Array.isArray(a.answer) && a.answer.length === 0) return false;
    return true;
  }).length;

  // Question navigation chips (quick jumping to ANY question)
  const navChipsHtml = quiz.questions.map((_, i) => {
    let chipCls = 'q-chip';
    const isCur = i === quiz.currentIndex;
    const a = quiz.answers[i];
    const isAnswered = a && a.answer !== null && a.answer !== undefined && a.answer !== '' && (!Array.isArray(a.answer) || a.answer.length > 0);

    if (quiz.isReviewMode) {
      if (a && a.answer !== null && a.answer !== undefined) {
        chipCls += a.isCorrect ? ' correct' : ' wrong';
      }
    } else {
      // EXAM MODE: NEVER show correct or wrong! Only answered / active
      if (isAnswered) chipCls += ' answered';
    }
    if (isCur) chipCls += ' active';

    return `<button type="button" class="${chipCls}" onclick="jumpToQuestion(${i})" title="السؤال ${i + 1}${isAnswered ? ' (تمت الإجابة)' : ' (لم تتم الإجابة)'}">${i + 1}</button>`;
  }).join('');

  // Progress dots (also clickable)
  const progressHtml = quiz.questions.map((_, i) => {
    let dotCls = 'quiz-progress-dot';
    const isCur = i === quiz.currentIndex;
    const a = quiz.answers[i];
    const isAnswered = a && a.answer !== null && a.answer !== undefined && a.answer !== '' && (!Array.isArray(a.answer) || a.answer.length > 0);

    if (quiz.isReviewMode) {
      if (a && a.answer !== null && a.answer !== undefined) {
        dotCls += a.isCorrect ? ' correct' : ' wrong';
      }
    } else {
      // EXAM MODE: NEVER show correct or wrong! Only answered / active
      if (isAnswered) dotCls += ' answered';
    }
    if (isCur) dotCls += ' active';

    return `<div class="${dotCls}" onclick="jumpToQuestion(${i})" style="cursor:pointer;" title="السؤال ${i + 1}"></div>`;
  }).join('');

  // Question body
  let questionHtml = '';
  if (q.type === 'mcq' || q.type === 'true_false') {
    const labels = q.type === 'true_false' ? (Array.isArray(q.options) && q.options.length ? q.options : ['صح', 'خطأ']) : q.options;
    questionHtml = `
      <div class="options-grid">
        ${labels.map((opt, i) => {
          let extraClass = prevAns?.answer === i ? 'selected' : '';
          // Only show correct/wrong in Review Mode when confirmed!
          if (quiz.isReviewMode && quiz.answerConfirmed) {
            if (i === q.correct_answer) extraClass += ' correct';
            else if (prevAns?.answer === i) extraClass += ' wrong';
          }
          return `
          <div class="option-item ${extraClass}"
               ${(quiz.isReviewMode && quiz.answerConfirmed) ? '' : `onclick="selectOption(${i})"`} data-index="${i}">
            <div class="option-radio"></div>
            <span>${opt}</span>
          </div>`;
        }).join('')}
      </div>`;
  } else if (q.type === 'essay') {
    questionHtml = `
      <textarea class="essay-textarea" id="essayAnswer"
        placeholder="اكتب إجابتك هنا..." ${(quiz.isReviewMode && quiz.answerConfirmed) ? 'readonly' : ''}
        oninput="onEssayInput()">${prevAns?.answer || ''}</textarea>`;
  } else if (q.type === 'matching') {
    const pairs = q.options || [];
    questionHtml = `
      <div class="matching-container">
        ${pairs.map((pair, i) => {
          let rightSide = '';
          if (quiz.isReviewMode && quiz.answerConfirmed) {
            const userAns = prevAns?.answer?.find(a => a.left === i)?.right;
            const isCorrect = userAns === i;
            const rightText = (typeof pairs[userAns] === 'object' ? pairs[userAns].right : pairs[userAns]) || 'لم يتم الاختيار';
            rightSide = `
              <div style="margin-top:8px; padding:10px; border-radius:8px; background: ${isCorrect ? 'var(--success)' : 'var(--danger)'}; color: white; font-size: 0.9rem;">
                ${rightText}
              </div>
            `;
          } else {
            rightSide = `
              <select class="match-select" id="match-${i}" onchange="onMatchingChange()">
                <option value="">اختر المطابقة...</option>
                ${pairs.map((p, j) =>
                  `<option value="${j}" ${prevAns?.answer?.find(a => a.left === i)?.right === j ? 'selected' : ''}>${typeof p === 'object' ? p.right : p}</option>`).join('')}
              </select>
            `;
          }

          return `
          <div class="match-item">
            <strong>${typeof pair === 'object' ? pair.left : pair}</strong>
            ${rightSide}
          </div>`;
        }).join('')}
      </div>`;
  }

  let explanationHtml = '';
  if (quiz.isReviewMode && quiz.answerConfirmed && q.explanation) {
    explanationHtml = `
      <div style="margin-top:20px; padding:16px; border-radius:8px; background:rgba(99,102,241,0.05); border-right:4px solid var(--primary); text-align:right;">
        <strong style="color:var(--primary); font-size:0.95rem;">${ICONS.info} التعليل:</strong>
        <p style="margin-top:8px; font-size:0.9rem; line-height:1.5;">${q.explanation}</p>
      </div>
    `;
  }

  // Timer badge
  const timerHtml = quiz.timeLeft > 0 ? `
    <div style="display:inline-flex; align-items:center; gap:6px; padding:5px 14px;
                background:rgba(99,102,241,0.09); border-radius:20px;
                font-size:0.9rem; font-weight:700; color:var(--primary);">
      ${ICONS.clock}
      <span id="quizTimerEl">${_fmtTime(quiz.timeLeft)}</span>
    </div>` : '';

  let nextBtnText = quiz.currentIndex === quiz.questions.length - 1 ? 'إنهاء وتسليم الاختبار' : 'التالي';
  let nextBtnIcon = quiz.currentIndex === quiz.questions.length - 1 ? ICONS.checkCircle : ICONS.arrowLeft;
  if (quiz.isReviewMode && !quiz.answerConfirmed) {
    nextBtnText = 'تأكيد الإجابة';
    nextBtnIcon = ICONS.check;
  }

  $('quizContent').innerHTML = `
    <div class="glass question-card">
      <!-- Question Navigator Bar -->
      <div class="quiz-nav-container">
        <div class="quiz-nav-header">
          <span style="font-weight:700; color:var(--text); display:flex; align-items:center; gap:6px;">
            ${ICONS.quiz} التنقل بين الأسئلة (${quiz.questions.length} سؤال)
          </span>
          <div style="display:flex; align-items:center; gap:10px;">
            <span id="quizAnsweredBadge" style="font-weight:600; color:var(--primary);">
              ${answeredCount} من ${quiz.questions.length} تمت الإجابة
            </span>
            ${!quiz.isReviewMode ? `
              <button type="button" class="btn btn-secondary" onclick="confirmSubmitQuiz()" style="padding:4px 10px; font-size:0.8rem; border-radius:8px;">
                ${ICONS.checkCircle} تسليم الاختبار
              </button>
            ` : ''}
          </div>
        </div>
        <div class="quiz-nav-chips" id="quizNavChips">
          ${navChipsHtml}
        </div>
      </div>

      <div class="quiz-progress">${progressHtml}</div>

      <div style="display:flex; justify-content:space-between; align-items:center;
                  margin-bottom:20px; flex-wrap:wrap; gap:8px;">
        <span style="color:var(--text-muted); font-size:0.95rem; font-weight:600;">
          السؤال ${quiz.currentIndex + 1} من ${quiz.questions.length}
        </span>
        <div style="display:flex; align-items:center; gap:12px;">
          ${timerHtml}
          <span style="color:var(--primary); font-weight:700;">
            ${q.points || 1} نقطة
          </span>
        </div>
      </div>

      <div class="question-text">${q.question_text}</div>
      ${questionHtml}
      ${explanationHtml}

      <div style="margin-top:32px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
        ${quiz.currentIndex > 0
          ? `<button class="btn btn-secondary" onclick="prevQuestion()">${ICONS.arrowRight} السابق</button>`
          : '<div></div>'}

        <div style="display:flex; gap:10px;">
          ${!quiz.isReviewMode && quiz.currentIndex !== quiz.questions.length - 1 ? `
            <button class="btn btn-secondary" onclick="confirmSubmitQuiz()" style="font-size:0.9rem;">
              تسليم الآن
            </button>
          ` : ''}
          <button class="btn btn-primary" onclick="nextQuestion()">
            ${nextBtnText} ${nextBtnIcon}
          </button>
        </div>
      </div>
    </div>`;
}

// ==========================================
// NAVIGATION & ANSWER HANDLING
// ==========================================
function selectOption(index) {
  document.querySelectorAll('.option-item').forEach(el => el.classList.remove('selected'));
  const target = document.querySelector(`.option-item[data-index="${index}"]`);
  if (target) target.classList.add('selected');

  if (!state.currentQuiz?.isReviewMode) {
    saveCurrentAnswer(false);
    updateNavChips();
  }
}

function onEssayInput() {
  if (!state.currentQuiz?.isReviewMode) {
    saveCurrentAnswer(false);
    updateNavChips();
  }
}

function onMatchingChange() {
  if (!state.currentQuiz?.isReviewMode) {
    saveCurrentAnswer(false);
    updateNavChips();
  }
}

function updateNavChips() {
  const quiz = state.currentQuiz;
  if (!quiz) return;

  const answeredCount = quiz.questions.filter((_, i) => {
    const a = quiz.answers[i];
    if (!a || a.answer === null || a.answer === undefined || a.answer === '') return false;
    if (Array.isArray(a.answer) && a.answer.length === 0) return false;
    return true;
  }).length;

  const badge = $('quizAnsweredBadge');
  if (badge) {
    badge.textContent = `${answeredCount} من ${quiz.questions.length} تمت الإجابة`;
  }

  const currentChip = document.querySelectorAll('.q-chip')[quiz.currentIndex];
  const currentDot = document.querySelectorAll('.quiz-progress-dot')[quiz.currentIndex];
  const a = quiz.answers[quiz.currentIndex];
  const isAnswered = a && a.answer !== null && a.answer !== undefined && a.answer !== '' && (!Array.isArray(a.answer) || a.answer.length > 0);

  if (currentChip) {
    if (isAnswered) {
      currentChip.classList.add('answered');
    } else {
      currentChip.classList.remove('answered');
    }
  }
  if (currentDot) {
    if (isAnswered) {
      currentDot.classList.add('answered');
    } else {
      currentDot.classList.remove('answered');
    }
  }
}

function saveCurrentAnswer(showAlert = false) {
  const quiz = state.currentQuiz;
  if (!quiz || !quiz.questions || !quiz.questions[quiz.currentIndex]) return false;
  const q = quiz.questions[quiz.currentIndex];

  let answer = null;
  let isCorrect = false;
  let hasAnswer = false;

  if (q.type === 'mcq' || q.type === 'true_false') {
    const selected = document.querySelector('.option-item.selected');
    if (selected) {
      answer = parseInt(selected.dataset.index, 10);
      isCorrect = answer === q.correct_answer;
      hasAnswer = true;
    }
  } else if (q.type === 'essay') {
    const essayEl = $('essayAnswer');
    if (essayEl) {
      const val = essayEl.value.trim();
      if (val !== '') {
        answer = val;
        isCorrect = null; // pending manual evaluation
        hasAnswer = true;
      }
    }
  } else if (q.type === 'matching') {
    const pairs = q.options || [];
    answer = [];
    let allCorrect = true;
    let anyFilled = false;
    pairs.forEach((_, i) => {
      const sel = $(`match-${i}`);
      if (sel && sel.value !== '') {
        anyFilled = true;
        const val = parseInt(sel.value, 10);
        answer.push({ left: i, right: val });
        if (val !== i) allCorrect = false;
      }
    });
    if (anyFilled) {
      hasAnswer = true;
      isCorrect = answer.length === pairs.length && allCorrect;
    }
  }

  if (hasAnswer) {
    const oldAns = quiz.answers[quiz.currentIndex];
    if (oldAns?.isCorrect) quiz.score -= (oldAns.points || 0);

    quiz.answers[quiz.currentIndex] = {
      question_id: q.question_id,
      type: q.type,
      answer,
      isCorrect,
      points: isCorrect ? (q.points || 1) : 0
    };

    if (isCorrect) quiz.score += (q.points || 1);
    return true;
  } else {
    if (showAlert) {
      showToast('يرجى اختيار إجابة أولاً', 'error');
    }
    return false;
  }
}

function jumpToQuestion(targetIndex) {
  const quiz = state.currentQuiz;
  if (!quiz || targetIndex < 0 || targetIndex >= quiz.questions.length) return;
  if (targetIndex === quiz.currentIndex) return;

  if (!quiz.isReviewMode) {
    saveCurrentAnswer(false);
  }

  quiz.currentIndex = targetIndex;
  if (quiz.isReviewMode) {
    quiz.answerConfirmed = quiz.answers[quiz.currentIndex] !== null;
  }
  renderQuizQuestion();
}

function prevQuestion() {
  const quiz = state.currentQuiz;
  if (!quiz || quiz.currentIndex <= 0) return;

  if (!quiz.isReviewMode) {
    saveCurrentAnswer(false);
  }

  quiz.currentIndex--;
  if (quiz.isReviewMode) {
    quiz.answerConfirmed = quiz.answers[quiz.currentIndex] !== null;
  }
  renderQuizQuestion();
}

function nextQuestion(forceAdvance = false) {
  const quiz = state.currentQuiz;
  if (!quiz) return;
  const q = quiz.questions[quiz.currentIndex];

  // 1. Review Mode logic
  if (quiz.isReviewMode && !quiz.answerConfirmed) {
    let answer = null;
    let isCorrect = false;

    if (!forceAdvance) {
      if (q.type === 'mcq' || q.type === 'true_false') {
        const selected = document.querySelector('.option-item.selected');
        if (!selected) { showToast('يرجى اختيار إجابة أولاً', 'error'); return; }
        answer = parseInt(selected.dataset.index, 10);
        isCorrect = answer === q.correct_answer;
      } else if (q.type === 'essay') {
        answer = $('essayAnswer').value.trim();
        if (!answer) { showToast('يرجى كتابة إجابة أولاً', 'error'); return; }
        isCorrect = null;
      } else if (q.type === 'matching') {
        const pairs = q.options || [];
        answer = [];
        let allCorrect = true;
        let missing = false;
        pairs.forEach((_, i) => {
          const val = $(`match-${i}`).value;
          if (val === '') { missing = true; }
          answer.push({ left: i, right: parseInt(val, 10) });
          if (parseInt(val, 10) !== i) allCorrect = false;
        });
        if (missing) { showToast('يرجى إكمال جميع المطابقات', 'error'); return; }
        isCorrect = allCorrect;
      }
    } else {
      answer = q.type === 'matching' ? [] : null;
      isCorrect = false;
    }

    quiz.answers[quiz.currentIndex] = {
      question_id: q.question_id,
      type: q.type,
      answer,
      isCorrect,
      points: isCorrect ? (q.points || 1) : 0
    };

    quiz.answerConfirmed = true;
    if (quiz.timerInterval) {
      clearInterval(quiz.timerInterval);
      quiz.timerInterval = null;
    }
    renderQuizQuestion();
    return;
  }

  // 2. Exam Mode logic
  if (!quiz.isReviewMode) {
    saveCurrentAnswer(false);
  }

  if (quiz.currentIndex < quiz.questions.length - 1) {
    quiz.currentIndex++;
    if (quiz.isReviewMode) {
      quiz.answerConfirmed = quiz.answers[quiz.currentIndex] !== null;
    }
    renderQuizQuestion();
  } else {
    if (quiz.isReviewMode) {
      showToast('🎉 اكتملت المراجعة بنجاح!', 'success');
      if (state.user.role === 'admin') {
        navigateTo('admin');
      } else {
        navigateTo('dashboard');
      }
    } else {
      confirmSubmitQuiz();
    }
  }
}

// ==========================================
// SUBMIT CONFIRMATION & QUIZ SUBMISSION
// ==========================================
function confirmSubmitQuiz() {
  const quiz = state.currentQuiz;
  if (!quiz) return;

  if (!quiz.isReviewMode) {
    saveCurrentAnswer(false);
  }

  const answeredCount = quiz.questions.filter((_, i) => {
    const a = quiz.answers[i];
    if (!a || a.answer === null || a.answer === undefined || a.answer === '') return false;
    if (Array.isArray(a.answer) && a.answer.length === 0) return false;
    return true;
  }).length;

  const total = quiz.questions.length;
  const unansweredCount = total - answeredCount;

  closeSubmitConfirmModal();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'submitConfirmModal';

  let modalBody = '';
  if (unansweredCount > 0) {
    modalBody = `
      <div style="font-size: 2.8rem; margin-bottom: 12px;">⚠️</div>
      <h3 style="margin-bottom: 12px; color: var(--warning);">تنبيه: أسئلة متبقية بدون إجابة</h3>
      <p style="margin-bottom: 16px; color: var(--text-muted); line-height: 1.6;">
        لقد قمت بالإجابة على <strong>${answeredCount}</strong> من أصل <strong>${total}</strong> سؤالاً.<br>
        يوجد <strong style="color: var(--danger); font-size: 1.1rem;">${unansweredCount}</strong> سؤالاً بدون إجابة.
      </p>
      <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 24px;">
        يمكنك العودة إلى لوحة الأسئلة واختيار أي سؤال لإكماله، أو تسليم الاختبار الآن.
      </div>
      <div class="modal-footer" style="justify-content: center; gap: 12px;">
        <button type="button" class="btn btn-secondary" onclick="closeSubmitConfirmModal()">
          العودة للأسئلة
        </button>
        <button type="button" class="btn btn-primary" style="background: var(--danger); border-color: var(--danger);" onclick="closeSubmitConfirmModal(); submitQuiz();">
          تسليم على أي حال
        </button>
      </div>
    `;
  } else {
    modalBody = `
      <div style="font-size: 2.8rem; margin-bottom: 12px;">📝</div>
      <h3 style="margin-bottom: 12px;">تأكيد تسليم الاختبار</h3>
      <p style="margin-bottom: 16px; color: var(--text-muted); line-height: 1.6;">
        أحسنت! لقد أجبت على جميع الأسئلة (<strong>${total}</strong> من <strong>${total}</strong>).<br>
        هل أنت متأكد من رغبتك في إنهاء المحاولة وتسليم الإجابات الآن؟
      </p>
      <div class="modal-footer" style="justify-content: center; gap: 12px; margin-top: 24px;">
        <button type="button" class="btn btn-secondary" onclick="closeSubmitConfirmModal()">
          مراجعة الإجابات
        </button>
        <button type="button" class="btn btn-primary" onclick="closeSubmitConfirmModal(); submitQuiz();">
          نعم، تسليم الاختبار
        </button>
      </div>
    `;
  }

  modal.innerHTML = `<div class="glass modal-content" style="max-width: 440px; text-align: center;">${modalBody}</div>`;
  document.body.appendChild(modal);
}

function closeSubmitConfirmModal() {
  const el = document.getElementById('submitConfirmModal');
  if (el) el.remove();
}

// ==========================================
// SUBMIT QUIZ
// ==========================================
function _scoreColor(score, max) {
  if (!max) return 'var(--primary)';
  const p = score / max;
  return p >= 0.7 ? 'var(--success)' : p >= 0.5 ? 'var(--warning)' : 'var(--danger)';
}

async function submitQuiz() {
  const quiz = state.currentQuiz;

  // Stop timer
  if (quiz.timerInterval) { clearInterval(quiz.timerInterval); quiz.timerInterval = null; }

  // Ensure current question answer is saved
  if (!quiz.isReviewMode) {
    saveCurrentAnswer(false);
  }

  // Recalculate total score accurately
  quiz.score = quiz.questions.reduce((acc, q, i) => {
    const a = quiz.answers[i];
    if (a && a.isCorrect) {
      return acc + (q.points || 1);
    }
    return acc;
  }, 0);

  const hasEssay  = quiz.answers.some(a => a?.type === 'essay');
  const color     = _scoreColor(quiz.score, quiz.maxScore);
  const pct       = quiz.maxScore ? Math.round(quiz.score / quiz.maxScore * 100) : 0;

  // ─── Build answer review ──────────────────────────────────────────────────
  let reviewHtml = '';
  quiz.questions.forEach((q, i) => {
    const ans = quiz.answers[i];
    const isPending  = q.type === 'essay';
    const isCorrect  = ans?.isCorrect;
    const rgb        = isPending ? '245,158,11' : isCorrect ? '16,185,129' : '239,68,68';
    const sColor     = isPending ? 'var(--warning)' : isCorrect ? 'var(--success)' : 'var(--danger)';
    const statusIcon = isPending ? ICONS.clock : isCorrect ? ICONS.checkCircle : ICONS.alert;
    const statusText = isPending ? 'قيد المراجعة' : isCorrect ? 'صحيحة ✓' : 'خاطئة ✗';

    // Build display text for the student's answer and the correct answer
    let myAnswer = '—';
    let correctAnswer = '';
    if (q.type === 'mcq' || q.type === 'true_false') {
      myAnswer      = Array.isArray(q.options) ? (q.options[ans?.answer] ?? `الخيار ${ans?.answer}`) : String(ans?.answer ?? '—');
      correctAnswer = Array.isArray(q.options) ? (q.options[q.correct_answer] ?? `الخيار ${q.correct_answer}`) : String(q.correct_answer);
    } else if (q.type === 'essay') {
      myAnswer = ans?.answer || '(لم يتم تقديم إجابة)';
    } else if (q.type === 'matching') {
      myAnswer = 'تم تقديم المطابقة';
    }

    reviewHtml += `
      <div style="border:2px solid rgba(${rgb},0.4); background:rgba(${rgb},0.04);
                  border-radius:14px; padding:18px; margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;
                    gap:10px; margin-bottom:10px;">
          <div style="font-weight:600; font-size:0.94rem; flex:1; line-height:1.5;">
            ${i + 1}. ${q.question_text}
          </div>
          <div style="color:${sColor}; white-space:nowrap; font-size:0.8rem; font-weight:700;
                      display:flex; align-items:center; gap:4px; padding-top:3px; flex-shrink:0;">
            ${statusIcon} ${statusText}
          </div>
        </div>

        <div style="font-size:0.87rem; display:flex; flex-direction:column; gap:5px;">
          ${q.type !== 'essay' && q.type !== 'matching' ? `
            <div>
              <span style="color:var(--text-muted);">إجابتك: </span>
              <strong style="color:${sColor};">${myAnswer}</strong>
            </div>` : ''}

          ${!isCorrect && !isPending && q.type !== 'matching' ? `
            <div>
              <span style="color:var(--text-muted);">الإجابة الصحيحة: </span>
              <strong style="color:var(--success);">${correctAnswer}</strong>
            </div>` : ''}

          ${q.type === 'essay' ? `
            <div>
              <span style="color:var(--text-muted);">إجابتك: </span>
              <span style="font-style:italic;">${myAnswer}</span>
            </div>
            <div style="color:var(--warning); font-size:0.82rem; display:flex; align-items:center; gap:4px; margin-top:2px;">
              ${ICONS.clock} مقالي — بانتظار التقييم اليدوي
            </div>` : ''}

          ${q.explanation && !isPending ? `
            <div style="margin-top:8px; padding:10px 14px;
                        background:rgba(99,102,241,0.07);
                        border-left:3px solid var(--primary);
                        border-radius:0 8px 8px 0;
                        font-size:0.84rem; line-height:1.65; color:var(--text-muted);">
              💡 <strong style="color:var(--primary);">التعليل:</strong> ${q.explanation}
            </div>` : ''}
        </div>
      </div>`;
  });

  // ─── Results screen ───────────────────────────────────────────────────────
  $('quizContent').innerHTML = `
    <div class="glass question-card">
      <div style="text-align:center; padding:20px 0 28px; border-bottom:2px solid var(--border); margin-bottom:24px;">
        <div style="font-size:3rem; margin-bottom:12px;">
          ${hasEssay ? '📝' : pct >= 70 ? '🎉' : pct >= 50 ? '📊' : '💪'}
        </div>
        <h2 style="margin-bottom:8px;">${quiz.isReviewMode ? 'اكتملت المراجعة!' : 'تم تسليم الاختبار!'}</h2>
        ${quiz.isReviewMode
          ? '<p style="color:var(--text-muted);">لقد أكملت مراجعة جميع أسئلة هذا الاختبار.</p>'
          : hasEssay
            ? '<p style="color:var(--text-muted);">الأسئلة المقالية في انتظار التقييم اليدوي.<br>سيتم تحديث درجاتك بعد التقييم.</p>'
            : `<div style="font-size:2.8rem; font-weight:900; color:${color}; margin:12px 0; line-height:1.1;">
                 ${quiz.score}<span style="font-size:1.3rem; font-weight:500; color:var(--text-muted);">/${quiz.maxScore}</span>
               </div>
               <div style="font-size:1rem; font-weight:700; color:${color};">${pct}%</div>`
        }
      </div>

      <h3 style="margin-bottom:16px; font-size:1.05rem;">📋 مراجعة الإجابات</h3>
      ${reviewHtml}

      <button class="btn btn-primary w-full" style="margin-top:8px;" onclick="navigateTo('dashboard')">
        العودة للوحة التحكم
      </button>
    </div>`;

  // Save to backend ONLY in Exam Mode and ONLY for students
  if (!MOCK_MODE && !quiz.isReviewMode) {
    if (state.user.role === 'student') {
      try {
        await API.post('submitQuiz', {
          username: state.user.username,
          quiz_id:  quiz.quizId,
          material_id: quiz.materialId,
          answers:  quiz.answers,
          score:    quiz.score,
          max_score: quiz.maxScore
        });
      } catch (err) {
        console.error('Error submitting quiz:', err);
      }
    } else {
      setTimeout(() => showToast('أنت لست طالباً - لم يتم حفظ السجل', 'warning'), 1000);
    }
  }

  if (!hasEssay) createConfetti();
  showToast(quiz.isReviewMode ? 'اكتملت المراجعة!' : 'تم تسليم الاختبار بنجاح!', 'success');
}
