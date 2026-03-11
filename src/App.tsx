import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Mic, MicOff, Camera, Loader2, X } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { useChat } from './hooks/useChat';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import SplashScreen from './components/SplashScreen';
import Header from './components/Header';
import TabNav from './components/TabNav';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/chat/ChatMessage';
import SettingsPanel from './components/settings/SettingsPanel';
import ExamPage from './components/exam/ExamPage';
import LearningTimeline from './components/learn/LearningTimeline';
import type { ExamGrade, AIExamData } from './types';
import './index.css';

type Tab = 'chat' | 'learn' | 'exam' | 'stats' | 'roadmap';

function AppContent() {
  const { user, userProfile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeAIExam, setActiveAIExam] = useState<AIExamData | null>(null);

  const onStartDiagnosticExam = useCallback(() => {
    setIsDiagnosing(true);
    setActiveTab('exam');
  }, []);

  const {
    messages, input, setInput, isLoading,
    previewImage, setPreviewImage, chatEndRef, fileInputRef,
    handleSend, addGradeMsg, startGraphicFlow, startExamFlow,
    startLesson,
  } = useChat(onStartDiagnosticExam);

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

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#F8FAFC' }}>
        <div className="loading-dots"><span /><span /><span /></div>
      </div>
    );
  }

  if (!user) return <SplashScreen />;

  return (
    <div className="app-shell">
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSidebar={() => setMobileSidebarOpen(true)}
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
          <TabNav active={activeTab} onChange={setActiveTab} />

          {/* Chat Tab */}
          {activeTab === 'chat' && (
            <>
              <div className="chat-scroll">
                {messages.map((msg, i) => (
                  <ChatMessage
                    key={i}
                    message={msg as Parameters<typeof ChatMessage>[0]['message']}
                    onPlayTTS={() => { }}
                    onStartAIExam={handleStartAIExam}
                  />
                ))}
                {isLoading && (
                  <div className="msg-row assistant slide-up">
                    <div className="msg-avatar">VM</div>
                    <div className="loading-dots"><span /><span /><span /></div>
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
                            : undefined
                      }
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

          {/* Learn Tab (Timeline) */}
          {activeTab === 'learn' && (
            <LearningTimeline
              lessonProgress={userProfile?.lessonProgress || {}}
              onSelectLesson={handleSelectLesson}
            />
          )}

          {/* Roadmap Tab (mobile: chứa nội dung sidebar) */}
          {activeTab === 'roadmap' && userProfile && (
            <div className="roadmap-page">
              <Sidebar profile={userProfile} />
            </div>
          )}

          {/* Exam Tab */}
          {activeTab === 'exam' && (
            <ExamPage
              diagnosticMode={isDiagnosing}
              onDiagnosticDone={() => { setIsDiagnosing(false); setActiveTab('chat'); }}
              onGradeComplete={(grade, resolved) => {
                setActiveAIExam(null);
                handleGradeComplete(grade, resolved);
              }}
              aiExam={activeAIExam ?? undefined}
            />
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14 }}>
              Tính năng đang được phát triển...
            </div>
          )}
        </div>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default function App() {
  return <AppContent />;
}
