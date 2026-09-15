const fs = require('fs');
let code = fs.readFileSync('js/admin.js', 'utf8');

const target = `<h2 style="margin-bottom: 24px; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">الطلاب</h2>`;
const replacement = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 style="margin: 0; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">الطلاب والمستخدمين</h2>
      <button class="btn btn-primary" onclick="showModal('addUser')">إضافة مستخدم جديد</button>
    </div>`;

code = code.replace(target, replacement);
fs.writeFileSync('js/admin.js', code);
