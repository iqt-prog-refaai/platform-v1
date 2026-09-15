const fs = require('fs');
let lines = fs.readFileSync('js/modals.js', 'utf8').split('\n');

// Find where to inject the quizModeSelection safely inside showModal
let insertionIndex = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes("modal.innerHTML = `")) {
    insertionIndex = i;
    break;
  }
}

if (insertionIndex !== -1) {
  const injection = `
  } else if (type === 'quizModeSelection') {
    content = \`
      <h3 style="margin-bottom: 8px;">\${data.title}</h3>
      <p style="color:var(--text-muted); margin-bottom:24px; font-size:0.9rem;">اختر وضع الاختبار للبدء</p>
      
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="glass glass-hover" style="padding:16px; cursor:pointer; border-left: 4px solid var(--primary);" onclick="closeModal(); startQuiz('\${data.materialId}', '\${data.quizId}', false)">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="color:var(--primary);">\${ICONS.quiz}</div>
            <div>
              <h4 style="margin:0; margin-bottom:4px;">وضع الاختبار (Test Mode)</h4>
              <p style="margin:0; font-size:0.8rem; color:var(--text-muted);">اختبار كامل مع مؤقت وحفظ الدرجة في السجل.</p>
            </div>
          </div>
        </div>
        
        <div class="glass glass-hover" style="padding:16px; cursor:pointer; border-left: 4px solid var(--warning);" onclick="closeModal(); startQuiz('\${data.materialId}', '\${data.quizId}', true)">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="color:var(--warning);">\${ICONS.info}</div>
            <div>
              <h4 style="margin:0; margin-bottom:4px;">وضع التدريب (Review Mode)</h4>
              <p style="margin:0; font-size:0.8rem; color:var(--text-muted);">تدريب بدون حفظ الدرجات، إظهار الإجابة الصحيحة فوراً، ومؤقت لكل سؤال.</p>
            </div>
          </div>
        </div>
      </div>
      
      <div style="display:flex; justify-content:center; margin-top:24px;">
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      </div>
    \`;
`;
  lines.splice(insertionIndex, 0, injection);
  fs.writeFileSync('js/modals.js', lines.join('\n'));
}
