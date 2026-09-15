const fs = require('fs');
let code = fs.readFileSync('js/profile.js', 'utf8');

const targetStr = `  // Convert image to Base64 for storing in the backend/localstorage
  const reader = new FileReader();
  reader.onloadend = async () => {
    const base64String = reader.result;
    
    showLoading();
    try {`;

const replaceStr = `  // Compress image before Base64 to avoid Google Apps Script payload limits
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = async function() {
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
      
      // Get compressed base64 (jpeg, 0.7 quality)
      const base64String = canvas.toDataURL('image/jpeg', 0.7);
      
      showLoading();
      try {`;

const targetEndStr = `    } catch(err) {
      showToast('حدث خطأ أثناء التحديث', 'error');
      console.error(err);
    } finally {
      hideLoading();
    }
  };
  reader.readAsDataURL(file);`;

const replaceEndStr = `      } catch(err) {
        showToast('حدث خطأ أثناء التحديث', 'error');
        console.error(err);
      } finally {
        hideLoading();
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);`;

code = code.replace(targetStr, replaceStr);
code = code.replace(targetEndStr, replaceEndStr);

fs.writeFileSync('js/profile.js', code);
