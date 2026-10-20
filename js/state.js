// ============================================
// state.js — Shared application state
// No dependencies on other JS files
// ============================================

const state = {
  user: null,
  units: [],
  lessons: {},       // { unitId: [lesson, ...] }
  materials: {},     // { lessonId: [material, ...] }
  quizzes: {},       // { materialId: quiz }
  questions: {},     // { quizId: [question, ...] }
  progress: null,
  attempts: [],
  currentQuiz: null,
  currentLesson: null,
  adminSection: 'overview',
  students: [],
  allMaterials: [],
  announcement: null,
  dismissedAnnouncementTime: null,
  dragItem: null
};
