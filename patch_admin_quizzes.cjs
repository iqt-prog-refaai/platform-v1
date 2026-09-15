const fs = require('fs');
let code = fs.readFileSync('js/admin.js', 'utf8');

const targetFunc = `  const quizMaterials = [];
  for (const unit of state.units) {
    for (const lesson of (state.lessons[unit.unit_id] || [])) {
      for (const mat of (state.materials[lesson.lesson_id] || [])) {
        if (mat.type === 'quiz') {
          quizMaterials.push({ mat, unit, lesson });
        }
      }
    }
  }`;

const replacementFunc = `  const quizMaterials = [];
  
  // Helper to safely add quizzes
  const addQuizMats = (mats, pathName) => {
    (mats || []).forEach(mat => {
      if (mat.type === 'quiz') quizMaterials.push({ mat, pathName });
    });
  };

  // Quizzes in lessons
  for (const unit of (state.units || [])) {
    for (const lesson of (state.lessons[unit.unit_id] || [])) {
      addQuizMats(state.materials[lesson.lesson_id], unit.unit_name + ' → ' + lesson.lesson_name);
    }
    // Quizzes directly in units
    addQuizMats(state.unitMaterials?.[unit.unit_id], unit.unit_name + ' (مستقل)');
  }
  
  // Completely standalone quizzes (if any)
  addQuizMats(state.standaloneMaterials, 'مستقل (بدون وحدة)');`;

code = code.replace(targetFunc, replacementFunc);
fs.writeFileSync('js/admin.js', code);
