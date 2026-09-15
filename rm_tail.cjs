const fs = require('fs');
let code = fs.readFileSync('js/modals.js', 'utf8');

const lastFunc = "async function handleModalSubmit(event, type) {";
const idx = code.indexOf("  if (type === 'quizModeSelection') {", code.indexOf(lastFunc));
if (idx > -1) {
  code = code.substring(0, idx).trim();
  fs.writeFileSync('js/modals.js', code);
}
