import React, { useState } from 'react';
import { Sparkles, Brain, BookOpen, GraduationCap, Download, Maximize2, Loader2, ArrowRight, History, Check, X, RefreshCw } from 'lucide-react';
import ExamPage from '../exam/ExamPage';
import type { PracticeState } from '../../hooks/useChat';

interface PracticeProps {
    practiceState: PracticeState;
    setPracticeState: React.Dispatch<React.SetStateAction<PracticeState>>;
    startSecondaryQuizDirect: () => void;
    startSecondaryExamDirect: () => void;
    answerSecondaryQuiz: (answer: string) => void;
    loadSecondaryExam: (choice: string) => void;
    loadSecondaryGraphic: (topic: string) => void;
}

export default function Practice({
    practiceState,
    setPracticeState,
    startSecondaryQuizDirect,
    startSecondaryExamDirect,
    answerSecondaryQuiz,
    loadSecondaryExam,
    loadSecondaryGraphic,
}: PracticeProps) {
    const { activeType, quizState, examState, graphicState } = practiceState;
    const [graphicInput, setGraphicInput] = useState('');
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);

    const handleSubTabChange = (type: 'graphic' | 'quiz' | 'exam') => {
        setPracticeState(prev => ({
            ...prev,
            activeType: type
        }));
        if (type === 'quiz' && quizState.phase === 'idle') {
            startSecondaryQuizDirect();
        } else if (type === 'exam' && !examState.activeExam && !examState.awaitingTypeChoice) {
            startSecondaryExamDirect();
        } else if (type === 'graphic' && !graphicState.imageUrl && !graphicState.isLoading) {
            // idle, wait for user input
        }
    };

    const handleCreateGraphicSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const topic = graphicInput.trim();
        if (!topic) return;
        loadSecondaryGraphic(topic);
        setGraphicInput('');
    };

    const handleDownload = async (url: string, prompt: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `Do_hoa_${prompt.replace(/\s+/g, '_')}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (err) {
            // Fallback: open in new tab
            window.open(url, '_blank');
        }
    };

    return (
        <div className="practice-container">
            {/* Header section */}
            <div className="practice-header">
                <div className="practice-title-row">
                    <div className="practice-badge">
                        <Brain size={16} />
                        <span>KHÔNG GIAN LUYỆN TẬP</span>
                    </div>
                    <h2>Thực hành & Bổ trợ</h2>
                    <p className="practice-subtitle">Nơi rèn luyện nâng cao năng lực đọc viết, ghi nhớ kiến thức trực quan và tự đánh giá bản thân.</p>
                </div>

                {/* Sub Tab Selection */}
                <div className="practice-tabs">
                    <button
                        className={`practice-tab-btn ${activeType === 'graphic' ? 'active' : ''}`}
                        onClick={() => handleSubTabChange('graphic')}
                    >
                        <Sparkles size={16} />
                        <span>Đồ hoạ kiến thức</span>
                    </button>
                    <button
                        className={`practice-tab-btn ${activeType === 'quiz' ? 'active' : ''}`}
                        onClick={() => handleSubTabChange('quiz')}
                    >
                        <BookOpen size={16} />
                        <span>Trắc nghiệm AI</span>
                    </button>
                    <button
                        className={`practice-tab-btn ${activeType === 'exam' ? 'active' : ''}`}
                        onClick={() => handleSubTabChange('exam')}
                    >
                        <GraduationCap size={16} />
                        <span>Đề thi thử THPT</span>
                    </button>
                </div>
            </div>

            {/* Content Section */}
            <div className="practice-body">
                {/* 1. GRAPHIC WORKSPACE */}
                {activeType === 'graphic' && (
                    <div className="practice-graphic-panel">
                        <div className="graphic-control-card">
                            <h3>Tạo đồ hoạ trực quan bằng AI</h3>
                            <p>Nhập tác phẩm văn học, nhân vật hoặc chuyên đề kiến thức để AI phân tích vẽ bản đồ tư duy / đồ hoạ học tập.</p>
                            <form onSubmit={handleCreateGraphicSubmit} className="graphic-form">
                                <input
                                    type="text"
                                    placeholder="Ví dụ: Chí Phèo, Vợ nhặt, Sóng, Cách làm văn nghị luận..."
                                    value={graphicInput}
                                    onChange={(e) => setGraphicInput(e.target.value)}
                                    disabled={graphicState.isLoading}
                                />
                                <button type="submit" disabled={graphicState.isLoading || !graphicInput.trim()}>
                                    {graphicState.isLoading ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            <span>Đang tạo...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={16} />
                                            <span>Tạo đồ hoạ</span>
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>

                        {/* Display state */}
                        <div className="graphic-display-pane">
                            {graphicState.isLoading ? (
                                <div className="graphic-loading-view">
                                    <div className="glowing-spinner">
                                        <Brain size={48} className="pulse-brain" />
                                        <Loader2 size={64} className="animate-spin spin-ring" />
                                    </div>
                                    <h4>Đang xử lý phân tích dữ liệu...</h4>
                                    <p className="loading-steps">Đang trích xuất kiến thức cốt lõi & vẽ trực quan hóa tác phẩm</p>
                                </div>
                            ) : graphicState.imageUrl ? (
                                <div className="graphic-result-card">
                                    <div className="result-img-container">
                                        <img src={graphicState.imageUrl} alt={graphicState.prompt} />
                                        <div className="image-overlay-actions">
                                            <button
                                                title="Phóng to"
                                                onClick={() => setZoomedImage(graphicState.imageUrl)}
                                            >
                                                <Maximize2 size={18} />
                                            </button>
                                            <button
                                                title="Tải xuống"
                                                onClick={() => handleDownload(graphicState.imageUrl!, graphicState.prompt)}
                                            >
                                                <Download size={18} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="result-info">
                                        <span className="result-tag">Đã tạo hoàn tất</span>
                                        <h4>Chủ đề: {graphicState.prompt}</h4>
                                    </div>
                                </div>
                            ) : (
                                <div className="graphic-empty-view">
                                    <Sparkles size={48} className="text-muted" />
                                    <h4>Chưa có đồ hoạ nào được yêu cầu</h4>
                                    <p>Nhập tên tác phẩm ở khung bên trái hoặc yêu cầu trực tiếp qua ô Chat học tập để xem ở đây.</p>
                                </div>
                            )}
                        </div>

                        {/* History section */}
                        {graphicState.history.length > 0 && (
                            <div className="graphic-history-section">
                                <div className="section-title">
                                    <History size={16} />
                                    <span>Lịch sử đồ họa đã tạo</span>
                                </div>
                                <div className="history-grid">
                                    {graphicState.history.map((item, idx) => (
                                        <div
                                            key={idx}
                                            className={`history-card ${graphicState.prompt === item.prompt ? 'active' : ''}`}
                                            onClick={() => setPracticeState(prev => ({
                                                ...prev,
                                                graphicState: { ...prev.graphicState, prompt: item.prompt, imageUrl: item.url }
                                            }))}
                                        >
                                            <img src={item.url} alt={item.prompt} />
                                            <div className="history-card-label">
                                                <span>{item.prompt}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 2. QUIZ WORKSPACE */}
                {activeType === 'quiz' && (
                    <div className="practice-quiz-panel">
                        {quizState.phase === 'loading' && (
                            <div className="quiz-loading-view">
                                <Loader2 size={48} className="animate-spin text-primary" />
                                <h4>Đang khởi tạo bộ trắc nghiệm đọc hiểu văn bản...</h4>
                                <p>Hệ thống AI đang lựa chọn đoạn trích và sinh bộ câu hỏi tối ưu dành cho em.</p>
                            </div>
                        )}

                        {quizState.phase === 'reading' && quizState.data && (
                            <div className="quiz-reading-view">
                                <div className="passage-card">
                                    <div className="card-header">
                                        <BookOpen size={18} />
                                        <span>VĂN BẢN ĐỌC HIỂU: {quizState.data.source}</span>
                                    </div>
                                    <div className="passage-content">
                                        {quizState.data.passage.split('\n').map((para, i) => (
                                            <p key={i}>{para}</p>
                                        ))}
                                    </div>
                                </div>
                                <div className="reading-actions">
                                    <p>💡 Đọc kĩ đoạn văn trên trước khi bấm bắt đầu làm bài trắc nghiệm 10 câu.</p>
                                    <button
                                        onClick={() => setPracticeState(prev => ({
                                            ...prev,
                                            quizState: { ...prev.quizState, phase: 'questioning' }
                                        }))}
                                        className="start-quiz-btn"
                                    >
                                        <span>Bắt đầu trả lời câu hỏi</span>
                                        <ArrowRight size={18} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {quizState.phase === 'questioning' && quizState.data && (
                            <div className="quiz-questioning-view">
                                <div className="quiz-status-header">
                                    <span className="q-progress">Câu {quizState.currentQ + 1} trên 10</span>
                                    <div className="progress-bar-container">
                                        <div
                                            className="progress-bar-fill"
                                            style={{ width: `${(quizState.currentQ / 10) * 100}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="quiz-question-card">
                                    <h3>{quizState.data.questions[quizState.currentQ].q}</h3>

                                    <div className="quiz-options-list">
                                        {['a', 'b', 'c', 'd'].map((optKey) => {
                                            const optionText = (quizState.data!.questions[quizState.currentQ] as any)[optKey];
                                            return (
                                                <button
                                                    key={optKey}
                                                    onClick={() => answerSecondaryQuiz(optKey)}
                                                    className="quiz-option-btn"
                                                >
                                                    <span className="opt-letter">{optKey.toUpperCase()}</span>
                                                    <span className="opt-text">{optionText}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {quizState.phase === 'done' && quizState.data && (
                            <div className="quiz-done-view">
                                <div className="result-header-card">
                                    <div className="trophy-badge">
                                        <GraduationCap size={40} />
                                    </div>
                                    <h3>Nộp bài thành công!</h3>
                                    <p>Chúc mừng em đã hoàn thành bài trắc nghiệm chẩn đoán năng lực đọc hiểu văn bản.</p>
                                </div>

                                <div className="results-breakdown">
                                    <h4>Chi tiết đáp án đúng / Sai</h4>
                                    <div className="results-list">
                                        {quizState.data.questions.map((q, idx) => {
                                            const userAns = quizState.userAnswers[idx]?.toLowerCase() || '';
                                            const correctAns = q.correct.toLowerCase();
                                            const isRight = userAns === correctAns;

                                            const getOptionText = (key: string) => {
                                                return (q as any)[key] || '';
                                            };

                                            return (
                                                <div key={idx} className={`result-item-card ${isRight ? 'right' : 'wrong'}`}>
                                                    <div className="result-item-header">
                                                        <span className="q-number">Câu {idx + 1}</span>
                                                        <span className={`status-badge ${isRight ? 'right' : 'wrong'}`}>
                                                            {isRight ? <Check size={14} /> : <X size={14} />}
                                                            <span>{isRight ? 'Đúng' : 'Sai'}</span>
                                                        </span>
                                                    </div>
                                                    <p className="q-text">{q.q}</p>
                                                    <div className="ans-details">
                                                        <div className="user-ans">
                                                            <span>Lựa chọn của em: </span>
                                                            <strong>{userAns.toUpperCase()}. {getOptionText(userAns)}</strong>
                                                        </div>
                                                        {!isRight && (
                                                            <div className="correct-ans">
                                                                <span>Đáp án chính xác: </span>
                                                                <strong>{correctAns.toUpperCase()}. {getOptionText(correctAns)}</strong>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="done-actions">
                                    <button onClick={startSecondaryQuizDirect} className="retry-btn">
                                        <RefreshCw size={18} />
                                        <span>Làm bài quiz mới</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {quizState.phase === 'idle' && (
                            <div className="quiz-empty-view">
                                <BookOpen size={48} className="text-muted" />
                                <h4>Bài trắc nghiệm chẩn đoán AI</h4>
                                <p>Nhấp vào nút dưới để tạo một đề trắc nghiệm đọc hiểu mới 10 câu.</p>
                                <button onClick={startSecondaryQuizDirect} className="btn-primary-glow">
                                    Khởi tạo trắc nghiệm
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* 3. EXAM WORKSPACE */}
                {activeType === 'exam' && (
                    <div className="practice-exam-panel">
                        {examState.awaitingTypeChoice && (
                            <div className="exam-choice-view">
                                <h3>Chọn loại đề luyện thi THPT</h3>
                                <p>Đề thi được biên soạn chuẩn cấu trúc ma trận của Bộ Giáo dục & Đào tạo với hệ thống AI chấm điểm và sửa lỗi chi tiết.</p>

                                <div className="exam-types-grid">
                                    <div className="exam-type-card" onClick={() => loadSecondaryExam('a')}>
                                        <div className="card-icon reading"><BookOpen size={24} /></div>
                                        <h4>Phần I: Đọc hiểu</h4>
                                        <span className="exam-time">Thời gian: 30 phút</span>
                                        <p>Tập trung củng cố kiến thức đọc hiểu văn bản nghị luận xã hội, văn học, các biện pháp tu từ.</p>
                                        <button className="select-exam-btn">Chọn đề này</button>
                                    </div>

                                    <div className="exam-type-card" onClick={() => loadSecondaryExam('b')}>
                                        <div className="card-icon writing"><GraduationCap size={24} /></div>
                                        <h4>Phần II: Làm Văn</h4>
                                        <span className="exam-time">Thời gian: 90 phút</span>
                                        <p>Luyện tập viết các đoạn văn nghị luận xã hội (200 chữ) và bài văn nghị luận văn học phân tích tác phẩm.</p>
                                        <button className="select-exam-btn">Chọn Đề Này</button>
                                    </div>

                                    <div className="exam-type-card featured" onClick={() => loadSecondaryExam('c')}>
                                        <div className="card-icon full"><Sparkles size={24} /></div>
                                        <h4>Đề tổng hợp toàn diện</h4>
                                        <span className="exam-time">Thời gian: 120 phút</span>
                                        <p>Đề thi đầy đủ cả đọc hiểu & Làm văn mô phỏng kì thi THPT thực tế.</p>
                                        <button className="select-exam-btn">Chọn đề này</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {examState.isLoading && (
                            <div className="exam-loading-view">
                                <Loader2 size={48} className="animate-spin text-primary" />
                                <h4>Đang tổ hợp đề thi từ ngân hàng đề THPT...</h4>
                                <p>Đồng bộ hoá dữ liệu văn bản nghị luận và cấu trúc ma trận đề thi.</p>
                            </div>
                        )}

                        {examState.activeExam && (
                            <div className="exam-workspace-container">
                                <ExamPage
                                    aiExam={examState.activeExam}
                                    onGradeComplete={() => {
                                        // Handled in ExamPage internally for display
                                    }}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Fullscreen Image Zoom Modal */}
            {zoomedImage && (
                <div className="image-zoom-overlay" onClick={() => setZoomedImage(null)}>
                    <div className="zoom-modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="close-zoom-btn" onClick={() => setZoomedImage(null)}>
                            <X size={24} />
                        </button>
                        <img src={zoomedImage} alt="Đồ hoạ phóng to" />
                    </div>
                </div>
            )}
        </div>
    );
}
