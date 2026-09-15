const fs = require('fs');
let code = fs.readFileSync('js/quiz.js', 'utf8');

const targetTimer = `      } else {
        showToast('\${ICONS.clock} انتهى الوقت لهذه السؤل!', 'error');
        // Force wrong answer
        if (!quiz.answerConfirmed) {
          quiz.answers[quiz.currentIndex] = { answer: null, isCorrect: false, points: 0 };
          quiz.answerConfirmed = true;
          renderQuizQuestion();
        }
      }`;

const newTimer = `      } else {
        showToast('\${ICONS.clock} انتهى الوقت!', 'warning');
      }`;

code = code.replace(targetTimer, newTimer);
fs.writeFileSync('js/quiz.js', code);
