// ============================================
// profile.js — Student profile & quiz history
// Depends on: api.js, state.js, utils.js
// ============================================

async function renderProfile() {
  $('profileName').textContent = state.user.name;
  
  // Use SVG Badge
  $('profileRoleBadge').innerHTML = getRoleBadgeSVG(state.user.role);
  
  if (state.user.avatar) {
    $('profileAvatar').innerHTML = `<img src="${state.user.avatar}" alt="avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
  } else {
    $('profileAvatar').textContent = state.user.name.charAt(0).toUpperCase();
  }
  
  // Pre-fill fields
  $('profileFullName').value = state.user.full_name || '';
  $('profileUsername').value = state.user.username || '';

  const historyContainer = $('quizHistory');
  historyContainer.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;">جاري تحميل السجل...</div>';

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

  function renderAttempts(attempts, titleByQuizId, matById) {
    if (!attempts.length) {
      return '<div class="glass text-center" style="padding: 40px;"><p>لا توجد محاولات اختبار بعد.</p></div>';
    }
    return attempts.map(att => {
      const title = titleByQuizId[att.quiz_id] || matById?.[att.material_id] || 'اختبار';
      const color = att.is_graded ? scoreColor(att.score, att.max_score) : 'var(--warning)';
      const pct   = att.is_graded && att.max_score ? Math.round((att.score / att.max_score) * 100) : null;
      return `
        <div class="glass" style="padding: 20px; margin-bottom: 12px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h4 style="margin-bottom: 4px;">${title}</h4>
            <p style="color: var(--text-muted); font-size: 0.85rem;">${formatDate(att.attempt_date)}</p>
            ${!att.is_graded ? `<span style="font-size:0.8rem; color:var(--warning); display:inline-flex; align-items:center; gap:4px; margin-top:4px;">${ICONS.clock} بانتظار التصحيح</span>` : ''}
          </div>
          <div style="text-align:center; min-width:72px;">
            <div style="font-size:1.6rem; font-weight:800; color:${color}; line-height:1;">
              ${att.is_graded ? `${att.score}<span style="font-size:0.9rem;font-weight:500;">/${att.max_score}</span>` : '—'}
            </div>
            ${pct !== null ? `<div style="font-size:0.78rem; color:${color}; margin-top:2px;">${pct}%</div>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  if (MOCK_MODE) {
    const { titleByQuizId, matById } = buildTitleMap();
    const mockAttempts = [
      { quiz_id: 'quiz1', score: 8, max_score: 10, is_graded: true,  attempt_date: new Date(Date.now() - 172800000).toISOString() },
      { quiz_id: 'quiz2', score: 3, max_score: 5,  is_graded: false, attempt_date: new Date().toISOString() }
    ];
    historyContainer.innerHTML = renderAttempts(mockAttempts, titleByQuizId, matById);
    return;
  }

  try {
    const res = await API.get('getQuizAttempts', { username: state.user.username, quizId: '' });
    if (!res.success) {
      historyContainer.innerHTML = '<div class="glass text-center" style="padding: 40px;"><p>لا توجد محاولات اختبار بعد.</p></div>';
      return;
    }

    // If allMaterials isn't populated yet (e.g. student navigated directly to profile), load it
    if (!state.allMaterials?.length) {
      await loadStudentData();
    }

    const { titleByQuizId, matById } = buildTitleMap();
    historyContainer.innerHTML = renderAttempts(res.attempts || [], titleByQuizId, matById);

  } catch(err) {
    historyContainer.innerHTML = '<p style="color:var(--danger);">خطأ في تحميل السجل.</p>';
    console.error(err);
  }
}

async function updateFullName() {
  const newName = $('profileFullName').value.trim();
  if (!newName) return showToast('يرجى إدخال الاسم', 'error');
  
  showLoading();
  try {
    const res = await API.post('updateUser', {
      username: state.user.username,
      full_name: newName
    });
    if (res.success) {
      state.user.full_name = newName;
      localStorage.setItem('iqt_user', JSON.stringify(state.user));
      showToast('تم تحديث الاسم بنجاح');
    } else {
      showToast(res.message || 'فشل التحديث', 'error');
    }
  } catch(e) {
    showToast('حدث خطأ', 'error');
  }
  hideLoading();
}

async function updateUsername() {
  const newUsername = $('profileUsername').value.trim();
  if (!newUsername) return showToast('يرجى إدخال اسم المستخدم', 'error');
  if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) return showToast('اسم المستخدم يجب أن يحتوي على حروف إنجليزية وأرقام فقط', 'error');
  
  showLoading();
  try {
    const res = await API.post('updateUser', {
      username: state.user.username,
      new_username: newUsername
    });
    if (res.success) {
      state.user.username = newUsername;
      localStorage.setItem('iqt_user', JSON.stringify(state.user));
      showToast('تم تحديث اسم المستخدم بنجاح');
    } else {
      showToast(res.message || 'اسم المستخدم مستخدم بالفعل', 'error');
    }
  } catch(e) {
    showToast('حدث خطأ', 'error');
  }
  hideLoading();
}

async function updatePassword() {
  const newPassword = $('profilePassword').value.trim();
  if (!newPassword) return showToast('يرجى إدخال كلمة المرور', 'error');
  if (newPassword.length < 6) return showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');

  showLoading();
  try {
    const res = await API.post('updateUser', {
      username: state.user.username,
      password: newPassword
    });
    if (res.success) {
      showToast('تم تحديث كلمة المرور بنجاح');
      $('profilePassword').value = '';
    } else {
      showToast(res.message || 'فشل التحديث', 'error');
    }
  } catch(e) {
    showToast('حدث خطأ', 'error');
  }
  hideLoading();
}

function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    const base64 = e.target.result;
    
    // Optimistic UI update
    $('profileAvatar').innerHTML = `<img src="${base64}" alt="avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    
    showLoading();
    try {
      const res = await API.post('updateUser', {
        username: state.user.username,
        avatar: base64
      });
      if (res.success) {
        state.user.avatar = base64;
        localStorage.setItem('iqt_user', JSON.stringify(state.user));
        // Update nav avatar
        if ($('navAvatar')) {
          $('navAvatar').innerHTML = `<img src="${base64}" alt="avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        }
        showToast('تم تحديث الصورة بنجاح');
      } else {
        showToast(res.message || 'فشل التحديث', 'error');
        renderProfile(); // Revert on fail
      }
    } catch(err) {
      showToast('حدث خطأ', 'error');
      renderProfile();
    }
    hideLoading();
  };
  reader.readAsDataURL(file);
}
