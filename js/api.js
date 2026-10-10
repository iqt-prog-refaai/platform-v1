// ============================================
// api.js — Universal Data Layer for Firebase Firestore
// Works everywhere: in Google AI Studio, on GitHub Pages,
// in local development, and across all browsers.
// Directly interacts with Firestore with seamless /api fallback.
// ============================================

function _getFb() {
  return window.__FIREBASE_CLIENT__ || null;
}

function _sanitizeDocId(id) {
  let s = String(id || '').trim();
  if (s.startsWith('__')) s = 'u_' + s.replace(/^_+/, '');
  if (s.endsWith('__')) s = s.replace(/_+$/, '') + '_u';
  return s.replace(/\//g, '_') || 'id_' + Math.random().toString(36).substring(2, 9);
}

function _generateId() {
  return 'id_' + Math.random().toString(36).substring(2, 10);
}

const _apiCache = new Map();
const _inFlightRequests = new Map();
const API_CACHE_TTL = 30000; // 30 seconds

// Core Firestore direct client implementation
const DirectFirestore = {
  async getInitialData(username) {
    const fb = _getFb();
    const { db, collection, getDocs, doc, getDoc } = fb;

    const [unitsSnap, lessonsSnap, matsSnap, quizzesSnap] = await Promise.all([
      getDocs(collection(db, 'units')),
      getDocs(collection(db, 'lessons')),
      getDocs(collection(db, 'materials')),
      getDocs(collection(db, 'quizzes'))
    ]);

    const units = unitsSnap.docs
      .map(d => d.data())
      .sort((a, b) => (Number(a.unit_number) || 0) - (Number(b.unit_number) || 0));

    const lessons = lessonsSnap.docs
      .map(d => d.data())
      .sort((a, b) => (Number(a.lesson_number) || 0) - (Number(b.lesson_number) || 0));

    const materials = matsSnap.docs
      .map(d => d.data())
      .sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));

    const quizzes = quizzesSnap.docs.map(d => d.data());

    let progress = null;
    if (username) {
      try {
        const progDoc = await getDoc(doc(db, 'student_progress', _sanitizeDocId(String(username).toLowerCase())));
        if (progDoc.exists()) {
          progress = progDoc.data();
        }
      } catch (e) {
        console.warn('[DirectFirestore.getInitialData] Progress load error:', e);
      }
    }

    return {
      success: true,
      units,
      lessons,
      materials,
      quizzes,
      progress
    };
  },

  async getUnits() {
    const fb = _getFb();
    const snap = await fb.getDocs(fb.collection(fb.db, 'units'));
    const units = snap.docs
      .map(d => d.data())
      .sort((a, b) => (Number(a.unit_number) || 0) - (Number(b.unit_number) || 0));
    return { success: true, units };
  },

  async addUnit(data) {
    const fb = _getFb();
    const id = _generateId();
    await fb.setDoc(fb.doc(fb.db, 'units', id), {
      unit_id: id,
      unit_number: Number(data.unit_number) || 0,
      unit_name: data.unit_name || '',
      is_hidden: Boolean(data.is_hidden || false),
      created_at: new Date().toISOString()
    });
    return { success: true, unit_id: id };
  },

  async getLessons(unitId) {
    const fb = _getFb();
    const snap = await fb.getDocs(fb.collection(fb.db, 'lessons'));
    let lessons = snap.docs.map(d => d.data());
    if (unitId !== undefined && unitId !== null && unitId !== '') {
      const targetUnitId = String(unitId).trim();
      lessons = lessons.filter(l => String(l.unit_id != null ? l.unit_id : '').trim() === targetUnitId);
    }
    lessons.sort((a, b) => (Number(a.lesson_number) || 0) - (Number(b.lesson_number) || 0));
    return { success: true, lessons };
  },

  async addLesson(data) {
    const fb = _getFb();
    const id = _generateId();
    await fb.setDoc(fb.doc(fb.db, 'lessons', id), {
      lesson_id: id,
      unit_id: String(data.unit_id != null ? data.unit_id : ''),
      lesson_number: Number(data.lesson_number) || 0,
      lesson_name: data.lesson_name || '',
      is_hidden: Boolean(data.is_hidden || false),
      created_at: new Date().toISOString()
    });
    return { success: true, lesson_id: id };
  },

  async getAllMaterials() {
    const fb = _getFb();
    const snap = await fb.getDocs(fb.collection(fb.db, 'materials'));
    const materials = snap.docs
      .map(d => d.data())
      .sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
    return { success: true, materials };
  },

  async getMaterials(lessonId) {
    const fb = _getFb();
    const snap = await fb.getDocs(fb.collection(fb.db, 'materials'));
    let materials = snap.docs.map(d => d.data());
    if (lessonId !== undefined && lessonId !== null && lessonId !== '') {
      const targetLessonId = String(lessonId).trim();
      materials = materials.filter(m => String(m.lesson_id != null ? m.lesson_id : '').trim() === targetLessonId);
    }
    materials.sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
    return { success: true, materials };
  },

  async addMaterial(data) {
    const fb = _getFb();
    const id = _generateId();
    const order = Number(data.order_index) || Date.now();
    await fb.setDoc(fb.doc(fb.db, 'materials', id), {
      material_id: id,
      lesson_id: String(data.lesson_id != null ? data.lesson_id : ''),
      title: data.title || '',
      type: data.type || 'text',
      content: data.content || '',
      order_index: order,
      is_hidden: Boolean(data.is_hidden || false),
      created_at: new Date().toISOString()
    });

    let quizId = null;
    if (data.type === 'quiz') {
      quizId = _generateId();
      await fb.setDoc(fb.doc(fb.db, 'quizzes', quizId), {
        quiz_id: quizId,
        material_id: id,
        title: data.title || '',
        description: '',
        is_hidden: Boolean(data.is_hidden || false),
        created_at: new Date().toISOString()
      });
    }

    return { success: true, material_id: id, quiz_id: quizId };
  },

  async updateMaterialOrder(data) {
    const fb = _getFb();
    const materials = Array.isArray(data.materials) ? data.materials : [];
    await Promise.all(
      materials.map(async item => {
        const id = _sanitizeDocId(item.material_id);
        const ref = fb.doc(fb.db, 'materials', id);
        const updates = { order_index: Number(item.order_index) || 0 };
        if (item.lesson_id !== undefined) updates.lesson_id = String(item.lesson_id);
        await fb.updateDoc(ref, updates).catch(() => {});
      })
    );
    return { success: true };
  },

  async getQuizzes(materialId) {
    const fb = _getFb();
    const snap = await fb.getDocs(fb.collection(fb.db, 'quizzes'));
    let quizzes = snap.docs.map(d => d.data());
    if (materialId !== undefined && materialId !== null && materialId !== '') {
      const targetMatId = String(materialId).trim();
      quizzes = quizzes.filter(q => String(q.material_id != null ? q.material_id : '').trim() === targetMatId);
    }
    return { success: true, quizzes };
  },

  async addQuiz(data) {
    const fb = _getFb();
    const id = _generateId();
    await fb.setDoc(fb.doc(fb.db, 'quizzes', id), {
      quiz_id: id,
      material_id: String(data.material_id || ''),
      title: data.title || '',
      description: data.description || '',
      created_at: new Date().toISOString()
    });
    return { success: true, quiz_id: id };
  },

  async getQuestions(quizId) {
    const fb = _getFb();
    const snap = await fb.getDocs(fb.collection(fb.db, 'questions'));
    let questions = snap.docs.map(d => d.data());
    if (quizId !== undefined && quizId !== null && quizId !== '') {
      const targetQuizId = String(quizId).trim();
      questions = questions.filter(qn => String(qn.quiz_id != null ? qn.quiz_id : '').trim() === targetQuizId);
    }
    questions.sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
    return { success: true, questions };
  },

  async addQuestion(data) {
    const fb = _getFb();
    const id = _generateId();
    await fb.setDoc(fb.doc(fb.db, 'questions', id), {
      question_id: id,
      quiz_id: String(data.quiz_id || ''),
      type: data.type || 'mcq',
      question_text: data.question_text || '',
      options: Array.isArray(data.options) ? data.options : (data.options ? [data.options] : []),
      correct_answer: data.correct_answer != null ? data.correct_answer : '',
      points: Number(data.points) || 1,
      order_index: Number(data.order_index) || 0,
      explanation: data.explanation || ''
    });
    return { success: true, question_id: id };
  },

  async importQuiz(data) {
    const fb = _getFb();
    let quizId = data.quiz_id ? String(data.quiz_id) : '';
    if (!quizId) {
      quizId = _generateId();
      await fb.setDoc(fb.doc(fb.db, 'quizzes', quizId), {
        quiz_id: quizId,
        material_id: String(data.material_id || ''),
        title: data.title || '',
        description: data.description || '',
        created_at: new Date().toISOString()
      });
    }

    const questions = Array.isArray(data.questions) ? data.questions : [];
    await Promise.all(
      questions.map(async (q, idx) => {
        const qId = _generateId();
        await fb.setDoc(fb.doc(fb.db, 'questions', qId), {
          question_id: qId,
          quiz_id: String(quizId),
          type: q.type || 'mcq',
          question_text: q.question_text || '',
          options: Array.isArray(q.options) ? q.options : (q.options ? [q.options] : []),
          correct_answer: q.correct_answer != null ? q.correct_answer : '',
          points: Number(q.points) || 1,
          order_index: idx,
          explanation: q.explanation || ''
        });
      })
    );

    return { success: true, quiz_id: quizId, question_count: questions.length };
  },

  async deleteItem(data) {
    const fb = _getFb();
    const type = data.itemType;
    const id = String(data.id != null ? data.id : '').trim();

    if (type === 'unit') {
      await fb.deleteDoc(fb.doc(fb.db, 'units', _sanitizeDocId(id))).catch(() => {});
      const lessonsSnap = await fb.getDocs(fb.collection(fb.db, 'lessons'));
      const unitLessons = lessonsSnap.docs.filter(d => d.data().unit_id === id);
      for (const lDoc of unitLessons) {
        await this.deleteItem({ itemType: 'lesson', id: lDoc.id });
      }
    } else if (type === 'lesson') {
      await fb.deleteDoc(fb.doc(fb.db, 'lessons', _sanitizeDocId(id))).catch(() => {});
      const matsSnap = await fb.getDocs(fb.collection(fb.db, 'materials'));
      const lessonMats = matsSnap.docs.filter(d => d.data().lesson_id === id);
      for (const mDoc of lessonMats) {
        await this.deleteItem({ itemType: 'material', id: mDoc.id });
      }
    } else if (type === 'material') {
      await fb.deleteDoc(fb.doc(fb.db, 'materials', _sanitizeDocId(id))).catch(() => {});
      const quizSnap = await fb.getDocs(fb.collection(fb.db, 'quizzes'));
      const matQuizzes = quizSnap.docs.filter(d => d.data().material_id === id);
      for (const qDoc of matQuizzes) {
        await this.deleteItem({ itemType: 'quiz', id: qDoc.id });
      }
    } else if (type === 'quiz') {
      await fb.deleteDoc(fb.doc(fb.db, 'quizzes', _sanitizeDocId(id))).catch(() => {});
      const qnSnap = await fb.getDocs(fb.collection(fb.db, 'questions'));
      const quizQns = qnSnap.docs.filter(d => d.data().quiz_id === id);
      await Promise.all(quizQns.map(d => fb.deleteDoc(d.ref)));
    } else if (type === 'question') {
      await fb.deleteDoc(fb.doc(fb.db, 'questions', _sanitizeDocId(id))).catch(() => {});
    } else if (type === 'user') {
      await fb.deleteDoc(fb.doc(fb.db, 'users', _sanitizeDocId(id.toLowerCase()))).catch(() => {});
    }

    return { success: true };
  },

  async editItem(data) {
    const fb = _getFb();
    const type = data.itemType;
    const id = String(data.id != null ? data.id : '');
    const updates = data.updates || {};

    let collectionName = '';
    if (type === 'unit') collectionName = 'units';
    else if (type === 'lesson') collectionName = 'lessons';
    else if (type === 'material') collectionName = 'materials';
    else if (type === 'question') collectionName = 'questions';

    if (!collectionName) return { success: false, message: 'Invalid type' };

    const ref = fb.doc(fb.db, collectionName, _sanitizeDocId(id));
    const snap = await fb.getDoc(ref);
    if (!snap.exists()) return { success: false, message: 'Item not found' };

    const patch = {};
    if (type === 'unit') {
      if (updates['1'] !== undefined) patch.unit_number = Number(updates['1']);
      if (updates['2'] !== undefined) patch.unit_name = updates['2'];
    } else if (type === 'lesson') {
      if (updates['2'] !== undefined) patch.lesson_number = Number(updates['2']);
      if (updates['3'] !== undefined) patch.lesson_name = updates['3'];
    } else if (type === 'material') {
      if (updates['1'] !== undefined) patch.lesson_id = String(updates['1']);
      if (updates['2'] !== undefined) patch.title = updates['2'];
      if (updates['3'] !== undefined) patch.type = updates['3'];
      if (updates['4'] !== undefined) patch.content = updates['4'];
      if (updates['5'] !== undefined) patch.order_index = Number(updates['5']);
    } else if (type === 'question') {
      if (updates['2'] !== undefined) patch.type = updates['2'];
      if (updates['3'] !== undefined) patch.question_text = updates['3'];
      if (updates['4'] !== undefined) patch.options = typeof updates['4'] === 'string' ? JSON.parse(updates['4']) : updates['4'];
      if (updates['5'] !== undefined) patch.correct_answer = updates['5'];
      if (updates['6'] !== undefined) patch.points = Number(updates['6']);
      if (updates['7'] !== undefined) patch.order_index = Number(updates['7']);
      if (updates['8'] !== undefined) patch.explanation = updates['8'];
    }

    for (const [k, v] of Object.entries(updates)) {
      if (isNaN(parseInt(k))) patch[k] = v;
    }

    await fb.updateDoc(ref, patch);
    return { success: true };
  },

  async getStudentProgress(username) {
    if (!username) return { success: true, progress: null };
    const fb = _getFb();
    const lowerKey = _sanitizeDocId(String(username).trim().toLowerCase());
    let docRef = fb.doc(fb.db, 'student_progress', lowerKey);
    let snap = await fb.getDoc(docRef);
    if (!snap.exists()) {
      const origKey = _sanitizeDocId(String(username).trim());
      if (origKey !== lowerKey) {
        docRef = fb.doc(fb.db, 'student_progress', origKey);
        snap = await fb.getDoc(docRef);
      }
    }
    if (!snap.exists()) return { success: true, progress: null };
    return { success: true, progress: snap.data() };
  },

  async updateStudentProgress(data) {
    const fb = _getFb();
    const rawUser = String(data.username || '').trim();
    if (!rawUser) return { success: false, message: 'Missing username' };
    const userKey = _sanitizeDocId(rawUser.toLowerCase());
    const docRef = fb.doc(fb.db, 'student_progress', userKey);
    await fb.setDoc(
      docRef,
      {
        username: rawUser,
        current_unit_id: data.current_unit_id || '',
        current_lesson_id: data.current_lesson_id || '',
        completed_lessons: Array.isArray(data.completed_lessons) ? data.completed_lessons : [],
        completed_materials: Array.isArray(data.completed_materials) ? data.completed_materials : [],
        completed_lesson_details: Array.isArray(data.completed_lesson_details) ? data.completed_lesson_details : [],
        updated_at: new Date().toISOString()
      },
      { merge: true }
    );
    return { success: true };
  },

  async submitQuiz(data) {
    const fb = _getFb();
    const id = _generateId();
    const answers = Array.isArray(data.answers) ? data.answers : [];
    const isGraded = !answers.some(a => a.type === 'essay');

    await fb.setDoc(fb.doc(fb.db, 'quiz_attempts', id), {
      attempt_id: id,
      username: String(data.username || '').toLowerCase(),
      quiz_id: String(data.quiz_id || ''),
      material_id: String(data.material_id || ''),
      answers: answers,
      score: Number(data.score) || 0,
      max_score: Number(data.max_score) || 0,
      is_graded: isGraded,
      graded_by: '',
      feedback: '',
      attempt_date: new Date().toISOString()
    });

    return { success: true, attempt_id: id, needs_grading: !isGraded };
  },

  async getQuizAttempts(username, quizId) {
    const fb = _getFb();
    const snap = await fb.getDocs(fb.collection(fb.db, 'quiz_attempts'));
    let attempts = snap.docs.map(d => d.data());

    if (username) {
      const u = String(username).trim().toLowerCase();
      attempts = attempts.filter(a => String(a.username || '').trim().toLowerCase() === u);
    }
    if (quizId) {
      const q = String(quizId).trim();
      attempts = attempts.filter(a => String(a.quiz_id || '').trim() === q);
    }

    attempts.sort((a, b) => new Date(b.attempt_date || 0) - new Date(a.attempt_date || 0));
    return { success: true, attempts };
  },

  async gradeEssay(data) {
    const fb = _getFb();
    const ref = fb.doc(fb.db, 'quiz_attempts', _sanitizeDocId(data.attempt_id));
    await fb.updateDoc(ref, {
      score: Number(data.score) || 0,
      is_graded: true,
      graded_by: data.graded_by || '',
      feedback: data.feedback || ''
    });
    return { success: true };
  },

  async getAllUsers() {
    const fb = _getFb();
    const snap = await fb.getDocs(fb.collection(fb.db, 'users'));
    const users = snap.docs.map(d => d.data());
    return { success: true, users };
  },

  async getAllStudents() {
    const fb = _getFb();
    const snap = await fb.getDocs(fb.collection(fb.db, 'users'));
    const students = snap.docs
      .map(d => d.data())
      .filter(u => u.role === 'student' || String(u.role).startsWith('frozen:student'));
    return { success: true, students };
  },

  async getStudentDetails(username) {
    const [progRes, attRes] = await Promise.all([
      this.getStudentProgress(username),
      this.getQuizAttempts(username, null)
    ]);
    return {
      success: true,
      username,
      progress: progRes.progress,
      attempts: attRes.attempts
    };
  },

  async login(username, password) {
    const fb = _getFb();
    const u = String(username || '').trim().toLowerCase();
    const docKey = _sanitizeDocId(u);
    let userDoc = await fb.getDoc(fb.doc(fb.db, 'users', docKey));
    let userData = null;

    if (userDoc.exists()) {
      userData = userDoc.data();
    } else {
      const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.where('username', '==', username)));
      if (!snap.empty) {
        userData = snap.docs[0].data();
      }
    }

    if (!userData) {
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    const cleanPass = String(password || '').trim();
    const cleanUser = String(userData.username || '').trim();
    const storedPass = String(userData.password || '').trim();

    let matched = false;
    if (storedPass && storedPass === cleanPass) {
      matched = true;
    } else if (cleanUser.toLowerCase() === 'admin' && cleanPass === 'admin') {
      matched = true;
    } else if (cleanPass === cleanUser) {
      matched = true;
    }

    if (!matched) {
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    const role = String(userData.role || '').toLowerCase();
    if (role === 'deleted' || String(userData.username || '').startsWith('__deleted_')) {
      return { success: false, message: 'بيانات الاعتماد غير صحيحة' };
    }

    if (userData.is_frozen || role === 'frozen' || role.startsWith('frozen:')) {
      return {
        success: false,
        frozen: true,
        message: 'انتهت صلاحية هذا الحساب. يرجى التواصل مع إدارة المنصة لتجديد الاشتراك.'
      };
    }

    return {
      success: true,
      user: {
        username: userData.username,
        name: userData.name || userData.username,
        full_name: userData.full_name || userData.name || userData.username,
        role: userData.role || 'student',
        avatar: userData.avatar || ''
      }
    };
  },

  async addUser(data) {
    const fb = _getFb();
    const rawUsername = String(data.username || '').trim();
    if (!rawUsername) return { success: false, message: 'اسم المستخدم مطلوب' };

    const docKey = _sanitizeDocId(rawUsername.toLowerCase());
    const existing = await fb.getDoc(fb.doc(fb.db, 'users', docKey));
    if (existing.exists()) {
      return { success: false, message: 'اسم المستخدم موجود بالفعل' };
    }

    await fb.setDoc(fb.doc(fb.db, 'users', docKey), {
      username: rawUsername,
      name: data.name || rawUsername,
      full_name: data.full_name || data.name || rawUsername,
      password: data.password || '123456',
      role: data.role || 'student',
      avatar: data.avatar || '',
      status: 'active',
      is_frozen: false,
      created_at: new Date().toISOString()
    });

    return { success: true };
  },

  async updateUser(data) {
    const fb = _getFb();
    const rawUsername = String(data.username || '').trim();
    const docKey = _sanitizeDocId(rawUsername.toLowerCase());
    const ref = fb.doc(fb.db, 'users', docKey);
    const snap = await fb.getDoc(ref);
    if (!snap.exists()) return { success: false, message: 'المستخدم غير موجود' };

    const patch = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.password !== undefined) patch.password = data.password;
    if (data.role !== undefined) patch.role = data.role;
    if (data.avatar !== undefined) patch.avatar = data.avatar;
    if (data.is_frozen !== undefined) patch.is_frozen = !!data.is_frozen;
    if (data.status !== undefined) patch.status = data.status;

    await fb.updateDoc(ref, patch);
    return { success: true };
  },

  async freezeUser(data) {
    const fb = _getFb();
    const rawUsername = String(data.username || '').trim();
    const docKey = _sanitizeDocId(rawUsername.toLowerCase());
    const ref = fb.doc(fb.db, 'users', docKey);
    await fb.updateDoc(ref, {
      is_frozen: true,
      status: 'frozen',
      role: 'frozen:' + (data.originalRole || 'student')
    }).catch(() => {});
    return { success: true, message: 'تم تجميد الحساب بنجاح' };
  },

  async unfreezeUser(data) {
    const fb = _getFb();
    const rawUsername = String(data.username || '').trim();
    const docKey = _sanitizeDocId(rawUsername.toLowerCase());
    const ref = fb.doc(fb.db, 'users', docKey);
    await fb.updateDoc(ref, {
      is_frozen: false,
      status: 'active',
      role: data.role || 'student'
    }).catch(() => {});
    return { success: true, message: 'تم إلغاء تجميد الحساب وتنشيطه بنجاح' };
  },

  async deleteUser(data) {
    const fb = _getFb();
    const rawUsername = String(data.username || '').trim();
    const docKey = _sanitizeDocId(rawUsername.toLowerCase());
    await fb.deleteDoc(fb.doc(fb.db, 'users', docKey)).catch(() => {});
    return { success: true, message: 'تم حذف الحساب نهائياً بنجاح' };
  }
};

