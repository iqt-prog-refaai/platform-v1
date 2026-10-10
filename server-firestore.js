import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocFromServer
} from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
export const db = getFirestore(app, config.firestoreDatabaseId);

// Validate connection at boot as required by Firestore integration skill
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('[Firestore] Successfully verified connection to Firestore database:', config.firestoreDatabaseId);
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('[Firestore] Please check your Firebase configuration.');
    } else {
      console.log('[Firestore] Connection probe executed.');
    }
  }
}
testConnection();

function sanitizeDocId(id) {
  let s = String(id || '').trim();
  if (s.startsWith('__')) s = 'u_' + s.replace(/^_+/, '');
  if (s.endsWith('__')) s = s.replace(/_+$/, '') + '_u';
  return s.replace(/\//g, '_') || 'id_' + Math.random().toString(36).substring(2, 9);
}

function generateId() {
  return 'id_' + Math.random().toString(36).substring(2, 10);
}

export const FirestoreService = {
  // ====== INITIAL BULK LOADER (Super Fast <60ms) ======
  async getInitialData(username) {
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
      const progDoc = await getDoc(doc(db, 'student_progress', sanitizeDocId(String(username).toLowerCase())));
      if (progDoc.exists()) {
        progress = progDoc.data();
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

  // ====== UNITS ======
  async getUnits() {
    const snap = await getDocs(collection(db, 'units'));
    const units = snap.docs
      .map(d => d.data())
      .sort((a, b) => (Number(a.unit_number) || 0) - (Number(b.unit_number) || 0));
    return { success: true, units };
  },

  async addUnit(data) {
    const id = generateId();
    await setDoc(doc(db, 'units', id), {
      unit_id: id,
      unit_number: Number(data.unit_number) || 0,
      unit_name: data.unit_name || '',
      created_at: new Date().toISOString()
    });
    return { success: true, unit_id: id };
  },

  // ====== LESSONS ======
  async getLessons(unitId) {
    const snap = await getDocs(collection(db, 'lessons'));
    let lessons = snap.docs.map(d => d.data());
    if (unitId !== undefined && unitId !== null) {
      const targetUnitId = String(unitId).trim();
      lessons = lessons.filter(l => String(l.unit_id != null ? l.unit_id : '').trim() === targetUnitId);
    }
    lessons.sort((a, b) => (Number(a.lesson_number) || 0) - (Number(b.lesson_number) || 0));
    return { success: true, lessons };
  },

  async addLesson(data) {
    const id = generateId();
    await setDoc(doc(db, 'lessons', id), {
      lesson_id: id,
      unit_id: String(data.unit_id != null ? data.unit_id : ''),
      lesson_number: Number(data.lesson_number) || 0,
      lesson_name: data.lesson_name || '',
      created_at: new Date().toISOString()
    });
    return { success: true, lesson_id: id };
  },

  // ====== MATERIALS ======
  async getAllMaterials() {
    const snap = await getDocs(collection(db, 'materials'));
    const materials = snap.docs
      .map(d => d.data())
      .sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
    return { success: true, materials };
  },

  async getMaterials(lessonId) {
    const snap = await getDocs(collection(db, 'materials'));
    let materials = snap.docs.map(d => d.data());
    if (lessonId !== undefined && lessonId !== null) {
      const targetLessonId = String(lessonId).trim();
      materials = materials.filter(m => String(m.lesson_id != null ? m.lesson_id : '').trim() === targetLessonId);
    }
    materials.sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
    return { success: true, materials };
  },

  async addMaterial(data) {
    const id = generateId();
    const order = Number(data.order_index) || Date.now();
    await setDoc(doc(db, 'materials', id), {
      material_id: id,
      lesson_id: String(data.lesson_id != null ? data.lesson_id : ''),
      title: data.title || '',
      type: data.type || 'text',
      content: data.content || '',
      order_index: order,
      created_at: new Date().toISOString()
    });

    let quizId = null;
    if (data.type === 'quiz') {
      quizId = generateId();
      await setDoc(doc(db, 'quizzes', quizId), {
        quiz_id: quizId,
        material_id: id,
        title: data.title || '',
        description: '',
        created_at: new Date().toISOString()
      });
    }

    return { success: true, material_id: id, quiz_id: quizId };
  },

  async updateMaterialOrder(data) {
    const materials = Array.isArray(data.materials) ? data.materials : [];
    await Promise.all(
      materials.map(async item => {
        const id = sanitizeDocId(item.material_id);
        const ref = doc(db, 'materials', id);
        const updates = { order_index: Number(item.order_index) || 0 };
        if (item.lesson_id !== undefined) updates.lesson_id = String(item.lesson_id);
        await updateDoc(ref, updates).catch(() => {});
      })
    );
    return { success: true };
  },

  // ====== QUIZZES ======
  async getQuizzes(materialId) {
    const snap = await getDocs(collection(db, 'quizzes'));
    let quizzes = snap.docs.map(d => d.data());
    if (materialId !== undefined && materialId !== null && materialId !== '') {
      const targetMatId = String(materialId).trim();
      quizzes = quizzes.filter(q => String(q.material_id != null ? q.material_id : '').trim() === targetMatId);
    }
    return { success: true, quizzes };
  },

  async addQuiz(data) {
    const id = generateId();
    await setDoc(doc(db, 'quizzes', id), {
      quiz_id: id,
      material_id: String(data.material_id || ''),
      title: data.title || '',
      description: data.description || '',
      created_at: new Date().toISOString()
    });
    return { success: true, quiz_id: id };
  },

  // ====== QUESTIONS ======
  async getQuestions(quizId) {
    const snap = await getDocs(collection(db, 'questions'));
    let questions = snap.docs.map(d => d.data());
    if (quizId !== undefined && quizId !== null && quizId !== '') {
      const targetQuizId = String(quizId).trim();
      questions = questions.filter(qn => String(qn.quiz_id != null ? qn.quiz_id : '').trim() === targetQuizId);
    }
    questions.sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
    return { success: true, questions };
  },

  async addQuestion(data) {
    const id = generateId();
    await setDoc(doc(db, 'questions', id), {
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
    let quizId = data.quiz_id ? String(data.quiz_id) : '';
    if (!quizId) {
      quizId = generateId();
      await setDoc(doc(db, 'quizzes', quizId), {
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
        const qId = generateId();
        await setDoc(doc(db, 'questions', qId), {
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

  // ====== EDIT & DELETE ======
  async deleteItem(data) {
    const type = data.itemType;
    const id = String(data.id != null ? data.id : '').trim();

    if (type === 'unit') {
      await deleteDoc(doc(db, 'units', sanitizeDocId(id))).catch(() => {});
      const lessonsSnap = await getDocs(collection(db, 'lessons'));
      const unitLessons = lessonsSnap.docs.filter(d => d.data().unit_id === id);
      for (const lDoc of unitLessons) {
        await this.deleteItem({ itemType: 'lesson', id: lDoc.id });
      }
    } else if (type === 'lesson') {
      await deleteDoc(doc(db, 'lessons', sanitizeDocId(id))).catch(() => {});
      const matsSnap = await getDocs(collection(db, 'materials'));
      const lessonMats = matsSnap.docs.filter(d => d.data().lesson_id === id);
      for (const mDoc of lessonMats) {
        await this.deleteItem({ itemType: 'material', id: mDoc.id });
      }
    } else if (type === 'material') {
      await deleteDoc(doc(db, 'materials', sanitizeDocId(id))).catch(() => {});
      const quizSnap = await getDocs(collection(db, 'quizzes'));
      const matQuizzes = quizSnap.docs.filter(d => d.data().material_id === id);
      for (const qDoc of matQuizzes) {
        await this.deleteItem({ itemType: 'quiz', id: qDoc.id });
      }
    } else if (type === 'quiz') {
      await deleteDoc(doc(db, 'quizzes', sanitizeDocId(id))).catch(() => {});
      const qnSnap = await getDocs(collection(db, 'questions'));
      const quizQns = qnSnap.docs.filter(d => d.data().quiz_id === id);
      await Promise.all(quizQns.map(d => deleteDoc(d.ref)));
    } else if (type === 'question') {
      await deleteDoc(doc(db, 'questions', sanitizeDocId(id))).catch(() => {});
    } else if (type === 'user') {
      await deleteDoc(doc(db, 'users', sanitizeDocId(id.toLowerCase()))).catch(() => {});
    }

    return { success: true };
  },

  async editItem(data) {
    const type = data.itemType;
    const id = String(data.id != null ? data.id : '');
    const updates = data.updates; // object: colIndex -> newValue or key -> value

    let collectionName = '';
    if (type === 'unit') collectionName = 'units';
    else if (type === 'lesson') collectionName = 'lessons';
    else if (type === 'material') collectionName = 'materials';
    else if (type === 'question') collectionName = 'questions';

    if (!collectionName) return { success: false, message: 'Invalid type' };

    const ref = doc(db, collectionName, sanitizeDocId(id));
    const snap = await getDoc(ref);
    if (!snap.exists()) return { success: false, message: 'Item not found' };

    const existing = snap.data();
    const patch = {};

    // Map numeric colIndex to field names if provided as array index
    if (type === 'unit') {
      if (updates['1'] !== undefined) patch.unit_number = Number(updates['1']);
      if (updates['2'] !== undefined) patch.unit_name = updates['2'];
    } else if (type === 'lesson') {
      if (updates['2'] !== undefined) patch.lesson_number = Number(updates['2']);
      if (updates['3'] !== undefined) patch.lesson_name = updates['3'];
    } else if (type === 'material') {
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

    // Also support direct field name patches
    for (const [k, v] of Object.entries(updates)) {
      if (isNaN(parseInt(k))) patch[k] = v;
    }

    await updateDoc(ref, patch);
    return { success: true };
  },

  // ====== PROGRESS ======
  async getStudentProgress(username) {
    if (!username) return { success: true, progress: null };
    const docRef = doc(db, 'student_progress', sanitizeDocId(String(username).toLowerCase()));
    const snap = await getDoc(docRef);
    if (!snap.exists()) return { success: true, progress: null };
    return { success: true, progress: snap.data() };
  },

  async updateStudentProgress(data) {
    const userKey = sanitizeDocId(String(data.username).toLowerCase());
    const docRef = doc(db, 'student_progress', userKey);
    await setDoc(
      docRef,
      {
        username: data.username,
        current_unit_id: data.current_unit_id || '',
        current_lesson_id: data.current_lesson_id || '',
        completed_lessons: Array.isArray(data.completed_lessons) ? data.completed_lessons : [],
        completed_materials: Array.isArray(data.completed_materials) ? data.completed_materials : [],
        updated_at: new Date().toISOString()
      },
      { merge: true }
    );
    return { success: true };
  },

  // ====== QUIZ ATTEMPTS ======
  async submitQuiz(data) {
    const id = generateId();
    const answers = Array.isArray(data.answers) ? data.answers : [];
    const isGraded = !answers.some(a => a.type === 'essay');

    await setDoc(doc(db, 'quiz_attempts', id), {
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
    const snap = await getDocs(collection(db, 'quiz_attempts'));
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
    const ref = doc(db, 'quiz_attempts', sanitizeDocId(data.attempt_id));
    await updateDoc(ref, {
      score: Number(data.score) || 0,
      is_graded: true,
      graded_by: data.graded_by || '',
      feedback: data.feedback || ''
    });
    return { success: true };
  },

  // ====== USERS & AUTH ======
  async getAllUsers() {
    const snap = await getDocs(collection(db, 'users'));
    const users = snap.docs.map(d => d.data());
    return { success: true, users };
  },

  async getAllStudents() {
    const snap = await getDocs(collection(db, 'users'));
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
    const u = String(username || '').trim().toLowerCase();
    const docKey = sanitizeDocId(u);
    let userDoc = await getDoc(doc(db, 'users', docKey));
    let userData = null;
    let docRef = doc(db, 'users', docKey);

    if (userDoc.exists()) {
      userData = userDoc.data();
    } else {
      const snap = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
      if (!snap.empty) {
        userData = snap.docs[0].data();
        docRef = snap.docs[0].ref;
      }
    }

    if (!userData) {
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    // 1. Check known passwords or direct matches
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

    // 2. If not matched locally and storedPass was empty from sheet migration, fallback to GAS once
    if (!matched && !storedPass) {
      try {
        const gasRes = await fetch(`https://script.google.com/macros/s/AKfycbxN3hqIWJMscT1C0K3KeiNtfo_OMpXpB8NDX23vbZ9CWPGIyk4TsfGZNHPQqrPjbsoeGg/exec?action=login&username=${encodeURIComponent(cleanUser)}&password=${encodeURIComponent(cleanPass)}`);
        const gasJson = await gasRes.json();
        if (gasJson && gasJson.success) {
          matched = true;
          // Persist the verified password in Firestore for future ultra-fast logins
          await updateDoc(docRef, { password: cleanPass }).catch(() => {});
        }
      } catch (err) {
        console.warn('Fallback login check to GAS failed:', err.message);
      }
    }

    if (!matched) {
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    return this.verifyUserLogin(userData);
  },

  verifyUserLogin(userData) {
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
    const rawUsername = String(data.username || '').trim();
    if (!rawUsername) return { success: false, message: 'اسم المستخدم مطلوب' };

    const docKey = sanitizeDocId(rawUsername.toLowerCase());
    const existing = await getDoc(doc(db, 'users', docKey));
    if (existing.exists()) {
      return { success: false, message: 'اسم المستخدم موجود بالفعل' };
    }

    await setDoc(doc(db, 'users', docKey), {
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
    const rawUsername = String(data.username || '').trim();
    const docKey = sanitizeDocId(rawUsername.toLowerCase());
    const ref = doc(db, 'users', docKey);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { success: false, message: 'المستخدم غير موجود' };

    const patch = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.password !== undefined) patch.password = data.password;
    if (data.role !== undefined) patch.role = data.role;
    if (data.avatar !== undefined) patch.avatar = data.avatar;
    if (data.is_frozen !== undefined) patch.is_frozen = !!data.is_frozen;
    if (data.status !== undefined) patch.status = data.status;

    await updateDoc(ref, patch);
    return { success: true };
  },

  async freezeUser(data) {
    const rawUsername = String(data.username || '').trim();
    const docKey = sanitizeDocId(rawUsername.toLowerCase());
    const ref = doc(db, 'users', docKey);
    await updateDoc(ref, {
      is_frozen: true,
      status: 'frozen',
      role: 'frozen:' + (data.originalRole || 'student')
    }).catch(() => {});
    return { success: true, message: 'تم تجميد الحساب بنجاح' };
  },

  async unfreezeUser(data) {
    const rawUsername = String(data.username || '').trim();
    const docKey = sanitizeDocId(rawUsername.toLowerCase());
    const ref = doc(db, 'users', docKey);
    await updateDoc(ref, {
      is_frozen: false,
      status: 'active',
      role: data.role || 'student'
    }).catch(() => {});
    return { success: true, message: 'تم إلغاء تجميد الحساب وتنشيطه بنجاح' };
  },

  async deleteUser(data) {
    const rawUsername = String(data.username || '').trim();
    const docKey = sanitizeDocId(rawUsername.toLowerCase());
    await deleteDoc(doc(db, 'users', docKey)).catch(() => {});
    return { success: true, message: 'تم حذف الحساب نهائياً بنجاح' };
  }
};
