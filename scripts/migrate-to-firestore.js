import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, terminate } from "firebase/firestore";
import fs from "fs";

const GAS_URL = "https://script.google.com/macros/s/AKfycbxN3hqIWJMscT1C0K3KeiNtfo_OMpXpB8NDX23vbZ9CWPGIyk4TsfGZNHPQqrPjbsoeGg/exec";

async function fetchGAS(action, params = {}) {
  const query = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${GAS_URL}?${query}`);
  return await res.json();
}

function sanitizeDocId(id) {
  let s = String(id || '').trim();
  // Firestore forbids IDs starting/ending with __ or containing /
  if (s.startsWith('__')) {
    s = 'u_' + s.replace(/^_+/, '');
  }
  if (s.endsWith('__')) {
    s = s.replace(/_+$/, '') + '_u';
  }
  return s.replace(/\//g, '_') || 'doc_' + Math.random().toString(36).substring(2, 9);
}

async function migrate() {
  console.log("=== Starting Data Migration from Google Sheets to Firebase Firestore ===");

  const config = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf8"));
  const app = initializeApp(config);
  const db = getFirestore(app, config.firestoreDatabaseId);

  // 1. Fetch units, lessons, materials, users, attempts
  console.log("1. Fetching units, lessons, materials, users, attempts...");
  const [unitsRes, lessonsRes, matsRes, usersRes, attemptsRes] = await Promise.all([
    fetchGAS("getUnits"),
    fetchGAS("getLessons"),
    fetchGAS("getAllMaterials"),
    fetchGAS("getAllUsers"),
    fetchGAS("getQuizAttempts")
  ]);

  const units = unitsRes.units || [];
  const lessons = lessonsRes.lessons || [];
  const materials = matsRes.materials || [];
  const users = usersRes.users || [];
  const attempts = attemptsRes.attempts || [];

  console.log(`Retrieved: ${units.length} units, ${lessons.length} lessons, ${materials.length} materials, ${users.length} users, ${attempts.length} attempts.`);

  // 2. Fetch quizzes for all materials
  console.log("2. Fetching quizzes for all materials...");
  const quizzesMap = new Map();
  for (const m of materials) {
    if (!m.material_id) continue;
    try {
      const qRes = await fetchGAS("getQuizzes", { materialId: m.material_id });
      if (qRes.quizzes && qRes.quizzes.length > 0) {
        for (const q of qRes.quizzes) {
          quizzesMap.set(String(q.quiz_id), q);
        }
      }
    } catch (e) {
      console.warn(`Failed getting quizzes for material ${m.material_id}:`, e.message);
    }
  }

  // Also check if any other quizzes exist
  const quizzes = Array.from(quizzesMap.values());
  console.log(`Retrieved ${quizzes.length} unique quizzes.`);

  // 3. Fetch questions for each quiz
  console.log("3. Fetching questions for quizzes...");
  const allQuestions = [];
  for (const q of quizzes) {
    try {
      const qnRes = await fetchGAS("getQuestions", { quizId: q.quiz_id });
      if (qnRes.questions && qnRes.questions.length > 0) {
        console.log(`  Quiz "${q.title}" (${q.quiz_id}): ${qnRes.questions.length} questions`);
        allQuestions.push(...qnRes.questions);
      }
    } catch (e) {
      console.warn(`  Failed getting questions for quiz ${q.quiz_id}:`, e.message);
    }
  }
  console.log(`Total questions retrieved: ${allQuestions.length}`);

  // 4. Write Units
  console.log("Writing units to Firestore...");
  for (const u of units) {
    const id = sanitizeDocId(u.unit_id);
    await setDoc(doc(db, "units", id), {
      unit_id: String(u.unit_id),
      unit_number: Number(u.unit_number) || 0,
      unit_name: u.unit_name || "",
      created_at: u.created_at || new Date().toISOString()
    });
  }

  // 5. Write Lessons
  console.log("Writing lessons to Firestore...");
  for (const l of lessons) {
    const id = sanitizeDocId(l.lesson_id);
    await setDoc(doc(db, "lessons", id), {
      lesson_id: String(l.lesson_id),
      unit_id: String(l.unit_id != null ? l.unit_id : ""),
      lesson_number: Number(l.lesson_number) || 0,
      lesson_name: l.lesson_name || "",
      created_at: l.created_at || new Date().toISOString()
    });
  }

  // 6. Write Materials
  console.log("Writing materials to Firestore...");
  for (const m of materials) {
    const id = sanitizeDocId(m.material_id);
    await setDoc(doc(db, "materials", id), {
      material_id: String(m.material_id),
      lesson_id: String(m.lesson_id != null ? m.lesson_id : ""),
      title: m.title || "",
      type: m.type || "text",
      content: m.content || "",
      order_index: Number(m.order_index) || 0,
      created_at: m.created_at || new Date().toISOString()
    });
  }

  // 7. Write Quizzes
  console.log("Writing quizzes to Firestore...");
  for (const q of quizzes) {
    const id = sanitizeDocId(q.quiz_id);
    await setDoc(doc(db, "quizzes", id), {
      quiz_id: String(q.quiz_id),
      material_id: String(q.material_id != null ? q.material_id : ""),
      title: q.title || "",
      description: q.description || "",
      created_at: q.created_at || new Date().toISOString()
    });
  }

  // 8. Write Questions
  console.log("Writing questions to Firestore...");
  for (const qn of allQuestions) {
    const id = sanitizeDocId(qn.question_id);
    await setDoc(doc(db, "questions", id), {
      question_id: String(qn.question_id),
      quiz_id: String(qn.quiz_id),
      type: qn.type || "mcq",
      question_text: qn.question_text || "",
      options: Array.isArray(qn.options) ? qn.options : (qn.options ? [qn.options] : []),
      correct_answer: qn.correct_answer != null ? qn.correct_answer : "",
      points: Number(qn.points) || 1,
      order_index: Number(qn.order_index) || 0,
      explanation: qn.explanation || ""
    });
  }

  // 9. Write Users
  console.log("Writing users to Firestore...");
  for (const u of users) {
    const rawUsername = String(u.username || "").trim();
    if (!rawUsername) continue;
    const docKey = sanitizeDocId(rawUsername.toLowerCase());
    await setDoc(doc(db, "users", docKey), {
      username: rawUsername,
      name: u.name || rawUsername,
      full_name: u.full_name || u.name || rawUsername,
      password: u.password || "",
      role: u.role || "student",
      avatar: u.avatar || "",
      status: u.status || "active",
      is_frozen: !!u.is_frozen,
      created_at: u.created_at || new Date().toISOString()
    });
  }

  // 10. Write Quiz Attempts
  console.log("Writing quiz attempts to Firestore...");
  for (const a of attempts) {
    const id = sanitizeDocId(a.attempt_id);
    await setDoc(doc(db, "quiz_attempts", id), {
      attempt_id: String(a.attempt_id),
      username: String(a.username || "").toLowerCase(),
      quiz_id: String(a.quiz_id || ""),
      material_id: String(a.material_id || ""),
      answers: typeof a.answers === "object" ? a.answers : {},
      score: Number(a.score) || 0,
      max_score: Number(a.max_score) || 0,
      is_graded: typeof a.is_graded === "boolean" ? a.is_graded : a.is_graded === "true",
      graded_by: a.graded_by || "",
      feedback: a.feedback || "",
      attempt_date: a.attempt_date || new Date().toISOString()
    });
  }

  console.log("=== Migration Successfully Completed! All data is now in Firestore ===");
  await terminate(db);
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
