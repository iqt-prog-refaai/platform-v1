const fs = require('fs');
let lines = fs.readFileSync('js/modals.js', 'utf8').split('\n');

let start = -1;
let end = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("} else if (type === 'addUser') {") && lines[i+1].includes("payload = {")) {
    start = i;
    for (let j = i; j < lines.length; j++) {
      if (lines[j].includes("};")) {
        end = j;
        break;
      }
    }
    break;
  }
}

if (start !== -1 && end !== -1) {
  lines.splice(start, end - start + 1);
  fs.writeFileSync('js/modals.js', lines.join('\n'));
}
