const fs = require('fs');
let code = fs.readFileSync('js/profile.js', 'utf8');

const targetStr = `      if (MOCK_MODE) {
        state.user.avatar_url = base64String;
        localStorage.setItem('iqt_user', JSON.stringify(state.user));
        setupNavigation();
        renderProfile();
        showToast('تم تحديث الصورة بنجاح');
      } else {
        // Send base64 to API
        const res = await API.post('updateProfile', { username: state.user.username, avatar_url: base64String });
        if (res.success) {
          state.user.avatar_url = base64String;
          localStorage.setItem('iqt_user', JSON.stringify(state.user));
          setupNavigation();
          renderProfile();
          showToast('تم تحديث الصورة بنجاح');
        } else {
          showToast('فشل تحديث الصورة', 'error');
        }
      }`;

const replaceStr = `      // Update local state and UI immediately (Optimistic UI)
      state.user.avatar_url = base64String;
      localStorage.setItem('iqt_user', JSON.stringify(state.user));
      setupNavigation();
      renderProfile();
      showToast('تم تحديث الصورة بنجاح');

      if (!MOCK_MODE) {
        // Send base64 to API in the background (fire and forget / soft error)
        API.post('updateProfile', { username: state.user.username, avatar_url: base64String })
          .then(res => {
            if (!res.success) {
              console.warn('Backend failed to update profile avatar, but it is saved locally.');
            }
          })
          .catch(err => console.error('Error sending avatar to backend:', err));
      }`;

code = code.replace(targetStr, replaceStr);

fs.writeFileSync('js/profile.js', code);
