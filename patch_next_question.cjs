const fs = require('fs');
let code = fs.readFileSync('js/quiz.js', 'utf8');

const target = `  if (quiz.currentIndex < quiz.questions.length - 1) {
    quiz.currentIndex++;
    if (quiz.isReviewMode) {
      quiz.answerConfirmed = quiz.answers[quiz.currentIndex] !== null;
    }
    renderQuizQuestion();
  } else {`;

const replacement = `  if (quiz.currentIndex < quiz.questions.length - 1) {
    quiz.currentIndex++;
    if (quiz.isReviewMode) {
      quiz.answerConfirmed = quiz.answers[quiz.currentIndex] !== null;
      // Reset the timer for the next question
      if (!quiz.answerConfirmed && quiz.questionTimeLimit > 0) {
        quiz.timeLeft = quiz.questionTimeLimit;
        startQuizTimer();
      }
    }
    renderQuizQuestion();
  } else {`;

code = code.replace(target, replacement);
fs.writeFileSync('js/quiz.js', code);
