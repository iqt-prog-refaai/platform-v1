const fs = require('fs');
let code = fs.readFileSync('js/admin.js', 'utf8');

const target = `  for (const { mat, unit, lesson } of quizMaterials) {
    const quiz = state.quizzes[mat.material_id];
    const timerBadge = quiz?.time_limit > 0
      ? \`<span style="font-size:0.78rem; color:var(--primary); background:rgba(99,102,241,0.1);
                      padding:2px 8px; border-radius:10px; margin-right:6px;">
           ⏱ \${quiz.time_limit} min
         </span>\`
      : '';
    html += \`
      <div class="glass" style="padding: 20px; margin-bottom: 12px;">
        <div class="flex justify-between items-center">
          <div>
            <h4 style="margin-bottom:4px;">\${mat.title}</h4>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin:0;">
              \${unit.unit_name} → \${lesson.lesson_name}
              \${quiz
                ? \`<span style="color: var(--success); margin-right: 6px;">\${ICONS.check} Ready</span>\${timerBadge}\`
                : \`<span style="color: var(--warning); margin-right: 8px;">\${ICONS.warning} No quiz record yet</span>\`}
            </p>`;

const replacement = `  for (const { mat, pathName } of quizMaterials) {
    const quiz = state.quizzes[mat.material_id];
    const timerBadge = quiz?.time_limit > 0
      ? \`<span style="font-size:0.78rem; color:var(--primary); background:rgba(99,102,241,0.1);
                      padding:2px 8px; border-radius:10px; margin-right:6px;">
           ⏱ \${quiz.time_limit} دقيقة
         </span>\`
      : '';
    html += \`
      <div class="glass" style="padding: 20px; margin-bottom: 12px;">
        <div class="flex justify-between items-center">
          <div>
            <h4 style="margin-bottom:4px;">\${mat.title}</h4>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin:0;">
              \${pathName}
              \${quiz
                ? \`<span style="color: var(--success); margin-right: 6px;">\${ICONS.check} جاهز</span>\${timerBadge}\`
                : \`<span style="color: var(--warning); margin-right: 8px;">\${ICONS.warning} لم يتم الإنشاء بعد</span>\`}
            </p>`;

code = code.replace(target, replacement);
fs.writeFileSync('js/admin.js', code);
