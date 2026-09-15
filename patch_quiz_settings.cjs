const fs = require('fs');
let code = fs.readFileSync('js/modals.js', 'utf8');

const targetModal = `  } else if (type === 'editQuizSettings') {
    // id = { quiz_id, material_id, title, time_limit }
    const qz = id;
    content = \`
      <h3 style="margin-bottom: 4px;">Quiz Settings</h3>
      <p style="color:var(--text-muted); margin-bottom:20px; font-size:0.85rem;">\${qz.title || 'Quiz'}</p>
      <input type="hidden" id="quizSettingsId" value="\${qz.quiz_id}">
      <input type="hidden" id="quizSettingsMaterialId" value="\${qz.material_id}">
      <div class="input-group">
        <label>Time Limit (minutes) &nbsp;<span style="color:var(--text-muted); font-weight:400; font-size:0.85rem;">0 = no limit</span></label>
        <input type="number" id="quizTimeLimit" value="\${qz.time_limit || 0}" min="0" max="180" step="1">
        <p style="margin-top:6px; font-size:0.82rem; color:var(--text-muted); line-height:1.6;">
          Students will see a live countdown timer. When it reaches 0 the quiz is automatically submitted.
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="submitQuizSettings()">Save Settings</button>
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    \`;
  } else if (type === 'addUser') {`;

const newModal = `  } else if (type === 'editQuizSettings') {
    // id = { quiz_id, material_id, title, time_limit, quiz_mode, question_time_limit }
    const qz = id;
    content = \`
      <h3 style="margin-bottom: 4px;">إعدادات الاختبار</h3>
      <p style="color:var(--text-muted); margin-bottom:20px; font-size:0.85rem;">\${qz.title || 'الاختبار'}</p>
      <input type="hidden" id="quizSettingsId" value="\${qz.quiz_id}">
      <input type="hidden" id="quizSettingsMaterialId" value="\${qz.material_id}">
      
      <div class="input-group">
        <label>وضع الاختبار</label>
        <select id="quizSettingsMode" onchange="toggleQuizSettingsFields()">
          <option value="test" \${(!qz.quiz_mode || qz.quiz_mode === 'test') ? 'selected' : ''}>وضع الاختبار (تقييم شامل)</option>
          <option value="review" \${qz.quiz_mode === 'review' ? 'selected' : ''}>وضع المراجعة والتدريب (سؤال بسؤال)</option>
        </select>
      </div>

      <div class="input-group" id="testModeSettings" style="display: \${(!qz.quiz_mode || qz.quiz_mode === 'test') ? 'block' : 'none'};">
        <label>المدة الإجمالية للاختبار (بالدقائق) &nbsp;<span style="color:var(--text-muted); font-weight:400; font-size:0.85rem;">0 = بدون وقت</span></label>
        <input type="number" id="quizTimeLimit" value="\${qz.time_limit || 0}" min="0" max="180" step="1">
        <p style="margin-top:6px; font-size:0.82rem; color:var(--text-muted); line-height:1.6;">
          في حال انتهاء الوقت سيتم تسليم الاختبار تلقائياً.
        </p>
      </div>

      <div class="input-group" id="reviewModeSettings" style="display: \${qz.quiz_mode === 'review' ? 'block' : 'none'};">
        <label>المدة المخصصة لكل سؤال (بالثواني) &nbsp;<span style="color:var(--text-muted); font-weight:400; font-size:0.85rem;">0 = بدون وقت</span></label>
        <input type="number" id="questionTimeLimit" value="\${qz.question_time_limit || 0}" min="0" max="300" step="1">
        <p style="margin-top:6px; font-size:0.82rem; color:var(--text-muted); line-height:1.6;">
          يتم تقييم الطالب بعد كل سؤال، ولا يتم حفظ نتيجته في السجل.
        </p>
      </div>

      <div class="modal-footer">
        <button class="btn btn-primary" onclick="submitQuizSettings()">حفظ الإعدادات</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      </div>
      <script>
        window.toggleQuizSettingsFields = function() {
          const mode = document.getElementById('quizSettingsMode').value;
          document.getElementById('testModeSettings').style.display = mode === 'test' ? 'block' : 'none';
          document.getElementById('reviewModeSettings').style.display = mode === 'review' ? 'block' : 'none';
        };
      </script>
    \`;
  } else if (type === 'addUser') {`;

code = code.replace(targetModal, newModal);
fs.writeFileSync('js/modals.js', code);
