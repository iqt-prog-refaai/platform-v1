# Student Activity Analytics & Interactive Lesson Content Protection

Deliver real-time student presence tracking (online/offline status, last seen timestamps, total active study time, login counts, and chronological activity logs) alongside multi-layer content protection for interactive web lessons (Firestore HTML rendering, standalone session auth gates, and dynamic student watermarking with copy deterrence).

### User Review & Critical Decisions

> [!IMPORTANT]
> Below is the summary of your confirmed preferences from our discussion, plus the recommended default for lesson link protection. Click **Proceed** to build this directly, or let me know if you want any adjustments.

- **Confirmed Decision 1 — Student Activity & Usage Metrics**: Track live Online/Offline status and "Last Seen" timestamps, total active study time (in minutes) and login counts, and a detailed chronological timeline of opened lessons, materials, and quiz submissions in the Admin Dashboard.
- **Confirmed Decision 2 — Dynamic Student Watermark & Copy Guard**: Overlay a subtle, non-intrusive repeating watermark displaying the logged-in student's name and username (`Name · @username`) inside interactive lessons, paired with copy/context-menu/source-inspection deterrence.
- **Recommended Default — Dual-Layer Interactive Lesson Protection**: Combine **Firestore HTML Storage (`srcdoc` / Blob rendering)** inside the platform viewer (so there is no public shareable URL inside the iframe) with a **Session & Firestore Auth Gate** inside the standalone `lesson-3-2.html` file (so if anyone opens or shares the direct link outside an authenticated platform session, content is immediately blocked and redirected to the platform login screen).

---

### 1. Overview & Core Concept

- **What It Does**:
  1. **Live Presence & Activity Telemetry**: Automatically records student logins, periodic presence heartbeats while the platform tab or interactive lesson is active, accumulated study duration, and granular learning events (opening a lesson, viewing a material, starting/submitting a quiz).
  2. **Admin Activity Console & Student Drawer**: Upgrades the Admin Users & Overview panels with live Online/Offline indicators, an "Online Now" filter, a comprehensive Student Activity Modal (study time, login count, last seen, and chronological event log), and enriched CSV export columns.
  3. **Interactive Lesson Content Protection**: Protects interactive HTML lessons against unauthorized link sharing and external scraping through embedded session verification, in-memory `srcdoc` rendering, dynamic student identity watermarks, and keyboard/context-menu copy guards.
