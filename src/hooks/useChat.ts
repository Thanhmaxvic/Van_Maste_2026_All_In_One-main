import { useState, useRef, useEffect, useCallback } from 'react';
import type { Message } from '../types';
import type { ExamGrade } from '../types';
import type { AIExamData } from '../types';
import {
    EXAM_DATE,
    DAILY_QUOTE,
    DIAGNOSTIC_QUIZ_PROMPT,
    ONBOARDING_WELCOME_TEMPLATE,
    PRONOUN_MAP,
    PROACTIVE_PROMPT,
    QUIZ_GENERATION_PROMPT,
    LESSON_TEACH_PROMPT,
    USER_TRAITS_PROMPT,
} from '../constants';
import {
    sendChatMessage,
    rewriteText,
    generateDiagnosticQuiz,
    isApiKeyConfigured,
    sendProactiveMessage,
    generateDiagnosticMCQ,
    generateInfographic,
    sendGradingRequest,
} from '../services/geminiApi';
import type { DiagnosticQuizData } from '../services/geminiApi';
import type { TimelineItem } from '../types';
import { playTTS, queueTTS, stopCurrentAudio } from '../services/ttsService';
import { useAuth } from '../context/AuthContext';
import { saveTargetScore, saveChatMemory, saveUserTraits, updateLessonProgress, saveActiveLesson, clearActiveLesson, updateUserProfile, getSystemConfig } from '../services/firebaseService';
import { findLesson, getLessonKey } from '../constants/curriculum';
import { fetchDocxAsText, estimateSectionCount, buildLessonContext } from '../services/examService';

function extractScore(text: string): number | null {
    const match = text.match(/\b(\d+(?:[.,]\d+)?)\b/);
    if (!match) return null;
    const num = parseFloat(match[1].replace(',', '.'));
    return isNaN(num) ? null : num;
}

function buildTeaseMessage(score: number, pronoun: string): string {
    const P = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);
    if (score > 10) {
        return `Thang điểm chỉ 0–10 thôi em ơi, ${score} điểm là vượt quá rồi. Em nhập lại nhé!`;
    }
    if (score < 5) {
        return `${P} nghĩ em có thể làm tốt hơn ${score} điểm. Đặt mục tiêu từ 5 trở lên nhé!`;
    }
    return '';
}

// ─── Quiz state machine ─────────────────────────────────────────────────────
type QuizPhase = 'idle' | 'reading' | 'questioning' | 'done';

interface QuizState {
    phase: QuizPhase;
    data: DiagnosticQuizData | null;
    currentQ: number;        // 0-based
    userAnswers: string[];   // 'a'|'b'|'c'|'d'
}

const QUIZ_INIT: QuizState = { phase: 'idle', data: null, currentQ: 0, userAnswers: [] };

// ─── Hook ────────────────────────────────────────────────────────────────────
export interface PracticeState {
    hasContent: boolean;
    activeType: 'graphic' | 'quiz' | 'exam' | null;
    quizState: {
        phase: 'idle' | 'loading' | 'reading' | 'questioning' | 'done';
        data: DiagnosticQuizData | null;
        currentQ: number;
        userAnswers: string[];
    };
    examState: {
        awaitingTypeChoice: boolean;
        activeExam: AIExamData | null;
        isLoading: boolean;
    };
    graphicState: {
        isLoading: boolean;
        prompt: string;
        imageUrl: string | null;
        history: { prompt: string; url: string }[];
    };
}

