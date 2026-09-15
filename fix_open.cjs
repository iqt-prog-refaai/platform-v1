const fs = require('fs');
let code = fs.readFileSync('js/student.js', 'utf8');

const oldModalStr = "showModal('quizModeSelection', { materialId: mat.material_id, quizId: quiz?.quiz_id || mat.material_id, title: mat.title });";
const newOpenStr = `
    const isReview = quiz && quiz.quiz_mode === 'review';
    startQuiz(mat.material_id, quiz?.quiz_id || mat.material_id, isReview);
`;
code = code.replace(oldModalStr, newOpenStr);
fs.writeFileSync('js/student.js', code);
