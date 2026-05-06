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
    CITATION_GENERATION_PROMPT,
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
    sendGradingRequest,
} from '../services/geminiApi';
import type { DiagnosticQuizData } from '../services/geminiApi';
import { playTTS, queueTTS, stopCurrentAudio } from '../services/ttsService';
import { useAuth } from '../context/AuthContext';
import { saveTargetScore, saveChatMemory, saveUserTraits, updateLessonProgress, saveActiveLesson, clearActiveLesson } from '../services/firebaseService';
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
    const [pendingCitationPrompt, setPendingCitationPrompt] = useState(false);
    const [awaitingTaskInterrupt, setAwaitingTaskInterrupt] = useState(false);
    const pendingInterruptMsgRef = useRef<string>('');

    // Synchronous "busy" tracking — refs update immediately, unlike React state
    const busyRef = useRef(false);
    const lastTaskEndRef = useRef(0); // timestamp of last task completion
    const TASK_COOLDOWN_MS = 3000; // cooldown window to catch rapid requests

    /** Call instead of setIsLoading(true) — updates both state and synchronous ref */
    const startBusy = useCallback(() => {
        busyRef.current = true;
        setIsLoading(true);
    }, []);

    /** Call instead of setIsLoading(false) — updates state, ref, and records timestamp */
    const endBusy = useCallback(() => {
        busyRef.current = false;
        lastTaskEndRef.current = Date.now();
        setIsLoading(false);
    }, []);

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
${pr} cần đánh giá năng lực của em trước khi bắt đầu. Em chọn:

