import React, { useState } from 'react';
import { Play, BookOpen } from 'lucide-react';
import type { Message, AIExamData } from '../../types';
import type { ExamGrade } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface ChatMessageProps {
    message: Message & { examGrade?: ExamGrade };
    onPlayTTS: (text: string) => void;
    onStartAIExam?: (exam: AIExamData) => void;
}

function clean(raw: string): string {
    return raw
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1');
}

function renderBody(text: string, isUser: boolean): React.ReactNode {
    const lines = text.split('\n');
    return lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 4 }} />;

        // MCQ options: A. B. C. D.
        if (/^[A-D]\.\s/.test(t)) {
            const letter = t[0];
            const rest = t.slice(3);
            return (
                <div key={i} className="bubble mcq-opt">
                    <span className="mcq-badge">{letter}</span>
                    <span style={{ fontSize: 13.5 }}>{rest}</span>
                </div>
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

/** Card hiển thị câu hỏi luyện tập theo ngữ cảnh */

/** Card hiển thị đề thi do AI tạo với nút Làm bài */
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
                    Đề thi AI — THPT 2025
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

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onPlayTTS, onStartAIExam }) => {
    const isUser = message.role === 'user';
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const { userProfile } = useAuth();
    const botAvatar = userProfile?.voiceGender === 'female' ? '/images/female.png' : '/images/male.png';

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
                        {renderBody(cleaned, isUser)}
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
                    {message.aiExam && onStartAIExam && (
                        <AIExamCard exam={message.aiExam} onStart={() => onStartAIExam(message.aiExam!)} />
                    )}
                    {!isUser && (
                        <button className="tts-btn" onClick={() => onPlayTTS(cleaned)}>
                            <Play size={10} /> Đọc
                        </button>
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
