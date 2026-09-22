// ==========================================
// Google Apps Script - LMS Backend
// Sheet ID: 1RaF-85znR0np3ngv6muGWtf334m4YWa8hB4LYLGael8
// Deploy as Web App (Execute as Me, Allow Anyone)
// ==========================================

const SHEET_ID = '1RaF-85znR0np3ngv6muGWtf334m4YWa8hB4LYLGael8';

function doGet(e) {
  const action = e.parameter.action;
  let result = { success: false, message: 'Unknown action' };

  try {
    switch(action) {
      case 'login':
        result = handleLogin(e.parameter.username, e.parameter.password);
        break;
      case 'getUnits':
        result = getUnits();
        break;
      case 'getLessons':
        result = getLessons(e.parameter.unitId);
        break;
      case 'getMaterials':
        result = getMaterials(e.parameter.lessonId);
        break;
      case 'getAllMaterials':
        result = getAllMaterials();
        break;
      case 'getQuizzes':
        result = getQuizzes(e.parameter.materialId);
        break;
      case 'getQuestions':
        result = getQuestions(e.parameter.quizId);
        break;
      case 'getStudentProgress':
        result = getStudentProgress(e.parameter.username);
        break;
      case 'getQuizAttempts':
        result = getQuizAttempts(e.parameter.username, e.parameter.quizId);
        break;
      case 'getAllStudents':
        result = getAllStudents();
        break;
      case 'getAllUsers':
        result = getAllUsers();
        break;
      case 'getStudentDetails':
        result = getStudentDetails(e.parameter.username);
        break;
    }
  } catch(err) {
    result = { success: false, message: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  let result = { success: false, message: 'Unknown action' };

  try {
    switch(action) {
      case 'addUnit':
        result = addUnit(data);
        break;
      case 'addLesson':
        result = addLesson(data);
        break;
      case 'addMaterial':
        result = addMaterial(data);
        break;
      case 'updateMaterialOrder':
        result = updateMaterialOrder(data);
        break;
      case 'addQuiz':
        result = addQuiz(data);
        break;
      case 'addQuestion':
        result = addQuestion(data);
        break;
      case 'updateStudentProgress':
        result = updateStudentProgress(data);
        break;
      case 'submitQuiz':
        result = submitQuiz(data);
        break;
      case 'gradeEssay':
        result = gradeEssay(data);
        break;
      case 'importQuiz':
        result = importQuiz(data);
        break;
      case 'deleteItem':
        result = deleteItem(data);
        break;
      case 'editItem':
        result = editItem(data);
        break;
      case 'addUser':
        result = addUser(data);
        break;
      case 'updateUser':
        result = updateUser(data);
        break;
      case 'deleteUser':
        result = deleteUser(data);
        break;
      case 'freezeUser':
        result = freezeUser(data);
        break;
      case 'unfreezeUser':
        result = unfreezeUser(data);
        break;
    }
  } catch(err) {
    result = { success: false, message: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ====== HELPER FUNCTIONS ======
function getSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // Set headers based on sheet name
    const headers = {
      'credits': ['name', 'username', 'password', 'role', 'full_name', 'avatar'],
      'units': ['unit_id', 'unit_number', 'unit_name', 'created_at'],
      'lessons': ['lesson_id', 'unit_id', 'lesson_number', 'lesson_name', 'created_at'],
      'materials': ['material_id', 'lesson_id', 'title', 'type', 'content', 'order_index', 'created_at'],
      'quizzes': ['quiz_id', 'material_id', 'title', 'description', 'created_at'],
      'questions': ['question_id', 'quiz_id', 'type', 'question_text', 'options', 'correct_answer', 'points', 'order_index'],
      'student_progress': ['username', 'current_unit_id', 'current_lesson_id', 'completed_lessons', 'completed_materials', 'updated_at'],
      'quiz_attempts': ['attempt_id', 'username', 'quiz_id', 'material_id', 'answers', 'score', 'max_score', 'is_graded', 'graded_by', 'feedback', 'attempt_date']
    };
    if (headers[name]) sheet.getRange(1, 1, 1, headers[name].length).setValues([headers[name]]);
  }
  return sheet;
}

function generateId() {
  return Utilities.getUuid().substring(0, 8);
}

// ====== AUTH ======
function handleLogin(username, password) {
  const sheet = getSheet('credits');
  const data = sheet.getDataRange().getValues();
  const cleanUser = String(username != null ? username : '').trim().toLowerCase();
  const cleanPass = String(password != null ? password : '').trim();

  for (let i = 1; i < data.length; i++) {
    const rowUser = String(data[i][1] != null ? data[i][1] : '').trim().toLowerCase();
    const rowPass = String(data[i][2] != null ? data[i][2] : '').trim();

    if (rowUser === cleanUser && rowPass === cleanPass) {
      const userRole = String(data[i][3] || '').trim();
      const uName = String(data[i][1] || '').trim();

      // Check if user is marked as deleted
      if (userRole.toLowerCase() === 'deleted' || uName.startsWith('__deleted_')) {
        return { success: false, message: 'Invalid credentials' };
      }

      // Check if user is frozen (expired subscription / access)
      if (userRole.toLowerCase() === 'frozen' || userRole.toLowerCase().startsWith('frozen:')) {
        return { 
          success: false, 
          frozen: true, 
          message: 'انتهت صلاحية هذا الحساب. يرجى التواصل مع إدارة المنصة لتجديد الاشتراك.' 
        };
      }

      return { 
        success: true, 
        user: { 
          name: data[i][0], 
          username: data[i][1], 
          role: data[i][3],
          full_name: data[i][4] || '',
          avatar: data[i][5] || ''
        } 
      };
    }
  }
  return { success: false, message: 'Invalid credentials' };
}

// ====== USER MANAGEMENT ======
function addUser(data) {
  const sheet = getSheet('credits');
  const allData = sheet.getDataRange().getValues();
  // Check if username exists
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][1] === data.username) {
      return { success: false, message: 'Username already exists' };
    }
  }
  sheet.appendRow([
    data.name,
    data.username,
    data.password,
    data.role || 'student',
    data.full_name || '',
    data.avatar || ''
  ]);
  return { success: true };
}

