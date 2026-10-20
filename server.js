import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { FirestoreService } from './server-firestore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Body parsers
app.use(express.json({ limit: '25mb' }));
app.use(express.text({ limit: '25mb', type: ['text/plain', 'text/*'] }));

// Health check endpoint for AI Studio runtime
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'firestore' });
});

// Common dispatcher for Firestore actions
async function handleApiAction(action, payload) {
  switch (action) {
    case 'getInitialData':
      return await FirestoreService.getInitialData(payload.username);
    case 'getUnits':
      return await FirestoreService.getUnits();
    case 'addUnit':
      return await FirestoreService.addUnit(payload);
    case 'getLessons':
      return await FirestoreService.getLessons(payload.unitId);
    case 'addLesson':
      return await FirestoreService.addLesson(payload);
    case 'getAllMaterials':
      return await FirestoreService.getAllMaterials();
    case 'getMaterials':
      return await FirestoreService.getMaterials(payload.lessonId);
    case 'addMaterial':
      return await FirestoreService.addMaterial(payload);
    case 'updateMaterialOrder':
      return await FirestoreService.updateMaterialOrder(payload);
    case 'getQuizzes':
      return await FirestoreService.getQuizzes(payload.materialId);
    case 'addQuiz':
      return await FirestoreService.addQuiz(payload);
    case 'getQuestions':
      return await FirestoreService.getQuestions(payload.quizId);
    case 'addQuestion':
      return await FirestoreService.addQuestion(payload);
    case 'importQuiz':
      return await FirestoreService.importQuiz(payload);
    case 'deleteItem':
      return await FirestoreService.deleteItem(payload);
    case 'editItem':
      return await FirestoreService.editItem(payload);
    case 'getStudentProgress':
      return await FirestoreService.getStudentProgress(payload.username);
    case 'updateStudentProgress':
      return await FirestoreService.updateStudentProgress(payload);
    case 'submitQuiz':
      return await FirestoreService.submitQuiz(payload);
    case 'getQuizAttempts':
      return await FirestoreService.getQuizAttempts(payload.username, payload.quizId);
    case 'gradeEssay':
      return await FirestoreService.gradeEssay(payload);
    case 'getAllStudents':
      return await FirestoreService.getAllStudents();
    case 'getAllUsers':
      return await FirestoreService.getAllUsers();
    case 'getStudentDetails':
      return await FirestoreService.getStudentDetails(payload.username);
    case 'login':
      return await FirestoreService.login(payload.username, payload.password);
    case 'addUser':
      return await FirestoreService.addUser(payload);
    case 'updateUser':
      return await FirestoreService.updateUser(payload);
    case 'deleteUser':
      return await FirestoreService.deleteUser(payload);
    case 'freezeUser':
      return await FirestoreService.freezeUser(payload);
    case 'unfreezeUser':
      return await FirestoreService.unfreezeUser(payload);
    case 'getAnnouncement':
      return await FirestoreService.getAnnouncement();
    case 'saveAnnouncement':
      return await FirestoreService.saveAnnouncement(payload);
    case 'getNotifications':
      return await FirestoreService.getNotifications();
    case 'addNotification':
      return await FirestoreService.addNotification(payload);
    case 'deleteNotification':
      return await FirestoreService.deleteNotification(payload);
    case 'clearAllNotifications':
      return await FirestoreService.clearAllNotifications();
    case 'getAdminAnalytics':
      return await FirestoreService.getAdminAnalytics();
    case 'exportAllCurriculum':
      return await FirestoreService.exportAllCurriculum();
    case 'clearAllCurriculum':
      return await FirestoreService.clearAllCurriculum(payload);
    case 'importAllCurriculum':
      return await FirestoreService.importAllCurriculum(payload);
    default:
      return { success: false, message: `Unknown action: ${action}` };
  }
}

// GET /api handler
app.get('/api', async (req, res) => {
  const action = req.query.action;
  if (!action) {
    return res.status(400).json({ success: false, message: 'Missing action parameter' });
  }

  try {
    const result = await handleApiAction(action, req.query);
    res.json(result);
  } catch (err) {
    console.error(`[API GET ${action}] Error:`, err);
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
});

// POST /api handler
app.post('/api', async (req, res) => {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
    }
  }

  const action = body.action || req.query.action;
  if (!action) {
    return res.status(400).json({ success: false, message: 'Missing action parameter' });
  }

  try {
    const result = await handleApiAction(action, body);
    res.json(result);
  } catch (err) {
    console.error(`[API POST ${action}] Error:`, err);
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
});

// Strip accidental trailing slashes on static file extensions (e.g. /lessons/lesson-3-2.html/)
app.use((req, res, next) => {
  if (/\.(html?|pdf)\/+$/i.test(req.path)) {
    const cleanPath = req.path.replace(/\/+$/, '');
    const queryIndex = req.url.indexOf('?');
    req.url = cleanPath + (queryIndex !== -1 ? req.url.slice(queryIndex) : '');
  }
  next();
});

// Serve frontend static files with no-cache headers to prevent stale browser caching
app.use(express.static(__dirname, {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }
}));

// Fallback to index.html for Single Page Application routing
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with Firebase Firestore backend`);
});
