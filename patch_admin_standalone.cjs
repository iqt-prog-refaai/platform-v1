const fs = require('fs');
let code = fs.readFileSync('js/admin.js', 'utf8');

const targetLoop = "      `).join('')}\n    </div>";

const replacementLoop = `      \`).join('')}

      <div class="glass" style="padding: 20px; margin-bottom: 12px; border-left: 4px solid var(--primary);">
        <div class="flex justify-between items-center">
          <div>
            <h4 style="margin: 0;">دروس ومحتويات مستقلة</h4>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary" style="padding: 8px 16px; font-size: 0.85rem;" onclick="showModal('addMaterial', '')">
              \${ICONS.plus} محتوى مستقل
            </button>
            <button class="btn btn-secondary" style="padding: 8px 16px; font-size: 0.85rem;" onclick="showModal('addLesson', '')">
              \${ICONS.plus} درس مستقل
            </button>
          </div>
        </div>
        <div style="margin-top: 16px; padding-right: 16px;">
          \${(state.unitMaterials?.[''] || []).map(mat => \`
            <div class="flex justify-between items-center" style="padding: 8px 12px; margin-bottom: 8px; background: rgba(99, 102, 241, 0.05); border-radius: 8px;">
              <span style="font-weight:600; color:var(--primary);">\${ICONS[mat.type] || ICONS.document} \${mat.title}</span>
              <div class="flex gap-2">
                \${mat.type === 'quiz' ? \`<button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem; border-color: var(--primary);" onclick="state.adminSection='quizzes'; renderAdmin(); setTimeout(() => manageQuestions('\${mat.material_id}'), 100)" title="إدارة الأسئلة">\${ICONS.quiz} الأسئلة</button>\` : ''}
                <button class="btn btn-secondary" style="padding: 6px;" onclick='showModal("editMaterial", \${JSON.stringify(mat).replace(/'/g, "&#39;")})' title="تعديل">\${ICONS.edit}</button>
                <button class="btn btn-secondary" style="padding: 6px; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'material', id: '\${mat.material_id}', name: '\${mat.title}'})" title="حذف">\${ICONS.trash}</button>
              </div>
            </div>
          \`).join('')}
          
          \${(state.lessons[''] || []).map(lesson => \`
            <div class="flex justify-between items-center" style="padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.04);">
              <span>\${lesson.lesson_number}. \${lesson.lesson_name}</span>
              <div class="flex gap-2">
                <button class="btn btn-secondary" style="padding: 6px;" onclick='showModal("editLesson", \${JSON.stringify(lesson).replace(/'/g, "&#39;")})' title="تعديل">\${ICONS.edit}</button>
                <button class="btn btn-secondary" style="padding: 6px; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'lesson', id: '\${lesson.lesson_id}', name: '\${lesson.lesson_name}'})" title="حذف">\${ICONS.trash}</button>
                <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="showModal('addMaterial', '\${lesson.lesson_id}')">
                  \${ICONS.plus} محتوى
                </button>
              </div>
            </div>
          \`).join('')}
        </div>
      </div>
    </div>`;

code = code.replace(targetLoop, replacementLoop);
fs.writeFileSync('js/admin.js', code);