function updateUser(data) {
  const sheet = getSheet('credits');
  const allData = sheet.getDataRange().getValues();
  // If changing username, check uniqueness
  if (data.new_username && data.new_username !== data.username) {
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][1] === data.new_username) {
        return { success: false, message: 'Username already exists' };
      }
    }
  }
  
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][1] === data.username) {
      if (data.new_username) sheet.getRange(i + 1, 2).setValue(data.new_username);
      if (data.password) sheet.getRange(i + 1, 3).setValue(data.password);
      if (data.name) sheet.getRange(i + 1, 1).setValue(data.name);
      if (data.role) sheet.getRange(i + 1, 4).setValue(data.role);
      if (data.full_name !== undefined) sheet.getRange(i + 1, 5).setValue(data.full_name);
      if (data.avatar !== undefined) sheet.getRange(i + 1, 6).setValue(data.avatar);

      // If username changed, cascade update to student_progress & quiz_attempts
      if (data.new_username && data.new_username !== data.username) {
        try {
          const progSheet = getSheet('student_progress');
          const progData = progSheet.getDataRange().getValues();
          for (let p = 1; p < progData.length; p++) {
            if (String(progData[p][0]) === String(data.username)) {
              progSheet.getRange(p + 1, 1).setValue(data.new_username);
            }
          }
        } catch(e) {}
        try {
          const attSheet = getSheet('quiz_attempts');
          const attData = attSheet.getDataRange().getValues();
          for (let a = 1; a < attData.length; a++) {
            if (String(attData[a][1]) === String(data.username)) {
              attSheet.getRange(a + 1, 2).setValue(data.new_username);
            }
          }
        } catch(e) {}
      }

      return { success: true, new_username: data.new_username || data.username };
    }
  }
  return { success: false, message: 'User not found' };
}

function freezeUser(data) {
  const sheet = getSheet('credits');
  const allData = sheet.getDataRange().getValues();
  const targetUsername = String(data.username || data.id || '').trim().toLowerCase();
  if (!targetUsername) return { success: false, message: 'Username is required' };

  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][1]).trim().toLowerCase() === targetUsername) {
      const currentRole = String(allData[i][3] || 'student');
      const originalRole = currentRole.startsWith('frozen:') ? currentRole.replace('frozen:', '') : (currentRole === 'frozen' ? 'student' : currentRole);
      sheet.getRange(i + 1, 4).setValue('frozen:' + (data.originalRole || originalRole));
      return { success: true, message: 'Account frozen successfully' };
    }
  }
  return { success: false, message: 'User not found' };
}