- **Target Audience / Persona**: Platform administrators monitoring student engagement and protecting proprietary curriculum assets, and registered students accessing interactive lessons seamlessly within their accounts.
- **Key Value**: Gives instructors full visibility into how every student engages with the curriculum while ensuring interactive web lessons cannot be accessed via leaked direct URLs outside the platform.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Automatic Student Heartbeat & Study Timer**:
     - When a student logs in, the platform increments their `login_count`, logs a `login` event, and starts an active study session timer.
     - Every 60 seconds (only while `document.visibilityState === 'visible'`), a lightweight heartbeat updates `last_seen_at`, `current_activity` (e.g., viewing a specific lesson or taking a quiz), and increments `total_study_minutes`.
     - Opening any lesson, material, or quiz records a structured entry in the student's activity timeline.
  2. **Admin Live Presence & Activity Inspection**:
     - In the Admin Users view, summary KPI cards display **Online Now** alongside Total Users, Active Students, and Frozen Accounts.
     - Each student row displays a clear status indicator (`● Online` in emerald when active within the last 3 minutes, or `Last seen: [time ago]` in muted tabular text) plus quick metrics (`Study Time`, `Logins`).
     - Admins can filter the user list by **Online Now** (`متصل الآن`) to see active learners immediately.
     - Clicking **"عرض السجل" (View Record)** opens the enhanced Student Analytics Modal showing:
       - Top KPI strip: **Online/Last Seen Status**, **Total Study Time (mins/hrs)**, **Total Logins**, **Completed Lessons**, and **Average Quiz Score**.
       - **Chronological Activity Timeline**: Filterable stream of the student's recent actions (logins, lessons opened, interactive lessons studied, quizzes submitted with scores) with exact timestamps.
  3. **Protected Interactive Lesson Viewing**:
     - When a student opens an interactive lesson inside the platform, the platform injects their identity (`name`, `username`, and a short-lived session signature) and renders the lesson with a subtle diagonal watermark grid and copy guard.
     - If an unauthenticated visitor opens the direct `.html` URL in a browser tab without an active, non-frozen student/admin session in `localStorage` (verified against Firestore), the page blocks rendering immediately and displays an access-restricted screen with a button to log in on the main platform.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-craft dark/light adaptive EdTech dashboard following the SaaS & Education design constitution—clean hairline borders (`1px solid var(--border)`), single-elevation surfaces, and zero nested card clutter.
  - *Color Palette & Mood*:
    - Dominant neutral canvas (`#0f172a` dark / `#f8fafc` light) with subdued structural glass surfaces.
    - Semantic status tokens paired with explicit text labels: Emerald (`#10b981`) for `متصل الآن (Online)`, Amber (`#f59e0b`) for frozen/warning states, and Indigo (`#6366f1`) for primary actions and study time metrics.
  - *Typography & Hierarchy*:
    - `Tajawal` and `Space Grotesk` for Arabic/English headings and UI controls.
    - `IBM Plex Mono` / `tabular-nums` for all numeric counters, study durations, login counts, percentages, and timestamps so columns align cleanly without layout jitter.
  - *Interactive Feedback & Motion*: Instantaneous filter switching ($\le 150\text{ms}$) and smooth modal transitions using compositor-only `opacity` and `transform` properties.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Visibility-Aware 60-Second Heartbeat over Continuous WebSockets**
  - *Chosen Approach*: Send presence heartbeats to Firestore every 60 seconds only when the browser tab is visible (`document.visibilityState === 'visible'`), plus immediate updates on login, navigation, and logout.
  - *Why*: Works identically on static GitHub Pages and AI Studio without requiring a persistent WebSocket server, prevents inflating study time when a student leaves a tab minimized overnight, and keeps Firestore write operations well within free-tier quotas.
  - *Alternatives Considered*: High-frequency 5-second polling was rejected because it would rapidly exhaust Firestore daily free quota limits.

- **Decision 2: Dual-Layer Content Protection (In-App `srcdoc`/Firestore + Standalone HTML Auth Gate)**
  - *Chosen Approach*: Store the interactive lesson HTML payload inside Firestore (or fetch and inject via `srcdoc` with session context) when viewed inside the platform, AND embed a synchronous pre-render Auth Gate script inside the standalone `lesson-3-2.html` file.
  - *Why*: `srcdoc` hides the file path inside the platform's embedded viewer, while the standalone HTML Auth Gate guarantees that even if someone guesses or shares the GitHub Pages URL (`.../lessons/lesson-3-2.html`), the page refuses to render unless the browser has a valid, non-frozen platform session.
  - *Alternatives Considered*: Server-only HTTP cookie middleware was not used as the sole guard because GitHub Pages serves static files directly without executing Express middleware.

- **Decision 3: Bounded Activity Log Array on `student_progress` + Dedicated Summary Fields**
  - *Chosen Approach*: Store aggregated counters (`last_seen_at`, `login_count`, `total_study_minutes`, `current_activity`, `is_online_flag`) directly on the user/progress document and maintain a bounded list of the latest 100 chronological activity events (`activity_log`) per student.
  - *Why*: Allows the Admin Users list and Student Details modal to load all presence and analytics data in a single fast Firestore read (`<60ms`) without expensive N+1 subcollection queries.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        STUDENT BROWSER SESSION                             │
