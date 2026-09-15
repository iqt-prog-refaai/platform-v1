const fs = require('fs');
let code = fs.readFileSync('js/admin.js', 'utf8');

const targetMatHTML = `              <button class="btn btn-secondary" style="padding: 6px; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'material', id: '\${mat.material_id}', name: '\${mat.title}'})" title="حذف">\${ICONS.trash}</button>
            </div>
          </div>
        \`).join('')}`;

const replacementMatHTML = `              \${mat.type === 'quiz' ? \`<button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem; border-color: var(--primary);" onclick="state.adminSection='quizzes'; renderAdmin(); setTimeout(() => manageQuestions('\${mat.material_id}'), 100)" title="إدارة الأسئلة">\${ICONS.quiz} الأسئلة</button>\` : ''}
              <button class="btn btn-secondary" style="padding: 6px; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'material', id: '\${mat.material_id}', name: '\${mat.title}'})" title="حذف">\${ICONS.trash}</button>
            </div>
          </div>
        \`).join('')}`;

code = code.replace(targetMatHTML, replacementMatHTML);
// Since this replacement needs to happen for both unit materials and lesson materials, we might need a regex
code = code.replace(/<button class="btn btn-secondary" style="padding: 6px; color: var\(--danger\);" onclick="showModal\('deleteConfirm', {type: 'material', id: '\\\${mat.material_id}', name: '\\\${mat.title}'}\)" title="حذف">\\\${ICONS.trash}<\/button>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?\\`\)\.join\(''\)/g, 
`\${mat.type === 'quiz' ? \`<button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem; border-color: var(--primary);" onclick="state.adminSection='quizzes'; renderAdmin(); setTimeout(() => manageQuestions('\${mat.material_id}'), 100)" title="إدارة الأسئلة">\${ICONS.quiz} الأسئلة</button>\` : ''}
              <button class="btn btn-secondary" style="padding: 6px; color: var(--danger);" onclick="showModal('deleteConfirm', {type: 'material', id: '\${mat.material_id}', name: '\${mat.title}'})" title="حذف">\${ICONS.trash}</button>
            </div>
          </div>
        \`).join('')`);

fs.writeFileSync('js/admin.js', code);