function unfreezeUser(data) {
  const sheet = getSheet('credits');
  const allData = sheet.getDataRange().getValues();
  const targetUsername = String(data.username || data.id || '').trim().toLowerCase();
  if (!targetUsername) return { success: false, message: 'Username is required' };

  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][1]).trim().toLowerCase() === targetUsername) {
      const currentRole = String(allData[i][3] || '');
      let restoreRole = data.role;
      if (!restoreRole) {
        restoreRole = currentRole.startsWith('frozen:') ? currentRole.replace('frozen:', '') : 'student';
      }
      sheet.getRange(i + 1, 4).setValue(restoreRole || 'student');
      return { success: true, message: 'Account unfrozen successfully' };
    }
  }
  return { success: false, message: 'User not found' };
}

function deleteUser(data) {
  const sheet = getSheet('credits');
  const allData = sheet.getDataRange().getValues();
  const targetUsername = String(data.username || data.id || '').trim().toLowerCase();
  if (!targetUsername) return { success: false, message: 'Username is required' };

  for (let i = allData.length - 1; i > 0; i--) {
    if (String(allData[i][1]).trim().toLowerCase() === targetUsername) {
      sheet.deleteRow(i + 1);
      return { success: true, message: 'User deleted successfully' };
    }
  }
  return { success: false, message: 'User not found' };
}

function getAllUsers() {
  const sheet = getSheet('credits');
  const data = sheet.getDataRange().getValues();
  const users = [];
  for (let i = 1; i < data.length; i++) {
    const rawRole = String(data[i][3] || '');
    const uName = String(data[i][1] || '');

    // Skip deleted users
    if (rawRole.toLowerCase() === 'deleted' || uName.startsWith('__deleted_')) {
      continue;
    }

    const isFrozen = rawRole.toLowerCase().startsWith('frozen:') || rawRole.toLowerCase() === 'frozen';
    const originalRole = isFrozen ? (rawRole.replace(/^frozen:?/i, '') || 'student') : rawRole;

    users.push({ 
      name: data[i][0], 
      username: data[i][1], 
      role: originalRole,
      status: isFrozen ? 'frozen' : 'active',
      is_frozen: isFrozen,
      originalRole: originalRole,
      full_name: data[i][4] || '',
      avatar: data[i][5] || ''
    });
  }
  return { success: true, users };
}

// ====== UNITS ======
function getUnits() {
  const sheet = getSheet('units');
  const data = sheet.getDataRange().getValues();
  const units = [];
  for (let i = 1; i < data.length; i++) {
    units.push({ unit_id: data[i][0], unit_number: data[i][1], unit_name: data[i][2], created_at: data[i][3] });
  }
  return { success: true, units: units.sort((a,b) => a.unit_number - b.unit_number) };
}

function addUnit(data) {
  const sheet = getSheet('units');
  const id = generateId();
  sheet.appendRow([id, data.unit_number, data.unit_name, new Date().toISOString()]);
  return { success: true, unit_id: id };
}

// ====== LESSONS ======
function getLessons(unitId) {
  const sheet = getSheet('lessons');
  const data = sheet.getDataRange().getValues();
  const lessons = [];
  for (let i = 1; i < data.length; i++) {
    // If unitId is passed as undefined/null or empty string, match accordingly.
    // E.g., for standalone lessons, unitId will be '' and it should match data[i][1] === ''
    if ((data[i][1] || '') === (unitId || '')) {
      lessons.push({ lesson_id: data[i][0], unit_id: data[i][1], lesson_number: data[i][2], lesson_name: data[i][3] });
    }
  }
  return { success: true, lessons: lessons.sort((a,b) => a.lesson_number - b.lesson_number) };
}

function addLesson(data) {
  const sheet = getSheet('lessons');
  const id = generateId();
  sheet.appendRow([id, data.unit_id || '', data.lesson_number, data.lesson_name, new Date().toISOString()]);
  return { success: true, lesson_id: id };
}

