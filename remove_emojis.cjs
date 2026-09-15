const fs = require('fs');

function fix(file) {
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/⏰/g, '${ICONS.clock}');
  code = code.replace(/✓/g, '${ICONS.check}');
  code = code.replace(/✗/g, '${ICONS.alert}');
  fs.writeFileSync(file, code);
}

fix('js/admin.js');
fix('js/modals.js');
fix('js/quiz.js');
