const fs = require('fs');
let code = fs.readFileSync('js/modals.js', 'utf8');

const target = `async function submitQuizSettings() {
  const quizId     = $('quizSettingsId').value;
  const materialId = $('quizSettingsMaterialId').value;
  const timeLimit  = Math.max(0, parseInt($('quizTimeLimit').value) || 0);

  if (!MOCK_MODE) {
    await API.post('editItem', {
      itemType: 'quiz',
      id: quizId,
      updates: { time_limit: timeLimit }
    });
  }

  // Update local cache so the timer is available immediately when student starts
  if (state.quizzes[materialId]) {
    state.quizzes[materialId].time_limit = timeLimit;
  }

  showToast(timeLimit > 0 ? \`⏱ Timer set to \${timeLimit} minute\${timeLimit !== 1 ? 's' : ''}!\` : 'Timer disabled');
  closeModal();
}`;

const replacement = `async function submitQuizSettings() {
  const quizId     = $('quizSettingsId').value;
  const materialId = $('quizSettingsMaterialId').value;
  const mode       = $('quizSettingsMode').value;
  const timeLimit  = Math.max(0, parseInt($('quizTimeLimit').value) || 0);
  const qTimeLimit = Math.max(0, parseInt($('questionTimeLimit').value) || 0);

  const updates = { 
    time_limit: timeLimit,
    quiz_mode: mode,
    question_time_limit: qTimeLimit
  };

  if (!MOCK_MODE) {
    await API.post('editItem', {
      itemType: 'quiz',
      id: quizId,
      updates: updates
    });
  } else {
    const db = JSON.parse(localStorage.getItem('iqt_db'));
    if(db && db.quizzes) {
      const idx = db.quizzes.findIndex(q => q.quiz_id === quizId);
      if(idx > -1) {
        db.quizzes[idx] = { ...db.quizzes[idx], ...updates };
        localStorage.setItem('iqt_db', JSON.stringify(db));
      }
    }
  }

  // Update local cache so the timer is available immediately when student starts
  if (state.quizzes[materialId]) {
    state.quizzes[materialId].time_limit = timeLimit;
    state.quizzes[materialId].quiz_mode = mode;
    state.quizzes[materialId].question_time_limit = qTimeLimit;
  }

  showToast('تم حفظ الإعدادات بنجاح');
  closeModal();
}`;

code = code.replace(target, replacement);
fs.writeFileSync('js/modals.js', code);
