const fs = require('fs');
let code = fs.readFileSync('js/modals.js', 'utf8');

// The first run created a loose snippet at the end of the file. Remove it.
const snippet = `  if (type === 'quizModeSelection') {
    content = \`
      <h3 style="margin-bottom: 8px;">\\\${data.title}</h3>`;

const idx = code.indexOf("if (type === 'quizModeSelection') {");
if (idx > code.indexOf("async function handleModalSubmit")) {
  code = code.substring(0, idx).trim();
  fs.writeFileSync('js/modals.js', code);
}
