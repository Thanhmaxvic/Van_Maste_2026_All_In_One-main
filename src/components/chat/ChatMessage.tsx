import React, { useState } from 'react';
import { Play, BookOpen, Square } from 'lucide-react';
import type { Message, AIExamData } from '../../types';
import type { ExamGrade } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { stopCurrentAudio } from '../../services/ttsService';

interface ChatMessageProps {
    message: Message & { examGrade?: ExamGrade };
    onPlayTTS: (text: string) => void;
    onStartAIExam?: (exam: AIExamData) => void;
    onQuizAnswer?: (answer: string) => void;
    onMCQSelect?: (answer: string) => void;
    onQuickReply?: (text: string) => void;
}

function clean(raw: string): string {
    return raw
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1');
}

function renderBody(text: string, isUser: boolean, mcqState?: { selected: Record<number, string>, onSelect: (qIdx: number, letter: string) => void } | null): React.ReactNode {
    // Extract [SỬA]...[/SỬA] correction blocks
    const correctionMatch = text.match(/\[SỬA\]([\s\S]*?)\[\/SỬA\]/);
    const correctionText = correctionMatch ? correctionMatch[1].trim() : null;
    const mainText = text.replace(/\[SỬA\][\s\S]*?\[\/SỬA\]\s*/g, '').trim();

    const lines = mainText.split('\n');
    let currentQIdx = -1; // Track which question we're in
    const bodyElements = lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 4 }} />;

        // Detect question header like "Câu 1:", "Câu 2:", etc.
        if (/^Câu\s*\d+/i.test(t)) {
            currentQIdx++;
        }

        // MCQ options: A. B. C. D.
        if (/^[A-D]\.\s/.test(t)) {
            const letter = t[0];
            const rest = t.slice(3);
            const qIdx = Math.max(0, currentQIdx); // fallback to 0 if no question header found
            const isClickable = mcqState && !isUser;
            const selectedForQ = mcqState?.selected[qIdx];
            const isSelected = selectedForQ === letter;
            const isDimmed = selectedForQ && selectedForQ !== letter;
            return (
                <button
                    key={i}
                    type="button"
                    className={`bubble mcq-opt mcq-clickable ${isSelected ? 'mcq-selected' : ''} ${isDimmed ? 'mcq-dimmed' : ''}`}
                    onClick={() => isClickable && !selectedForQ && mcqState?.onSelect(qIdx, letter)}
                    disabled={!isClickable || !!selectedForQ}
                    style={{ cursor: isClickable && !selectedForQ ? 'pointer' : 'default', width: '100%', textAlign: 'left', border: 'none', fontFamily: 'inherit' }}
                >
                    <span className="mcq-badge">{letter}</span>
                    <span style={{ fontSize: 13.5 }}>{rest}</span>
                </button>
            );
        }
        // Bullet
        if (t.startsWith('- ') || t.startsWith('• ')) {
            return (
                <div key={i} className="bullet-line">
                    {!isUser && <span className="bullet-dot" />}
                    <span style={{ fontSize: 13.5 }}>{t.slice(2)}</span>
                </div>
            );
        }
        return <p key={i} style={{ margin: '2px 0', fontSize: 13.5, lineHeight: 1.6 }}>{t}</p>;
    });

    return (
        <>
            {correctionText && !isUser && (
                <div className="spelling-correction">
                    <span className="spelling-icon">✏️</span>
                    <span>{correctionText}</span>
                </div>
            )}
            {bodyElements}
        </>
    );
}

