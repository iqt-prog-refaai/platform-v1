const fs = require('fs');
let code = fs.readFileSync('js/quiz.js', 'utf8');

const oldCode = `    // Get time limit (minutes → seconds) from cached quiz record
    const quizRecord = state.quizzes[materialId];
    const timeLimitSecs =
      quizRecord?.time_limit && parseInt(quizRecord.time_limit) > 0
        ? parseInt(quizRecord.time_limit) * 60
        : 0;

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
      answerConfirmed: false // true when student submits an answer in review mode
    };`;

const newCode = `    const quizRecord = state.quizzes[materialId];
    
    // Determine the actual mode based on settings (overrides param if set)
    const actualMode = quizRecord?.quiz_mode === 'review' ? true : 
                      (quizRecord?.quiz_mode === 'test' ? false : isReviewMode);
    
    const timeLimitSecs =
      quizRecord?.time_limit && parseInt(quizRecord.time_limit) > 0
        ? parseInt(quizRecord.time_limit) * 60
        : 0;
        
    const questionTimeLimitSecs = 
      quizRecord?.question_time_limit && parseInt(quizRecord.question_time_limit) > 0
        ? parseInt(quizRecord.question_time_limit)
        : 0;

    state.currentQuiz = {
      materialId,
      quizId,
      questions,
      currentIndex: 0,
      answers: new Array(questions.length).fill(null),
      score: 0,
      maxScore: questions.reduce((acc, q) => acc + (q.points || 1), 0),
      timeLeft: actualMode ? questionTimeLimitSecs : timeLimitSecs, // Question timer for review, global for test
      globalTimeLimit: timeLimitSecs,
      questionTimeLimit: questionTimeLimitSecs,
      timerInterval: null,
      isReviewMode: actualMode,
      answerConfirmed: false
    };`;

code = code.replace(oldCode, newCode);
fs.writeFileSync('js/quiz.js', code);