// ====== MATERIALS ======
function getMaterials(lessonId) {
  const sheet = getSheet('materials');
  const data = sheet.getDataRange().getValues();
  const materials = [];
  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || '') === (lessonId || '')) {
      materials.push({ 
        material_id: data[i][0], 
        lesson_id: data[i][1], 
        title: data[i][2], 
        type: data[i][3], 
        content: data[i][4], 
        order_index: parseInt(data[i][5]) || 0 
      });
    }
  }
  return { success: true, materials: materials.sort((a,b) => a.order_index - b.order_index) };
}

function getAllMaterials() {
  const sheet = getSheet('materials');
  const data = sheet.getDataRange().getValues();
  const materials = [];
  for (let i = 1; i < data.length; i++) {
    materials.push({ 
      material_id: data[i][0], 
      lesson_id: data[i][1], 
      title: data[i][2], 
      type: data[i][3], 
      content: data[i][4], 
      order_index: parseInt(data[i][5]) || 0,
      created_at: data[i][6]
    });
  }
  return { success: true, materials };
}

function addMaterial(data) {
  const sheet = getSheet('materials');
  const id = generateId();
  const order = sheet.getLastRow();
  sheet.appendRow([id, data.lesson_id, data.title, data.type, data.content || '', order, new Date().toISOString()]);

  // FIX: Auto-create a quiz record when material type is 'quiz'
  // This ensures getQuizzes(materialId) always finds a record for quiz materials.
  let quizId = null;
  if (data.type === 'quiz') {
    const quizSheet = getSheet('quizzes');
    quizId = generateId();
    quizSheet.appendRow([quizId, id, data.title, '', new Date().toISOString()]);
  }

  return { success: true, material_id: id, quiz_id: quizId };
}

function updateMaterialOrder(data) {
  const sheet = getSheet('materials');
  const allData = sheet.getDataRange().getValues();
  data.materials.forEach(item => {
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][0] === item.material_id) {
        sheet.getRange(i + 1, 6).setValue(item.order_index);
        if (item.lesson_id) sheet.getRange(i + 1, 2).setValue(item.lesson_id);
        break;
      }
    }
  });
  return { success: true };
}

// ====== QUIZZES ======
function getQuizzes(materialId) {
  const sheet = getSheet('quizzes');
  const data = sheet.getDataRange().getValues();
  const quizzes = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === materialId) {
      quizzes.push({ quiz_id: data[i][0], material_id: data[i][1], title: data[i][2], description: data[i][3] });
    }
  }
  return { success: true, quizzes };
}

function addQuiz(data) {
  const sheet = getSheet('quizzes');
  const id = generateId();
  sheet.appendRow([id, data.material_id, data.title, data.description || '', new Date().toISOString()]);
  return { success: true, quiz_id: id };
}

// ====== QUESTIONS ======
function getQuestions(quizId) {
  const sheet = getSheet('questions');
  const data = sheet.getDataRange().getValues();
  const questions = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === quizId) {
      questions.push({
        question_id: data[i][0],
        quiz_id: data[i][1],
        type: data[i][2],
        question_text: data[i][3],
        options: data[i][4] ? JSON.parse(data[i][4]) : null,
        correct_answer: data[i][5] !== "" ? JSON.parse(data[i][5]) : null,
        points: parseInt(data[i][6]) || 1,
        order_index: parseInt(data[i][7]) || 0,
        explanation: data[i][8] || ''
      });
    }
  }
  return { success: true, questions: questions.sort((a,b) => a.order_index - b.order_index) };
}

function addQuestion(data) {
  const sheet = getSheet('questions');
  const id = generateId();
  sheet.appendRow([
    id, 
    data.quiz_id, 
    data.type, 
    data.question_text, 
    JSON.stringify(data.options || null), 
    JSON.stringify(data.correct_answer ?? null), 
    data.points || 1, 
    data.order_index || 0,
    data.explanation || ''
  ]);
  return { success: true, question_id: id };
}