function GradeBubble({ grade }: { grade: ExamGrade }) {
    const pct = Math.round((grade.score / grade.maxScore) * 100);
    return (
        <div className="grade-bubble">
            <div style={{ marginBottom: 12 }}>
                <div className="grade-score">
                    {grade.score}<span>/{grade.maxScore}</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                    {pct}% — {pct >= 80 ? 'Xuất sắc' : pct >= 65 ? 'Khá' : pct >= 50 ? 'Trung bình' : 'Cần cố gắng'}
                </div>
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.9, marginBottom: 12 }}>{grade.feedback}</div>

            {grade.errors.length > 0 && (
                <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', opacity: 0.65, marginBottom: 6 }}>
                        Lỗi cần sửa
                    </div>
                    {grade.errors.map((err, i) => (
                        <div key={i} className="grade-error-item">
                            <div className="grade-error-quote">"{err.quote}"</div>
                            <div className="grade-error-issue">{err.issue}</div>
                            <div className="grade-error-fix">{err.suggestion}</div>
                        </div>
                    ))}
                </div>
            )}

            {grade.improvements.length > 0 && (
                <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', opacity: 0.65, marginBottom: 6 }}>
                        Cải thiện văn phong
                    </div>
                    {grade.improvements.map((imp, i) => (
                        <div key={i} style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>- {imp}</div>
                    ))}
                </div>
            )}

            {(grade.weaknesses.length > 0 || grade.strengths.length > 0) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {grade.weaknesses.map((w, i) => (
                        <span key={i} style={{ background: 'rgba(239,68,68,.25)', color: '#FCA5A5', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5 }}>{w}</span>
                    ))}
                    {grade.strengths.map((s, i) => (
                        <span key={i} style={{ background: 'rgba(34,197,94,.2)', color: '#86EFAC', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5 }}>{s}</span>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Card hiển thị câu hỏi lựa chọn A/B/C/D dạng nút bấm */
function QuizButtons({ options, onAnswer }: { options: { a: string; b: string; c: string; d: string }; onAnswer?: (answer: string) => void }) {
    const [selected, setSelected] = useState<string | null>(null);
    const letters = ['a', 'b', 'c', 'd'] as const;
    const labels = { a: 'A', b: 'B', c: 'C', d: 'D' };

    const handleClick = (letter: string) => {
        if (selected) return;
        setSelected(letter);
        onAnswer?.(letter);
    };

    return (
        <div className="quiz-options-grid">
            {letters.map(l => (
                <button
                    key={l}
                    className={`quiz-option-btn ${selected === l ? 'selected' : ''} ${selected && selected !== l ? 'dimmed' : ''}`}
                    onClick={() => handleClick(l)}
                    disabled={!!selected}
                >
                    <span className="quiz-option-badge">{labels[l]}</span>
                    <span className="quiz-option-text">{options[l]}</span>
                </button>
            ))}
        </div>
    );
}

/** Card hiển thị câu hỏi luyện tập theo ngữ cảnh */
function AIExamCard({ exam, onStart }: { exam: AIExamData; onStart: () => void }) {
    const typeLabel = exam.type === 'reading' ? 'Đọc hiểu' : exam.type === 'writing' ? 'Phần Viết' : 'Tổng hợp';
    const durationLabel = `${exam.durationMinutes} phút`;
    const questionCount = exam.questions.length;
    return (
        <div style={{
            marginTop: 10,
            background: 'linear-gradient(135deg, #1a2e1a 0%, #0f2218 100%)',
            border: '1px solid rgba(74,222,128,.3)',
            borderRadius: 16,
            padding: '14px 16px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <BookOpen size={13} color="#4ade80" />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    Đề thi AI — THPT 2026
                </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f0fdf4', marginBottom: 4 }}>{exam.title}</div>
            {exam.source && <div style={{ fontSize: 11, color: 'rgba(240,253,244,.6)', marginBottom: 8 }}>Ngữ liệu: {exam.source}</div>}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 11, background: 'rgba(74,222,128,.15)', color: '#86efac', padding: '2px 8px', borderRadius: 20 }}>{typeLabel}</span>
                <span style={{ fontSize: 11, background: 'rgba(74,222,128,.15)', color: '#86efac', padding: '2px 8px', borderRadius: 20 }}>{durationLabel}</span>
                <span style={{ fontSize: 11, background: 'rgba(74,222,128,.15)', color: '#86efac', padding: '2px 8px', borderRadius: 20 }}>{questionCount} câu</span>
            </div>
            <button
                onClick={onStart}
                style={{
                    background: 'linear-gradient(135deg, #16a34a, #15803d)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '8px 20px',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    width: '100%',
                    letterSpacing: '.02em',
                }}
            >
                Làm bài →
            </button>
        </div>
    );
}

/** Quick-reply pill buttons under AI messages */
function QuickReplyBtns({ replies, onReply }: { replies: string[]; onReply?: (t: string) => void }) {
    const [used, setUsed] = useState(false);
    if (used || !replies.length) return null;
    return (
        <div className="quick-reply-row">
            {replies.map((r, i) => (
                <button
                    key={i}
                    type="button"
                    className="quick-reply-btn"
                    onClick={() => { setUsed(true); onReply?.(r); }}
                >
                    {r}
                </button>
            ))}
        </div>
    );
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onPlayTTS, onStartAIExam, onQuizAnswer, onMCQSelect, onQuickReply }) => {
    const isUser = message.role === 'user';
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [mcqSelected, setMcqSelected] = useState<Record<number, string>>({});
    const { userProfile } = useAuth();
    const botAvatar = userProfile?.voiceGender === 'female' ? '/images/female.webp' : '/images/male.webp';

    // Detect if this message contains inline MCQ options (A. B. C. D.)
    const hasMCQ = !isUser && /^[A-D]\.\s/m.test(message.content);

    const handleMCQClick = (qIdx: number, letter: string) => {
        if (mcqSelected[qIdx]) return; // Already answered this question
        setMcqSelected(prev => ({ ...prev, [qIdx]: letter }));

        // Build answer string like "Câu 1: A, Câu 2: B" once all questions are answered
        const updated = { ...mcqSelected, [qIdx]: letter };
        // Count total questions in this message
        const totalQs = (message.content.match(/^Câu\s*\d+/gim) || []).length || 1;
        const answeredCount = Object.keys(updated).length;
        if (answeredCount >= totalQs) {
            // All questions answered — send combined answer
            const answerText = Object.entries(updated)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([idx, l]) => `Câu ${Number(idx) + 1}: ${l}`)
                .join(', ');
            onMCQSelect?.(answerText);
        }
    };

    if (message.examGrade) {
        return (
            <div className="msg-row assistant slide-up">
                <div className="msg-avatar">
                    <img src={botAvatar} alt="Văn Master" className="bot-avatar-img" />
                </div>
                <GradeBubble grade={message.examGrade} />
            </div>
        );
    }

    const cleaned = clean(message.content);

    if (message.content.includes('[TIMELINE]')) {
        return (
            <div className={`msg-row ${isUser ? 'user' : 'assistant'} slide-up`}>
                {!isUser && <div className="msg-avatar">VM</div>}
                <div className="bubble" style={{ fontStyle: 'italic', color: 'var(--color-text-secondary)', fontSize: 13 }}>
                    {cleaned}
                </div>
            </div>
        );
    }

    // Build mcqState for clickable inline MCQ options
    const mcqState = hasMCQ ? { selected: mcqSelected, onSelect: handleMCQClick } : null;

    return (
        <>
            <div className={`msg-row ${isUser ? 'user' : 'assistant'} slide-up`}>
                {!isUser && (
                    <div className="msg-avatar">
                        <img src={botAvatar} alt="Văn Master" className="bot-avatar-img" />
                    </div>
                )}
                <div>
                    <div className="bubble">
                        {message.image && (
                            <button
                                type="button"
                                className="chat-img-thumb"
                                onClick={() => setPreviewUrl(message.image as string)}
                            >
                                <img
                                    src={message.image}
                                    alt="Ảnh đã gửi"
                                    style={{ borderRadius: 10, marginBottom: 8, maxWidth: '100%' }}
                                />
                            </button>
                        )}
                        {renderBody(cleaned, isUser, mcqState)}
                        {message.generatedImage && (
                            <button
                                type="button"
                                className="chat-img-thumb"
                                onClick={() => setPreviewUrl(message.generatedImage as string)}
                            >
                                <img
                                    src={message.generatedImage}
                                    alt="Ảnh AI"
                                    style={{ borderRadius: 12, marginTop: 10, maxWidth: '100%', display: 'block' }}
                                />
                            </button>
                        )}
                    </div>
                    {/* Quiz option buttons */}
                    {message.quizOptions && (
                        <QuizButtons options={message.quizOptions} onAnswer={onQuizAnswer} />
                    )}
                    {message.aiExam && onStartAIExam && (
                        <AIExamCard exam={message.aiExam} onStart={() => onStartAIExam(message.aiExam!)} />
                    )}
                    {/* Quick-reply buttons */}
                    {message.quickReplies && message.quickReplies.length > 0 && (
                        <QuickReplyBtns replies={message.quickReplies} onReply={onQuickReply} />
                    )}
                    {!isUser && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="tts-btn" onClick={() => onPlayTTS(cleaned)}>
                                <Play size={10} /> Đọc
                            </button>
                            <button className="tts-btn" onClick={stopCurrentAudio}>
                                <Square size={10} /> Dừng
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {previewUrl && (
                <div className="img-modal-backdrop" onClick={() => setPreviewUrl(null)}>
                    <div className="img-modal" onClick={(e) => e.stopPropagation()}>
                        <img src={previewUrl} alt="Xem lớn" className="img-modal-img" />
                        <div className="img-modal-actions">
                            <a
                                href={previewUrl}
                                download="vanmaster-image.png"
                                className="img-download-btn"
                            >
                                Tải ảnh
                            </a>
                            <button
                                type="button"
                                className="img-close-btn"
                                onClick={() => setPreviewUrl(null)}
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ChatMessage;
