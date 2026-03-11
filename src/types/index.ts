export interface Message {
  role: 'user' | 'assistant';
  content: string;
  image?: string | null;
  generatedImage?: string | null;
  /** Attached AI-generated exam — rendered as a special card with a "Làm bài" button */
  aiExam?: AIExamData | null;
}

export interface AIExamQuestion {
  id: number;
  part: 'reading' | 'nlxh' | 'nlvh';
  points: number;
  prompt: string;
  hint?: string;
}

export interface AIExamData {
  type: 'reading' | 'writing' | 'full';
  title: string;
  durationMinutes: number;
  passage?: string | null;
  source?: string | null;
  questions: AIExamQuestion[];
}

// Legacy compatibility alias
export interface UserData {
  level: string;
  status: string;
  progress: number;
  xp: number;
  streak: number;
  daysLeft: number;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  targetScore: number | null;
  voiceGender: 'male' | 'female';
  isOnboarded: boolean;
  /** true only after diagnostic assessment (MCQ quiz or exam) is fully complete */
  assessmentDone: boolean;
  diagnosticScore?: number | null;
  /** Running average score across all submitted exams */
  avgScore: number | null;
  /** Number of exams submitted (for computing running average) */
  submissionCount: number;
  /** Recurring weaknesses detected by AI, sorted by frequency */
  weaknesses: string[];
  /** Strengths detected by AI */
  strengths: string[];
  level: string;
  xp: number;
  streak: number;
  progress: number;
  /**
   * Tracks consecutive submissions where each weakness did NOT appear.
   * When cleanStreak >= 2 for a weakness, it is auto-removed from `weaknesses`.
   * Resets to 0 if the weakness reappears in a new submission.
   */
  weaknessCleanStreak?: Record<string, number>;
  /** Lesson progress per lesson key (e.g. "s1-b2") */
  lessonProgress?: Record<string, LessonProgress>;
  /** Recent chat messages saved for persistent AI memory */
  chatMemory?: Message[];
  /** User personality traits extracted by AI every 20 chat turns */
  userTraits?: string[];
  /** Currently active lesson (if any) - saved to resume learning */
  activeLesson?: {
    sectionId: string;
    lessonId: string;
  } | null;
}

export interface LessonProgress {
  status: 'not_started' | 'in_progress' | 'completed';
  /** Total sections in the DOCX content */
  sectionsTotal: number;
  /** Sections the student has been taught so far */
  sectionsDone: number;
  /** Current section index being taught (0-based, for resuming) */
  currentSectionIndex?: number;
  /** Practice questions asked during the lesson */
  questionsAsked: number;
  /** Practice questions answered correctly */
  questionsCorrect: number;
}

export interface ExamError {
  quote: string;        // exact student text that has issue
  issue: string;        // e.g. "Thiếu dẫn chứng cụ thể"
  suggestion: string;   // rewrite suggestion
}

export interface ExamGrade {
  score: number;
  maxScore: number;
  feedback: string;       // 2-3 sentence summary
  details: string;        // per-section breakdown
  errors: ExamError[];    // specific error blocks
  improvements: string[]; // rewrite suggestions
  weaknesses: string[];   // weakness tags for profile
  strengths: string[];    // strength tags for profile
}

export interface ExamSubmission {
  id?: string;
  examId: number;
  studentAnswer: string;
  status: 'pending' | 'graded';
  cheating?: boolean;
  createdAt?: unknown;
  gradedAt?: unknown;
  grade?: ExamGrade;
}
