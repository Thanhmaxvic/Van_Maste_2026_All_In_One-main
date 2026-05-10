import React, { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { Send, Mic, MicOff, Camera, Loader2, X, BookOpen, GraduationCap, ArrowRight } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { useChat } from './hooks/useChat';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import SplashScreen from './components/SplashScreen';
import Header from './components/Header';
import TabNav from './components/TabNav';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/chat/ChatMessage';
import ChatBubble from './components/chat/ChatBubble';
import { incrementTotalVisits, trackOnlinePresence } from './services/firebaseService';
import { findLesson, CURRICULUM } from './constants/curriculum';
import { getSpacedRepetitionLessons } from './services/recommendationService';
import type { ExamGrade, AIExamData } from './types';
import './index.css';

function RotatingLoadingText() {
  const [idx, setIdx] = React.useState(0);
  const msgs = ['Đang phân tích yêu cầu...', 'Đang tìm kiếm thông tin...', 'Đang suy nghĩ...', 'Đang tổng hợp kiến thức...'];
  React.useEffect(() => {
    const timer = setInterval(() => {
      setIdx(i => (i + 1) % msgs.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);
  return <div style={{ fontSize: 13, color: 'var(--color-text-muted)', fontStyle: 'italic', marginLeft: 12 }}>{msgs[idx]}</div>;
}

// ── Lazy-loaded heavy components (code-split) ────────────────────────────────
const ExamPage = React.lazy(() => import('./components/exam/ExamPage'));
const LearningTimeline = React.lazy(() => import('./components/learn/LearningTimeline'));
const StatsTab = React.lazy(() => import('./components/stats/StatsTab'));
const MiniGamesHub = React.lazy(() => import('./components/games/MiniGamesHub'));
const TeacherApp = React.lazy(() => import('./components/teacher/TeacherApp'));
const SettingsPanel = React.lazy(() => import('./components/settings/SettingsPanel'));
const ProgressDashboard = React.lazy(() => import('./components/dashboard/ProgressDashboard'));

/** Shared loading fallback for lazy components */
function LazyFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', flex: 1 }}>
      <div className="loading-dots"><span /><span /><span /></div>
    </div>
  );
}

type Tab = 'chat' | 'learn' | 'exam' | 'stats' | 'games' | 'roadmap';

function StudentApp() {
  const { user, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [panelMode, setPanelMode] = useState<'settings' | 'profile' | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeAIExam, setActiveAIExam] = useState<AIExamData | null>(null);
  const [pendingTabSwitch, setPendingTabSwitch] = useState<Tab | null>(null);

  const onStartDiagnosticExam = useCallback(() => {
    setIsDiagnosing(true);
    setActiveTab('exam');
  }, []);

  const {
    messages, input, setInput, isLoading,
    previewImage, setPreviewImage, chatEndRef, fileInputRef,
    handleSend, handlePlayTTS, addGradeMsg, startGraphicFlow, startExamFlow,
    startLesson, exitLesson, activeLesson: activeLessonState,
    startCitationFlow, startQuizFlow, handleQuizAnswer, abortCurrentTask,
  } = useChat(onStartDiagnosticExam);

  // Resolve active lesson title for the banner
  const activeLessonInfo = activeLessonState
    ? findLesson(activeLessonState.sectionId, activeLessonState.lessonId)
    : null;

  // ── Select lesson from timeline ──────────────────────────────────────
  const handleSelectLesson = useCallback((sectionId: string, lessonId: string) => {
    startLesson(sectionId, lessonId);
    setActiveTab('chat');
  }, [startLesson]);

  // ── Start AI Exam from chat card ──────────────────────────────────────
  const handleStartAIExam = useCallback((exam: AIExamData) => {
    setActiveAIExam(exam);
    setActiveTab('exam');
  }, []);

  const handleTabChange = useCallback((t: typeof activeTab) => {
    if (isLoading) {
      setPendingTabSwitch(t);
    } else {
      setActiveTab(t);
    }
  }, [isLoading]);

  // Handle visibility change (Option B: let background tasks run, so no action needed on visibility change)
  // The user selected Option B: "Cứ để AI chạy ngầm. Khi họ quay lại thì AI đã làm xong và có sẵn kết quả".
  // So we don't need to do anything for visibilitychange! We just let it run.

  // ── Exam grade callback: switch to chat and post result in chat ─────────
  const handleGradeComplete = useCallback((grade: ExamGrade, resolvedWeaknesses?: string[]) => {
    setIsDiagnosing(false);
    setActiveTab('chat');
    addGradeMsg(grade, resolvedWeaknesses);
  }, [addGradeMsg]);

  // ── Speech Recognition ───────────────────────────────────────────────────
  const committedRef = useRef('');
  const { isRecording, toggleRecording } = useSpeechRecognition(
    (final) => {
      committedRef.current += ' ' + final;
      setInput(committedRef.current.trim());
    },
    (interim) => {
      setInput((committedRef.current + ' ' + interim).trim());
    }
  );
  useEffect(() => {
    if (!isRecording) committedRef.current = '';
  }, [isRecording]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      committedRef.current = '';
      handleSend();
    }
  };

  const handleCameraCapture = () => fileInputRef.current?.click();

  return (
    <div className="app-shell">
      <Header
        onOpenPanel={(mode) => setPanelMode(mode)}
      />

      {/* Mobile sidebar overlay (profile & stats) */}
      {userProfile && mobileSidebarOpen && (
        <div
          className="mobile-sidebar-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
        >
          <div
            className="mobile-sidebar-sheet"
            onClick={e => e.stopPropagation()}
          >
            <Sidebar profile={userProfile} />
          </div>
        </div>
      )}

      <div className="app-body">
        {/* Left Sidebar — desktop only */}
        {userProfile && <Sidebar profile={userProfile} />}

        {/* Main Area */}
        <div className="main-area">
          <TabNav active={activeTab} onChange={handleTabChange} />

          {/* Chat Tab */}
          {activeTab === 'chat' && (
            <>
              {/* Lesson mode banner */}
              {activeLessonState && activeLessonInfo && (
                <div className="lesson-banner">
                  <div className="lesson-banner-info">
                    <BookOpen size={16} />
                    <span className="lesson-banner-title">
                      Đang học: {activeLessonInfo.lesson.title}
                    </span>
                    {(() => {
                      const key = `${activeLessonState.sectionId}-${activeLessonState.lessonId}`;
                      const lp = userProfile?.lessonProgress?.[key];
                      if (lp && lp.sectionsTotal > 0) {
                        return (
                          <span className="lesson-banner-progress">
                            {lp.sectionsDone}/{lp.sectionsTotal} phần
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <button
                    className="lesson-banner-exit"
                    onClick={exitLesson}
                    title="Thoát bài học"
                  >
                    <X size={14} />
                    <span>Thoát bài</span>
                  </button>
                </div>
              )}

              <div className="chat-scroll">
                {/* ── Welcome empty state when no messages ── */}
                {messages.length === 0 && !isLoading && (() => {
                  const lp = userProfile?.lessonProgress || {};
                  const allLessons: { sectionId: string; lessonId: string; title: string }[] = [];
                  CURRICULUM.forEach(sec => sec.lessons.forEach(l => allLessons.push({ sectionId: sec.id, lessonId: l.id, title: l.title })));

                  const inProgress = allLessons.find(l => lp[`${l.sectionId}-${l.lessonId}`]?.status === 'in_progress');
                  const nextNew = allLessons.find(l => !lp[`${l.sectionId}-${l.lessonId}`] || lp[`${l.sectionId}-${l.lessonId}`]?.status === 'not_started');
                  const completedCount = allLessons.filter(l => lp[`${l.sectionId}-${l.lessonId}`]?.status === 'completed').length;
                  const hasAnyProgress = Object.keys(lp).length > 0;
                  const allDone = completedCount === allLessons.length && allLessons.length > 0;
                  const reviewLessons = userProfile ? getSpacedRepetitionLessons(userProfile).slice(0, 1) : [];

                  return (
                    <div className="chat-welcome">
                      <div className="chat-welcome-icon">
                        <GraduationCap size={32} />
                      </div>

                      {!hasAnyProgress ? (
                        <>
                          <h2 className="chat-welcome-title">Chào em! Gia sư Ngữ văn AI sẵn sàng hỗ trợ em</h2>
                          <p className="chat-welcome-desc">
                            Em có thể hỏi bất kỳ câu hỏi nào về Ngữ văn, hoặc bắt đầu học bài theo lộ trình.
                            Hãy chọn một trong các cách bên dưới để bắt đầu nhé!
                          </p>
                          <div className="chat-welcome-actions">
                            <button className="chat-welcome-btn primary" onClick={() => setActiveTab('learn')}>
                              <BookOpen size={16} />
                              <span>Bắt đầu học bài</span>
                              <ArrowRight size={14} />
                            </button>
                            <button className="chat-welcome-btn" onClick={startQuizFlow}>
                              Quiz trắc nghiệm
                            </button>
                            <button className="chat-welcome-btn" onClick={startExamFlow}>
                              Tạo đề thi thử
                            </button>
                          </div>
                          <div className="chat-welcome-hint">
                            Hoặc gõ câu hỏi vào ô chat bên dưới — ví dụ: "Phân tích nhân vật Chí Phèo"
                          </div>
                        </>
                      ) : inProgress ? (
                        <>
                          <h2 className="chat-welcome-title">Chào em! Em hãy lựa chọn nội dung học:</h2>
                          <p className="chat-welcome-desc">
                            Tiếp tục bài "{inProgress.title}" từ chỗ đã dừng, hoặc chọn bài mới nếu muốn chuyển chủ đề.
                          </p>
                          <div className="chat-welcome-actions">
                            <button className="chat-welcome-btn primary" onClick={() => startLesson(inProgress.sectionId, inProgress.lessonId, true)}>
                              <BookOpen size={16} />
                              <span>Tiếp tục: {inProgress.title}</span>
                              <ArrowRight size={14} />
                            </button>
                            <button className="chat-welcome-btn" onClick={() => setActiveTab('learn')}>
                              Chọn bài khác
                            </button>
                          </div>
                          <div className="chat-welcome-hint">
                            Hoặc hỏi bất kỳ câu hỏi Ngữ văn nào — em không bắt buộc phải theo bài học
                          </div>
                        </>
                      ) : allDone ? (
                        <>
                          <h2 className="chat-welcome-title">Tuyệt vời! Em đã hoàn thành tất cả bài học</h2>
                          <p className="chat-welcome-desc">
                            Em có thể ôn lại bất kỳ bài nào, làm quiz, hoặc hỏi thêm câu hỏi để củng cố kiến thức.
                          </p>
                          <div className="chat-welcome-actions">
                            <button className="chat-welcome-btn primary" onClick={() => setActiveTab('learn')}>
                              <BookOpen size={16} />
                              <span>Ôn tập lại</span>
                            </button>
                            <button className="chat-welcome-btn" onClick={startQuizFlow}>
                              Quiz trắc nghiệm
                            </button>
                            <button className="chat-welcome-btn" onClick={startExamFlow}>
                              Tạo đề thi thử
                            </button>
                          </div>
                        </>
                      ) : nextNew ? (
                        <>
                          <h2 className="chat-welcome-title">Chào em! Đã hoàn thành {completedCount} bài</h2>
                          <p className="chat-welcome-desc">
                            Bài tiếp theo trong lộ trình: "{nextNew.title}". Tiếp tục học hoặc hỏi bất kỳ câu hỏi nào.
                          </p>
                          <div className="chat-welcome-actions">
                            <button className="chat-welcome-btn primary" onClick={() => startLesson(nextNew.sectionId, nextNew.lessonId)}>
                              <BookOpen size={16} />
                              <span>Học bài tiếp: {nextNew.title}</span>
                              <ArrowRight size={14} />
                            </button>
                            <button className="chat-welcome-btn" onClick={() => setActiveTab('learn')}>
                              Xem lộ trình
                            </button>
                          </div>
                          {reviewLessons.length > 0 && (
                            <div style={{
                              background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10,
                              padding: '10px 14px', marginTop: 8, fontSize: 12, color: '#0C4A6E',
                              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                            }} onClick={() => startLesson(reviewLessons[0].sectionId, reviewLessons[0].lessonId)}>
                              <span style={{ fontSize: 14 }}>🔄</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600 }}>Nên ôn lại: {reviewLessons[0].title}</div>
                                <div style={{ fontSize: 11, color: '#075985', marginTop: 2 }}>{reviewLessons[0].reason}</div>
                              </div>
                            </div>
                          )}
                          <div className="chat-welcome-hint">
                            Hoặc gõ câu hỏi vào ô chat bên dưới
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })()}

                {messages.map((msg, i) => (
                  <ChatMessage
                    key={i}
                    message={msg as Parameters<typeof ChatMessage>[0]['message']}
                    onPlayTTS={handlePlayTTS}
                    onStartAIExam={handleStartAIExam}
                    onQuizAnswer={handleQuizAnswer}
                    onMCQSelect={(letter) => handleSend(letter)}
                    onQuickReply={(text) => handleSend(text)}
                    onReply={(text) => {
                      const snippet = text.length > 50 ? text.substring(0, 50) + '...' : text;
                      const replyText = `> Trả lời cho: "${snippet}"\n`;
                      setInput(replyText);
                      committedRef.current = replyText;
                      const ta = document.querySelector('.chat-input') as HTMLTextAreaElement;
                      if (ta) ta.focus();
                    }}
                  />
                ))}
                {isLoading && (
                  <div className="msg-row assistant slide-up">
                    <div className="msg-avatar">VM</div>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '4px 20px 20px 20px', padding: '10px 16px', boxShadow: 'var(--shadow-sm)' }}>
                      <div className="loading-dots" style={{ margin: 0 }}><span /><span /><span /></div>
                      <RotatingLoadingText />
                    </div>
                  </div>
                )}
                {/* Sentinel div for smooth auto-scroll to latest message */}
                <div ref={chatEndRef as React.RefObject<HTMLDivElement>} />
              </div>

              <div className="input-bar">
                {/* Quick action pills */}
                <div className="quick-actions">
                  {['Đồ hoạ', 'Dẫn chứng', 'Quiz', 'Đề thi'].map(label => (
                    <button
                      key={label}
                      className="qa-btn"
                      onClick={
                        label === 'Đồ hoạ' ? startGraphicFlow
                          : label === 'Đề thi' ? startExamFlow
                            : label === 'Dẫn chứng' ? startCitationFlow
                              : label === 'Quiz' ? startQuizFlow
                                : undefined
                      }
                      disabled={isLoading}
                      style={{ opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Camera preview */}
                {previewImage && (
                  <div style={{ position: 'relative', width: 80 }}>
                    <img src={previewImage} style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 10 }} alt="" />
                    <button onClick={() => setPreviewImage(null)} style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={11} />
                    </button>
                  </div>
                )}

                <div className="input-row">
                  <button className={`icon-btn ${isRecording ? 'active' : ''}`} onClick={toggleRecording} title="Ghi âm">
                    {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>

                  <textarea
                    className="chat-input"
                    rows={1}
                    placeholder={isRecording ? 'Đang nghe...' : 'Hỏi gì cũng được...'}
                    value={input}
                    onChange={e => { setInput(e.target.value); committedRef.current = e.target.value; }}
                    onKeyDown={handleKeyDown}
                  />

                  <button className="icon-btn" onClick={handleCameraCapture} title="Ảnh">
                    <Camera size={18} />
                  </button>
                  <button
                    className="icon-btn send"
                    onClick={() => { committedRef.current = ''; handleSend(); }}
                    disabled={isLoading || (!input.trim() && !previewImage)}
                  >
                    {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => setPreviewImage(ev.target?.result as string);
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
            </>
          )}

          {/* Learn Tab (Timeline & Dashboard) */}
          {activeTab === 'learn' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
              <Suspense fallback={<LazyFallback />}>
                {userProfile && (
                  <ProgressDashboard
                    userProfile={userProfile}
                    onGoToLesson={(sId, lId) => { startLesson(sId, lId); setActiveTab('chat'); }}
                  />
                )}
                <div style={{ borderTop: '4px solid var(--color-surface-hover)', flex: 1, minHeight: 400 }}>
                  <LearningTimeline
                    lessonProgress={userProfile?.lessonProgress || {}}
                    onSelectLesson={handleSelectLesson}
                    userProfile={userProfile}
                  />
                </div>
              </Suspense>
            </div>
          )}

          {/* Roadmap Tab (mobile: chứa nội dung sidebar) */}
          {activeTab === 'roadmap' && userProfile && (
            <div className="roadmap-page">
              <Sidebar profile={userProfile} />
            </div>
          )}

          {/* Exam Tab */}
          {activeTab === 'exam' && (
            <Suspense fallback={<LazyFallback />}>
              <ExamPage
                diagnosticMode={isDiagnosing}
                onDiagnosticDone={() => { setIsDiagnosing(false); setActiveTab('chat'); }}
                onGradeComplete={(grade, resolved) => {
                  setActiveAIExam(null);
                  handleGradeComplete(grade, resolved);
                }}
                aiExam={activeAIExam ?? undefined}
              />
            </Suspense>
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && user && (
            <Suspense fallback={<LazyFallback />}>
              <StatsTab currentUid={user.uid} />
            </Suspense>
          )}

          {/* Games Tab */}
          {activeTab === 'games' && (
            <Suspense fallback={<LazyFallback />}>
              <MiniGamesHub />
            </Suspense>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <SettingsPanel open={!!panelMode} mode={panelMode || 'settings'} onClose={() => setPanelMode(null)} />
      </Suspense>
      <ChatBubble />

      {/* Custom Confirm Modal for Tab Switching */}
      {pendingTabSwitch && (
        <div className="confirm-modal-overlay" onClick={() => setPendingTabSwitch(null)}>
          <div className="confirm-modal-box" onClick={e => e.stopPropagation()}>
            <span className="confirm-modal-emoji">⏳</span>
            <div className="confirm-modal-title">Khoan đã em ơi!</div>
            <div className="confirm-modal-text">
              Tác vụ của em vẫn đang được AI xử lý. Nếu chuyển trang bây giờ thì AI sẽ hủy tác vụ này đó. Em muốn sao nè?
            </div>
            <div className="confirm-modal-actions">
              <button
                className="btn-cancel-task"
                onClick={() => {
                  abortCurrentTask();
                  if (pendingTabSwitch) setActiveTab(pendingTabSwitch);
                  setPendingTabSwitch(null);
                }}
              >
                Hủy tác vụ & Chuyển trang 🚀
              </button>
              <button
                className="btn-stay"
                onClick={() => setPendingTabSwitch(null)}
              >
                Ở lại đợi xíu ⏳
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AppContent() {
  const { user, loading, isTeacher } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#F8FAFC' }}>
        <div className="loading-dots"><span /><span /><span /></div>
      </div>
    );
  }

  if (!user) return <SplashScreen />;

  // Teacher gets a completely different UI
  if (isTeacher) return <Suspense fallback={<LazyFallback />}><TeacherApp /></Suspense>;

  return <StudentApp />;
}

export default function App() {
  useEffect(() => {
    trackOnlinePresence();

    const hasVisited = sessionStorage.getItem('hasVisited');
    if (!hasVisited) {
      incrementTotalVisits();
      sessionStorage.setItem('hasVisited', 'true');
    }
  }, []);

  return <AppContent />;
}
