const fs = require('fs');
let code = fs.readFileSync('js/admin.js', 'utf8');

const targetFunc = `async function renderAdminStudents(container) {
  container.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;">جاري تحميل الطلاب...</div>';

  let students = [];
  if (MOCK_MODE) {
    students = [{ name: 'طالب تجريبي', username: 'student', role: 'student' }];
  } else {
    const res = await API.get('getAllStudents');
    if (res.success) students = res.students;
  }

  container.innerHTML = \`
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 style="margin: 0; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">الطلاب والمستخدمين</h2>
      <button class="btn btn-primary" onclick="showModal('addUser')">إضافة مستخدم جديد</button>
    </div>
    <div id="studentsList">
      \${students.map(s => \`
        <div class="glass student-card">
          <div class="student-info">
            <h3>\${s.name}</h3>
            <p>@\${s.username}</p>
          </div>
          <button class="btn btn-secondary" onclick="viewStudentDetails('\${s.username}')">عرض التفاصيل</button>
        </div>
      \`).join('')}
    </div>
  \`;
}`;

const replacementFunc = `async function renderAdminStudents(container) {
  container.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;">جاري تحميل الطلاب...</div>';

  let students = [];
  if (MOCK_MODE) {
    const db = JSON.parse(localStorage.getItem('iqt_db'));
    students = db ? db.users.filter(u => u.role === 'student') : [{ name: 'طالب تجريبي', username: 'student', role: 'student' }];
  } else {
    const res = await API.get('getAllStudents');
    if (res.success) students = res.students;
  }

  if (state.user.role === 'manager') {
    container.innerHTML = \`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <h2 style="margin: 0; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">إحصائيات الطلاب</h2>
      </div>
      <div class="glass" style="padding:40px; text-align:center;">
        <h1 style="font-size:3rem; margin-bottom:16px;">\${students.length}</h1>
        <p style="color:var(--text-muted);">إجمالي عدد الطلاب المسجلين بالمنصة</p>
        <p style="margin-top:12px; font-size:0.85rem; color:var(--text-muted);">حساب المدير لا يمكنه عرض أسماء الطلاب أو تفاصيلهم لحماية الخصوصية.</p>
      </div>
    \`;
    return;
  }

  container.innerHTML = \`
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 style="margin: 0; font-family: 'Space Grotesk', 'Tajawal', sans-serif;">الطلاب والمستخدمين</h2>
      \${['admin', 'vip'].includes(state.user.role) ? '<button class="btn btn-primary" onclick="showModal(\\'addUser\\')">إضافة مستخدم جديد</button>' : ''}
    </div>
    <div id="studentsList">
      \${students.map(s => \`
        <div class="glass student-card">
          <div class="student-info">
            <h3>\${state.user.role === 'vip' ? s.name : (s.credits || s.name)}</h3>
            <p>@\${state.user.role === 'vip' ? '******' : s.username}</p>
          </div>
          <button class="btn btn-secondary" onclick="viewStudentDetails('\${s.username}')">عرض التفاصيل</button>
        </div>
      \`).join('')}
    </div>
  \`;
}`;

code = code.replace(targetFunc, replacementFunc);
fs.writeFileSync('js/admin.js', code);
