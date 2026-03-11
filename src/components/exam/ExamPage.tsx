import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Send, RefreshCw, CheckCircle, AlertCircle, Mic, MicOff, Square, Play, Maximize2, Clock, Trophy } from 'lucide-react';
import { renderAsync } from 'docx-preview';
import { pickRandomExam, fetchDocxAsText, gradeWithAI, detectAvailableExams } from '../../services/examService';
import { saveExamSubmission, updateSubmissionGrade, completeAssessment, saveExamInsights, getExamHistory } from '../../services/firebaseService';
import { useAuth } from '../../context/AuthContext';
import GradingResult from './GradingResult';
import type { ExamSubmission, ExamGrade, AIExamData } from '../../types';

// ─── Exam state machine ───────────────────────────────────────────────────────
// idle   = page load; exam blurred, show start overlay
// active = fullscreen; exam visible; timer running
// submitting/grading/graded = submission flow
type ExamStatus = 'idle' | 'loading' | 'ready' | 'active' | 'submitting' | 'grading' | 'graded' | 'error';

const EXAM_DURATION_SECONDS = 120 * 60; // 120 minutes

// ─── Speech Recognition types ─────────────────────────────────────────────────
interface ISpeechRecognitionResult { readonly [index: number]: { readonly transcript: string }; readonly isFinal: boolean; }
interface ISpeechRecognitionEvent { readonly resultIndex: number; readonly results: { [i: number]: ISpeechRecognitionResult; length: number }; }
interface ISpeechRecognition {
    lang: string; continuous: boolean; interimResults: boolean;
    onresult: ((e: ISpeechRecognitionEvent) => void) | null;
    onend: (() => void) | null;
    onerror: ((e: { error: string }) => void) | null;
    start(): void; stop(): void; abort(): void;
}
type SpeechRecognitionCtor = new () => ISpeechRecognition;
const _w = window as unknown as Record<string, unknown>;
const SpeechRecognitionAPI: SpeechRecognitionCtor | null =
    (_w.SpeechRecognition || _w.webkitSpeechRecognition || null) as SpeechRecognitionCtor | null;

interface ExamPageProps {
    diagnosticMode?: boolean;
    onDiagnosticDone?: () => void;
    onGradeComplete?: (grade: ExamGrade, resolvedWeaknesses?: string[]) => void;
    /** If set, render this AI-generated exam instead of loading a DOCX file */
    aiExam?: AIExamData;
}

