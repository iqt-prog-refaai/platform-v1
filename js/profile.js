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
    if ($('deleteAvatarBtn')) $('deleteAvatarBtn').style.display = 'inline-flex';
  } else {
    $('profileAvatar').textContent = state.user.name.charAt(0).toUpperCase();
    if ($('deleteAvatarBtn')) $('deleteAvatarBtn').style.display = 'none';
  }
  
  // Pre-fill fields
  if ($('profileUsername')) $('profileUsername').value = state.user.username || '';

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

// Name cannot be updated by student directly anymore

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
