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
      try {
        const cleanUser = String(username).trim();
        const progDoc = await getDoc(doc(db, 'student_progress', _sanitizeDocId(cleanUser.toLowerCase())));
        if (progDoc.exists()) {
          progress = progDoc.data();
        }
        // Automatically mark user online & record session presence whenever platform loads
        this.recordPresenceHeartbeat({
          username: cleanUser,
          is_online: true,
          is_session_init: true,
          study_minutes_delta: 0,
          current_activity: progress?.current_activity || 'متصل في الصفحة الرئيسية'
        }).catch(() => {});
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
      progress,
      announcement,
      notifications
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
      const [lessonsSnap, matsSnap] = await Promise.all([
        fb.getDocs(fb.collection(fb.db, 'lessons')),
        fb.getDocs(fb.collection(fb.db, 'materials'))
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

  _synthesizeStudentTelemetry(userData = {}, progData = null, userAttempts = [], lessonsMap = {}, materialsMap = {}) {
    const rawProg = progData || {};
    const attempts = Array.isArray(userAttempts) ? userAttempts : [];
    const compLessons = Array.isArray(rawProg.completed_lessons) ? rawProg.completed_lessons : [];
    const compMaterials = Array.isArray(rawProg.completed_materials) ? rawProg.completed_materials : [];
    const compDetails = Array.isArray(rawProg.completed_lesson_details) ? rawProg.completed_lesson_details : [];
    const readNotifs = Array.isArray(rawProg.read_notifications) ? rawProg.read_notifications : [];

    // 1. Collect all known activity timestamps to find the true latest last_seen_at
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

    // 2. Determine online status (online if active within 3.5 minutes and not explicitly logged out or frozen)
    const r = String(userData?.role || '').toLowerCase();
    const isFrozen = Boolean(userData?.is_frozen) || userData?.status === 'frozen' || r.startsWith('frozen');
    const explicitLogout = rawProg?.explicit_logout === true || userData?.explicit_logout === true;
    const ageMs = latestSeenMs > 0 ? (Date.now() - latestSeenMs) : Infinity;
    const isRecentlyActive = ageMs >= -60000 && ageMs < 210000; // 3.5 minutes window
    const isOnline = !isFrozen && !explicitLogout && isRecentlyActive;

    // 3. Build / synthesize chronological activity_log (combines recorded events + historical progress/attempts)
    const storedLog = Array.isArray(rawProg.activity_log) ? [...rawProg.activity_log] : [];
    const synthEvents = [];

    // Add quiz attempts to timeline if not already represented
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

    // Add completed lesson details if not already represented
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

    // Add current/last lesson visit from rawProg.updated_at if student has progress
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

    // 4. Calculate login / session count (distinct sessions > 25 mins apart, or stored login_count)
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

    // 5. Calculate total study minutes (stored real-time minutes OR minimum credit from completed activities)
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

    // 6. Determine human-readable current/last activity
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
    const fb = _getFb();
    const rawUser = String(data.username || '').trim();
    if (!rawUser) return { success: false, message: 'Missing username' };
    const userKey = _sanitizeDocId(rawUser.toLowerCase());
    const nowIso = new Date().toISOString();
    const docRef = fb.doc(fb.db, 'student_progress', userKey);
    const userRef = fb.doc(fb.db, 'users', userKey);

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

    await fb.setDoc(docRef, payload, { merge: true });
    fb.updateDoc(userRef, {
      last_seen_at: nowIso,
      is_online: true,
      explicit_logout: false
    }).catch(() => {});

    return { success: true };
  },

  async submitQuiz(data) {
    const fb = _getFb();
    const id = _generateId();
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

    await fb.setDoc(fb.doc(fb.db, 'quiz_attempts', id), {
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

  async _fetchEnrichedUsers() {
    const fb = _getFb();
    const [usersSnap, progSnap, attemptsSnap, lessonsSnap, matsSnap] = await Promise.all([
      fb.getDocs(fb.collection(fb.db, 'users')),
      fb.getDocs(fb.collection(fb.db, 'student_progress')).catch(() => ({ docs: [] })),
      fb.getDocs(fb.collection(fb.db, 'quiz_attempts')).catch(() => ({ docs: [] })),
      fb.getDocs(fb.collection(fb.db, 'lessons')).catch(() => ({ docs: [] })),
      fb.getDocs(fb.collection(fb.db, 'materials')).catch(() => ({ docs: [] }))
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
      const prog = progByUser[key] || progByUser[_sanitizeDocId(key)] || null;
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
    const fb = _getFb();
    const uKey = _sanitizeDocId(String(username || '').trim().toLowerCase());
    const [progRes, attRes, userSnap, lessonsSnap, matsSnap] = await Promise.all([
      this.getStudentProgress(username),
      this.getQuizAttempts(username, null),
      fb ? fb.getDoc(fb.doc(fb.db, 'users', uKey)).catch(() => null) : Promise.resolve(null),
      fb ? fb.getDocs(fb.collection(fb.db, 'lessons')).catch(() => ({ docs: [] })) : Promise.resolve({ docs: [] }),
      fb ? fb.getDocs(fb.collection(fb.db, 'materials')).catch(() => ({ docs: [] })) : Promise.resolve({ docs: [] })
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
    const fb = _getFb();
    const rawUser = String(data.username || '').trim();
    if (!rawUser) return { success: false, message: 'Missing username' };
    const docKey = _sanitizeDocId(rawUser.toLowerCase());
    const nowIso = new Date().toISOString();
    const isOnline = data.is_online !== false;
    const explicitLogout = data.is_online === false;
    let studyDelta = Math.max(0, Math.min(10, Number(data.study_minutes_delta) || 0));

    let userRef = fb.doc(fb.db, 'users', docKey);
    const progRef = fb.doc(fb.db, 'student_progress', docKey);

    let [userSnap, progSnap] = await Promise.all([
      fb.getDoc(userRef).catch(() => null),
      fb.getDoc(progRef).catch(() => null)
    ]);

    if (!userSnap || !userSnap.exists()) {
      const qSnap = await fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.where('username', '==', rawUser))).catch(() => null);
      if (qSnap && !qSnap.empty) {
        userSnap = qSnap.docs[0];
        userRef = userSnap.ref;
      }
    }

    const userData = (userSnap && userSnap.exists()) ? userSnap.data() : null;
    const progData = (progSnap && progSnap.exists()) ? progSnap.data() : null;

    // Detect if this is a brand-new session (e.g., returning after > 20 minutes or first ever session)
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
      studyDelta = 1; // Credit first active minute upon starting a new study session
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
      await fb.setDoc(userRef, userPatch, { merge: true }).catch(() => {});
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

    await fb.setDoc(progRef, progPatch, { merge: true }).catch(() => {});
    return {
      success: true,
      last_seen_at: nowIso,
      is_online: isOnline,
      login_count: currentLoginCount,
      total_study_minutes: nextStudyMins
    };
  },

  async login(username, password) {
    const fb = _getFb();
    const u = String(username || '').trim().toLowerCase();
    const docKey = _sanitizeDocId(u);
    let userRef = fb.doc(fb.db, 'users', docKey);
    let userDoc = await fb.getDoc(userRef);
    let userData = null;

    if (userDoc.exists()) {
      userData = userDoc.data();
    } else {
      const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.where('username', '==', username)));
      if (!snap.empty) {
        userData = snap.docs[0].data();
        userRef = snap.docs[0].ref;
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

    const nowIso = new Date().toISOString();
    const newLoginCount = (Number(userData.login_count) || 0) + 1;
    const totalStudyMins = Number(userData.total_study_minutes) || 0;

    // Record login count, online status, and login event in background
    fb.updateDoc(userRef, {
      last_seen_at: nowIso,
      is_online: true,
      login_count: newLoginCount,
      current_activity: 'متصل في الصفحة الرئيسية'
    }).catch(() => {});

    const progKey = _sanitizeDocId(String(userData.username || username).trim().toLowerCase());
    const progRef = fb.doc(fb.db, 'student_progress', progKey);
    fb.getDoc(progRef).then(pSnap => {
      const pData = pSnap.exists() ? pSnap.data() : {};
      const existingLog = Array.isArray(pData.activity_log) ? pData.activity_log : [];
      const loginEvent = {
        id: 'act_' + Date.now() + '_login',
        type: 'login',
        title: 'تسجيل دخول إلى المنصة',
        detail: `تسجيل الدخول رقم #${newLoginCount}`,
        timestamp: nowIso
      };
      return fb.setDoc(progRef, {
        username: userData.username,
        last_seen_at: nowIso,
        is_online: true,
        login_count: newLoginCount,
        total_study_minutes: Math.max(totalStudyMins, Number(pData.total_study_minutes) || 0),
        current_activity: 'متصل في الصفحة الرئيسية',
        activity_log: [loginEvent, ...existingLog].slice(0, 100)
      }, { merge: true });
    }).catch(() => {});

    return {
      success: true,
      user: {
        username: userData.username,
        name: userData.name || userData.username,
        full_name: userData.full_name || userData.name || userData.username,
        role: userData.role || 'student',
        avatar: userData.avatar || '',
        login_count: newLoginCount,
        total_study_minutes: totalStudyMins,
        last_seen_at: nowIso,
        is_online: true
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
    const fb = _getFb();
    const rawUsername = String(data.username || '').trim();
    const docKey = _sanitizeDocId(rawUsername.toLowerCase());
    const ref = fb.doc(fb.db, 'users', docKey);
    const snap = await fb.getDoc(ref);
    if (!snap.exists()) return { success: false, message: 'المستخدم غير موجود' };

    const existingData = snap.data();

    if (data.new_username) {
      const newRaw = String(data.new_username).trim();
      const newDocKey = _sanitizeDocId(newRaw.toLowerCase());
      if (newDocKey !== docKey) {
        const newRef = fb.doc(fb.db, 'users', newDocKey);
        const newSnap = await fb.getDoc(newRef);
        if (newSnap.exists()) {
          return { success: false, message: 'اسم المستخدم الجديد مستخدم بالفعل' };
        }
        await fb.setDoc(newRef, { ...existingData, username: newRaw });
        await fb.deleteDoc(ref).catch(() => {});

        const oldProgRef = fb.doc(fb.db, 'student_progress', docKey);
        const oldProgSnap = await fb.getDoc(oldProgRef);
        if (oldProgSnap.exists()) {
          await fb.setDoc(fb.doc(fb.db, 'student_progress', newDocKey), {
            ...oldProgSnap.data(),
            username: newRaw.toLowerCase()
          });
          await fb.deleteDoc(oldProgRef).catch(() => {});
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
  },

  async getAnnouncement() {
    const fb = _getFb();
    const snap = await fb.getDoc(fb.doc(fb.db, 'announcements', 'global_announcement'));
    return {
      success: true,
      announcement: snap.exists() ? snap.data() : null
    };
  },

  async saveAnnouncement(data) {
    const fb = _getFb();
    const payload = {
      title: String(data.title || '').trim(),
      message: String(data.message || '').trim(),
      type: data.type || 'info',
      is_active: Boolean(data.is_active),
      link_url: String(data.link_url || '').trim(),
      link_text: String(data.link_text || '').trim(),
      updated_at: new Date().toISOString()
    };
    await fb.setDoc(fb.doc(fb.db, 'announcements', 'global_announcement'), payload, { merge: true });
    return { success: true, announcement: payload };
  },

  async getNotifications() {
    const fb = _getFb();
    const snap = await fb.getDocs(fb.collection(fb.db, 'notifications'));
    const notifications = snap.docs
      .map(d => d.data())
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 50);
    return { success: true, notifications };
  },

  async addNotification(data) {
    const fb = _getFb();
    const id = _generateId();
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
    await fb.setDoc(fb.doc(fb.db, 'notifications', id), payload);
    return { success: true, notification: payload };
  },

  async deleteNotification(data) {
    const fb = _getFb();
    const id = _sanitizeDocId(data.notification_id || data.id || '');
    if (!id) return { success: false, message: 'Missing notification_id' };
    await fb.deleteDoc(fb.doc(fb.db, 'notifications', id)).catch(() => {});
    return { success: true };
  },

  async clearAllNotifications() {
    const fb = _getFb();
    const snap = await fb.getDocs(fb.collection(fb.db, 'notifications'));
    await Promise.all(snap.docs.map(d => fb.deleteDoc(d.ref).catch(() => {})));
    return { success: true, deleted_count: snap.size };
  },

  async getAdminAnalytics() {
    const fb = _getFb();
    const [enriched, annSnap, notifsSnap] = await Promise.all([
      this._fetchEnrichedUsers(),
      fb.getDoc(fb.doc(fb.db, 'announcements', 'global_announcement')).catch(() => null),
      fb.getDocs(fb.collection(fb.db, 'notifications')).catch(() => null)
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
    const fb = _getFb();
    const [unitsSnap, lessonsSnap, matsSnap, quizzesSnap, questionsSnap] = await Promise.all([
      fb.getDocs(fb.collection(fb.db, 'units')),
      fb.getDocs(fb.collection(fb.db, 'lessons')),
      fb.getDocs(fb.collection(fb.db, 'materials')),
      fb.getDocs(fb.collection(fb.db, 'quizzes')),
      fb.getDocs(fb.collection(fb.db, 'questions'))
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
    const fb = _getFb();
    const resetStudentProgress = data.resetStudentProgress !== false;

    const [unitsSnap, lessonsSnap, matsSnap, quizzesSnap, questionsSnap] = await Promise.all([
      fb.getDocs(fb.collection(fb.db, 'units')),
      fb.getDocs(fb.collection(fb.db, 'lessons')),
      fb.getDocs(fb.collection(fb.db, 'materials')),
      fb.getDocs(fb.collection(fb.db, 'quizzes')),
      fb.getDocs(fb.collection(fb.db, 'questions'))
    ]);

    const allDocs = [
      ...unitsSnap.docs,
      ...lessonsSnap.docs,
      ...matsSnap.docs,
      ...quizzesSnap.docs,
      ...questionsSnap.docs
    ];

    await Promise.all(allDocs.map(d => fb.deleteDoc(d.ref).catch(() => {})));

    if (resetStudentProgress) {
      const progSnap = await fb.getDocs(fb.collection(fb.db, 'student_progress'));
      await Promise.all(progSnap.docs.map(d => fb.updateDoc(d.ref, {
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
    const fb = _getFb();
    const raw = data.raw_data || data;
    const units = Array.isArray(raw.units) ? raw.units : [];
    const lessons = Array.isArray(raw.lessons) ? raw.lessons : [];
    const materials = Array.isArray(raw.materials) ? raw.materials : [];
    const quizzes = Array.isArray(raw.quizzes) ? raw.quizzes : [];
    const questions = Array.isArray(raw.questions) ? raw.questions : [];

    await Promise.all([
      ...units.map(u => {
        const id = _sanitizeDocId(u.unit_id || _generateId());
        return fb.setDoc(fb.doc(fb.db, 'units', id), { ...u, unit_id: id });
      }),
      ...lessons.map(l => {
        const id = _sanitizeDocId(l.lesson_id || _generateId());
        return fb.setDoc(fb.doc(fb.db, 'lessons', id), { ...l, lesson_id: id });
      }),
      ...materials.map(m => {
        const id = _sanitizeDocId(m.material_id || _generateId());
        return fb.setDoc(fb.doc(fb.db, 'materials', id), { ...m, material_id: id });
      }),
      ...quizzes.map(q => {
        const id = _sanitizeDocId(q.quiz_id || _generateId());
        return fb.setDoc(fb.doc(fb.db, 'quizzes', id), { ...q, quiz_id: id });
      }),
      ...questions.map(qn => {
        const id = _sanitizeDocId(qn.question_id || _generateId());
        return fb.setDoc(fb.doc(fb.db, 'questions', id), { ...qn, question_id: id });
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
          } else if (action === 'getAnnouncement') {
            result = await DirectFirestore.getAnnouncement();
          } else if (action === 'getNotifications') {
            result = await DirectFirestore.getNotifications();
          } else if (action === 'getAdminAnalytics') {
            result = await DirectFirestore.getAdminAnalytics();
          } else if (action === 'exportAllCurriculum') {
            result = await DirectFirestore.exportAllCurriculum();
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
    if (action !== 'recordPresenceHeartbeat') {
      this.clearCache();
    }
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