export default function ExamPage({ diagnosticMode = false, onDiagnosticDone, onGradeComplete, aiExam }: ExamPageProps) {
    const { user, userProfile, setUserProfile } = useAuth();
    const [examId, setExamId] = useState<number | null>(aiExam ? 0 : null);
    const [status, setStatus] = useState<ExamStatus>('loading');
    const [answer, setAnswer] = useState('');
    const [gradeResult, setGradeResult] = useState<ExamSubmission['grade'] | null>(null);
    const [showGrading, setShowGrading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [voiceSupported] = useState(() => Boolean(SpeechRecognitionAPI));
    const [isCheating, setIsCheating] = useState(false);
    const [interimAnswer, setInterimAnswer] = useState('');
    /** Real count of available .docx exams (probed on mount) */
    const [availableCount, setAvailableCount] = useState(0);
    /** Map of examId -> best score out of 10 for this user */
    const [examHistory, setExamHistory] = useState<Map<number, number>>(new Map());

    // ── Timer ──────────────────────────────────────────────────────────────────
    const [timeLeft, setTimeLeft] = useState(() => aiExam ? aiExam.durationMinutes * 60 : EXAM_DURATION_SECONDS);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const docxContainerRef = useRef<HTMLDivElement>(null);
    const examWrapperRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const recognitionRef = useRef<ISpeechRecognition | null>(null);

    // Helper: format seconds → MM:SS
    const fmtTime = (s: number) => {
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    };

    const loadExam = useCallback(async (id: number) => {
        if (aiExam || !id) return;
        setStatus('loading');
        setAnswer('');
        setGradeResult(null);
        setShowGrading(false);
        setErrorMsg('');
        setIsCheating(false);
        setTimeLeft(EXAM_DURATION_SECONDS);

        try {
            const url = `/dethi/${id}.docx`;
            const res = await fetch(url, { method: 'HEAD' });
            if (!res.ok) throw new Error('Không tìm thấy đề thi');

            const docxRes = await fetch(url);
            const arrayBuffer = await docxRes.arrayBuffer();
            if (docxContainerRef.current) {
                docxContainerRef.current.innerHTML = '';
                await renderAsync(arrayBuffer, docxContainerRef.current, undefined, {
                    className: 'docx-preview',
                    inWrapper: false,
                    ignoreWidth: true,
                    ignoreHeight: true,
                });
            }
            setStatus('ready'); // shows blur overlay
        } catch (e) {
            console.error(e);
            setErrorMsg('Không thể tải đề thi. Đặt file vào thư mục public/dethi/');
            setStatus('error');
        }
    }, [aiExam]);

    useEffect(() => {
        if (aiExam) {
            // AI-generated exam: skip DOCX loading, go directly to ready state
            setStatus('ready');
            setTimeLeft(aiExam.durationMinutes * 60);
        } else if (examId) {
            loadExam(examId);
        }
    }, [examId, aiExam, loadExam]);
    useEffect(() => () => { recognitionRef.current?.abort(); }, []);

    // ── Probe available exams + load history on mount ────────────────────────
    useEffect(() => {
        if (aiExam) return; // not needed for AI exams
        detectAvailableExams().then(count => {
            setAvailableCount(count);
            setExamId(prev => prev || pickRandomExam(count));
        });
        if (user) {
            getExamHistory(user.uid).then(setExamHistory);
        }
    }, [user, aiExam]);

    // ── Timer logic ────────────────────────────────────────────────────────────
    const startTimer = useCallback(() => {
        timerRef.current = setInterval(() => {
            setTimeLeft(t => {
                if (t <= 1) {
                    clearInterval(timerRef.current!);
                    // auto-submit
                    setStatus(prev => prev === 'active' ? 'submitting' : prev);
                    return 0;
                }
                return t - 1;
            });
        }, 1000);
    }, []);

    const stopTimer = useCallback(() => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }, []);

    // ── Fullscreen & anti-cheat ────────────────────────────────────────────────
    const handleFullscreenChange = useCallback(() => {
        if (status !== 'active') return;
        if (!document.fullscreenElement) {
            // User exited fullscreen → treat as cheating
            setIsCheating(true);
            stopTimer();
            setStatus('submitting');
        }
    }, [status, stopTimer]);

    useEffect(() => {
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [handleFullscreenChange]);

    // ── Start exam: request fullscreen + begin timer ───────────────────────────
    const handleStart = useCallback(async () => {
        try {
            await examWrapperRef.current?.requestFullscreen();
        } catch {
            // Fullscreen denied; proceed anyway
        }
        setStatus('active');
        startTimer();
        setTimeout(() => textareaRef.current?.focus(), 300);
    }, [startTimer]);

    // ── Auto-submit when status flips to 'submitting' ─────────────────────────
    useEffect(() => {
        if (status === 'submitting') {
            handleSubmit(isCheating);
        }
    }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── STT ────────────────────────────────────────────────────────────────────
    const toggleRecording = () => {
        if (!voiceSupported) { alert('Trình duyệt không hỗ trợ nhận diện giọng nói.'); return; }
        if (isRecording) {
            recognitionRef.current?.stop();
            setIsRecording(false);
            setInterimAnswer('');
            return;
        }

        if (!SpeechRecognitionAPI) return;
        const recog = new SpeechRecognitionAPI();
        recog.lang = 'vi-VN';
        recog.continuous = true;
        recog.interimResults = true;

        // Note: we don't clear answer, we append to it.
        // We'll use a local variable to keep track of what's been added in THIS session
        let sessionFinal = '';

        recog.onresult = (event: ISpeechRecognitionEvent) => {
            let interim = '';
            let newFinalAdded = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    newFinalAdded += t + ' ';
                } else {
                    interim = t;
                }
            }

            if (newFinalAdded) {
                sessionFinal += newFinalAdded;
                setAnswer(prev => prev + newFinalAdded);
            }
            setInterimAnswer(interim);
        };

        recog.onend = () => {
            setInterimAnswer('');
            setIsRecording(false);
            recognitionRef.current = null;
        };

        recog.onerror = (e) => {
            console.error('Speech error:', e.error);
            setInterimAnswer('');
            setIsRecording(false);
        };

        recognitionRef.current = recog;
        recog.start();
        setIsRecording(true);
        textareaRef.current?.focus();
    };

    const handleNewExam = () => {
        stopTimer();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
        if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); }
        const count = availableCount || 1;
        setExamId(pickRandomExam(count));
    };

    // ── Submit ─────────────────────────────────────────────────────────────────
    const handleSubmit = async (cheating = false) => {
        if (!user || examId == null) return;
        stopTimer();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
        if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); }

        if (!cheating && !answer.trim()) { alert('Em chưa viết bài!'); setStatus('active'); return; }

        setStatus('grading');
        try {
            const submissionId = await saveExamSubmission(user.uid, examId, cheating ? '[GIAN LẬN] ' + answer : answer);

            const [examText, answerKeyText] = await Promise.all([
                fetchDocxAsText(`/dethi/${examId}.docx`).catch(() => 'Không thể đọc đề thi'),
                fetchDocxAsText(`/huongdancham/${examId}.docx`).catch(() => 'Không có hướng dẫn chấm'),
            ]);

            const grade = await gradeWithAI(examText, answerKeyText, answer || '(Bo trang)');
            await updateSubmissionGrade(user.uid, submissionId, grade);

            // Save weakness/strength insights to Firestore
            let resolvedWeaknesses: string[] = [];
            if (userProfile) {
                const insights = await saveExamInsights(user.uid, grade, userProfile);
                resolvedWeaknesses = insights.resolvedWeaknesses || [];
                // Update local profile with resolved weaknesses removed
                setUserProfile(p => p ? {
                    ...p,
                    weaknesses: insights.mergedWeaknesses,
                    strengths: insights.mergedStrengths,
                    avgScore: insights.newAvg,
                    submissionCount: (p.submissionCount || 0) + 1,
                } : p);
            }

            // Complete assessment gate if this was a diagnostic exam
            if (diagnosticMode && grade) {
                const diagScore = +(grade.score / grade.maxScore * 10).toFixed(1);
                await completeAssessment(user.uid, diagScore);
                setUserProfile(p => p ? { ...p, diagnosticScore: diagScore, assessmentDone: true, isOnboarded: true } : p);
                onDiagnosticDone?.();
            }

            setGradeResult(grade);
            setStatus('graded');
            setShowGrading(true);

            // Update local examHistory (best score per exam)
            const scoreOutOf10 = +(grade.score / grade.maxScore * 10).toFixed(1);
            setExamHistory(prev => {
                const next = new Map(prev);
                const existing = next.get(examId);
                if (existing === undefined || scoreOutOf10 > existing) {
                    next.set(examId, scoreOutOf10);
                }
                return next;
            });

            // Switch to chat and show grade result (with resolved weaknesses list)
            onGradeComplete?.(grade, resolvedWeaknesses);
        } catch (err) {
            console.error('Submit error:', err);
            setErrorMsg('Có lỗi khi nộp bài. Vui lòng thử lại.');
            setStatus('error');
        }
    };

    // ── Timer colour ───────────────────────────────────────────────────────────
    const timerColor = timeLeft < 300 ? 'text-red-500 animate-pulse' : timeLeft < 600 ? 'text-amber-500' : 'text-slate-700';
    const isActive = status === 'active';
    const isReadyOrActive = status === 'ready' || status === 'active';
    const bestScore = examId != null ? examHistory.get(examId) : undefined;

    return (
        <div ref={examWrapperRef} className="flex flex-col h-full bg-[#f8f9fa]">
            {/* ── Top bar ── */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
                <div>
                    <h2 className="font-black text-slate-800 text-base flex items-center gap-2">
                        Đề Thi #{examId}
                        {diagnosticMode && (
                            <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                                Chẩn đoán
                            </span>
                        )}
                    </h2>
                    <p className="text-xs text-slate-400">Kỳ thi Tốt nghiệp THPT – Ngữ văn</p>
                </div>
                <div className="flex gap-2 items-center">
                    {/* Timer */}
                    {isActive && (
                        <div className={`flex items-center gap-1 font-mono font-black text-sm px-3 py-1.5 rounded-xl bg-slate-100 ${timerColor}`}>
                            <Clock size={13} /> {fmtTime(timeLeft)}
                        </div>
                    )}
                    {/* Exam history badge */}
                    {bestScore != null && (
                        <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-2 py-1 rounded-full border border-blue-200">
                            Đã làm: {bestScore}/10
                        </span>
                    )}
                    {status === 'ready' && (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1">
                            <CheckCircle size={10} /> Sẵn sàng
                        </span>
                    )}
                    {(status === 'grading' || status === 'submitting') && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full flex items-center gap-1">
                            <Loader2 size={10} className="animate-spin" />
                            {status === 'submitting' ? 'Đang nộp...' : 'AI đang chấm...'}
                        </span>
                    )}
                    {isCheating && (
                        <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-1 rounded-full">
                            ⚠ Gian lận phát hiện
                        </span>
                    )}
                    <button
                        onClick={handleNewExam}
                        disabled={status === 'loading' || status === 'submitting' || status === 'grading'}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-all disabled:opacity-40"
                    >
                        <RefreshCw size={13} /> Đề khác
                    </button>
                    {isActive && (
                        <button
                            onClick={() => handleSubmit(false)}
                            className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-[#0EA5E9] to-indigo-600 px-4 py-2 rounded-xl transition-all hover:scale-105 shadow-md shadow-sky-200"
                        >
                            <Send size={13} /> Nộp Bài
                        </button>
                    )}
                </div>
            </div>

            {/* ── Main split layout ── */}
            <div className="flex flex-1 overflow-hidden relative exam-layout">

                {/* LEFT — Exam paper viewer */}
                <div className="w-1/2 border-r border-slate-200 overflow-y-auto bg-[#f8f9fa] relative exam-left">
                    {status === 'loading' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#f8f9fa]">
                            <Loader2 className="animate-spin text-[#0EA5E9]" size={36} />
                            <p className="text-sm text-slate-500 font-medium">Đang tải đề thi...</p>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
                            <AlertCircle className="text-red-400" size={40} />
                            <p className="text-sm text-slate-600 font-medium">{errorMsg}</p>
                            <p className="text-xs text-slate-400">Đặt file: <code className="bg-slate-100 px-1 rounded">public/dethi/{examId}.docx</code></p>
                        </div>
                    )}

                    {/* AI Exam content (text-based, no DOCX needed) */}
                    {aiExam && (status === 'active' || status === 'ready') && (
                        <div
                            className="px-8 py-6 min-h-full"
                            style={{
                                filter: status === 'ready' ? 'blur(8px)' : 'none',
                                userSelect: status === 'ready' ? 'none' : 'auto',
                                pointerEvents: status === 'ready' ? 'none' : 'auto',
                            }}
                        >
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Đề thi AI — THPT 2025</div>
                            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>{aiExam.title}</h2>
                            {aiExam.source && <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16, fontStyle: 'italic' }}>Ngữ liệu: {aiExam.source}</p>}
                            {aiExam.passage && (
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', fontSize: 13.5, lineHeight: 1.8, color: '#334155', marginBottom: 20, whiteSpace: 'pre-wrap' }}>
                                    {aiExam.passage}
                                </div>
                            )}
                            {aiExam.questions.map(q => (
                                <div key={q.id} style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px dashed #e2e8f0' }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                        <span style={{ background: '#0ea5e9', color: '#fff', borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                            Câu {q.id} ({q.points}đ)
                                        </span>
                                        <p style={{ fontSize: 13.5, color: '#1e293b', lineHeight: 1.7, margin: 0 }}>{q.prompt}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Blurred DOCX exam paper (used when no aiExam) */}
                    {!aiExam && (
                        <div
                            ref={docxContainerRef}
                            className="px-8 py-6 min-h-full transition-all duration-500"
                            style={{
                                display: status === 'error' || status === 'loading' ? 'none' : 'block',
                                filter: status === 'ready' ? 'blur(8px)' : 'none',
                                userSelect: status === 'ready' ? 'none' : 'auto',
                                pointerEvents: status === 'ready' ? 'none' : 'auto',
                            }}
                        />
                    )}

                    {/* Start overlay */}
                    {status === 'ready' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 backdrop-blur-sm z-10">
                            <div className="bg-white rounded-3xl shadow-2xl p-8 mx-6 text-center max-w-sm">
                                <div className="w-16 h-16 bg-gradient-to-br from-sky-400 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                                    <Maximize2 size={28} className="text-white" />
                                </div>
                                <h3 className="font-black text-slate-800 text-xl mb-2">Sẵn sàng vào phòng thi?</h3>
                                <p className="text-slate-500 text-sm mb-1">Đề đang bị làm mờ để đảm bảo công bằng.</p>
                                <p className="text-slate-400 text-xs mb-6">
                                    Sau khi bắt đầu: toàn màn hình, 120 phút đếm ngược.<br />
                                    Thoát màn hình = tự nộp bài + gắn cờ gian lận.
                                </p>
                                <button
                                    onClick={handleStart}
                                    className="w-full bg-gradient-to-r from-[#0EA5E9] to-indigo-600 text-white font-black py-4 rounded-2xl text-lg shadow-lg shadow-sky-200 hover:scale-105 transition-transform flex items-center justify-center gap-2"
                                >
                                    <Play size={20} /> Bắt Đầu Thi
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT — Answer paper */}
                <div className="w-1/2 overflow-y-auto flex flex-col exam-right" style={{ background: '#fffef7' }}>
                    {/* Paper header */}
                    <div className="px-6 pt-5 pb-3 border-b-2 border-slate-300">
                        <div className="text-center mb-3">
                            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Bài Làm Của Học Sinh</p>
                            <div className="flex justify-center gap-6 mt-2 text-xs text-slate-400">
                                <span>Môn: <span className="font-bold text-slate-600">Ngữ văn</span></span>
                                <span>Đề số: <span className="font-bold text-slate-600">#{examId}</span></span>
                                <span>Ngày: <span className="font-bold text-slate-600">{new Date().toLocaleDateString('vi-VN')}</span></span>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-400 border-t border-dashed border-slate-200 pt-2">
                            <div>Họ tên: <span className="border-b border-slate-300 inline-block w-32 ml-1" /></div>
                            <div>Số báo danh: <span className="border-b border-slate-300 inline-block w-20 ml-1" /></div>
                        </div>
                    </div>

                    {/* Not-started placeholder */}
                    {!isReadyOrActive && status !== 'loading' && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 p-8 text-center">
                            <Trophy size={40} className="opacity-30" />
                            <p className="font-medium text-sm">Bài làm sẽ xuất hiện ở đây sau khi bắt đầu.</p>
                        </div>
                    )}

                    {isReadyOrActive && (
                        <>
                            {/* Voice input banner */}
                            {voiceSupported && (
                                <div className={`flex items-center justify-between px-4 py-2 text-xs transition-all ${isRecording ? 'bg-red-50 border-b border-red-200' : 'bg-slate-50 border-b border-slate-100'}`}>
                                    <div className="flex items-center gap-2">
                                        {isRecording ? (
                                            <>
                                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
                                                <span className="text-red-600 font-semibold">Đang nghe... Nói để điền bài</span>
                                            </>
                                        ) : (
                                            <span className="text-slate-500">Dùng giọng nói để điền bài thi nhanh hơn</span>
                                        )}
                                    </div>
                                    <button
                                        onClick={toggleRecording}
                                        disabled={!isActive}
                                        className={`flex items-center gap-1.5 font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-40 ${isRecording ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-[#0EA5E9] text-white hover:bg-sky-600'}`}
                                    >
                                        {isRecording ? <><Square size={11} /> Dừng</> : <><Mic size={11} /> Nói</>}
                                    </button>
                                </div>
                            )}

                            {/* Textarea */}
                            <div className="flex-1 relative px-6 py-2" style={{
                                backgroundImage: 'repeating-linear-gradient(transparent, transparent 31px, #d1d9e6 31px, #d1d9e6 32px)',
                                backgroundPositionY: '4px',
                            }}>
                                <textarea
                                    ref={textareaRef}
                                    value={answer}
                                    onChange={e => setAnswer(e.target.value)}
                                    disabled={!isActive}
                                    placeholder={isActive ? (isRecording ? '' : 'Viết hoặc nói bài làm của em tại đây...') : 'Nhấn Bắt Đầu để mở khoa bài làm...'}
                                    className="w-full h-full min-h-[500px] bg-transparent text-slate-800 resize-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                    style={{
                                        fontFamily: "'TQ-Kingston', 'Handlee', 'Caveat', cursive",
                                        fontSize: '18px',
                                        lineHeight: '32px',
                                        paddingTop: '4px',
                                    }}
                                />

                                {/* Real-time floating interim text */}
                                {isRecording && interimAnswer && (
                                    <div className="absolute left-6 bottom-4 right-6 bg-white/90 backdrop-blur-sm border border-sky-100 shadow-sm p-4 rounded-2xl animate-in slide-in-from-bottom-2 duration-300">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <div className="flex gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                            <span className="text-[10px] font-bold text-sky-500 uppercase tracking-wider">Đang chuyển ngữ...</span>
                                        </div>
                                        <p className="text-slate-600 italic text-sm leading-relaxed">
                                            {interimAnswer}...
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Bottom status bar */}
                            <div className="px-6 py-2 border-t border-slate-200 flex items-center justify-between">
                                {isRecording && voiceSupported && (
                                    <button onClick={toggleRecording} className="flex items-center gap-1 text-[10px] text-red-500 font-bold hover:text-red-700">
                                        <MicOff size={11} /> Dừng ghi âm
                                    </button>
                                )}
                                <div className="ml-auto text-[10px] text-slate-400 font-medium">
                                    {answer.trim() ? answer.trim().split(/\s+/).length : 0} từ
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Grading result overlay */}
            {showGrading && gradeResult && examId != null && (
                <GradingResult
                    grade={gradeResult}
                    examId={examId}
                    onClose={() => setShowGrading(false)}
                    onNewExam={handleNewExam}
                />
            )}
        </div>
    );
}