// ====== IMPORT QUIZ ======
function importQuiz(data) {
  let quizId = data.quiz_id;
  
  if (!quizId) {
    const quizSheet = getSheet('quizzes');
    quizId = generateId();
    quizSheet.appendRow([quizId, data.material_id, data.title, data.description || '', new Date().toISOString()]);
  }

  const qSheet = getSheet('questions');
  data.questions.forEach((q, idx) => {
    const qId = generateId();
    qSheet.appendRow([
      qId,
      quizId,
      q.type,
      q.question_text,
      JSON.stringify(q.options || null),
      JSON.stringify(q.correct_answer ?? null),
      q.points || 1,
      idx,
      q.explanation || ''
    ]);
  });

  return { success: true, quiz_id: quizId, question_count: data.questions.length };
}

// ====== EDIT & DELETE (CRUD) ======
function deleteRowsByCol(sheetName, idColIndex, parentIdColIndex, parentId) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  const deletedIds = [];
  const targetParent = String(parentId != null ? parentId : '');
  // Delete from bottom to top to avoid shifting indices
  for (let i = data.length - 1; i > 0; i--) {
    if (String(data[i][parentIdColIndex] != null ? data[i][parentIdColIndex] : '') === targetParent) {
      deletedIds.push(data[i][idColIndex]);
      sheet.deleteRow(i + 1);
    }
  }
  return deletedIds;
}

function deleteItem(data) {
  const type = data.itemType; // 'unit', 'lesson', 'material', 'quiz', 'question'
  const id = String(data.id != null ? data.id : '');

  if (type === 'unit') {
    deleteRowsByCol('units', 0, 0, id); // delete unit itself
    const lessonIds = deleteRowsByCol('lessons', 0, 1, id); // unit_id is col 1
    lessonIds.forEach(lId => {
      const materialIds = deleteRowsByCol('materials', 0, 1, lId); // lesson_id is col 1
      materialIds.forEach(mId => {
        const quizIds = deleteRowsByCol('quizzes', 0, 1, mId); // material_id is col 1
        quizIds.forEach(qId => deleteRowsByCol('questions', 0, 1, qId)); // quiz_id is col 1
      });
    });
    // Also delete materials that were directly inside the unit
    const directMaterialIds = deleteRowsByCol('materials', 0, 1, `unit_${id}`);
    directMaterialIds.forEach(mId => {
      const quizIds = deleteRowsByCol('quizzes', 0, 1, mId);
      quizIds.forEach(qId => deleteRowsByCol('questions', 0, 1, qId));
    });
  } else if (type === 'lesson') {
    deleteRowsByCol('lessons', 0, 0, id);
    const materialIds = deleteRowsByCol('materials', 0, 1, id);
    materialIds.forEach(mId => {
      const quizIds = deleteRowsByCol('quizzes', 0, 1, mId);
      quizIds.forEach(qId => deleteRowsByCol('questions', 0, 1, qId));
    });
  } else if (type === 'material') {
    deleteRowsByCol('materials', 0, 0, id);
    const quizIds = deleteRowsByCol('quizzes', 0, 1, id);
    quizIds.forEach(qId => deleteRowsByCol('questions', 0, 1, qId));
  } else if (type === 'quiz') {
    deleteRowsByCol('quizzes', 0, 0, id);
    deleteRowsByCol('questions', 0, 1, id);
  } else if (type === 'question') {
    deleteRowsByCol('questions', 0, 0, id);
  } else if (type === 'user') {
    deleteRowsByCol('credits', 1, 1, id); // username is col 1
  }

  return { success: true };
}

function editItem(data) {
  const type = data.itemType;
  const id = String(data.id != null ? data.id : '');
  const updates = data.updates; // object: { colIndex: newValue }

  let sheetName = '';
  if (type === 'unit') sheetName = 'units';
  if (type === 'lesson') sheetName = 'lessons';
  if (type === 'material') sheetName = 'materials';
  if (type === 'question') sheetName = 'questions';

  if (!sheetName) return { success: false, message: 'Invalid type' };

  const sheet = getSheet(sheetName);
  const sheetData = sheet.getDataRange().getValues();
  for (let i = 1; i < sheetData.length; i++) {
    if (String(sheetData[i][0] != null ? sheetData[i][0] : '') === id) {
      for (const [col, val] of Object.entries(updates)) {
        sheet.getRange(i + 1, parseInt(col) + 1).setValue(val);
      }
      return { success: true };
    }
  }
  return { success: false, message: 'Item not found' };
}

