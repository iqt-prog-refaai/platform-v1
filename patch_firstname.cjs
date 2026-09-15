const fs = require('fs');
let code = fs.readFileSync('js/auth.js', 'utf8');

code = code.replace("showToast(`مرحباً بعودتك، ${result.user.name}!`);", "showToast(`مرحباً بعودتك، ${result.user.name.split(' ')[0]}!`);");
code = code.replace("<span>${state.user.name}</span>", "<span>${state.user.name.split(' ')[0]}</span>");

fs.writeFileSync('js/auth.js', code);