│                                                                            │
│  ┌──────────────────────┐   ┌───────────────────────┐   ┌───────────────┐  │
│  │ Presence & Study     │   │ Activity Event Logger │   │ Interactive   │  │
│  │ Heartbeat Engine     │   │ (Login / Lesson /     │   │ Lesson Viewer │  │
│  │ (60s Visible Tab)    │   │  Material / Quiz)     │   │ (srcdoc +     │  │
│  └──────────┬───────────┘   └───────────┬───────────┘   │  Watermark +  │  │
│             │                           │               │  Auth Gate)   │  │
└─────────────┼───────────────────────────┼───────────────┴───────┬───────┘  │
              │                           │                       │
              ▼                           ▼                       ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                     FIREBASE FIRESTORE DATA LAYER                          │
│                                                                            │
│  • users/{username}             -> last_seen_at, login_count, study_mins   │
│  • student_progress/{username}  -> activity_log[], current_activity,       │
│                                    completed_lessons, total_study_minutes  │
│  • materials/{materialId}       -> content (path) + html_content (guarded) │
└─────────────────────────────────────────┬──────────────────────────────────┘
                                          │
                                          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         ADMIN ANALYTICS CONSOLE                            │
│                                                                            │
│  ┌──────────────────────┐   ┌───────────────────────┐   ┌───────────────┐  │
│  │ Live Presence KPIs   │   │ Student Activity &    │   │ Enriched CSV  │  │
│  │ & "Online Now"       │   │ Timeline Modal        │   │ Report Export │  │
│  │ User List Filter     │   │ (Study Time + Events) │   │               │  │
│  └──────────────────────┘   └───────────────────────┘   └───────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **User / Student Presence Fields (`users` & `student_progress` documents)**:
    - `last_seen_at`: ISO timestamp updated on login, navigation, and every 60-second active heartbeat.
    - `is_online`: Boolean flag set `true` on active heartbeat and `false` on explicit logout / `pagehide`. (Online status is computed dynamically as `is_online !== false && (Date.now() - Date.parse(last_seen_at)) < 180000`).
    - `login_count`: Integer counter incremented each time `handleLogin` succeeds.
    - `total_study_minutes`: Integer counter incremented by 1 for each active 60-second study heartbeat while viewing platform content or an interactive lesson.
    - `current_activity`: Short descriptive string of what the student is currently doing (e.g., `"يدرس: الدرس 3-2"`, `"يؤدي اختبار: مراجعة الوحدة"`).
    - `activity_log`: Bounded array (up to 100 latest entries) of `{ type: 'login' | 'lesson' | 'material' | 'quiz', title: string, detail: string, timestamp: string }`.

- **Interactive Component & State Mapping**:
  - **Heartbeat & Activity Tracker**:
    - Starts automatically upon login or session restore (`initApp` / `handleLogin`).
    - Hooks into `visibilitychange` and `beforeunload` / `pagehide` to pause time accumulation when the tab is hidden and mark the session offline when closed.
    - Hooks into `openLesson`, `openMaterial`, `startQuiz`, and `submitQuiz` to record real-time `current_activity` and append to `activity_log`.
    - Listens to `window.postMessage` from embedded interactive lessons (`lesson-3-2.html`) so interactions inside the lesson iframe keep the student's heartbeat and study timer active.
  - **Interactive Lesson Auth Gate, Watermark & Copy Guard**:
    - Standalone `lesson-3-2.html` checks `localStorage.getItem('iqt_user')` (and parent window session if embedded) before revealing `document.body`. If missing or frozen, it replaces the document body with an "Access Restricted — Members Only" screen linking back to the platform login page.
    - Injects a fixed, pointer-events-none repeating diagonal watermark layer displaying the student's `name` and `@username` across the lesson viewport.
    - Blocks context menu (`contextmenu`), text-copy shortcuts (`Ctrl+C`, `Ctrl+U`, `Ctrl+S`, `F12` / `Ctrl+Shift+I` outside interactive code-simulator inputs) to deter casual source copying.
  - **Admin Users & Student Record Modal**:
    - Adds an **"Online Now" (`متصل الآن`)** KPI card and filter button in the Users management bar.
    - Displays live Online badge or relative "Last Seen" time, total study duration, and login count on each user card and in the Student Details modal, plus a scrollable **Activity Timeline (`سجل النشاط الزمني`)** tab/section.