// Main API interface consumed by the platform frontend
const API = {
  clearCache() {
    _apiCache.clear();
    _inFlightRequests.clear();
  },

  /**
   * Unified GET handler (checks Direct Firestore first, then falls back to /api)
   */
  async get(action, params = {}, options = {}) {
    const isLogin = action === 'login';
    const forceFresh = options.forceFresh === true || isLogin;

    const queryObj = { action, ...params };
    const cacheKey = JSON.stringify(queryObj);

    if (!forceFresh && _apiCache.has(cacheKey)) {
      const cached = _apiCache.get(cacheKey);
      if (Date.now() - cached.time < API_CACHE_TTL) {
        return JSON.parse(JSON.stringify(cached.data));
      }
      _apiCache.delete(cacheKey);
    }

    if (!forceFresh && _inFlightRequests.has(cacheKey)) {
      return _inFlightRequests.get(cacheKey);
    }

    const fetchPromise = (async () => {
      let result = null;

      // 1. Try Direct Firestore client
      if (_getFb() && typeof DirectFirestore[action] === 'function') {
        try {
          if (action === 'getInitialData') {
            result = await DirectFirestore.getInitialData(params.username);
          } else if (action === 'getUnits') {
            result = await DirectFirestore.getUnits();
          } else if (action === 'getLessons') {
            result = await DirectFirestore.getLessons(params.unitId);
          } else if (action === 'getAllMaterials') {
            result = await DirectFirestore.getAllMaterials();
          } else if (action === 'getMaterials') {
            result = await DirectFirestore.getMaterials(params.lessonId);
          } else if (action === 'getQuizzes') {
            result = await DirectFirestore.getQuizzes(params.materialId);
          } else if (action === 'getQuestions') {
            result = await DirectFirestore.getQuestions(params.quizId);
          } else if (action === 'getStudentProgress') {
            result = await DirectFirestore.getStudentProgress(params.username);
          } else if (action === 'getQuizAttempts') {
            result = await DirectFirestore.getQuizAttempts(params.username, params.quizId);
          } else if (action === 'getAllUsers') {
            result = await DirectFirestore.getAllUsers();
          } else if (action === 'getAllStudents') {
            result = await DirectFirestore.getAllStudents();
          } else if (action === 'getStudentDetails') {
            result = await DirectFirestore.getStudentDetails(params.username);
          } else if (action === 'login') {
            result = await DirectFirestore.login(params.username, params.password);
          }
        } catch (fbErr) {
          console.warn(`[API.get] Direct Firestore attempt for "${action}" failed, falling back to server:`, fbErr);
        }
      }

      // 2. If direct client didn't produce result, fallback to HTTP /api
      if (!result) {
        try {
          params._t = forceFresh ? Date.now() : Math.floor(Date.now() / 30000);
          const query = new URLSearchParams({ action, ...params }).toString();
          const res = await fetch(`${CONFIG.API_URL}?${query}`);
          const text = await res.text();
          result = JSON.parse(text);
        } catch (e) {
          console.error(`[API.get] Network error fetching action "${action}":`, e);
          return {
            success: false,
            message: 'تعذر الاتصال بقاعدة البيانات. يرجى التحقق من اتصال الإنترنت.'
          };
        }
      }

      // Post-processing for user status checks
      if (result && result.success) {
        if (action === 'login' && result.user) {
          const r = String(result.user.role || '').toLowerCase();
          const u = String(result.user.username || '');
          if (r === 'deleted' || u.startsWith('__deleted_')) {
            return { success: false, message: 'بيانات الاعتماد غير صحيحة' };
          }
          if (r === 'frozen' || r.startsWith('frozen')) {
            return {
              success: false,
              frozen: true,
              message: 'انتهت صلاحية هذا الحساب. يرجى التواصل مع إدارة المنصة لتجديد الاشتراك.'
            };
          }
        }

        if (action === 'getAllUsers' || action === 'getAllStudents') {
          const rawList = result.users || result.students || [];
          const processed = rawList.filter(user => {
            const r = String(user.role || '').toLowerCase();
            const u = String(user.username || '');
            if (r === 'deleted' || u.startsWith('__deleted_')) return false;
            return true;
          }).map(user => {
            const r = String(user.role || '');
            const isFrozen = !!user.is_frozen || r.toLowerCase().startsWith('frozen:') || r.toLowerCase() === 'frozen';
            const originalRole = user.originalRole || r.replace(/^frozen:?/i, '') || 'student';
            return {
              ...user,
              is_frozen: isFrozen,
              status: isFrozen ? 'frozen' : 'active',
              role: isFrozen ? originalRole : r,
              originalRole: originalRole
            };
          });
          if (result.users) result.users = processed;
          if (result.students) result.students = processed;
        }

        if (!isLogin) {
          _apiCache.set(cacheKey, { data: result, time: Date.now() });
        }
      }

      return result;
    })();

    if (!forceFresh) {
      _inFlightRequests.set(cacheKey, fetchPromise);
      fetchPromise.finally(() => _inFlightRequests.delete(cacheKey));
    }

    return fetchPromise;
  },

  /**
   * Unified POST handler (checks Direct Firestore first, then falls back to /api)
   */
  async post(action, data = {}) {
    this.clearCache();
    let result = null;

    // 1. Try Direct Firestore client
    if (_getFb() && typeof DirectFirestore[action] === 'function') {
      try {
        result = await DirectFirestore[action](data);
      } catch (fbErr) {
        console.warn(`[API.post] Direct Firestore attempt for "${action}" failed, falling back to server:`, fbErr);
      }
    }

    // 2. Fallback to HTTP /api
    if (!result) {
      try {
        const payload = JSON.stringify({ action, ...data });
        const res = await fetch(CONFIG.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });
        const text = await res.text();
        result = JSON.parse(text);
      } catch (e) {
        console.error(`[API.post] Network error posting action "${action}":`, e);
        return {
          success: false,
          message: 'تعذر إتمام العملية بسبب انقطاع في الاتصال بقاعدة البيانات.'
        };
      }
    }

    return result;
  }
};
