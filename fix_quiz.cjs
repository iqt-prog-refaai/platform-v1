const fs = require('fs');
let code = fs.readFileSync('js/quiz.js', 'utf8');

const targetState = `
    state.currentQuiz = {
      materialId,
      quizId,
      questions,
      currentIndex: 0,
      // Pre-fill answers array with nulls so prev/next pre-selection works
      answers: new Array(questions.length).fill(null),
      score: 0,
      maxScore: questions.reduce((acc, q) => acc + (q.points || 1), 0),
      timeLeft: isReviewMode ? 60 : timeLimitSecs,
      timerInterval: null,
      isReviewMode,
      answerConfirmed: false
    };`;

const newState = `
    const qTimeLimit = quizRecord?.question_time_limit ? parseInt(quizRecord.question_time_limit) : 0;
    state.currentQuiz = {
      materialId,
      quizId,
      questions,
      currentIndex: 0,
      answers: new Array(questions.length).fill(null),
      score: 0,
      maxScore: questions.reduce((acc, q) => acc + (q.points || 1), 0),
      timeLeft: isReviewMode ? qTimeLimit : timeLimitSecs,
      questionTimeLimit: qTimeLimit,
      timerInterval: null,
      isReviewMode,
      answerConfirmed: false
    };`;

code = code.replace(targetState, newState);

const targetReviewTimer = `
  if (quiz.isReviewMode && !quiz.answerConfirmed) {
    quiz.timeLeft = 60;
    startQuizTimer();
  }`;

const newReviewTimer = `
  if (quiz.isReviewMode && !quiz.answerConfirmed && quiz.questionTimeLimit > 0) {
    quiz.timeLeft = quiz.questionTimeLimit;
    startQuizTimer();
  }`;
  
code = code.replace(targetReviewTimer, newReviewTimer);

fs.writeFileSync('js/quiz.js', code);
