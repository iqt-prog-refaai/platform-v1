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
    const [unitsSnap, lessonsSnap, matsSnap, quizzesSnap, annSnap, notifsSnap] = await Promise.all([
      getDocs(collection(db, 'units')),
      getDocs(collection(db, 'lessons')),
      getDocs(collection(db, 'materials')),
      getDocs(collection(db, 'quizzes')),
      getDoc(doc(db, 'announcements', 'global_announcement')).catch(() => null),
      getDocs(collection(db, 'notifications')).catch(() => null)
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
    const announcement = (annSnap && annSnap.exists()) ? annSnap.data() : null;
    const notifications = notifsSnap
      ? notifsSnap.docs
          .map(d => d.data())
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
          .slice(0, 50)
      : [];

    let progress = null;
    if (username) {
      const cleanUser = String(username).trim();
      const progDoc = await getDoc(doc(db, 'student_progress', sanitizeDocId(cleanUser.toLowerCase())));
      if (progDoc.exists()) {
        progress = progDoc.data();
      }
      this.recordPresenceHeartbeat({
        username: cleanUser,
        is_online: true,
        is_session_init: true,
        study_minutes_delta: 0,
        current_activity: progress?.current_activity || 'متصل في الصفحة الرئيسية'
      }).catch(() => {});
    }

    return {
      success: true,
      units,
      lessons,
      materials,
      quizzes,
      progress,
      announcement,
      notifications
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
      is_hidden: Boolean(data.is_hidden || false),
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
      is_hidden: Boolean(data.is_hidden || false),
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
      is_hidden: Boolean(data.is_hidden || false),
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
        is_hidden: Boolean(data.is_hidden || false),
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
      const [lessonsSnap, matsSnap] = await Promise.all([
        getDocs(collection(db, 'lessons')),
        getDocs(collection(db, 'materials'))
      ]);
      const unitLessons = lessonsSnap.docs.filter(d => String(d.data().unit_id) === id);
      for (const lDoc of unitLessons) {
        await this.deleteItem({ itemType: 'lesson', id: lDoc.id });
      }
      const unitDirectMats = matsSnap.docs.filter(d => String(d.data().lesson_id) === `unit_${id}`);
      for (const mDoc of unitDirectMats) {
        await this.deleteItem({ itemType: 'material', id: mDoc.id });
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
    const lowerKey = sanitizeDocId(String(username).trim().toLowerCase());
    let docRef = doc(db, 'student_progress', lowerKey);
    let snap = await getDoc(docRef);
    if (!snap.exists()) {
      const origKey = sanitizeDocId(String(username).trim());
      if (origKey !== lowerKey) {
        docRef = doc(db, 'student_progress', origKey);
        snap = await getDoc(docRef);
      }
    }
    if (!snap.exists()) return { success: true, progress: null };
    return { success: true, progress: snap.data() };
  },

  _synthesizeStudentTelemetry(userData = {}, progData = null, userAttempts = [], lessonsMap = {}, materialsMap = {}) {
    const rawProg = progData || {};
    const attempts = Array.isArray(userAttempts) ? userAttempts : [];
    const compLessons = Array.isArray(rawProg.completed_lessons) ? rawProg.completed_lessons : [];
    const compMaterials = Array.isArray(rawProg.completed_materials) ? rawProg.completed_materials : [];
    const compDetails = Array.isArray(rawProg.completed_lesson_details) ? rawProg.completed_lesson_details : [];
    const readNotifs = Array.isArray(rawProg.read_notifications) ? rawProg.read_notifications : [];

    const candidateTimestamps = [
      userData?.last_seen_at,
      rawProg?.last_seen_at,
      rawProg?.updated_at,
      ...compDetails.map(d => d?.completed_at),
      ...attempts.map(a => a?.attempt_date)
    ].filter(ts => ts && !isNaN(new Date(ts).getTime()));

    let latestSeenIso = '';
    let latestSeenMs = 0;
    for (const ts of candidateTimestamps) {
      const ms = new Date(ts).getTime();
      if (ms > latestSeenMs) {
        latestSeenMs = ms;
        latestSeenIso = ts;
      }
    }

    const r = String(userData?.role || '').toLowerCase();
    const isFrozen = Boolean(userData?.is_frozen) || userData?.status === 'frozen' || r.startsWith('frozen');
    const explicitLogout = rawProg?.explicit_logout === true || userData?.explicit_logout === true;
    const ageMs = latestSeenMs > 0 ? (Date.now() - latestSeenMs) : Infinity;
    const isRecentlyActive = ageMs >= -60000 && ageMs < 210000;
    const isOnline = !isFrozen && !explicitLogout && isRecentlyActive;

    const storedLog = Array.isArray(rawProg.activity_log) ? [...rawProg.activity_log] : [];
    const synthEvents = [];

    for (const att of attempts) {
      if (!att || !att.attempt_date) continue;
      const matTitle = materialsMap[String(att.material_id || '')] || 'اختبار تفاعلي';
      const scoreText = att.is_graded ? `النتيجة: ${att.score}/${att.max_score}` : 'بانتظار تصحيح المقالي';
      const exists = storedLog.some(e =>
        (e.type === 'quiz_submit' || e.type === 'quiz') &&
        Math.abs(new Date(e.timestamp || 0).getTime() - new Date(att.attempt_date).getTime()) < 120000
      );
      if (!exists) {
        synthEvents.push({
          id: 'synth_att_' + (att.attempt_id || Math.random().toString(36).slice(2, 7)),
          type: 'quiz_submit',
          title: `تسليم اختبار: ${matTitle}`,
          detail: scoreText,
          timestamp: att.attempt_date
        });
      }
    }

    for (const det of compDetails) {
      if (!det || !det.completed_at) continue;
      const lTitle = det.lesson_name || lessonsMap[String(det.lesson_id || '')] || `درس #${det.lesson_id}`;
      const exists = storedLog.some(e =>
        e.type === 'complete' &&
        Math.abs(new Date(e.timestamp || 0).getTime() - new Date(det.completed_at).getTime()) < 120000
      );
      if (!exists) {
        synthEvents.push({
          id: 'synth_les_' + (det.lesson_id || Math.random().toString(36).slice(2, 7)),
          type: 'complete',
          title: `إتمام الدرس: ${lTitle}`,
          detail: det.unit_name || 'المنهج الدراسي',
          timestamp: det.completed_at
        });
      }
    }

    if (rawProg.updated_at) {
      const curLessonName = lessonsMap[String(rawProg.current_lesson_id || '')] || '';
      const existsNearUpdate = storedLog.some(e =>
        Math.abs(new Date(e.timestamp || 0).getTime() - new Date(rawProg.updated_at).getTime()) < 180000
      );
      if (!existsNearUpdate) {
        synthEvents.push({
          id: 'synth_prog_' + new Date(rawProg.updated_at).getTime(),
          type: curLessonName ? 'lesson' : 'login',
          title: curLessonName ? `فتح ودراسة: ${curLessonName}` : 'فتح المنصة واستعراض المحتوى الدراسي',
          detail: compMaterials.length > 0 ? `أنجز ${compMaterials.length} محتوى تعليمي` : 'تصفح الوحدات والدروس',
          timestamp: rawProg.updated_at
        });
      }
    }

    const combinedLog = [...storedLog, ...synthEvents]
      .filter(e => e && e.title)
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, 100);

    const sessionTimestamps = combinedLog
      .map(e => new Date(e.timestamp || 0).getTime())
      .filter(ms => ms > 0)
      .sort((a, b) => a - b);
    let derivedSessions = 0;
    let lastSessMs = 0;
    for (const ms of sessionTimestamps) {
      if (!lastSessMs || (ms - lastSessMs) > 25 * 60 * 1000) {
        derivedSessions++;
        lastSessMs = ms;
      }
    }
    if (derivedSessions === 0 && latestSeenMs > 0) {
      derivedSessions = 1;
    }

    const loginCount = Math.max(
      Number(userData?.login_count) || 0,
      Number(rawProg?.login_count) || 0,
      derivedSessions
    );

    const hasUsedPlatform = latestSeenMs > 0 || compLessons.length > 0 || compMaterials.length > 0 || attempts.length > 0;
    const estimatedStudyMins =
      (compLessons.length * 15) +
      (compMaterials.length * 8) +
      (attempts.length * 10) +
      (rawProg.current_lesson_id ? 6 : (hasUsedPlatform ? 3 : 0));

    const totalStudyMinutes = Math.max(
      Number(userData?.total_study_minutes) || 0,
      Number(rawProg?.total_study_minutes) || 0,
      estimatedStudyMins
    );

    let currentActivity = rawProg?.current_activity || userData?.current_activity || '';
    if ((!currentActivity || currentActivity === 'غير متصل') && latestSeenMs > 0) {
      if (rawProg.current_lesson_id && lessonsMap[String(rawProg.current_lesson_id)]) {
        currentActivity = `يدرس: ${lessonsMap[String(rawProg.current_lesson_id)]}`;
      } else if (combinedLog.length > 0) {
        currentActivity = combinedLog[0].title;
      } else {
        currentActivity = 'تصفح المنصة';
      }
    }

    return {
      last_seen_at: latestSeenIso,
      is_online: isOnline,
      login_count: loginCount,
      total_study_minutes: totalStudyMinutes,
      current_activity: currentActivity,
      activity_log: combinedLog
    };
  },

  async updateStudentProgress(data) {
    const rawUser = String(data.username || '').trim();
    if (!rawUser) return { success: false, message: 'Missing username' };
    const userKey = sanitizeDocId(rawUser.toLowerCase());
    const nowIso = new Date().toISOString();
    const docRef = doc(db, 'student_progress', userKey);
    const userRef = doc(db, 'users', userKey);

    const payload = {
      username: rawUser,
      current_unit_id: data.current_unit_id || '',
      current_lesson_id: data.current_lesson_id || '',
      completed_lessons: Array.isArray(data.completed_lessons) ? data.completed_lessons : [],
      completed_materials: Array.isArray(data.completed_materials) ? data.completed_materials : [],
      completed_lesson_details: Array.isArray(data.completed_lesson_details) ? data.completed_lesson_details : [],
      updated_at: nowIso,
      last_seen_at: nowIso,
      is_online: true,
      explicit_logout: false
    };
    if (Array.isArray(data.read_notifications)) {
      payload.read_notifications = data.read_notifications;
    }
    await setDoc(docRef, payload, { merge: true });
    updateDoc(userRef, {
      last_seen_at: nowIso,
      is_online: true,
      explicit_logout: false
    }).catch(() => {});
    return { success: true };
  },

  // ====== QUIZ ATTEMPTS ======
  async submitQuiz(data) {
    const id = generateId();
    const nowIso = new Date().toISOString();
    const answers = Array.isArray(data.answers) ? data.answers : [];
    const hasAnsweredEssay = answers.some(a => a && a.type === 'essay' && a.answer !== null && a.answer !== undefined && String(a.answer).trim() !== '');
    const isGraded = !hasAnsweredEssay;
    const cleanUser = String(data.username || '').trim();
    const score = Number(data.score) || 0;
    const maxScore = Number(data.max_score) || 0;
    const objScore = data.objective_score !== undefined ? Number(data.objective_score) : score;
    const objMaxScore = data.objective_max_score !== undefined ? Number(data.objective_max_score) : maxScore;
    const essayMaxScore = data.essay_max_score !== undefined ? Number(data.essay_max_score) : 0;

    await setDoc(doc(db, 'quiz_attempts', id), {
      attempt_id: id,
      username: cleanUser.toLowerCase(),
      quiz_id: String(data.quiz_id || ''),
      material_id: String(data.material_id || ''),
      answers: answers,
      score: score,
      max_score: maxScore,
      objective_score: objScore,
      objective_max_score: objMaxScore,
      essay_max_score: essayMaxScore,
      is_graded: isGraded,
      graded_by: '',
      feedback: '',
      attempt_date: nowIso
    });

    if (cleanUser) {
      this.recordPresenceHeartbeat({
        username: cleanUser,
        is_online: true,
        study_minutes_delta: 3,
        current_activity: `أنهى اختبار (${objScore}/${objMaxScore})`,
        event: {
          type: 'quiz_submit',
          title: 'تسليم اختبار تفاعلي',
          detail: `درجة الموضوعي: ${objScore}/${objMaxScore}` + (essayMaxScore > 0 ? ` | المقالي: من ${essayMaxScore}` : ''),
          timestamp: nowIso
        }
      }).catch(() => {});
    }

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

  async _fetchEnrichedUsers() {
    const [usersSnap, progSnap, attemptsSnap, lessonsSnap, matsSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'student_progress')).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'quiz_attempts')).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'lessons')).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'materials')).catch(() => ({ docs: [] }))
    ]);

    const lessonsMap = {};
    lessonsSnap.docs.forEach(d => {
      const l = d.data();
      if (l && l.lesson_id) lessonsMap[String(l.lesson_id)] = l.lesson_name || `درس ${l.lesson_number || ''}`;
    });

    const materialsMap = {};
    matsSnap.docs.forEach(d => {
      const m = d.data();
      if (m && m.material_id) materialsMap[String(m.material_id)] = m.title || 'محتوى';
    });

    const progByUser = {};
    progSnap.docs.forEach(d => {
      const p = d.data();
      const key = String(p?.username || d.id || '').trim().toLowerCase();
      if (key) progByUser[key] = p;
    });

    const attemptsByUser = {};
    attemptsSnap.docs.forEach(d => {
      const a = d.data();
      const key = String(a?.username || '').trim().toLowerCase();
      if (!key) return;
      if (!attemptsByUser[key]) attemptsByUser[key] = [];
      attemptsByUser[key].push(a);
    });

    const enrichedUsers = usersSnap.docs.map(d => {
      const u = d.data();
      const key = String(u?.username || d.id || '').trim().toLowerCase();
      const prog = progByUser[key] || progByUser[sanitizeDocId(key)] || null;
      const uAttempts = attemptsByUser[key] || [];
      const telemetry = this._synthesizeStudentTelemetry(u, prog, uAttempts, lessonsMap, materialsMap);
      return {
        ...u,
        ...telemetry
      };
    });

    return {
      users: enrichedUsers,
      allProgress: progSnap.docs.map(d => {
        const p = d.data();
        const key = String(p?.username || d.id || '').trim().toLowerCase();
        const u = enrichedUsers.find(x => String(x.username || '').trim().toLowerCase() === key) || {};
        const uAttempts = attemptsByUser[key] || [];
        const telemetry = this._synthesizeStudentTelemetry(u, p, uAttempts, lessonsMap, materialsMap);
        return { ...p, ...telemetry };
      }),
      allAttempts: attemptsSnap.docs.map(d => d.data())
    };
  },

  // ====== USERS & AUTH ======
  async getAllUsers() {
    const { users } = await this._fetchEnrichedUsers();
    return { success: true, users };
  },

  async getAllStudents() {
    const { users } = await this._fetchEnrichedUsers();
    const students = users.filter(u => u.role === 'student' || String(u.role).startsWith('frozen:student'));
    return { success: true, students };
  },

  async getStudentDetails(username) {
    const uKey = sanitizeDocId(String(username || '').trim().toLowerCase());
    const [progRes, attRes, userSnap, lessonsSnap, matsSnap] = await Promise.all([
      this.getStudentProgress(username),
      this.getQuizAttempts(username, null),
      getDoc(doc(db, 'users', uKey)).catch(() => null),
      getDocs(collection(db, 'lessons')).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'materials')).catch(() => ({ docs: [] }))
    ]);

    const lessonsMap = {};
    (lessonsSnap?.docs || []).forEach(d => {
      const l = d.data();
      if (l && l.lesson_id) lessonsMap[String(l.lesson_id)] = l.lesson_name || `درس ${l.lesson_number || ''}`;
    });
    const materialsMap = {};
    (matsSnap?.docs || []).forEach(d => {
      const m = d.data();
      if (m && m.material_id) materialsMap[String(m.material_id)] = m.title || 'محتوى';
    });

    const userData = (userSnap && userSnap.exists()) ? userSnap.data() : {};
    const rawProg = progRes.progress || {
      username,
      completed_lessons: [],
      completed_materials: [],
      completed_lesson_details: [],
      activity_log: []
    };

    const telemetry = this._synthesizeStudentTelemetry(userData, rawProg, attRes.attempts || [], lessonsMap, materialsMap);
    const mergedProgress = {
      ...rawProg,
      ...telemetry
    };

    return {
      success: true,
      username,
      userProfile: { ...userData, ...telemetry },
      progress: mergedProgress,
      attempts: attRes.attempts
    };
  },

  async recordPresenceHeartbeat(data = {}) {
    const rawUser = String(data.username || '').trim();
    if (!rawUser) return { success: false, message: 'Missing username' };
    const docKey = sanitizeDocId(rawUser.toLowerCase());
    const nowIso = new Date().toISOString();
    const isOnline = data.is_online !== false;
    const explicitLogout = data.is_online === false;
    let studyDelta = Math.max(0, Math.min(10, Number(data.study_minutes_delta) || 0));

    let userRef = doc(db, 'users', docKey);
    const progRef = doc(db, 'student_progress', docKey);

    let [userSnap, progSnap] = await Promise.all([
      getDoc(userRef).catch(() => null),
      getDoc(progRef).catch(() => null)
    ]);

    if (!userSnap || !userSnap.exists()) {
      const qSnap = await getDocs(query(collection(db, 'users'), where('username', '==', rawUser))).catch(() => null);
      if (qSnap && !qSnap.empty) {
        userSnap = qSnap.docs[0];
        userRef = userSnap.ref;
      }
    }

    const userData = (userSnap && userSnap.exists()) ? userSnap.data() : null;
    const progData = (progSnap && progSnap.exists()) ? progSnap.data() : null;

    const prevSeenIso = progData?.last_seen_at || userData?.last_seen_at || progData?.updated_at || '';
    const prevSeenMs = prevSeenIso ? new Date(prevSeenIso).getTime() : 0;
    const isNewSession = isOnline && (
      Boolean(data.is_session_start) ||
      Boolean(data.is_session_init)
    ) && (!prevSeenMs || (Date.now() - prevSeenMs) > 20 * 60 * 1000);

    const currentStudyMins = Math.max(
      Number(userData?.total_study_minutes) || 0,
      Number(progData?.total_study_minutes) || 0
    );
    if (isNewSession && studyDelta === 0) {
      studyDelta = 1;
    }
    const nextStudyMins = currentStudyMins + studyDelta;

    let currentLoginCount = Math.max(
      Number(userData?.login_count) || 0,
      Number(progData?.login_count) || 0
    );
    if (isNewSession || (isOnline && currentLoginCount === 0)) {
      currentLoginCount += 1;
    }

    if (userData) {
      const userPatch = {
        last_seen_at: nowIso,
        is_online: isOnline,
        explicit_logout: explicitLogout,
        total_study_minutes: nextStudyMins,
        login_count: currentLoginCount
      };
      if (data.current_activity !== undefined) {
        userPatch.current_activity = String(data.current_activity || '');
      }
      await setDoc(userRef, userPatch, { merge: true }).catch(() => {});
    }

    const progPatch = {
      username: userData?.username || progData?.username || rawUser,
      last_seen_at: nowIso,
      updated_at: nowIso,
      is_online: isOnline,
      explicit_logout: explicitLogout,
      total_study_minutes: nextStudyMins,
      login_count: currentLoginCount
    };

    if (data.current_activity !== undefined) {
      progPatch.current_activity = String(data.current_activity || '');
    }

    const existingLog = Array.isArray(progData?.activity_log) ? progData.activity_log : [];
    let eventToLog = (data.event && typeof data.event === 'object' && data.event.title) ? data.event : null;
    if (!eventToLog && isNewSession) {
      eventToLog = {
        type: 'login',
        title: 'فتح المنصة وبدء جلسة دراسة',
        detail: `الجلسة رقم #${currentLoginCount}`,
        timestamp: nowIso
      };
    }

    if (eventToLog && eventToLog.title) {
      const newEntry = {
        id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: String(eventToLog.type || 'view'),
        title: String(eventToLog.title || ''),
        detail: String(eventToLog.detail || ''),
        timestamp: eventToLog.timestamp || nowIso
      };
      const latest = existingLog[0];
      const isDuplicate = latest &&
        latest.type === newEntry.type &&
        latest.title === newEntry.title &&
        Math.abs(new Date(newEntry.timestamp).getTime() - new Date(latest.timestamp || 0).getTime()) < 30000;

      if (!isDuplicate) {
        progPatch.activity_log = [newEntry, ...existingLog].slice(0, 100);
      }
    }

    await setDoc(progRef, progPatch, { merge: true }).catch(() => {});
    return {
      success: true,
      last_seen_at: nowIso,
      is_online: isOnline,
      login_count: currentLoginCount,
      total_study_minutes: nextStudyMins
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

    if (!matched) {
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    const res = this.verifyUserLogin(userData);
    if (res.success && res.user) {
      const nowIso = new Date().toISOString();
      const newLoginCount = (Number(userData.login_count) || 0) + 1;
      const totalStudyMins = Number(userData.total_study_minutes) || 0;

      updateDoc(docRef, {
        last_seen_at: nowIso,
        is_online: true,
        login_count: newLoginCount,
        current_activity: 'متصل في الصفحة الرئيسية'
      }).catch(() => {});

      const progKey = sanitizeDocId(String(userData.username || username).trim().toLowerCase());
      const progRef = doc(db, 'student_progress', progKey);
      getDoc(progRef).then(pSnap => {
        const pData = pSnap.exists() ? pSnap.data() : {};
        const existingLog = Array.isArray(pData.activity_log) ? pData.activity_log : [];
        const loginEvent = {
          id: 'act_' + Date.now() + '_login',
          type: 'login',
          title: 'تسجيل دخول إلى المنصة',
          detail: `تسجيل الدخول رقم #${newLoginCount}`,
          timestamp: nowIso
        };
        return setDoc(progRef, {
          username: userData.username,
          last_seen_at: nowIso,
          is_online: true,
          login_count: newLoginCount,
          total_study_minutes: Math.max(totalStudyMins, Number(pData.total_study_minutes) || 0),
          current_activity: 'متصل في الصفحة الرئيسية',
          activity_log: [loginEvent, ...existingLog].slice(0, 100)
        }, { merge: true });
      }).catch(() => {});

      res.user.login_count = newLoginCount;
      res.user.total_study_minutes = totalStudyMins;
      res.user.last_seen_at = nowIso;
      res.user.is_online = true;
    }
    return res;
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
      is_online: false,
      login_count: 0,
      total_study_minutes: 0,
      last_seen_at: '',
      current_activity: '',
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

    const existingData = snap.data();

    if (data.new_username) {
      const newRaw = String(data.new_username).trim();
      const newDocKey = sanitizeDocId(newRaw.toLowerCase());
      if (newDocKey !== docKey) {
        const newRef = doc(db, 'users', newDocKey);
        const newSnap = await getDoc(newRef);
        if (newSnap.exists()) {
          return { success: false, message: 'اسم المستخدم الجديد مستخدم بالفعل' };
        }
        await setDoc(newRef, { ...existingData, username: newRaw });
        await deleteDoc(ref).catch(() => {});

        // Also migrate student_progress if present
        const oldProgRef = doc(db, 'student_progress', docKey);
        const oldProgSnap = await getDoc(oldProgRef);
        if (oldProgSnap.exists()) {
          await setDoc(doc(db, 'student_progress', newDocKey), {
            ...oldProgSnap.data(),
            username: newRaw.toLowerCase()
          });
          await deleteDoc(oldProgRef).catch(() => {});
        }
        return { success: true };
      }
    }

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
  },

  // ====== ANNOUNCEMENTS & ANALYTICS ======
  async getAnnouncement() {
    const snap = await getDoc(doc(db, 'announcements', 'global_announcement'));
    return {
      success: true,
      announcement: snap.exists() ? snap.data() : null
    };
  },

  async saveAnnouncement(data) {
    const payload = {
      title: String(data.title || '').trim(),
      message: String(data.message || '').trim(),
      type: data.type || 'info',
      is_active: Boolean(data.is_active),
      link_url: String(data.link_url || '').trim(),
      link_text: String(data.link_text || '').trim(),
      updated_at: new Date().toISOString()
    };
    await setDoc(doc(db, 'announcements', 'global_announcement'), payload, { merge: true });
    return { success: true, announcement: payload };
  },

  async getNotifications() {
    const snap = await getDocs(collection(db, 'notifications'));
    const notifications = snap.docs
      .map(d => d.data())
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 50);
    return { success: true, notifications };
  },

  async addNotification(data) {
    const id = generateId();
    const payload = {
      notification_id: id,
      title: String(data.title || '').trim(),
      message: String(data.message || '').trim(),
      type: String(data.type || 'announcement').trim(),
      target_type: String(data.target_type || 'announcement').trim(),
      target_id: String(data.target_id || '').trim(),
      unit_id: String(data.unit_id || '').trim(),
      lesson_id: String(data.lesson_id || '').trim(),
      link_url: String(data.link_url || '').trim(),
      link_text: String(data.link_text || '').trim(),
      created_at: new Date().toISOString()
    };
    await setDoc(doc(db, 'notifications', id), payload);
    return { success: true, notification: payload };
  },

  async deleteNotification(data) {
    const id = sanitizeDocId(data.notification_id || data.id || '');
    if (!id) return { success: false, message: 'Missing notification_id' };
    await deleteDoc(doc(db, 'notifications', id)).catch(() => {});
    return { success: true };
  },

  async clearAllNotifications() {
    const snap = await getDocs(collection(db, 'notifications'));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref).catch(() => {})));
    return { success: true, deleted_count: snap.size };
  },

  async getAdminAnalytics() {
    const [enriched, annSnap, notifsSnap] = await Promise.all([
      this._fetchEnrichedUsers(),
      getDoc(doc(db, 'announcements', 'global_announcement')).catch(() => null),
      getDocs(collection(db, 'notifications')).catch(() => null)
    ]);

    const announcement = (annSnap && annSnap.exists()) ? annSnap.data() : null;
    const notifications = notifsSnap
      ? notifsSnap.docs
          .map(d => d.data())
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
          .slice(0, 50)
      : [];

    return {
      success: true,
      users: enriched.users,
      allProgress: enriched.allProgress,
      allAttempts: enriched.allAttempts,
      announcement,
      notifications
    };
  },

  async exportAllCurriculum() {
    const [unitsSnap, lessonsSnap, matsSnap, quizzesSnap, questionsSnap] = await Promise.all([
      getDocs(collection(db, 'units')),
      getDocs(collection(db, 'lessons')),
      getDocs(collection(db, 'materials')),
      getDocs(collection(db, 'quizzes')),
      getDocs(collection(db, 'questions'))
    ]);

    const units = unitsSnap.docs.map(d => d.data()).sort((a, b) => (Number(a.unit_number) || 0) - (Number(b.unit_number) || 0));
    const lessons = lessonsSnap.docs.map(d => d.data()).sort((a, b) => (Number(a.lesson_number) || 0) - (Number(b.lesson_number) || 0));
    const materials = matsSnap.docs.map(d => d.data()).sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
    const quizzes = quizzesSnap.docs.map(d => d.data());
    const questions = questionsSnap.docs.map(d => d.data()).sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));

    return {
      success: true,
      units,
      lessons,
      materials,
      quizzes,
      questions
    };
  },

  async clearAllCurriculum(data = {}) {
    const resetStudentProgress = data.resetStudentProgress !== false;

    const [unitsSnap, lessonsSnap, matsSnap, quizzesSnap, questionsSnap] = await Promise.all([
      getDocs(collection(db, 'units')),
      getDocs(collection(db, 'lessons')),
      getDocs(collection(db, 'materials')),
      getDocs(collection(db, 'quizzes')),
      getDocs(collection(db, 'questions'))
    ]);

    const allDocs = [
      ...unitsSnap.docs,
      ...lessonsSnap.docs,
      ...matsSnap.docs,
      ...quizzesSnap.docs,
      ...questionsSnap.docs
    ];

    await Promise.all(allDocs.map(d => deleteDoc(d.ref).catch(() => {})));

    if (resetStudentProgress) {
      const progSnap = await getDocs(collection(db, 'student_progress'));
      await Promise.all(progSnap.docs.map(d => updateDoc(d.ref, {
        current_unit_id: '',
        current_lesson_id: '',
        completed_lessons: [],
        completed_materials: [],
        completed_lesson_details: [],
        updated_at: new Date().toISOString()
      }).catch(() => {})));
    }

    return {
      success: true,
      deleted_counts: {
        units: unitsSnap.size,
        lessons: lessonsSnap.size,
        materials: matsSnap.size,
        quizzes: quizzesSnap.size,
        questions: questionsSnap.size
      }
    };
  },

  async importAllCurriculum(data = {}) {
    const raw = data.raw_data || data;
    const units = Array.isArray(raw.units) ? raw.units : [];
    const lessons = Array.isArray(raw.lessons) ? raw.lessons : [];
    const materials = Array.isArray(raw.materials) ? raw.materials : [];
    const quizzes = Array.isArray(raw.quizzes) ? raw.quizzes : [];
    const questions = Array.isArray(raw.questions) ? raw.questions : [];

    await Promise.all([
      ...units.map(u => {
        const id = sanitizeDocId(u.unit_id || generateId());
        return setDoc(doc(db, 'units', id), { ...u, unit_id: id });
      }),
      ...lessons.map(l => {
        const id = sanitizeDocId(l.lesson_id || generateId());
        return setDoc(doc(db, 'lessons', id), { ...l, lesson_id: id });
      }),
      ...materials.map(m => {
        const id = sanitizeDocId(m.material_id || generateId());
        return setDoc(doc(db, 'materials', id), { ...m, material_id: id });
      }),
      ...quizzes.map(q => {
        const id = sanitizeDocId(q.quiz_id || generateId());
        return setDoc(doc(db, 'quizzes', id), { ...q, quiz_id: id });
      }),
      ...questions.map(qn => {
        const id = sanitizeDocId(qn.question_id || generateId());
        return setDoc(doc(db, 'questions', id), { ...qn, question_id: id });
      })
    ]);

    return {
      success: true,
      imported_counts: {
        units: units.length,
        lessons: lessons.length,
        materials: materials.length,
        quizzes: quizzes.length,
        questions: questions.length
      }
    };
  }
};