A. Làm bài kiểm tra đề thi thật (120 phút)
B. Trả lời 10 câu trắc nghiệm nhanh`;
            timerId = setTimeout(() => {
                setMessages([{ role: 'assistant', content: resumeMsg }]);
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
            const question = await sendProactiveMessage(currentMessages, PROACTIVE_PROMPT, PRONOUN_MAP[voiceGenderRef.current]);
            proactiveBlockedRef.current = false;
            if (question) {
                setMessages(p => [...p, { role: 'assistant', content: question }]);
                playNotification();
            }
        }, PROACTIVE_DELAY_MS); // 25 seconds
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
        startBusy();
        addAssistant(`Đợi ${pronoun} chọn một đoạn trích nhé...`);
        const data = await generateDiagnosticMCQ(QUIZ_GENERATION_PROMPT);
        endBusy();
        if (!data) {
            addAssistant('Lỗi tạo câu hỏi. Em thử lại sau nhé.');
            return;
        }
        setQuizState({ phase: 'reading', data, currentQ: 0, userAnswers: [] });
        const msg = `📖 **${data.source}**\n\n${data.passage}\n\n---\nSau khi đọc kĩ văn bản, ${pronoun} sẽ bắt đầu hỏi. Hãy đọc thật kĩ nhé. Nếu em đã sẵn sàng hãy gõ **"Bắt đầu"**.`;
        addAssistant(msg);
    }, [addAssistant]);

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
        const justFinished = (Date.now() - lastTaskEndRef.current) < TASK_COOLDOWN_MS;
        if ((isBusy || justFinished) && !awaitingTaskInterrupt) {
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

        // ── Đang chờ mô tả chủ đề dẫn chứng ────────────────────────────────────
        if (pendingCitationPrompt) {
            setPendingCitationPrompt(false);
            const topic = val;
            if (!topic) {
                addAssistant('Em mô tả rõ hơn chủ đề cần dẫn chứng nhé.');
                setPendingCitationPrompt(true);
                return;
            }

            if (!isApiKeyConfigured()) {
                addAssistant('API Key chưa được cấu hình. Thêm VITE_GOOGLE_API_KEY vào file .env.');
                return;
            }

            addAssistant(`${pronoun.charAt(0).toUpperCase() + pronoun.slice(1)} đang tìm dẫn chứng cho chủ đề: "${topic}"...`);
            startBusy();
            try {
                const citationPrompt = CITATION_GENERATION_PROMPT.replace('{{TOPIC}}', topic);
                const { text: citationResult } = await sendChatMessage(messages, citationPrompt, null);
                addAssistant(citationResult || 'Không tìm được dẫn chứng phù hợp. Em thử chủ đề khác nhé.');
            } catch {
                addAssistant('Có lỗi khi tìm dẫn chứng. Em thử lại sau nhé.');
            } finally {
                endBusy();
            }
            return;
        }

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
            addAssistant(`${pronoun.charAt(0).toUpperCase() + pronoun.slice(1)} sẽ tạo một ảnh đồ hoạ minh hoạ cho chủ đề Ngữ văn: "${topic}". Đợi một chút nhé...`);
            startBusy();
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
                endBusy();
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
        const wantsExam = /tạo\s*đề|ra\s*đề|cho em\s*đề|đề thi ngữ văn|(?:thầy|cô)\s*ra\s*đề/i.test(lower);
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

        // ── Detect citation request ─────────────────────────────────────────
        const wantsCitation = /(dẫn chứng|tìm dẫn chứng|cho em dẫn chứng|dẫn chứng cho)/i.test(lower);
        if (wantsCitation) {
            askCitationTopic();
            return;
        }

        // Quiz answers are now handled via handleQuizAnswer (clickable buttons)
        // No need to handle quiz answers from text input

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
                effectiveInput = `${LESSON_TEACH_PROMPT}\n\nQUAN TRỌNG: Xưng hô là "${pronoun}" khi nói với học sinh. Ví dụ: "${Pronoun} sẽ giảng phần tiếp theo...", "${Pronoun} muốn hỏi em...".${resumeContext}\n\n[NỘI DUNG LÝ THUYẾT]:\n${activeLesson.docxContent}\n\n[CÂU TRẢ LỜI CỦA HỌC SINH]: ${val}`;
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
                const ack = `Chờ chút, ${pronoun} sẽ tóm tắt và tạo infographic về "${workTitle}" cho em nhé.`;
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
        let examType: 'reading' | 'writing' | 'full';
        let label: string;
        if (choice === 'b') { examType = 'writing'; label = 'Đề viết'; }
        else if (choice === 'c') { examType = 'full'; label = 'Đề tổng hợp'; }
        else { examType = 'reading'; label = 'Đề đọc hiểu'; }

        addAssistant(`${pronoun.charAt(0).toUpperCase() + pronoun.slice(1)} đang tạo ${label} từ ngân hàng đề thi THPT cho em, chờ xíu...`);
        startBusy();
        try {
            const { buildExamFromPool } = await import('../services/examPoolService');
            const exam = await buildExamFromPool(examType);
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
        } catch (err) {
            console.error('Exam pool error:', err);
            endBusy();
            addAssistant('Lỗi tạo đề thi, em thử lại sau nhé.');
        }
    }, [addAssistant, autoSpeak, resetProactiveTimer, playNotification]);

    const startGraphicFlow = () => {
        // Giả lập như user vừa nói "Em muốn tạo ảnh đồ họa ạ"
        const syntheticUser: Message = { role: 'user', content: 'Em muốn tạo ảnh đồ hoạ ạ' };
        setMessages(prev => [...prev, syntheticUser]);
        askGraphicTopic();
    };

    // ── Citation flow ───────────────────────────────────────────────────────
    const askCitationTopic = useCallback(() => {
        const suggestion = [
            'nghị luận về lòng biết ơn',
            'nghị luận về ý chí vượt khó',
            'phân tích một tác phẩm văn học',
        ].join('\n- ');
        const msg = `Em muốn tìm dẫn chứng cho chủ đề gì?\n\nMột vài gợi ý:\n- ${suggestion}\n\nEm gõ ngắn gọn chủ đề cần dẫn chứng nhé.`;
        setPendingCitationPrompt(true);
        addAssistant(msg);
    }, [addAssistant]);

    const startCitationFlow = useCallback(() => {
        const syntheticUser: Message = { role: 'user', content: 'Em muốn tìm dẫn chứng ạ' };
        setMessages(prev => [...prev, syntheticUser]);
        askCitationTopic();
    }, [askCitationTopic]);

    // ── Quiz flow (clickable buttons) ────────────────────────────────────────
    const startQuizFlow = useCallback(() => {
        const syntheticUser: Message = { role: 'user', content: 'Em muốn làm quiz trắc nghiệm ạ' };
        setMessages(prev => [...prev, syntheticUser]);
        startInlineQuiz();
    }, [startInlineQuiz]);

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
            addAssistant(`Sau đây ${pronoun} sẽ cùng em bắt đầu học bài: "${lesson.title}" nhé. Em đã sẵn sàng chưa?`);
        } else {
            // Resume mode: add a welcome-back message so chat area isn't empty
            if (messages.length === 0) {
                addAssistant(`Chào em! Mình tiếp tục bài "${lesson.title}" nhé. Em gõ "sẵn sàng" hoặc bất kỳ câu hỏi nào để bắt đầu.`);
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
        startCitationFlow, startQuizFlow, handleQuizAnswer,
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