// ====== STUDENT PROGRESS ======
function getStudentProgress(username) {
  const sheet = getSheet('student_progress');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      return { 
        success: true, 
        progress: {
          username: data[i][0],
          current_unit_id: data[i][1],
          current_lesson_id: data[i][2],
          completed_lessons: data[i][3] ? JSON.parse(data[i][3]) : [],
          completed_materials: data[i][4] ? JSON.parse(data[i][4]) : [],
          updated_at: data[i][5]
        }
      };
    }
  }
  return { success: true, progress: null };
}

function updateStudentProgress(data) {
  const sheet = getSheet('student_progress');
  const allData = sheet.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === data.username) {
      sheet.getRange(i + 1, 2).setValue(data.current_unit_id || '');
      sheet.getRange(i + 1, 3).setValue(data.current_lesson_id || '');
      sheet.getRange(i + 1, 4).setValue(JSON.stringify(data.completed_lessons || []));
      sheet.getRange(i + 1, 5).setValue(JSON.stringify(data.completed_materials || []));
      sheet.getRange(i + 1, 6).setValue(new Date().toISOString());
      found = true;
      break;
    }
  }
  if (!found) {
    sheet.appendRow([
      data.username,
      data.current_unit_id || '',
      data.current_lesson_id || '',
      JSON.stringify(data.completed_lessons || []),
      JSON.stringify(data.completed_materials || []),
      new Date().toISOString()
    ]);
  }
  return { success: true };
}

// ====== QUIZ ATTEMPTS ======
function submitQuiz(data) {
  const sheet = getSheet('quiz_attempts');
  const id = generateId();
  const isGraded = !data.answers.some(a => a.type === 'essay');

  sheet.appendRow([
    id,
    data.username,
    data.quiz_id,
    data.material_id,
    JSON.stringify(data.answers),
    data.score,
    data.max_score,
    isGraded,
    '',
    '',
    new Date().toISOString()
  ]);

  return { success: true, attempt_id: id, needs_grading: !isGraded };
}

function getQuizAttempts(username, quizId) {
  const sheet = getSheet('quiz_attempts');
  const data = sheet.getDataRange().getValues();
  const attempts = [];
  for (let i = 1; i < data.length; i++) {
    const matchUser = !username || data[i][1] === username;
    const matchQuiz = !quizId || data[i][2] === quizId;
    if (matchUser && matchQuiz) {
      attempts.push({
        attempt_id: data[i][0],
        username: data[i][1],
        quiz_id: data[i][2],
        material_id: data[i][3],
        answers: data[i][4] ? JSON.parse(data[i][4]) : [],
        score: parseFloat(data[i][5]) || 0,
        max_score: parseFloat(data[i][6]) || 0,
        is_graded: data[i][7] === true || data[i][7] === 'TRUE',
        graded_by: data[i][8],
        feedback: data[i][9],
        attempt_date: data[i][10]
      });
    }
  }
  return { success: true, attempts: attempts.reverse() }; // newest first
}

function gradeEssay(data) {
  const sheet = getSheet('quiz_attempts');
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === data.attempt_id) {
      sheet.getRange(i + 1, 6).setValue(data.score);
      sheet.getRange(i + 1, 8).setValue(true);
      sheet.getRange(i + 1, 9).setValue(data.graded_by);
      sheet.getRange(i + 1, 10).setValue(data.feedback || '');
      return { success: true };
    }
  }
  return { success: false, message: 'Attempt not found' };
}

// ====== STUDENTS (ADMIN) ======
function getAllStudents() {
  const sheet = getSheet('credits');
  const data = sheet.getDataRange().getValues();
  const students = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === 'student') {
      students.push({ name: data[i][0], username: data[i][1], role: data[i][3] });
    }
  }
  return { success: true, students };
}

function getStudentDetails(username) {
  const progress = getStudentProgress(username);
  const attempts = getQuizAttempts(username, null);
  return { 
    success: true, 
    username,
    progress: progress.progress,
    attempts: attempts.attempts
  };
}
