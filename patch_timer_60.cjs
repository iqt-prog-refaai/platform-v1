const fs = require('fs');
let code = fs.readFileSync('js/quiz.js', 'utf8');

const target = `  if (quiz.isReviewMode && !quiz.answerConfirmed) {
    quiz.timeLeft = 60;
    startQuizTimer();
  }`;

code = code.replace(target, `  // Time was already initialized globally or in nextQuestion`);
fs.writeFileSync('js/quiz.js', code);
