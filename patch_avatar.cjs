const fs = require('fs');
let code = fs.readFileSync('js/profile.js', 'utf8');

const oldFunc = `function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Convert image to Base64 for storing in the backend/localstorage
  const reader = new FileReader();
  reader.onloadend = async () => {
    const base64String = reader.result;
    
    showLoading();
    try {
      if (MOCK_MODE) {
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
          showToast(res.message || 'فشل تحديث الصورة', 'error');
        }
      }
    } catch(err) {
      console.error(err);
      showToast('حدث خطأ أثناء تحديث الصورة', 'error');
    } finally {
      hideLoading();
    }
  };
  reader.readAsDataURL(file);
}`;

const newFunc = `function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Compress image before saving to avoid large Base64 strings
  const reader = new FileReader();
  reader.onloadend = () => {
    const img = new Image();
    img.src = reader.result;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 150;
      const MAX_HEIGHT = 150;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      const base64String = canvas.toDataURL('image/jpeg', 0.7);
      
      // Save locally to bypass backend limitations for avatars
      state.user.avatar_url = base64String;
      localStorage.setItem('iqt_user', JSON.stringify(state.user));
      localStorage.setItem('avatar_' + state.user.username, base64String);
      
      setupNavigation();
      renderProfile();
      showToast('تم تحديث الصورة بنجاح');
    };
  };
  reader.readAsDataURL(file);
}`;

code = code.replace(oldFunc, newFunc);
fs.writeFileSync('js/profile.js', code);
