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
    PROACTIVE_DELAY_MS,
    QUIZ_GENERATION_PROMPT,
    AI_EXAM_PROMPT_READING,
    AI_EXAM_PROMPT_WRITING,
    AI_EXAM_PROMPT_FULL,
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
    generateImage,
    generateAIExam,
    sendGradingRequest,
} from '../services/geminiApi';
import type { DiagnosticQuizData } from '../services/geminiApi';
import { playTTS } from '../services/ttsService';
import { useAuth } from '../context/AuthContext';
import { saveTargetScore, completeAssessment, saveChatMemory, loadChatMemory, saveUserTraits, updateLessonProgress, saveActiveLesson, clearActiveLesson } from '../services/firebaseService';
import { findLesson, getLessonKey } from '../constants/curriculum';
import { fetchDocxAsText, estimateSectionCount } from '../services/examService';

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
export function useChat(onStartDiagnosticExam?: () => void) {
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
    const [pendingGraphicPrompt, setPendingGraphicPrompt] = useState(false);
    const [awaitingResumeChoice, setAwaitingResumeChoice] = useState(false);

    // ── Lesson mode state ─────────────────────────────────────────────────────────
    const [activeLesson, setActiveLesson] = useState<{
        sectionId: string; lessonId: string; docxContent: string;
    } | null>(null);
    const chatTurnCountRef = useRef(0);

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
        playTTS(text, voiceGenderRef.current, () => setIsPlayingAudio(true), () => setIsPlayingAudio(false));
    }, []);

    // ── Greeting (text + TTS on every page load) ─────────────────────────────
    const initDoneRef = useRef(false);
    useEffect(() => {
        if (!userProfile) return;
        if (initDoneRef.current) return;
        initDoneRef.current = true;

        const examDate = new Date(EXAM_DATE);
        const diff = Math.ceil((examDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        const pr = PRONOUN_MAP[userProfile.voiceGender || 'male'];

        let timerId: ReturnType<typeof setTimeout>;

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
Thầy cần đánh giá năng lực của em trước khi bắt đầu. Em chọn:

A. Làm bài kiểm tra đề thi thật (120 phút)
B. Trả lời 10 câu trắc nghiệm nhanh`;
            timerId = setTimeout(() => {
                setMessages([{ role: 'assistant', content: resumeMsg }]);
                playNotification();
                autoSpeak(resumeMsg);
            }, 800);
        } else {
            // Check if there's an active lesson to resume
            const activeLesson = userProfile.activeLesson;
            if (activeLesson && activeLesson.sectionId && activeLesson.lessonId) {
                // Check if lesson is not completed
                const lessonKey = `${activeLesson.sectionId}-${activeLesson.lessonId}`;
                const lessonProgress = userProfile.lessonProgress?.[lessonKey];
                if (lessonProgress && lessonProgress.status !== 'completed') {
                    // Find lesson info for greeting
                    const found = findLesson(activeLesson.sectionId, activeLesson.lessonId);
                    if (found) {
                        const { section, lesson } = found;
                        setAwaitingResumeChoice(true);
                        const resumeLessonMsg = `Chào ${userProfile.name}! Còn ${diff} ngày nữa là thi.

Trong bài học lần trước, ${pr} và em đã học đến phần "${lesson.title}" trong chủ đề "${section.title}". Em đã hoàn thành ${lessonProgress.sectionsDone}/${lessonProgress.sectionsTotal} phần.

Em có muốn tiếp tục học bài này không, hay muốn trao đổi về vấn đề khác?

**A.** Tiếp tục học bài hôm trước
**B.** Trao đổi vấn đề khác`;
                        timerId = setTimeout(() => {
                            setMessages([{ role: 'assistant', content: resumeLessonMsg }]);
                            playNotification();
                            autoSpeak(resumeLessonMsg);
                        }, 800);
                    } else {
                        // Lesson not found, clear it and show normal greeting
                        if (user) clearActiveLesson(user.uid).catch(console.error);
                        const returning = `Chào ${userProfile.name}! Còn ${diff} ngày nữa là thi. Hôm nay em muốn ôn gì?`;
                        timerId = setTimeout(() => {
                            setMessages([{ role: 'assistant', content: returning }]);
                            playNotification();
                            autoSpeak(returning);
                        }, 800);
                    }
                } else {
                    // Lesson is completed, clear it and show normal greeting
                    if (user) clearActiveLesson(user.uid).catch(console.error);
                    const returning = `Chào ${userProfile.name}! Còn ${diff} ngày nữa là thi. Hôm nay em muốn ôn gì?`;
                    timerId = setTimeout(() => {
                        setMessages([{ role: 'assistant', content: returning }]);
                        playNotification();
                        autoSpeak(returning);
                    }, 800);
                }
            } else {
                // No active lesson, normal greeting
                const returning = `Chào ${userProfile.name}! Còn ${diff} ngày nữa là thi. Hôm nay em muốn ôn gì?`;
                timerId = setTimeout(() => {
                    setMessages([{ role: 'assistant', content: returning }]);
                    playNotification();
                    autoSpeak(returning);
                }, 800);
            }
        }

        return () => clearTimeout(timerId);
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

        proactiveTimerRef.current = setTimeout(async () => {
            if (proactiveBlockedRef.current) return;
            proactiveBlockedRef.current = true;
            const question = await sendProactiveMessage(currentMessages, PROACTIVE_PROMPT);
            proactiveBlockedRef.current = false;
            if (question) {
                setMessages(p => [...p, { role: 'assistant', content: question }]);
                playNotification();
            }
        }, PROACTIVE_DELAY_MS); // 25 seconds
    }, [userProfile?.isOnboarded]);

    // Clean up timer on unmount
    useEffect(() => () => {
        if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);
    }, []);

    const handlePlayTTS = (text: string) => {
        autoSpeak(text);
    };

    // ── addAssistantMsg helper ────────────────────────────────────────────────
    const addAssistant = useCallback((content: string, speak = true) => {
        setMessages(p => {
            const next = [...p, { role: 'assistant' as const, content }];
            resetProactiveTimer(next);
            return next;
        });
        playNotification();
        if (speak) autoSpeak(content);
    }, [autoSpeak, resetProactiveTimer, playNotification]);

    const askGraphicTopic = useCallback(() => {
        const suggestion = [
            'chân dung nhân vật trong một tác phẩm Văn',
            'khung cảnh một bài thơ em thích',
            'poster ôn thi cho một tác phẩm Ngữ văn 12',
        ].join('\n- ');
        const msg = `Em muốn tạo ảnh đồ hoạ về chủ đề gì?\n\nMột vài gợi ý:\n- ${suggestion}\n\nEm gõ ngắn gọn: tên tác phẩm, nhân vật hoặc chủ đề Ngữ văn mà em muốn vẽ nhé.`;
        setPendingGraphicPrompt(true);
        addAssistant(msg);
    }, [addAssistant]);

    // ── Quiz: show passage and reading prompt ─────────────────────────────────
    const startInlineQuiz = useCallback(async () => {
        setIsLoading(true);
        addAssistant('Đợi thầy chọn một đoạn trích nhé...');
        const data = await generateDiagnosticMCQ(QUIZ_GENERATION_PROMPT);
        setIsLoading(false);
        if (!data) {
            addAssistant('Lỗi tạo câu hỏi. Em thử lại sau nhé.');
            return;
        }
        setQuizState({ phase: 'reading', data, currentQ: 0, userAnswers: [] });
        const msg = `📖 **${data.source}**\n\n${data.passage}\n\n---\nSau khi đọc kĩ văn bản, thầy sẽ bắt đầu hỏi. Hãy đọc thật kĩ nhé. Nếu em đã sẵn sàng hãy gõ **"Bắt đầu"**.`;
        addAssistant(msg);
    }, [addAssistant]);

    // ── Quiz: ask next question ───────────────────────────────────────────────
    const askQuizQuestion = useCallback((data: DiagnosticQuizData, qIndex: number) => {
        const q = data.questions[qIndex];
        const msg = `**Câu ${qIndex + 1}/10:** ${q.q}\n\nA. ${q.a}\nB. ${q.b}\nC. ${q.c}\nD. ${q.d}`;
        addAssistant(msg);
    }, [addAssistant]);

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
        const score = +(correct / 10 * 10).toFixed(1);
        lines.push(`\nTổng: ${correct}/10 (${pct}%)`);
        if (pct >= 80) lines.push('Năng lực đọc hiểu tốt — thầy sẽ đặt lộ trình nâng cao.');
        else if (pct >= 60) lines.push('Năng lực ở mức trung bình — lộ trình chuẩn sẽ phù hợp.');
        else lines.push('Em cần củng cố kiến thức nền — thầy sẽ đồng hành từ đầu.');


        setQuizState(QUIZ_INIT);
        addAssistant(lines.join('\n'));

        // Mark assessment as complete in Firestore — only now is the user fully onboarded
        if (user) {
            completeAssessment(user.uid, score).catch(console.error);
            setUserProfile(p => p ? {
                ...p,
                diagnosticScore: score,
                assessmentDone: true,
                isOnboarded: true,
                avgScore: score,
                submissionCount: 1,
            } : p);
        }
    }, [user, setUserProfile, addAssistant]);

    // ── Main send handler ─────────────────────────────────────────────────────
    const handleSend = async (override?: string) => {
        const val = (override || input).trim();
        if (!val && !previewImage) return;
        if (isLoading) return;

        const userMsg: Message = { role: 'user', content: val, image: previewImage };
        setMessages(p => [...p, userMsg]);
        setInput('');
        setPreviewImage(null);

        // Reset proactive timer on user activity
        if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);

        // ── Đang chờ mô tả chủ đề đồ hoạ ─────────────────────────────────────
        if (pendingGraphicPrompt) {
            setPendingGraphicPrompt(false);
            const topic = val;
            if (!topic) {
                addAssistant('Em mô tả rõ hơn chủ đề Ngữ văn mà em muốn vẽ nhé.');
                setPendingGraphicPrompt(true);
                return;
            }

            if (!isApiKeyConfigured()) {
                addAssistant('API Key chưa được cấu hình. Thêm VITE_GOOGLE_API_KEY vào file .env để tạo ảnh đồ hoạ.');
                return;
            }

            // Nhắc xác nhận chủ đề Ngữ văn, rồi tạo ảnh bằng Imagen 3.0
            addAssistant(`Thầy sẽ tạo một ảnh đồ hoạ minh hoạ cho chủ đề Ngữ văn: "${topic}". Đợi một chút nhé...`, false);
            setIsLoading(true);
            try {
                const prompt = `Tạo một ảnh minh hoạ/đồ hoạ đẹp, hiện đại cho môn Ngữ văn THPT Việt Nam với chủ đề: "${topic}".
Yêu cầu: phải liên quan rõ ràng đến tác phẩm, nhân vật, bài thơ, chủ đề nghị luận hoặc kiến thức Ngữ văn; nếu chủ đề không thuộc môn Văn thì thay vào đó hãy thể hiện một tấm bảng ghi "Chủ đề này không thuộc môn Văn".
Phong cách: màu sắc ấm, chữ dễ đọc, phù hợp học sinh ôn thi tốt nghiệp THPT.`;
                const imgUrl = await generateImage(prompt);
                if (imgUrl) {
                    setMessages(p => {
                        const next = [
                            ...p,
                            {
                                role: 'assistant' as const,
                                content: `Đồ hoạ cho chủ đề "${topic}":`,
                                generatedImage: imgUrl,
                            },
                        ];
                        resetProactiveTimer(next);
                        return next;
                    });
                    playNotification();
                } else {
                    addAssistant('Thầy chưa tạo được ảnh đồ hoạ cho chủ đề này. Em thử mô tả lại ngắn gọn hơn hoặc thử lại sau nhé.');
                }
            } catch {
                addAssistant('Có lỗi khi tạo ảnh đồ hoạ. Em thử lại sau nhé.');
            } finally {
                setIsLoading(false);
            }
            return;
        }

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

        // ── Resume lesson choice ──────────────────────────────────────────────
        if (awaitingResumeChoice) {
            const choice = val.trim().toUpperCase().slice(0, 1);
            if (choice === 'A') {
                // User wants to resume lesson
                setAwaitingResumeChoice(false);
                const activeLesson = userProfile?.activeLesson;
                if (activeLesson && activeLesson.sectionId && activeLesson.lessonId) {
                    // Load chat memory first
                    const savedMessages = await loadChatMemory(user!.uid);
                    if (savedMessages && savedMessages.length > 0) {
                        setMessages(savedMessages);
                    }
                    // Resume lesson in resume mode (don't clear messages, don't show intro)
                    await startLesson(activeLesson.sectionId, activeLesson.lessonId, true);
                    // Add a reminder message about where we left off
                    const found = findLesson(activeLesson.sectionId, activeLesson.lessonId);
                    if (found) {
                        const { section, lesson } = found;
                        const lessonKey = getLessonKey(activeLesson.sectionId, activeLesson.lessonId);
                        const lp = userProfile?.lessonProgress?.[lessonKey];
                        if (lp) {
                            const currentSection = (lp.currentSectionIndex ?? lp.sectionsDone) + 1;
                            const resumeMsg = `Tiếp tục học bài "${lesson.title}" trong chủ đề "${section.title}". 

Trong bài học lần trước, thầy và em đã học đến phần thứ ${currentSection}/${lp.sectionsTotal} (đã hoàn thành ${lp.sectionsDone}/${lp.sectionsTotal} phần). Thầy sẽ nhắc lại ngắn gọn nội dung phần trước rồi tiếp tục giảng phần tiếp theo nhé.`;
                            addAssistant(resumeMsg, false);
                        }
                    }
                } else {
                    addAssistant('Không tìm thấy bài học đang học. Em có thể chọn bài học mới từ tab Tiến Trình nhé.');
                }
                return;
            }
            if (choice === 'B') {
                // User wants to discuss other topics
                setAwaitingResumeChoice(false);
                // Clear active lesson since user wants to do something else
                if (user && userProfile?.activeLesson) {
                    clearActiveLesson(user.uid).catch(console.error);
                }
                addAssistant('Được rồi, em muốn trao đổi về vấn đề gì?');
                return;
            }
            addAssistant('Em gõ **A** để tiếp tục học bài hôm trước hoặc **B** để trao đổi vấn đề khác nhé.');
            return;
        }

        // ── Inline quiz flow ──────────────────────────────────────────────────
        if (quizState.phase === 'reading') {
            if (val.toLowerCase().includes('bắt đầu') || val.toLowerCase() === 'bt' || val === '1') {
                setQuizState(p => ({ ...p, phase: 'questioning' }));
                askQuizQuestion(quizState.data!, 0);
            } else {
                addAssistant('Gõ **"Bắt đầu"** khi em đã đọc xong nhé.');
            }
            return;
        }

        const lower = val.toLowerCase();

        // ── Awaiting exam type choice (A/B/C) ────────────────────────────────
        if (awaitingExamTypeChoice) {
            const ch = lower.trim().slice(0, 1);
            await handleExamTypeChoice(ch);
            return;
        }

        // ── Detect exam generation requests from chat ─────────────────────────
        const wantsExam = /tạo\s*đề|ra\s*đề|cho em\s*đề|đề thi ngữ văn|thầy\s*ra\s*đề/i.test(lower);
        if (wantsExam) {
            startExamFlow();
            return;
        }

        // ── Detect graphics request ─────────────────────────────────────────
        const wantsGraphic = /(đồ hoạ|đồ họa|infographic|poster|ảnh minh hoạ|ảnh minh họa|tạo ảnh|vẽ giúp em)/i.test(lower);
        if (wantsGraphic) {
            askGraphicTopic();
            return;
        }

        if (quizState.phase === 'questioning' && quizState.data) {
            const ans = val.trim().toLowerCase().slice(0, 1);
            if (!['a', 'b', 'c', 'd'].includes(ans)) {
                addAssistant('Em chọn A, B, C hoặc D nhé.');
                return;
            }
            const newAnswers = [...quizState.userAnswers, ans];
            const nextQ = quizState.currentQ + 1;

            if (nextQ >= 10) {
                setQuizState(p => ({ ...p, userAnswers: newAnswers, phase: 'done' }));
                await finishQuiz(quizState.data, newAnswers);
            } else {
                setQuizState(p => ({ ...p, userAnswers: newAnswers, currentQ: nextQ }));
                askQuizQuestion(quizState.data, nextQ);
            }
            return;
        }

        // ── Normal chat ───────────────────────────────────────────────────────
        if (!isApiKeyConfigured()) {
            addAssistant('API Key chưa được cấu hình. Thêm VITE_GOOGLE_API_KEY vào file .env.');
            return;
        }

        setIsLoading(true);
        try {
            // Build enhanced prompt with lesson context + user memory
            let effectiveInput = val;
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
                
                effectiveInput = `${LESSON_TEACH_PROMPT}${resumeContext}\n\n[NỘI DUNG LÝ THUYẾT]:\n${activeLesson.docxContent}\n\n[CÂU TRẢ LỜI CỦA HỌC SINH]: ${val}`;
            }
            // Inject user memory/traits for personalization
            const traits = userProfile?.userTraits;
            if (traits && traits.length > 0) {
                effectiveInput = `[TRÍ NHỚ VỀ HỌC SINH]: ${traits.join('; ')}\n\n${effectiveInput}`;
            }
            const { text: aiContent, generatedImageUrl } = await sendChatMessage(messages, effectiveInput, previewImage);

            // ── Detect [INFOGRAPHIC] tag → tạo ảnh infographic im lặng ─────────
            const infMatch = aiContent.match(/\[INFOGRAPHIC\]([^\[]*)\[\/INFOGRAPHIC\]/);
            if (infMatch) {
                const workTitle = infMatch[1].trim();
                const ack = `Chờ chút, thầy sẽ tóm tắt và tạo infographic về "${workTitle}" cho em nhé.`;
                addAssistant(ack);

                // Tạo infographic ở background, chỉ gửi 1 tin mới khi ảnh xong
                generateInfographic(workTitle).then(imgUrl => {
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
                        addAssistant(`Không thể tạo infographic về "${workTitle}". API chưa hỗ trợ hoặc lỗi kết nối.`);
                    }
                });
            } else if (generatedImageUrl) {
                // Trường hợp Gemini trả về [GEN_IMAGE] → chỉ nói ngắn gọn rồi gửi ảnh
                const ack = 'Chờ chút, thầy sẽ tạo ảnh minh hoạ cho em ngay đây.';
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
                let aiExamData: AIExamData | null = null;

                // Parse [AI_EXAM] {...} [/AI_EXAM]
                const examMatch = cleanContent.match(/\[AI_EXAM\]([\s\S]*?)\[\/AI_EXAM\]/);
                if (examMatch) {
                    try {
                        aiExamData = JSON.parse(examMatch[1].trim());
                    } catch { /* ignore malformed */ }
                    cleanContent = cleanContent.replace(/\[AI_EXAM\][\s\S]*?\[\/AI_EXAM\]/, '').trim();
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
                    if (cleanContent.includes('[QUESTION_CORRECT]')) {
                        cleanContent = cleanContent.replace(/\[QUESTION_CORRECT\]/g, '').trim();
                        lp.questionsCorrect += 1;
                        lp.questionsAsked += 1;
                        changed = true;
                    }
                    if (cleanContent.includes('[SECTION_DONE]')) {
                        cleanContent = cleanContent.replace(/\[SECTION_DONE\]/g, '').trim();
                        lp.sectionsDone += 1;
                        lp.currentSectionIndex = (lp.currentSectionIndex || 0) + 1;
                        changed = true;
                    }
                    if (cleanContent.includes('[LESSON_DONE]')) {
                        cleanContent = cleanContent.replace(/\[LESSON_DONE\]/g, '').trim();
                        lp.status = 'completed';
                        lp.sectionsDone = lp.sectionsTotal;
                        lp.currentSectionIndex = lp.sectionsTotal;
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
                if (cleanContent) autoSpeak(cleanContent);
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
        } catch (err) {
            console.error('API error:', err);
            addAssistant('Lỗi kết nối AI. Kiểm tra kết nối và API Key rồi thử lại.');
        } finally {
            setIsLoading(false);
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
        } catch {
            setMessages([{ role: 'assistant', content: 'Lỗi tạo bài kiểm tra. Thử lại sau.' }]);
            playNotification();
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
        setAwaitingExamTypeChoice(true);
        const syntheticUser: Message = { role: 'user', content: 'Thầy ơi, tạo đề thi cho em với' };
        setMessages(prev => [...prev, syntheticUser]);
        addAssistant(`Em muốn luyện đề loại nào?\n\nA. Đọc hiểu (30 phút)\nB. Phần Viết (90 phút)\nC. Đề tổng hợp Đọc hiểu + Viết (120 phút)`);
    }, [addAssistant]);

    const handleExamTypeChoice = useCallback(async (choice: string) => {
        setAwaitingExamTypeChoice(false);
        let prompt: string;
        let label: string;
        if (choice === 'b') { prompt = AI_EXAM_PROMPT_WRITING; label = 'Đề viết'; }
        else if (choice === 'c') { prompt = AI_EXAM_PROMPT_FULL; label = 'Đề tổng hợp'; }
        else { prompt = AI_EXAM_PROMPT_READING; label = 'Đề đọc hiểu'; }

        addAssistant(`Thầy đang tạo ${label} chuẩn THPT 2025 cho em, chờ xíu...`, false);
        setIsLoading(true);
        const exam = await generateAIExam(prompt);
        setIsLoading(false);
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
    }, [addAssistant, autoSpeak, resetProactiveTimer, playNotification]);

    const startGraphicFlow = () => {
        // Giả lập như user vừa nói "Em muốn tạo ảnh đồ họa ạ"
        const syntheticUser: Message = { role: 'user', content: 'Em muốn tạo ảnh đồ hoạ ạ' };
        setMessages(prev => [...prev, syntheticUser]);
        askGraphicTopic();
    };

    // ── Start lesson flow ───────────────────────────────────────────────────
    const startLesson = useCallback(async (sectionId: string, lessonId: string, resumeMode = false) => {
        const found = findLesson(sectionId, lessonId);
        if (!found) return;
        const { lesson } = found;

        // Clear existing messages and show intro (only if not resuming)
        if (!resumeMode) {
            setMessages([]);
            addAssistant(`Sau đây thầy sẽ cùng em bắt đầu học bài: "${lesson.title}" nhé. Em đã sẵn sàng chưa?`);
        }

        // Fetch DOCX content
        try {
            const docxContent = await fetchDocxAsText(lesson.docxPath);
            setActiveLesson({ sectionId, lessonId, docxContent });

            // Save active lesson to Firebase (clear old one first if starting new lesson)
            if (user) {
                // If starting a new lesson (not resuming), clear any old active lesson first
                if (!resumeMode && userProfile?.activeLesson) {
                    await clearActiveLesson(user.uid);
                }
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
    }, [addAssistant, user, userProfile, setUserProfile]);

    return {
        messages, input, isLoading, isRewriting, isDiagnosing, isPlayingAudio, previewImage,
        quizPhase: quizState.phase,
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
        startGraphicFlow, startExamFlow, handleExamTypeChoice, startLesson,
        addGradeMsg: (grade: ExamGrade, resolvedWeaknesses?: string[]) => {
            const scoreOutOf10 = +(grade.score / grade.maxScore * 10).toFixed(1);
            const label = scoreOutOf10 >= 8 ? 'Xuất sắc' : scoreOutOf10 >= 6.5 ? 'Khá' : scoreOutOf10 >= 5 ? 'Trung bình' : 'Cần cố gắng';
            const summary = `Thầy đã chấm xong bài vừa rồi của em.\n\nĐiểm: ${grade.score}/${grade.maxScore} (${scoreOutOf10}/10) — ${label}.\n${grade.feedback}`;
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
