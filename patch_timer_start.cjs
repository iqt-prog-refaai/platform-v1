const fs = require('fs');
let code = fs.readFileSync('js/quiz.js', 'utf8');

const target = `    if (timeLimitSecs > 0 || isReviewMode) startQuizTimer();`;
const replacement = `    if (state.currentQuiz.timeLeft > 0) startQuizTimer();`;

code = code.replace(target, replacement);
fs.writeFileSync('js/quiz.js', code);