export function useChat(
    onStartDiagnosticExam?: () => void,
    onPracticeTrigger?: (type: 'graphic' | 'quiz' | 'exam') => void
) {
    const { user, userProfile, setUserProfile } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isRewriting, setIsRewriting] = useState(false);
    const [isDiagnosing, setIsDiagnosing] = useState(false);
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [awaitingScore, setAwaitingScore] = useState(false);
    const [awaitingTestChoice, setAwaitingTestChoice] = useState(false);
    const [awaitingExamTypeChoice, setAwaitingExamTypeChoice] = useState(false);
    const [quizState, setQuizState] = useState<QuizState>(QUIZ_INIT);
    const [awaitingTaskInterrupt, setAwaitingTaskInterrupt] = useState(false);
    const pendingInterruptMsgRef = useRef<string>('');

    const [practiceState, setPracticeState] = useState<PracticeState>({
        hasContent: false,
        activeType: null,
        quizState: { phase: 'idle', data: null, currentQ: 0, userAnswers: [] },
        examState: { awaitingTypeChoice: false, activeExam: null, isLoading: false },
        graphicState: { isLoading: false, prompt: '', imageUrl: null, history: [] }
    });

    const loadSecondaryQuiz = useCallback(async () => {
        setPracticeState(prev => ({
            ...prev,
            quizState: { ...prev.quizState, phase: 'loading' }
        }));
        try {
            const data = await generateDiagnosticMCQ(QUIZ_GENERATION_PROMPT, abortControllerRef.current?.signal);
            if (!data) {
                setPracticeState(prev => ({
                    ...prev,
                    quizState: { ...prev.quizState, phase: 'idle' }
                }));
                return;
            }
            setPracticeState(prev => ({
                ...prev,
                quizState: { phase: 'reading', data, currentQ: 0, userAnswers: [] }
            }));
        } catch (err) {
            console.error('Secondary Quiz generation error:', err);
            setPracticeState(prev => ({
                ...prev,
                quizState: { ...prev.quizState, phase: 'idle' }
            }));
        }
    }, []);

    const loadSecondaryExam = useCallback(async (choice: string) => {
        let examType: 'reading' | 'writing' | 'full';
        if (choice === 'b') examType = 'writing';
        else if (choice === 'c') examType = 'full';
        else examType = 'reading';

        setPracticeState(prev => ({
            ...prev,
            examState: { ...prev.examState, awaitingTypeChoice: false, isLoading: true }
        }));

        try {
            const { buildExamFromPool } = await import('../services/examPoolService');
            const exam = await buildExamFromPool(examType, abortControllerRef.current?.signal);
            if (!exam) {
                setPracticeState(prev => ({
                    ...prev,
                    examState: { ...prev.examState, isLoading: false }
                }));
                return;
            }
            setPracticeState(prev => ({
                ...prev,
                examState: { awaitingTypeChoice: false, activeExam: exam, isLoading: false }
            }));
        } catch (err) {
            console.error('Secondary exam generation error:', err);
            setPracticeState(prev => ({
                ...prev,
                examState: { ...prev.examState, isLoading: false }
            }));
        }
    }, []);

    const loadSecondaryGraphic = useCallback(async (topic: string) => {
        setPracticeState(prev => ({
            ...prev,
            graphicState: { ...prev.graphicState, isLoading: true, prompt: topic, imageUrl: null }
        }));
        try {
            const imgUrl = await generateInfographic(topic, abortControllerRef.current?.signal);
            if (imgUrl) {
                setPracticeState(prev => ({
                    ...prev,
                    graphicState: {
                        isLoading: false,
                        prompt: topic,
                        imageUrl: imgUrl,
                        history: [{ prompt: topic, url: imgUrl }, ...prev.graphicState.history].slice(0, 10)
                    }
                }));
            } else {
                setPracticeState(prev => ({
                    ...prev,
                    graphicState: { ...prev.graphicState, isLoading: false }
                }));
            }
        } catch (err) {
            console.error('Graphic generation error:', err);
            setPracticeState(prev => ({
                ...prev,
                graphicState: { ...prev.graphicState, isLoading: false }
            }));
        }
    }, []);

    const startSecondaryGraphicDirect = useCallback((topic?: string) => {
        setPracticeState(prev => ({
            ...prev,
            hasContent: true,
            activeType: 'graphic',
            graphicState: { ...prev.graphicState, imageUrl: null }
        }));
        if (topic) {
            loadSecondaryGraphic(topic);
        }
    }, [loadSecondaryGraphic]);

    const startSecondaryQuizDirect = useCallback(() => {
        setPracticeState(prev => ({
            ...prev,
            hasContent: true,
            activeType: 'quiz',
            quizState: { phase: 'loading', data: null, currentQ: 0, userAnswers: [] }
        }));
        loadSecondaryQuiz();
    }, [loadSecondaryQuiz]);

    const startSecondaryExamDirect = useCallback(() => {
        setPracticeState(prev => ({
            ...prev,
            hasContent: true,
            activeType: 'exam',
            examState: { awaitingTypeChoice: true, activeExam: null, isLoading: false }
        }));
    }, []);

    const answerSecondaryQuiz = useCallback(async (answer: string) => {
        setPracticeState(prev => {
            const { quizState } = prev;
            if (quizState.phase !== 'questioning' || !quizState.data) return prev;

            const newAnswers = [...quizState.userAnswers, answer];
            const nextQ = quizState.currentQ + 1;

            if (nextQ >= 10) {
                // Submit asynchronously in background
                let correct = 0;
                quizState.data.questions.forEach((q, i) => {
                    if ((newAnswers[i] || '').toLowerCase() === q.correct) correct++;
                });
                const rawScore = +(correct / 10 * 10).toFixed(1);
                const score = Math.min(rawScore, 9.5);

                if (user) {
                    const studentRef = quizState.data.questions.map((q, i) => {
                        const userAns = newAnswers[i]?.toLowerCase() || '?';
                        return `Câu ${i + 1}: ${q.q}\n- Đáp án em chọn: ${userAns.toUpperCase()}\n- Đáp án đúng: ${q.correct.toUpperCase()}`;
                    }).join('\n\n');

                    import('../services/firebaseService').then(async ({ saveExamSubmission, updateSubmissionPendingGrade, completeAssessment }) => {
                        const subId = await saveExamSubmission(user.uid, 8888, `[BÀI TRẮC NGHIỆM AI - TAB THỰC HÀNH]\n\n${studentRef}`);
                        const aiGrade = {
                            score,
                            maxScore: 10,
                            feedback: `Bài trắc nghiệm tab Thực hành: Đúng ${correct}/10 câu.`,
                            details: 'Chấm trắc nghiệm tự động',
                            errors: [], improvements: [], weaknesses: [], strengths: []
                        };
                        await updateSubmissionPendingGrade(user.uid, subId, aiGrade);
                        await completeAssessment(user.uid, score);
                    }).catch(console.error);

                    setUserProfile(p => p ? {
                        ...p,
                        diagnosticScore: score,
                        assessmentDone: true,
                        isOnboarded: true,
                    } : p);
                }

                return {
                    ...prev,
                    quizState: { ...quizState, userAnswers: newAnswers, phase: 'done' }
                };
            } else {
                return {
                    ...prev,
                    quizState: { ...quizState, userAnswers: newAnswers, currentQ: nextQ }
                };
            }
        });
    }, [user, setUserProfile]);

    const clearPracticeState = useCallback(() => {
        setPracticeState({
            hasContent: false,
            activeType: null,
            quizState: { phase: 'idle', data: null, currentQ: 0, userAnswers: [] },
            examState: { awaitingTypeChoice: false, activeExam: null, isLoading: false },
            graphicState: { isLoading: false, prompt: '', imageUrl: null, history: [] }
        });
    }, []);


    // Synchronous "busy" tracking — refs update immediately, unlike React state
    const busyRef = useRef(false);
    const lastTaskEndRef = useRef(0); // timestamp of last task completion
    const TASK_COOLDOWN_MS = 3000; // cooldown window to catch rapid requests
    const abortControllerRef = useRef<AbortController | null>(null);

    const abortCurrentTask = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        busyRef.current = false;
        setIsLoading(false);
        setAwaitingTaskInterrupt(false);
    }, []);

    /** Call instead of setIsLoading(true) — updates both state and synchronous ref */
    const startBusy = useCallback(() => {
        busyRef.current = true;
        setIsLoading(true);
        abortControllerRef.current = new AbortController();
    }, []);

    /** Call instead of setIsLoading(false) — updates state, ref, and records timestamp */
    const endBusy = useCallback(() => {
        busyRef.current = false;
        lastTaskEndRef.current = Date.now();
        setIsLoading(false);
        abortControllerRef.current = null;
    }, []);

    // ── Lesson mode state ─────────────────────────────────────────────────────────
    const [activeLesson, setActiveLesson] = useState<{
        sectionId: string; lessonId: string; docxContent: string;
    } | null>(null);
    const chatTurnCountRef = useRef(0);
    /** Stores the correct answer letter (A/B/C/D) for the current [LESSON_MCQ] question.
     *  Set when AI sends a [LESSON_MCQ] block, cleared after student answers. */
    const lessonMcqAnswerRef = useRef<string | null>(null);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Proactive agent timer
    const proactiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const proactiveBlockedRef = useRef(false); // prevent double-fire

    const voiceGenderRef = useRef(userProfile?.voiceGender || 'male');
    useEffect(() => {
        voiceGenderRef.current = userProfile?.voiceGender || 'male';
    }, [userProfile?.voiceGender]);

    const voiceGender = userProfile?.voiceGender || 'male';
    const pronoun = PRONOUN_MAP[voiceGender];

    // ── Swap pronouns in existing messages when voice gender changes ────────
    const prevGenderRef = useRef(voiceGender);
    useEffect(() => {
        if (prevGenderRef.current === voiceGender) return;
        const oldPronoun = PRONOUN_MAP[prevGenderRef.current];
        const newPronoun = PRONOUN_MAP[voiceGender];
        const OldPronoun = oldPronoun.charAt(0).toUpperCase() + oldPronoun.slice(1);
        const NewPronoun = newPronoun.charAt(0).toUpperCase() + newPronoun.slice(1);
        prevGenderRef.current = voiceGender;

        setMessages(prev => prev.map(msg => {
            if (msg.role !== 'assistant') return msg;
            let c = msg.content;
            // Replace lowercase (thầy → cô or vice versa)
            c = c.split(oldPronoun).join(newPronoun);
            // Replace capitalized (Thầy → Cô or vice versa)
            c = c.split(OldPronoun).join(NewPronoun);
            return c === msg.content ? msg : { ...msg, content: c };
        }));
    }, [voiceGender]);

    const playNotification = useCallback(() => {
        try {
            const audio = new Audio('/audio/chat.mp3');
            audio.volume = 0.6;
            // Fire and forget; ignore autoplay errors
            void audio.play().catch(() => { });
        } catch {
            // ignore
        }
    }, []);

    const autoSpeak = useCallback((text: string) => {
        queueTTS(text, voiceGenderRef.current, () => setIsPlayingAudio(true), () => setIsPlayingAudio(false));
    }, []);

    // ── Greeting (text + TTS on every page load) ─────────────────────────────
    const initDoneRef = useRef(false);
    useEffect(() => {
        if (!userProfile) return;
        if (initDoneRef.current) return;
        initDoneRef.current = true;

        let timerId: ReturnType<typeof setTimeout>;
        let cancelled = false;

        (async () => {
            // Đọc ngày thi từ cấu hình hệ thống (admin đặt trong trang quản trị) thay vì hardcode
            let examDateStr = EXAM_DATE;
            try {
                const sysConfig = await getSystemConfig();
                if (sysConfig.examDate) examDateStr = sysConfig.examDate as string;
            } catch { /* fallback to constant */ }
            if (cancelled) return;

            const examDate = new Date(examDateStr);
            const diff = Math.ceil((examDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
            const pr = PRONOUN_MAP[userProfile.voiceGender || 'male'];

            // Determine onboarding state on load:
            // a) Never set up target → full onboarding
            // b) Has target but assessment not done → resume A/B choice
            // c) Fully onboarded → check for active lesson to resume
            if (!userProfile.targetScore) {
                setAwaitingScore(true);
                const welcome = ONBOARDING_WELCOME_TEMPLATE(userProfile.name, pr);
                timerId = setTimeout(() => {
                    setMessages([{ role: 'assistant', content: welcome }]);
                    playNotification();
                    autoSpeak(welcome);
                }, 800);
            } else if (!userProfile.assessmentDone) {
                // Resume: target saved but assessment not yet done
                setAwaitingTestChoice(true);
                const resumeMsg = `Chào ${userProfile.name}! Em đã đặt mục tiêu ${userProfile.targetScore}/10 rồi.
${pr} cần đánh giá năng lực của em trước khi bắt đầu. Em chọn:

A. Làm bài kiểm tra đề thi thật (120 phút)
B. Trả lời 10 câu trắc nghiệm nhanh`;
                timerId = setTimeout(() => {
                    setMessages([{ role: 'assistant', content: resumeMsg, quickReplies: ['A', 'B'] }]);
                    playNotification();
                    autoSpeak(resumeMsg);
                }, 800);
            } else {
                // Fully onboarded user - don't push text messages so the Welcome Screen stays visible.
                // We just play the audio greeting if needed.
                const returning = `Chào ${userProfile.name}! Còn ${diff} ngày nữa là thi. Hôm nay em muốn ôn gì?`;
                timerId = setTimeout(() => {
                    playNotification();
                    autoSpeak(returning);
                }, 800);
            }
        })();

        return () => {
            cancelled = true;
            clearTimeout(timerId!);
        };
    }, [userProfile?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Load chat memory from Firebase on mount ────────────────────────────
    // Note: Chat memory is loaded when resuming lesson, not here
    // to avoid conflicts with greeting flow

    // ── Save chat memory to Firebase (debounced) ──────────────────────────
    const memorySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!user || messages.length === 0) return;
        if (memorySaveTimerRef.current) clearTimeout(memorySaveTimerRef.current);
        memorySaveTimerRef.current = setTimeout(() => {
            const last15 = messages.slice(-15);
            saveChatMemory(user.uid, last15).catch(console.error);
        }, 3000); //  debounce 3s
        return () => { if (memorySaveTimerRef.current) clearTimeout(memorySaveTimerRef.current); };
    }, [messages, user]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Proactive agent ───────────────────────────────────────────────────────
    const resetProactiveTimer = useCallback((currentMessages: Message[]) => {
        if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);
        // Only activate when onboarded + at least 2 msgs + no special mode active
        if (!userProfile?.isOnboarded) return;
        if (currentMessages.length < 2) return;

        const lastMsg = currentMessages[currentMessages.length - 1];
        let dynamicDelayMs = 35_000; // Thời gian chờ mặc định: 35 giây — tiết kiệm token
        
        if (lastMsg && lastMsg.role === 'assistant') {
            // Tốc độ đọc trung bình: 32 ký tự / giây.
            const readingTimeSeconds = lastMsg.content.length / 32;
            dynamicDelayMs += Math.round(readingTimeSeconds * 1000);
        }
        
        // Giới hạn thời gian chờ tối đa (VD: 3 phút) để không bắt học sinh chờ quá lâu
        const finalDelayMs = Math.min(dynamicDelayMs, 180_000);

        proactiveTimerRef.current = setTimeout(async () => {
            if (proactiveBlockedRef.current) return;
            proactiveBlockedRef.current = true;
            const question = await sendProactiveMessage(currentMessages, PROACTIVE_PROMPT, PRONOUN_MAP[voiceGenderRef.current]);
            proactiveBlockedRef.current = false;
            if (question) {
                setMessages(p => [...p, { role: 'assistant', content: question }]);
                playNotification();
            }
        }, finalDelayMs);
    }, [userProfile?.isOnboarded]);

    // Clean up timer and stop all audio on unmount
    useEffect(() => () => {
        if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);
        stopCurrentAudio();
    }, []);

    const handlePlayTTS = (text: string) => {
        playTTS(text, voiceGenderRef.current, () => setIsPlayingAudio(true), () => setIsPlayingAudio(false));
    };

    // ── addAssistantMsg helper ────────────────────────────────────────────────
    const addAssistant = useCallback((content: string, speak = true, extras?: Partial<Message>) => {
        setMessages(p => {
            const next = [...p, { role: 'assistant' as const, content, ...extras }];
            resetProactiveTimer(next);
            return next;
        });
        playNotification();
        if (speak) autoSpeak(content);
    }, [autoSpeak, resetProactiveTimer, playNotification]);

    // ── Quiz: show passage and reading prompt ─────────────────────────────────
    const startInlineQuiz = useCallback(async () => {
        startBusy();
        addAssistant(`Đợi ${pronoun} chọn một đoạn trích nhé...`);
        try {
            const data = await generateDiagnosticMCQ(QUIZ_GENERATION_PROMPT, abortControllerRef.current?.signal);
            endBusy();
            if (!data) {
                addAssistant('Lỗi tạo câu hỏi. Em thử lại sau nhé.');
                return;
            }
            setQuizState({ phase: 'reading', data, currentQ: 0, userAnswers: [] });
            const msg = `📖 **${data.source}**\n\n${data.passage}\n\n---\nSau khi đọc kĩ văn bản, ${pronoun} sẽ bắt đầu hỏi. Hãy đọc thật kĩ nhé!`;
            addAssistant(msg, true, { quickReplies: ['Bắt đầu', 'Từ chối'] });
        } catch (err: any) {
            endBusy();
            if (err.name !== 'AbortError') {
                addAssistant('Lỗi tạo câu hỏi. Em thử lại sau nhé.');
            }
        }
    }, [addAssistant, pronoun]);

    // ── Quiz: ask next question (with clickable options) ──────────────────────
    const askQuizQuestion = useCallback((data: DiagnosticQuizData, qIndex: number) => {
        const q = data.questions[qIndex];
        const questionText = `Câu ${qIndex + 1}/10: ${q.q}`;
        setMessages(p => {
            const next = [...p, {
                role: 'assistant' as const,
                content: questionText,
                quizOptions: { a: q.a, b: q.b, c: q.c, d: q.d },
                quizQuestionIndex: qIndex,
            }];
            resetProactiveTimer(next);
            return next;
        });
        playNotification();
        autoSpeak(questionText);
    }, [resetProactiveTimer, playNotification, autoSpeak]);

    // ── Quiz: show final result ───────────────────────────────────────────────
    const finishQuiz = useCallback(async (data: DiagnosticQuizData, answers: string[]) => {
        let correct = 0;
        const lines: string[] = ['📊 Kết quả bài kiểm tra:\n'];
        data.questions.forEach((q, i) => {
            const userAns = answers[i]?.toLowerCase() || '?';
            const isRight = userAns === q.correct;
            if (isRight) correct++;
            const label = (k: string) => ({ a: 'A', b: 'B', c: 'C', d: 'D' }[k] || k);
            lines.push(`${i + 1}. ${isRight ? '✅ Đúng' : '❌ Sai'} — Em chọn ${label(userAns)} — Đáp án: ${label(q.correct)}`);
        });
        const pct = Math.round((correct / 10) * 100);
        const rawScore = +(correct / 10 * 10).toFixed(1);
        // Cap at 9.5 to match exam grading standard (no perfect 10)
        const score = Math.min(rawScore, 9.5);
        lines.push(`\nTổng: ${correct}/10 (${pct}%)`);
        if (pct >= 80) lines.push(`Năng lực đọc hiểu tốt — ${pronoun} sẽ đặt lộ trình nâng cao.`);
        else if (pct >= 60) lines.push('Năng lực ở mức trung bình — lộ trình chuẩn sẽ phù hợp.');
        else lines.push(`Em cần củng cố kiến thức nền — ${pronoun} sẽ đồng hành từ đầu.`);


        setQuizState(QUIZ_INIT);
        addAssistant(lines.join('\n') + `\n\n📌 Bài trắc nghiệm của em đã được gửi để Giáo viên duyệt điểm. Điểm chính thức sẽ được cộng sau khi được chấp nhận.`);

        // Đợi duyệt thay vì cộng điểm ngay lập tức.
        if (user) {
            // Chuẩn bị nội dung bài nộp mô phỏng cho trắc nghiệm
            const studentRef = data.questions.map((q, i) => {
                const userAns = answers[i]?.toLowerCase() || '?';
                return `Câu ${i + 1}: ${q.q}\n- Đáp án em chọn: ${userAns.toUpperCase()}\n- Đáp án đúng: ${q.correct.toUpperCase()}`;
            }).join('\n\n');

            import('../services/firebaseService').then(async ({ saveExamSubmission, updateSubmissionPendingGrade, completeAssessment }) => {
                const subId = await saveExamSubmission(user.uid, 8888, `[BÀI TRẮC NGHIỆM AI]\n\n${studentRef}`);
                const aiGrade = {
                    score,
                    maxScore: 10,
                    feedback: `Bài trắc nghiệm chẩn đoán: Đúng ${correct}/10 câu.`,
                    details: 'Chấm trắc nghiệm tự động',
                    errors: [], improvements: [], weaknesses: [], strengths: []
                };
                await updateSubmissionPendingGrade(user.uid, subId, aiGrade);
                await completeAssessment(user.uid, score);
            }).catch(console.error);

            setUserProfile(p => p ? {
                ...p,
                diagnosticScore: score,
                assessmentDone: true,
                isOnboarded: true,
            } : p);
        }
    }, [user, setUserProfile, addAssistant]);

    // ── Main send handler ─────────────────────────────────────────────────────
    const handleSend = async (override?: string) => {
        const val = (override || input).trim();
        if (!val && !previewImage) return;

        // ── If AI is busy or just finished a task, ask user before starting a new one ───
        const isBusy = busyRef.current || isLoading;
        const isRecentlyFinished = Date.now() - lastTaskEndRef.current < TASK_COOLDOWN_MS;

        if ((isBusy || isRecentlyFinished) && !awaitingTaskInterrupt) {
            pendingInterruptMsgRef.current = val;
            setAwaitingTaskInterrupt(true);
            const Pronoun = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);
            const statusText = isBusy
                ? `${Pronoun} đang xử lý yêu cầu trước đó`
                : `${Pronoun} vừa xử lý xong yêu cầu trước`;
            setMessages(p => [
                ...p,
                { role: 'user' as const, content: val },
                {
                    role: 'assistant' as const,
                    content: `${statusText}. Em có muốn ${pronoun} tiếp tục không hay xử lý yêu cầu mới của em?\n\n**A.** Có, tiếp tục\n**B.** Không, xử lý yêu cầu mới`,
                },
            ]);
            setInput('');
            stopCurrentAudio();
            return;
        }

        // ── Handle task interrupt choice ───────────────────────────────────
        if (awaitingTaskInterrupt) {
            const choice = val.trim().toUpperCase().slice(0, 1);
            setAwaitingTaskInterrupt(false);
            if (choice === 'A' || /có|chờ|đợi|tiếp/i.test(val)) {
                // User wants to continue current task
                addAssistant(`Được rồi, em đợi ${pronoun} xử lý xong nhé!`);
                setInput('');
                return;
            }
            // User wants to switch — cancel current task
            busyRef.current = false;
            lastTaskEndRef.current = 0;
            setIsLoading(false); // This one should remain setIsLoading(false)
            const savedMsg = pendingInterruptMsgRef.current;
            pendingInterruptMsgRef.current = '';
            // Process the pending message as a new request
            if (savedMsg) {
                setInput('');
                // Use setTimeout to ensure state is settled before re-processing
                setTimeout(() => handleSend(savedMsg), 50);
                return;
            }
        }

        if (isLoading) return;

        const userMsg: Message = { role: 'user', content: val, image: previewImage };
        setMessages(p => [...p, userMsg]);
        setInput('');
        setPreviewImage(null);

        // Stop any playing TTS when user sends a message
        stopCurrentAudio();
        setIsPlayingAudio(false);

        // Reset proactive timer on user activity
        if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);

        // ── Onboarding: awaiting target score ────────────────────────────────
        if (awaitingScore) {
            const score = extractScore(val);
            if (score === null) {
                const resp = `${PRONOUN_MAP[voiceGender].charAt(0).toUpperCase() + PRONOUN_MAP[voiceGender].slice(1)} chưa hiểu, em nhập một số từ 5 đến 10 nhé.`;
                addAssistant(resp);
                return;
            }
            const tease = buildTeaseMessage(score, pronoun);
            if (tease) { addAssistant(tease); return; }

            if (user) {
                await saveTargetScore(user.uid, score);
                setUserProfile(prev => prev ? { ...prev, targetScore: score, isOnboarded: true } : prev);
            }
            setAwaitingScore(false);
            setAwaitingTestChoice(true);

            const p = pronoun;
            const confirmMsg = `Mục tiêu ${score}/10 đã lưu.\n\nĐể ${p} biết năng lực hiện tại của em, em muốn thử cách nào?\n\n**A.** Làm bài kiểm tra đề thi thật (120 phút)\n**B.** Trả lời 10 câu trắc nghiệm nhanh`;
            addAssistant(confirmMsg);
            return;
        }

        // ── Onboarding: awaiting A/B test choice ─────────────────────────────
        if (awaitingTestChoice) {
            const choice = val.trim().toUpperCase().slice(0, 1);
            if (choice === 'A') {
                setAwaitingTestChoice(false);
                addAssistant('Tốt! Thầy sẽ chuyển em sang phòng thi. Nhấn **Bắt Đầu** khi em sẵn sàng — đề sẽ được mở sau khi bắt đầu.');
                setTimeout(() => onStartDiagnosticExam?.(), 1200);
                return;
            }
            if (choice === 'B') {
                setAwaitingTestChoice(false);
                await startInlineQuiz();
                return;
            }
            addAssistant('Em gõ **A** để làm đề thi hoặc **B** để trả lời trắc nghiệm nhé.');
            return;
        }

        // ── Inline quiz flow ──────────────────────────────────────────────────
        if (quizState.phase === 'reading') {
            const lowerQ = val.toLowerCase();
            if (lowerQ.includes('bắt đầu') || lowerQ === 'bt' || val === '1' || lowerQ.includes('sẵn sàng')) {
                setQuizState(p => ({ ...p, phase: 'questioning' }));
                askQuizQuestion(quizState.data!, 0);
            } else if (lowerQ.includes('từ chối') || lowerQ.includes('không') || lowerQ.includes('thôi') || lowerQ.includes('bỏ')) {
                setQuizState(QUIZ_INIT);
                addAssistant('Được rồi, em có thể làm quiz bất cứ lúc nào nhé. Tiếp tục nào!');
            } else {
                addAssistant('Em bấm **Bắt đầu** để làm quiz, hoặc **Từ chối** nếu chưa muốn nhé.', true, { quickReplies: ['Bắt đầu', 'Từ chối'] });
            }
            return;
        }

        const lower = val.toLowerCase();

        // ── Awaiting exam type choice (A/B/C) ────────────────────────────────
        if (awaitingExamTypeChoice) {
            let ch = 'a'; // default
            if (lower.includes('đọc hiểu') || lower.match(/\b(a)\b/)) ch = 'a';
            else if (lower.includes('viết') || lower.match(/\b(b)\b/)) ch = 'b';
            else if (lower.includes('tổng hợp') || lower.match(/\b(c)\b/)) ch = 'c';
            
            // Also handle if user typed "Câu 1: A" just in case
            if (lower.includes('câu 1: a')) ch = 'a';
            else if (lower.includes('câu 1: b')) ch = 'b';
            else if (lower.includes('câu 1: c')) ch = 'c';

            await handleExamTypeChoice(ch);
            return;
        }

        // ── Detect quiz / trắc nghiệm requests from chat ─────────────────────
        // Chỉ dùng quiz flow chính thức (10 câu) khi NGOÀI bài học.
        // Khi đang trong bài học, để AI tự tạo câu trắc nghiệm inline linh hoạt (1-5 câu).
        const wantsQuiz = /trắc\s*nghiệm|quiz|kiểm\s*tra\s*trắc|bài\s*tập\s*trắc|làm\s*trắc|câu\s*hỏi\s*trắc|test\s*trắc/i.test(lower)
            && !/đề\s*thi|thi\s*thử|120\s*phút|90\s*phút/i.test(lower);
        if (wantsQuiz && !activeLesson) {
            startSecondaryQuizDirect();
            addAssistant(`Thầy đã khởi tạo bài trắc nghiệm cho em ở tab **Thực hành** rồi nhé. Em hãy click sang tab **Thực hành** (cạnh tab Giải Trí) để làm bài nha!`);
            return;
        }

        // ── Detect exam generation requests from chat ─────────────────────────
        const wantsExam = /tạo\s*đề|ra\s*đề|cho em\s*đề|đề thi ngữ văn|(?:thầy|cô)\s*ra\s*đề/i.test(lower)
            && !/trắc\s*nghiệm/i.test(lower);
        if (wantsExam) {
            if (activeLesson) {
                onPracticeTrigger?.('exam');
            } else {
                startSecondaryExamDirect();
                addAssistant(`Thầy đã chuẩn bị bài thi thử cho em ở tab **Thực hành** rồi nhé. Em hãy click sang tab **Thực hành** (cạnh tab Giải Trí) để chọn loại đề và làm bài nha!`);
            }
            return;
        }

        // ── Detect graphic requests from chat ─────────────────────────
        const wantsGraphic = /tạo\s*(?:ảnh|hình)\s*đồ\s*họa|vẽ\s*đồ\s*họa|đồ\s*họa\s*kiến\s*thức/i.test(lower);
        if (wantsGraphic && !activeLesson) {
            let topic = val.replace(/tạo\s*(?:ảnh|hình)\s*đồ\s*họa|vẽ\s*đồ\s*họa|đồ\s*họa\s*kiến\s*thức/i, '').trim();
            if (!topic) topic = "Ngữ văn";
            startSecondaryGraphicDirect(topic);
            addAssistant(`Thầy đang vẽ đồ hoạ học tập về "${topic}" cho em ở tab **Thực hành** rồi nhé. Em hãy click sang tab **Thực hành** (cạnh tab Giải Trí) để xem nha!`);
            return;
        }

        // ── Detect lesson exit / switch intent while in lesson mode ────────
        if (activeLesson) {
            const wantsExit = /muốn học bài khác|chuyển bài|dừng bài|không muốn học (bài )?này|thoát bài|em muốn dừng|đổi bài|bỏ bài này|học bài mới/i.test(lower);
            if (wantsExit) {
                // Save progress and exit lesson
                if (user) {
                    const lessonKey = getLessonKey(activeLesson.sectionId, activeLesson.lessonId);
                    const lp = userProfile?.lessonProgress?.[lessonKey];
                    if (lp) {
                        updateLessonProgress(user.uid, lessonKey, lp).catch(console.error);
                    }
                }
                const found = findLesson(activeLesson.sectionId, activeLesson.lessonId);
                const lessonTitle = found ? found.lesson.title : 'bài học';
                setActiveLesson(null);
                if (user) clearActiveLesson(user.uid).catch(console.error);
                addAssistant(`Được rồi, tiến trình bài "${lessonTitle}" đã được lưu lại. Em có thể quay lại học tiếp bất cứ lúc nào nhé!\n\nEm muốn ${pronoun} giúp gì tiếp? Hoặc em có thể chọn bài mới từ tab **Tiến Trình**.`);
                setInput('');
                return;
            }
        }

        // ── Normal chat ───────────────────────────────────────────────────────
        if (!isApiKeyConfigured()) {
            addAssistant('API Key chưa được cấu hình. Thêm VITE_GOOGLE_API_KEY vào file .env.');
            return;
        }

        startBusy();
        try {
            // Build enhanced prompt with lesson context + user memory
            let effectiveInput = val;
            let chatHistory = messages; // default: full history
            let lessonSystemContext: string | undefined;

            // ── Auto-grade [LESSON_MCQ] answers in lesson mode ──
            // When the AI sent a [LESSON_MCQ] block, lessonMcqAnswerRef stores the correct letter.
            // When the student clicks an MCQ option, onMCQSelect sends "Câu 1: B" etc.
            // We intercept here to auto-grade and inject the result for the AI.
            if (activeLesson && lessonMcqAnswerRef.current) {
                const correctAnswer = lessonMcqAnswerRef.current;
                // Extract the student's selected letter from patterns like "Câu 1: B", "B", "b"
                const mcqAnswerMatch = val.match(/(?:Câu\s*\d+\s*:\s*)?([A-Da-d])\s*$/i);
                if (mcqAnswerMatch) {
                    const studentLetter = mcqAnswerMatch[1].toUpperCase();
                    const isCorrect = studentLetter === correctAnswer;
                    // Clear the stored answer
                    lessonMcqAnswerRef.current = null;

                    // Update lesson progress
                    if (user && userProfile) {
                        const lessonKey = getLessonKey(activeLesson.sectionId, activeLesson.lessonId);
                        const lp = userProfile.lessonProgress?.[lessonKey] || {
                            status: 'in_progress' as const, sectionsTotal: 10, sectionsDone: 0,
                            currentSectionIndex: 0,
                            questionsAsked: 0, questionsCorrect: 0,
                        };
                        lp.questionsAsked += 1;
                        if (isCorrect) {
                            lp.questionsCorrect += 1;
                            lp.sectionsDone += 1;
                            lp.currentSectionIndex = (lp.currentSectionIndex || 0) + 1;
                        }
                        updateLessonProgress(user.uid, lessonKey, lp).catch(console.error);
                        setUserProfile(p => p ? {
                            ...p,
                            lessonProgress: { ...p.lessonProgress, [lessonKey]: lp },
                        } : p);
                    }

                    // Inject auto-grading result into the message so AI responds accordingly
                    if (isCorrect) {
                        effectiveInput = `[HỆ THỐNG TỰ ĐỘNG CHẤM — TRẮC NGHIỆM ĐÚNG] Em đã chọn ${studentLetter}, đáp án đúng là ${correctAnswer}. Em trả lời ĐÚNG. Hãy khen ngắn gọn rồi chuyển sang phần tiếp theo. KHÔNG gửi [QUESTION_CORRECT] hay [SECTION_DONE] vì hệ thống đã tự xử lý.`;
                    } else {
                        effectiveInput = `[HỆ THỐNG TỰ ĐỘNG CHẤM — TRẮC NGHIỆM SAI] Em đã chọn ${studentLetter}, nhưng đáp án đúng là ${correctAnswer}. Em trả lời SAI. Hãy nhẹ nhàng giải thích tại sao ${correctAnswer} đúng, giảng lại phần liên quan ngắn gọn, rồi hỏi lại câu khác. KHÔNG gửi [QUESTION_WRONG] hay [SECTION_DONE] vì hệ thống đã tự xử lý.`;
                    }
                }
            }
            if (activeLesson) {
                const lessonKey = getLessonKey(activeLesson.sectionId, activeLesson.lessonId);
                const lp = userProfile?.lessonProgress?.[lessonKey];
                const currentSectionIndex = lp?.currentSectionIndex ?? 0;
                const sectionsDone = lp?.sectionsDone ?? 0;
                const sectionsTotal = lp?.sectionsTotal ?? 10;

                // Add resume context if continuing from a previous session
                let resumeContext = '';
                if (sectionsDone > 0 && currentSectionIndex > 0) {
                    resumeContext = `\n\n[TIẾP TỤC BÀI HỌC]: Em đã học xong ${sectionsDone}/${sectionsTotal} phần. Hiện tại đang học phần thứ ${currentSectionIndex + 1}. Hãy tiếp tục từ phần tiếp theo, nhắc lại ngắn gọn (1-2 câu) nội dung phần trước đó rồi tiếp tục giảng phần mới.\n`;
                }

                const Pronoun = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);
                // Build trimmed DOCX context — only send current section + outline instead of full document
                const lessonContent = buildLessonContext(activeLesson.docxContent, currentSectionIndex);
                // In lesson mode, limit history to 8 messages to reduce token usage
                chatHistory = messages.slice(-8);

                // Lesson context goes into systemInstruction (not user message)
                // This prevents re-injecting the full lesson prompt every turn,
                // which was causing the AI to re-explain content it already covered.
                lessonSystemContext = `${LESSON_TEACH_PROMPT}\n\nQUAN TRỌNG: Xưng hô là "${pronoun}" khi nói với học sinh. Ví dụ: "${Pronoun} sẽ giảng phần tiếp theo...", "${Pronoun} muốn hỏi em...".${resumeContext}\n\n[NỘI DUNG LÝ THUYẾT]:\n${lessonContent}`;

                // User message is ONLY the student's reply — clean and simple
                effectiveInput = val;
            }
            // Inject user memory/traits for personalization
            const traits = userProfile?.userTraits;
            if (traits && traits.length > 0) {
                effectiveInput = `[TRÍ NHỚ VỀ HỌC SINH]: ${traits.join('; ')}\n\n${effectiveInput}`;
            }
            const { text: aiContent, generatedImageUrl } = await sendChatMessage(chatHistory, effectiveInput, previewImage, userProfile, abortControllerRef.current?.signal, lessonSystemContext);

            // ── Detect [INFOGRAPHIC] tag → tạo ảnh infographic im lặng ─────────
            const infMatch = aiContent.match(/\[INFOGRAPHIC\]([^\[]*)\[\/INFOGRAPHIC\]/);
            if (infMatch) {
                const workTitle = infMatch[1].trim();
                const ack = `Chờ chút, ${pronoun} sẽ tóm tắt và tạo infographic về "${workTitle}" cho em nhé.`;
                addAssistant(ack);

                // Cố tình await để hiển thị trạng thái đang xử lý và cho phép Stop
                const imgUrl = await generateInfographic(workTitle, abortControllerRef.current?.signal);
                if (imgUrl) {
                    setMessages(p => {
                        const next = [
                            ...p,
                            {
                                role: 'assistant' as const,
                                content: `Infographic "${workTitle}":`,
                                generatedImage: imgUrl,
                            },
                        ];
                        resetProactiveTimer(next);
                        return next;
                    });
                    playNotification();
                } else {
                    // Nếu người dùng ấn Stop (quăng lỗi AbortError) thì không báo lỗi chung chung
                    if (abortControllerRef.current?.signal.aborted) {
                        throw new Error('AbortError');
                    }
                    addAssistant(`Không thể tạo infographic về "${workTitle}". API chưa hỗ trợ hoặc lỗi kết nối.`);
                }
            } else if (generatedImageUrl) {
                // Trường hợp Gemini trả về [GEN_IMAGE] → chỉ nói ngắn gọn rồi gửi ảnh
                const ack = `Chờ chút, ${pronoun} sẽ tạo ảnh minh hoạ cho em ngay đây.`;
                setMessages(p => {
                    const next = [
                        ...p,
                        {
                            role: 'assistant' as const,
                            content: ack,
                            generatedImage: generatedImageUrl,
                        },
                    ];
                    resetProactiveTimer(next);
                    return next;
                });
                playNotification();
                autoSpeak(ack);
            } else {
                // ── Normal text response — parse [AI_EXAM] + lesson tags ──
                let cleanContent = aiContent;

                // Handle [SỬA] correction tags → format as readable styled text
                // First, strip hallucinated corrections where "before" === "after"
                cleanContent = cleanContent.replace(/\[SỬA\]\s*(.*?)\s*\[\/SỬA\]/g, (_match, inner: string) => {
                    // Extract "từ sai" → "từ đúng" pattern
                    const parts = inner.split('→').map((s: string) => s.replace(/"/g, '').trim());
                    if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
                        // Hallucinated correction — same word on both sides, strip entirely
                        return '';
                    }
                    return `📝 **Sửa:** ${inner}`;
                });

                // Strip leaked internal lesson context markers that AI may accidentally echo
                cleanContent = cleanContent
                    .replace(/\[PHẦN TIẾP THEO\][\s\S]*?\[\/PHẦN TIẾP THEO\]/g, '')
                    .replace(/\[PHẦN TIẾP THEO\][^\n]*/g, '')
                    .replace(/\[\/PHẦN TIẾP THEO\]/g, '')
                    .replace(/\[PHẦN HIỆN TẠI[^\]]*\][^\n]*/g, '')
                    .replace(/\[PHẦN TRƯỚC[^\]]*\][^\n]*/g, '')
                    .replace(/\[DÀN BÀI[^\]]*\][^\n]*/g, '')
                    .replace(/\[→ đang học\]/g, '')
                    .replace(/\[✓ đã học\]/g, '')
                    .replace(/\[chưa học\]/g, '')
                    .replace(/\[NỘI DUNG LÝ THUYẾT\][^\n]*/g, '')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();

                let aiExamData: AIExamData | null = null;

                // Parse [AI_EXAM] {...} [/AI_EXAM]
                const examMatch = cleanContent.match(/\[AI_EXAM\]([\s\S]*?)\[\/AI_EXAM\]/);
                if (examMatch) {
                    try {
                        aiExamData = JSON.parse(examMatch[1].trim());
                    } catch { /* ignore malformed */ }
                    cleanContent = cleanContent.replace(/\[AI_EXAM\][\s\S]*?\[\/AI_EXAM\]/, '').trim();
                }

                // Parse [TIMELINE]
                if (cleanContent.includes('[TIMELINE]')) {
                    const lines = cleanContent.split('\n');
                    const timelineEvents: TimelineItem[] = [];
                    const remainingLines: string[] = [];
                    for (const line of lines) {
                        if (line.includes('[TIMELINE]')) {
                            const p = line.replace(/\[TIMELINE\]/g, '').split('|');
                            if (p.length >= 2) {
                                timelineEvents.push({
                                    time: p[0]?.trim() || '',
                                    title: p[1]?.trim() || '',
                                    desc: p[2]?.trim() || ''
                                });
                            }
                        } else {
                            remainingLines.push(line);
                        }
                    }
                    cleanContent = remainingLines.join('\n').trim();
                    if (timelineEvents.length > 0 && user) {
                        updateUserProfile(user.uid, { customTimeline: timelineEvents }).catch(console.error);
                        setUserProfile(p => p ? { ...p, customTimeline: timelineEvents } : p);
                    }
                }

                // ── Parse [LESSON_MCQ]...[ANSWER:X]...[/LESSON_MCQ] — auto-graded MCQ in lesson ──
                const lessonMcqMatch = cleanContent.match(/\[LESSON_MCQ\]([\s\S]*?)\[\/LESSON_MCQ\]/);
                if (lessonMcqMatch && activeLesson) {
                    const mcqBlock = lessonMcqMatch[1];
                    // Extract correct answer letter from [ANSWER:X]
                    const answerMatch = mcqBlock.match(/\[ANSWER:\s*([A-Da-d])\s*\]/);
                    const correctLetter = answerMatch ? answerMatch[1].toUpperCase() : null;

                    if (correctLetter) {
                        // Store the correct answer for auto-grading when student clicks
                        lessonMcqAnswerRef.current = correctLetter;

                        // Strip the [LESSON_MCQ], [/LESSON_MCQ] tags and [ANSWER:X] from display
                        // but keep the question and options text visible for the student
                        let mcqDisplay = mcqBlock
                            .replace(/\[ANSWER:\s*[A-Da-d]\s*\]/gi, '')
                            .trim();

                        // Replace the entire [LESSON_MCQ]...[/LESSON_MCQ] block with the cleaned display text
                        cleanContent = cleanContent.replace(
                            /\[LESSON_MCQ\][\s\S]*?\[\/LESSON_MCQ\]/,
                            mcqDisplay
                        ).trim();
                    } else {
                        // No valid [ANSWER:X] found — just strip the tags
                        cleanContent = cleanContent
                            .replace(/\[LESSON_MCQ\]/g, '')
                            .replace(/\[\/LESSON_MCQ\]/g, '')
                            .trim();
                        console.warn('[Lesson] [LESSON_MCQ] thiếu [ANSWER:X] — hiển thị như text thường');
                    }
                }

                // ── Lesson progress tags ──
                if (activeLesson && user && userProfile) {
                    const lessonKey = getLessonKey(activeLesson.sectionId, activeLesson.lessonId);
                    const lp = userProfile.lessonProgress?.[lessonKey] || {
                        status: 'in_progress' as const, sectionsTotal: 10, sectionsDone: 0,
                        currentSectionIndex: 0,
                        questionsAsked: 0, questionsCorrect: 0,
                    };
                    let changed = false;
                    const hasWrong = cleanContent.includes('[QUESTION_WRONG]');
                    const hasCorrect = cleanContent.includes('[QUESTION_CORRECT]');
                    const hasSectionDone = cleanContent.includes('[SECTION_DONE]');

                    if (hasCorrect) {
                        cleanContent = cleanContent.replace(/\[QUESTION_CORRECT\]/g, '').trim();
                        lp.questionsCorrect += 1;
                        lp.questionsAsked += 1;
                        changed = true;
                    }
                    if (hasWrong) {
                        cleanContent = cleanContent.replace(/\[QUESTION_WRONG\]/g, '').trim();
                        lp.questionsAsked += 1;
                        changed = true;
                    }
                    // Validate: [SECTION_DONE] chỉ được xử lý khi KHÔNG có [QUESTION_WRONG]
                    // Nếu AI vô tình gửi cả 2 tag → strip [SECTION_DONE] để tránh skip section sai
                    if (hasSectionDone && !hasWrong) {
                        cleanContent = cleanContent.replace(/\[SECTION_DONE\]/g, '').trim();
                        lp.sectionsDone += 1;
                        lp.currentSectionIndex = (lp.currentSectionIndex || 0) + 1;
                        changed = true;
                    } else if (hasSectionDone && hasWrong) {
                        // AI vi phạm: gửi SECTION_DONE khi HS sai → chỉ strip tag, KHÔNG tăng section
                        cleanContent = cleanContent.replace(/\[SECTION_DONE\]/g, '').trim();
                        console.warn('[Lesson] AI gửi [SECTION_DONE] cùng [QUESTION_WRONG] — đã bỏ qua SECTION_DONE');
                    }
                    if (cleanContent.includes('[LESSON_DONE]')) {
                        cleanContent = cleanContent.replace(/\[LESSON_DONE\]/g, '').trim();
                        lp.status = 'completed';
                        lp.sectionsDone = lp.sectionsTotal;
                        lp.currentSectionIndex = lp.sectionsTotal;
                        lp.completedAt = Date.now();
                        setActiveLesson(null);
                        // Clear active lesson from Firebase when completed
                        if (user) {
                            clearActiveLesson(user.uid).catch(console.error);
                        }
                        changed = true;
                    }
                    if (changed) {
                        updateLessonProgress(user.uid, lessonKey, lp).catch(console.error);
                        setUserProfile(p => p ? {
                            ...p,
                            lessonProgress: { ...p.lessonProgress, [lessonKey]: lp },
                        } : p);
                    }
                }

                setMessages(p => {
                    const next = [
                        ...p,
                        {
                            role: 'assistant' as const,
                            content: cleanContent,
                            ...(aiExamData ? { aiExam: aiExamData } : {}),
                        },
                    ];
                    resetProactiveTimer(next);
                    return next;
                });
                playNotification();
                if (cleanContent && !activeLesson) autoSpeak(cleanContent);
            }
            if (user && userProfile) {
                // Track chat turns for user traits extraction
                chatTurnCountRef.current += 1;
                if (chatTurnCountRef.current % 20 === 0) {
                    // Extract user traits every 20 turns
                    const last20 = messages.slice(-20);
                    const traitsPrompt = USER_TRAITS_PROMPT + '\n\n' + last20.map(m => `${m.role}: ${m.content}`).join('\n');
                    sendGradingRequest(traitsPrompt).then((raw: string) => {
                        try {
                            const cleanRaw = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
                            const traits = JSON.parse(cleanRaw) as string[];
                            if (Array.isArray(traits)) {
                                saveUserTraits(user.uid, traits).catch(console.error);
                                setUserProfile(p => p ? { ...p, userTraits: traits } : p);
                            }
                        } catch { /* ignore */ }
                    }).catch(() => { });
                }

                import('../services/firebaseService').then(({ updateUserProfile }) => {
                    updateUserProfile(user.uid, {
                        xp: (userProfile.xp || 0) + 50,
                        progress: Math.min((userProfile.progress || 0) + 2, 100),
                    });
                });
                setUserProfile(p => p ? { ...p, xp: p.xp + 50, progress: Math.min(p.progress + 2, 100) } : p);
            }
        } catch (err: any) {
            if (err.name === 'AbortError' || err.message === 'AbortError') {
                addAssistant('Đã dừng tác vụ theo yêu cầu của em. Em muốn học gì tiếp theo?', true, { quickReplies: getDynamicSuggestions('general') });
                return;
            }
            console.error('API error:', err);
            // Provide specific error feedback
            const msg = err?.message || '';
            if (msg.includes('API_KEY_MISSING') || msg.includes('Missing API Key')) {
                addAssistant('API Key chưa được cấu hình trên server. Vui lòng kiểm tra biến môi trường GOOGLE_API_KEY.');
            } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
                addAssistant('Không thể kết nối đến server AI. Kiểm tra kết nối mạng rồi thử lại nhé em.');
            } else if (msg.includes('503') || msg.includes('overloaded')) {
                addAssistant('Server AI đang quá tải. Em đợi vài giây rồi gửi lại nhé.');
            } else if (msg.includes('429') || msg.includes('quota') || msg.includes('rate')) {
                addAssistant('Đã vượt giới hạn gọi API. Em đợi một chút rồi thử lại nhé.');
            } else {
                addAssistant(`Lỗi xử lý: ${msg || 'Không xác định'}. Em thử gửi lại nhé.`);
            }
        } finally {
            endBusy();
        }
    };

    const handleMagicRewrite = async () => {
        if (!input.trim()) return;
        if (!isApiKeyConfigured()) return;
        setIsRewriting(true);
        try {
            const rewritten = await rewriteText(input);
            if (rewritten) setInput(rewritten);
        } catch (e) {
            console.error('Rewrite error:', e);
        } finally {
            setIsRewriting(false);
        }
    };

    const startDiagnosis = async () => {
        setIsDiagnosing(true);
        setMessages([]);
        try {
            const aiContent = await generateDiagnosticQuiz(DIAGNOSTIC_QUIZ_PROMPT);
            setMessages([{ role: 'assistant', content: `BÀI KIỂM TRA CHẨN ĐOÁN\n\n${aiContent}\n\nTrả lời: A, B, C hoặc D cho từng câu.` }]);
            playNotification();
            autoSpeak('Bắt đầu bài kiểm tra chẩn đoán.');
        } catch (err: any) {
            if (err.name !== 'AbortError' && err.message !== 'AbortError') {
                setMessages([{ role: 'assistant', content: 'Lỗi tạo bài kiểm tra. Thử lại sau.' }]);
                playNotification();
            } else {
                setMessages([{ role: 'assistant', content: 'Đã dừng bài kiểm tra chẩn đoán. Em muốn làm gì tiếp theo?', quickReplies: getDynamicSuggestions('diagnosis') }]);
            }
        } finally {
            setIsDiagnosing(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            if (file.type.startsWith('image/')) {
                const r = new FileReader();
                r.onload = () => { if (typeof r.result === 'string') setPreviewImage(r.result); };
                r.readAsDataURL(file);
            }
        }
    };

    // ── Awaiting exam type choice ─────────────────────────────────────────────
    const startExamFlow = useCallback(() => {
        if (activeLesson) {
            onPracticeTrigger?.('exam');
        } else {
            startSecondaryExamDirect();
            onPracticeTrigger?.('exam');
        }
    }, [activeLesson, onPracticeTrigger, startSecondaryExamDirect]);

    const handleExamTypeChoice = useCallback(async (choice: string) => {
        setAwaitingExamTypeChoice(false);
        let examType: 'reading' | 'writing' | 'full';
        let label: string;
        if (choice === 'b') { examType = 'writing'; label = 'Đề viết'; }
        else if (choice === 'c') { examType = 'full'; label = 'Đề tổng hợp'; }
        else { examType = 'reading'; label = 'Đề đọc hiểu'; }

        addAssistant(`${pronoun.charAt(0).toUpperCase() + pronoun.slice(1)} đang tạo ${label} từ ngân hàng đề thi THPT cho em, chờ xíu...`);
        startBusy();
        try {
            const { buildExamFromPool } = await import('../services/examPoolService');
            const exam = await buildExamFromPool(examType, abortControllerRef.current?.signal);
            endBusy();
            if (!exam) {
                addAssistant('Lỗi tạo đề thi, em thử lại sau nhé.');
                return;
            }
            const durationLabel = exam.durationMinutes === 30 ? '30 phút' : exam.durationMinutes === 90 ? '90 phút' : '120 phút';
            const msg = `Đề đã sẵn sàng! Thời gian làm bài: ${durationLabel}. Nhấn "Làm bài" để bắt đầu em nhé.`;
            setMessages(p => {
                const next = [
                    ...p,
                    { role: 'assistant' as const, content: msg, aiExam: exam },
                ];
                resetProactiveTimer(next);
                return next;
            });
            playNotification();
            autoSpeak(msg);
        } catch (err: any) {
            console.error('Exam pool error:', err);
            endBusy();
            if (err.name !== 'AbortError' && err.message !== 'AbortError') {
                addAssistant('Lỗi tạo đề thi, em thử lại sau nhé.');
            } else {
                addAssistant('Đã dừng tạo đề thi. Em muốn làm gì tiếp theo?', true, { quickReplies: getDynamicSuggestions('exam') });
            }
        }
    }, [addAssistant, autoSpeak, resetProactiveTimer, playNotification, pronoun, startBusy, endBusy]);

    const startGraphicFlow = useCallback(() => {
        if (activeLesson) {
            onPracticeTrigger?.('graphic');
        } else {
            startSecondaryGraphicDirect();
            onPracticeTrigger?.('graphic');
        }
    }, [activeLesson, onPracticeTrigger, startSecondaryGraphicDirect]);

    // ── Citation flow ───────────────────────────────────────────────────────
    const startCitationFlow = useCallback(() => {
        if (isLoading || busyRef.current) return;
        const syntheticUser: Message = { role: 'user', content: 'Em muốn tìm dẫn chứng ạ' };
        setMessages(prev => [...prev, syntheticUser]);
        const msg = `Em muốn tìm dẫn chứng cho chủ đề nghị luận nào? Cứ nhắn chủ đề vào đây nhé.`;
        addAssistant(msg);
    }, [addAssistant, pronoun, isLoading]);

    // ── Quiz flow (clickable buttons) ────────────────────────────────────────
    const startQuizFlow = useCallback(() => {
        if (activeLesson) {
            onPracticeTrigger?.('quiz');
        } else {
            startSecondaryQuizDirect();
            onPracticeTrigger?.('quiz');
        }
    }, [activeLesson, onPracticeTrigger, startSecondaryQuizDirect]);

    // ── Handle quiz answer from clickable buttons ────────────────────────────
    const handleQuizAnswer = useCallback(async (answer: string) => {
        if (quizState.phase !== 'questioning' || !quizState.data) return;

        // Stop any playing audio from the current question immediately
        stopCurrentAudio();
        setIsPlayingAudio(false);

        // Add user answer as message
        const labelMap: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D' };
        setMessages(p => [...p, { role: 'user' as const, content: labelMap[answer] || answer }]);

        const newAnswers = [...quizState.userAnswers, answer];
        const nextQ = quizState.currentQ + 1;

        if (nextQ >= 10) {
            setQuizState(p => ({ ...p, userAnswers: newAnswers, phase: 'done' }));
            await finishQuiz(quizState.data!, newAnswers);
        } else {
            setQuizState(p => ({ ...p, userAnswers: newAnswers, currentQ: nextQ }));
            askQuizQuestion(quizState.data!, nextQ);
        }
    }, [quizState, finishQuiz, askQuizQuestion]);

    // ── Exit lesson flow ────────────────────────────────────────────────────
    const exitLesson = useCallback(() => {
        if (!activeLesson) return;

        // 1. Stop any playing audio immediately
        stopCurrentAudio();
        setIsPlayingAudio(false);

        // 2. Cancel busy/loading state (in case AI is mid-response)
        busyRef.current = false;
        lastTaskEndRef.current = 0;
        setIsLoading(false);

        // 3. Save current progress before exiting
        if (user) {
            const lessonKey = getLessonKey(activeLesson.sectionId, activeLesson.lessonId);
            const lp = userProfile?.lessonProgress?.[lessonKey];
            if (lp) {
                updateLessonProgress(user.uid, lessonKey, lp).catch(console.error);
            }
            clearActiveLesson(user.uid).catch(console.error);
        }

        const found = findLesson(activeLesson.sectionId, activeLesson.lessonId);
        const lessonTitle = found ? found.lesson.title : 'bài học';

        // 4. Clear active lesson state FIRST (so handleSend won't inject lesson context)
        setActiveLesson(null);

        // 5. Clear ALL messages to remove lesson context from chat history,
        //    then show a fresh exit message. This prevents the AI from
        //    continuing the lesson based on chat history.
        const Pronoun = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);
        setMessages([{
            role: 'assistant' as const,
            content: `Đã lưu tiến trình bài "${lessonTitle}". Em có thể quay lại học tiếp bất cứ lúc nào nhé!\n\nBây giờ em muốn ${Pronoun} giúp gì? Em có thể:\n- Chọn bài mới từ tab Tiến Trình\n- Hỏi bất kỳ câu hỏi nào về Ngữ văn\n- Làm đề thi, quiz, hoặc tạo đồ hoạ`,
        }]);
        playNotification();
    }, [activeLesson, user, userProfile, pronoun, playNotification]);

    // ── Start lesson flow ───────────────────────────────────────────────────
    const startLesson = useCallback(async (sectionId: string, lessonId: string, resumeMode = false) => {
        if (isLoading || busyRef.current) {
            // Prevent starting a lesson if AI is currently answering another question.
            // But we can interrupt if needed. For now, just block to prevent race condition.
            return;
        }
        const found = findLesson(sectionId, lessonId);
        if (!found) return;
        const { lesson } = found;

        // If switching from another active lesson, save progress of old lesson first
        if (activeLesson && !resumeMode) {
            const oldKey = getLessonKey(activeLesson.sectionId, activeLesson.lessonId);
            const isSameLesson = activeLesson.sectionId === sectionId && activeLesson.lessonId === lessonId;
            if (!isSameLesson && user) {
                const oldLp = userProfile?.lessonProgress?.[oldKey];
                if (oldLp) {
                    updateLessonProgress(user.uid, oldKey, oldLp).catch(console.error);
                }
                await clearActiveLesson(user.uid);
                const oldFound = findLesson(activeLesson.sectionId, activeLesson.lessonId);
                const oldTitle = oldFound ? oldFound.lesson.title : 'bài trước';
                addAssistant(`Đã lưu tiến trình bài "${oldTitle}".`);
            }
        }

        // Clear existing messages and show intro
        if (!resumeMode) {
            setMessages([]);
            addAssistant(`Sau đây ${pronoun} sẽ cùng em bắt đầu học bài: "${lesson.title}" nhé.`, true, { quickReplies: ['Sẵn sàng'] });
        } else {
            // Resume mode: add a welcome-back message so chat area isn't empty
            if (messages.length === 0) {
                addAssistant(`Chào em! Mình tiếp tục bài "${lesson.title}" nhé.`, true, { quickReplies: ['Sẵn sàng'] });
            }
        }

        // Fetch DOCX content
        try {
            const docxContent = await fetchDocxAsText(lesson.docxPath);
            setActiveLesson({ sectionId, lessonId, docxContent });

            // Save active lesson to Firebase
            if (user) {
                await saveActiveLesson(user.uid, sectionId, lessonId);

                const key = getLessonKey(sectionId, lessonId);
                const existing = userProfile?.lessonProgress?.[key];

                // Estimate sectionsTotal from content
                const estimatedSections = estimateSectionCount(docxContent);

                if (!existing || existing.status === 'not_started') {
                    const lp = {
                        status: 'in_progress' as const,
                        sectionsTotal: estimatedSections,
                        sectionsDone: 0,
                        currentSectionIndex: 0,
                        questionsAsked: 0,
                        questionsCorrect: 0,
                    };
                    updateLessonProgress(user.uid, key, lp).catch(console.error);
                    setUserProfile(p => p ? {
                        ...p,
                        lessonProgress: { ...p.lessonProgress, [key]: lp },
                        activeLesson: { sectionId, lessonId },
                    } : p);
                } else {
                    // Update activeLesson and sectionsTotal if needed
                    const updatedLp = {
                        ...existing,
                        sectionsTotal: existing.sectionsTotal < estimatedSections ? estimatedSections : existing.sectionsTotal,
                    };
                    updateLessonProgress(user.uid, key, updatedLp).catch(console.error);
                    setUserProfile(p => p ? {
                        ...p,
                        lessonProgress: { ...p.lessonProgress, [key]: updatedLp },
                        activeLesson: { sectionId, lessonId },
                    } : p);
                }
            }
        } catch (e) {
            console.error('Failed to load lesson DOCX:', e);
            addAssistant('Lỗi tải tài liệu bài học. Em thử lại sau nhé.');
        }
    }, [activeLesson, addAssistant, user, userProfile, setUserProfile]);

    const getDynamicSuggestions = useCallback((actionContext: 'general' | 'exam' | 'diagnosis' = 'general') => {
        if (activeLesson) {
            const found = findLesson(activeLesson.sectionId, activeLesson.lessonId);
            const title = found ? found.lesson.title : 'bài này';
            return [`Học tiếp ${title}`, 'Tóm tắt bài này', 'Làm trắc nghiệm bài này'];
        }
        if (actionContext === 'exam') {
            return ['Làm đề thi thử khác', 'Ôn bài học mới', 'Làm trắc nghiệm'];
        }
        if (actionContext === 'diagnosis') {
            return ['Bắt đầu lộ trình học', 'Làm lại kiểm tra', 'Hỏi đáp tự do'];
        }
        return ['Học bài mới', 'Tạo đề thi', 'Tạo ảnh đồ họa'];
    }, [activeLesson]);

    return {
        messages, input, isLoading, isRewriting, isDiagnosing, isPlayingAudio, previewImage,
        quizPhase: quizState.phase,
        activeLesson,
        userData: {
            level: userProfile?.level || 'Tan Binh',
            status: 'San sang chien',
            progress: userProfile?.progress || 5,
            xp: userProfile?.xp || 0,
            streak: userProfile?.streak || 1,
            daysLeft: 0,
        },
        dailyQuote: DAILY_QUOTE,
        chatEndRef, fileInputRef,
        setInput, setPreviewImage,
        handleSend, handleMagicRewrite, handlePlayTTS, startDiagnosis, handleFileSelect,
        startGraphicFlow, startExamFlow, handleExamTypeChoice, startLesson, exitLesson,
        startCitationFlow, startQuizFlow, handleQuizAnswer, abortCurrentTask,
        practiceState, setPracticeState,
        startSecondaryQuizDirect, startSecondaryExamDirect, startSecondaryGraphicDirect,
        answerSecondaryQuiz, loadSecondaryExam, loadSecondaryGraphic, clearPracticeState,
        addGradeMsg: (grade: ExamGrade, resolvedWeaknesses?: string[]) => {
            const safeScore = grade.score ?? 0;
            const safeMax = grade.maxScore && grade.maxScore > 0 ? grade.maxScore : 10;
            const scoreOutOf10 = +(safeScore / safeMax * 10).toFixed(1);
            const label = scoreOutOf10 >= 8 ? 'Xuất sắc' : scoreOutOf10 >= 6.5 ? 'Khá' : scoreOutOf10 >= 5 ? 'Trung bình' : 'Cần cố gắng';
            const summary = `📌 **Hệ thống AI đã chấm nháp bài của em**.\n\nĐiểm gợi ý: ${safeScore}/${safeMax} (${scoreOutOf10}/10) — ${label}.\n\nBài làm đã được gửi vào *Hàng chờ duyệt* để Giáo viên kiểm tra và chốt điểm vòng cuối.\n\nNhận xét (nháp): ${grade.feedback || 'Chưa có nhận xét.'}`;
            setMessages(prev => {
                const gradeMsg = { role: 'assistant' as const, content: summary, examGrade: grade };
                // If any weaknesses were resolved, append a celebration message
                if (resolvedWeaknesses && resolvedWeaknesses.length > 0) {
                    const resolvedList = resolvedWeaknesses.map(w => `✅ ${w}`).join('\n');
                    const resolvedMsg = {
                        role: 'assistant' as const,
                        content: `🎉 Tuyệt vời! Em đã khắc phục được ${resolvedWeaknesses.length > 1 ? 'các' : 'lỗi'} sau đây so với các bài trước:\n\n${resolvedList}\n\nĐây là dấu hiệu tiến bộ rõ rệt. Thầy sẽ xóa những lỗi này khỏi danh sách cần cải thiện của em.`,
                    };
                    return [...prev, gradeMsg, resolvedMsg];
                }
                return [...prev, gradeMsg];
            });
            playNotification();
        },
    };
}
