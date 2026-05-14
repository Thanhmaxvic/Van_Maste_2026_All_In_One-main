import { useState } from 'react';
import { X, BookOpen, Target, BarChart3, RotateCcw, Trash2, Save, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { CURRICULUM, getLessonKey } from '../../constants/curriculum';
import { updateUserProfile, updateLessonProgress } from '../../services/firebaseService';
import type { AdminUserEntry } from '../../services/firebaseService';
import type { LessonProgress } from '../../types';

interface Props {
    student: AdminUserEntry;
    onClose: () => void;
    onUpdated: (uid: string, data: Partial<AdminUserEntry>) => void;
}

type TabKey = 'progress' | 'profile' | 'stats';

export default function StudentLearningModal({ student, onClose, onUpdated }: Props) {
    const [activeTab, setActiveTab] = useState<TabKey>('progress');
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState('');

    // Editable profile state
    const [targetScore, setTargetScore] = useState(student.targetScore ?? 0);
    const [weaknesses, setWeaknesses] = useState<string[]>(student.weaknesses || []);
    const [strengths, setStrengths] = useState<string[]>(student.strengths || []);
    const [newWeakness, setNewWeakness] = useState('');
    const [newStrength, setNewStrength] = useState('');

    const lessonProgress = student.lessonProgress || {};

    const showSaved = (msg: string) => {
        setSavedMsg(msg);
        setTimeout(() => setSavedMsg(''), 2500);
    };

    // ── Reset a lesson back to not_started ──
    const handleResetLesson = async (sectionId: string, lessonId: string) => {
        const key = getLessonKey(sectionId, lessonId);
        if (!window.confirm(`Đặt lại bài "${key}" về trạng thái chưa học?`)) return;
        setSaving(true);
        try {
            const resetProgress: LessonProgress = {
                status: 'not_started',
                sectionsTotal: lessonProgress[key]?.sectionsTotal || 0,
                sectionsDone: 0,
                currentSectionIndex: 0,
                questionsAsked: 0,
                questionsCorrect: 0,
            };
            await updateLessonProgress(student.uid, key, resetProgress);
            // Update local state
            const updated = { ...lessonProgress, [key]: resetProgress };
            onUpdated(student.uid, { lessonProgress: updated });
            showSaved(`Đã đặt lại bài ${key}`);
        } catch (e) {
            console.error(e);
            alert('Lỗi khi đặt lại bài học');
        } finally {
            setSaving(false);
        }
    };

    // ── Save profile changes ──
    const handleSaveProfile = async () => {
        setSaving(true);
        try {
            const data: Record<string, unknown> = {
                targetScore: Number(targetScore) || 0,
                weaknesses,
                strengths,
            };
            await updateUserProfile(student.uid, data as any);
            onUpdated(student.uid, { targetScore: Number(targetScore), weaknesses, strengths });
            showSaved('Đã lưu hồ sơ thành công');
        } catch (e) {
            console.error(e);
            alert('Lỗi khi lưu hồ sơ');
        } finally {
            setSaving(false);
        }
    };

    // ── Calculate stats ──
    const totalLessons = CURRICULUM.reduce((sum, s) => sum + s.lessons.length, 0);
    const completedLessons = Object.values(lessonProgress).filter(lp => lp.status === 'completed').length;
    const inProgressLessons = Object.values(lessonProgress).filter(lp => lp.status === 'in_progress').length;
    const totalQuestionsAsked = Object.values(lessonProgress).reduce((s, lp) => s + (lp.questionsAsked || 0), 0);
    const totalQuestionsCorrect = Object.values(lessonProgress).reduce((s, lp) => s + (lp.questionsCorrect || 0), 0);
    const accuracy = totalQuestionsAsked > 0 ? Math.round((totalQuestionsCorrect / totalQuestionsAsked) * 100) : 0;

    const tabs: { key: TabKey; label: string; icon: typeof BookOpen }[] = [
        { key: 'progress', label: 'Tiến độ bài học', icon: BookOpen },
        { key: 'profile', label: 'Hồ sơ cá nhân', icon: Target },
        { key: 'stats', label: 'Thống kê', icon: BarChart3 },
    ];

    return (
        <div className="slm-overlay" onClick={onClose}>
            <div className="slm-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="slm-header">
                    <div>
                        <h2 className="slm-title">Học tập — {student.name}</h2>
                        <p className="slm-subtitle">
                            {student.email} · Cấp độ: {student.level} · XP: {student.xp || 0}
                        </p>
                    </div>
                    <button className="slm-close" onClick={onClose}><X size={20} /></button>
                </div>

                {/* Tabs */}
                <div className="slm-tabs">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            className={`slm-tab ${activeTab === t.key ? 'active' : ''}`}
                            onClick={() => setActiveTab(t.key)}
                        >
                            <t.icon size={15} />
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Saved message */}
                {savedMsg && <div className="slm-saved-toast">{savedMsg}</div>}

                {/* Tab content */}
                <div className="slm-body">
                    {activeTab === 'progress' && (
                        <div className="slm-progress-tab">
                            {CURRICULUM.map(section => (
                                <div key={section.id} className="slm-section-group">
                                    <h4 className="slm-section-title" style={{ color: section.color }}>
                                        <section.icon size={16} />
                                        {section.title}
                                    </h4>
                                    <div className="slm-lessons-grid">
                                        {section.lessons.map(lesson => {
                                            const key = getLessonKey(section.id, lesson.id);
                                            const lp = lessonProgress[key];
                                            const status = lp?.status || 'not_started';
                                            const done = lp?.sectionsDone || 0;
                                            const total = lp?.sectionsTotal || 0;
                                            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                                            const qAsked = lp?.questionsAsked || 0;
                                            const qCorrect = lp?.questionsCorrect || 0;

                                            return (
                                                <div key={key} className={`slm-lesson-card status-${status}`}>
                                                    <div className="slm-lesson-top">
                                                        <span className="slm-lesson-name">{lesson.title}</span>
                                                        <span className={`slm-status-badge ${status}`}>
                                                            {status === 'completed' && <><CheckCircle2 size={12} /> Hoàn thành</>}
                                                            {status === 'in_progress' && <><Clock size={12} /> Đang học</>}
                                                            {status === 'not_started' && <><AlertCircle size={12} /> Chưa học</>}
                                                        </span>
                                                    </div>
                                                    <div className="slm-lesson-bar-wrap">
                                                        <div className="slm-lesson-bar" style={{ width: `${pct}%`, background: section.color }} />
                                                    </div>
                                                    <div className="slm-lesson-meta">
                                                        <span>Phần: {done}/{total}</span>
                                                        <span>Câu hỏi: {qCorrect}/{qAsked}</span>
                                                        <span className="slm-difficulty">{lesson.difficulty}</span>
                                                    </div>
                                                    {status !== 'not_started' && (
                                                        <button
                                                            className="slm-reset-btn"
                                                            onClick={() => handleResetLesson(section.id, lesson.id)}
                                                            disabled={saving}
                                                            title="Đặt lại về chưa học"
                                                        >
                                                            <RotateCcw size={12} /> Đặt lại
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'profile' && (
                        <div className="slm-profile-tab">
                            {/* Target Score */}
                            <div className="slm-field-group">
                                <label className="slm-label">Mục tiêu điểm</label>
                                <input
                                    type="number"
                                    min={0} max={10} step={0.5}
                                    value={targetScore}
                                    onChange={e => setTargetScore(Number(e.target.value))}
                                    className="slm-input"
                                />
                            </div>

                            {/* Diagnostic Score */}
                            <div className="slm-field-group">
                                <label className="slm-label">Điểm chẩn đoán ban đầu</label>
                                <div className="slm-readonly-value">
                                    {student.diagnosticScore != null ? student.diagnosticScore.toFixed(1) : 'Chưa kiểm tra'}
                                </div>
                            </div>

                            {/* Weaknesses */}
                            <div className="slm-field-group">
                                <label className="slm-label">Điểm yếu ({weaknesses.length})</label>
                                <div className="slm-tag-list">
                                    {weaknesses.map((w, i) => (
                                        <span key={i} className="slm-tag weakness">
                                            {w}
                                            <button onClick={() => setWeaknesses(prev => prev.filter((_, j) => j !== i))} title="Xoá">
                                                <Trash2 size={11} />
                                            </button>
                                        </span>
                                    ))}
                                    {weaknesses.length === 0 && <span className="slm-empty">Không có điểm yếu</span>}
                                </div>
                                <div className="slm-add-tag">
                                    <input
                                        placeholder="Thêm điểm yếu..."
                                        value={newWeakness}
                                        onChange={e => setNewWeakness(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && newWeakness.trim()) {
                                                setWeaknesses(prev => [...prev, newWeakness.trim()]);
                                                setNewWeakness('');
                                            }
                                        }}
                                        className="slm-input"
                                    />
                                </div>
                            </div>

                            {/* Strengths */}
                            <div className="slm-field-group">
                                <label className="slm-label">Điểm mạnh ({strengths.length})</label>
                                <div className="slm-tag-list">
                                    {strengths.map((s, i) => (
                                        <span key={i} className="slm-tag strength">
                                            {s}
                                            <button onClick={() => setStrengths(prev => prev.filter((_, j) => j !== i))} title="Xoá">
                                                <Trash2 size={11} />
                                            </button>
                                        </span>
                                    ))}
                                    {strengths.length === 0 && <span className="slm-empty">Không có điểm mạnh</span>}
                                </div>
                                <div className="slm-add-tag">
                                    <input
                                        placeholder="Thêm điểm mạnh..."
                                        value={newStrength}
                                        onChange={e => setNewStrength(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && newStrength.trim()) {
                                                setStrengths(prev => [...prev, newStrength.trim()]);
                                                setNewStrength('');
                                            }
                                        }}
                                        className="slm-input"
                                    />
                                </div>
                            </div>

                            {/* User Traits */}
                            {(student.userTraits && student.userTraits.length > 0) && (
                                <div className="slm-field-group">
                                    <label className="slm-label">Đặc điểm cá nhân (AI phát hiện)</label>
                                    <div className="slm-tag-list">
                                        {student.userTraits.map((t, i) => (
                                            <span key={i} className="slm-tag trait">{t}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button className="slm-save-btn" onClick={handleSaveProfile} disabled={saving}>
                                <Save size={15} />
                                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                            </button>
                        </div>
                    )}

                    {activeTab === 'stats' && (
                        <div className="slm-stats-tab">
                            <div className="slm-stats-grid">
                                <div className="slm-stat-box">
                                    <div className="slm-stat-number">{student.avgScore != null && student.avgScore > 0 ? student.avgScore.toFixed(1) : '--'}</div>
                                    <div className="slm-stat-label">Điểm TB</div>
                                </div>
                                <div className="slm-stat-box">
                                    <div className="slm-stat-number">{student.bestScore != null && student.bestScore > 0 ? student.bestScore.toFixed(1) : '--'}</div>
                                    <div className="slm-stat-label">Điểm cao nhất</div>
                                </div>
                                <div className="slm-stat-box">
                                    <div className="slm-stat-number">{student.submissionCount}</div>
                                    <div className="slm-stat-label">Bài đã nộp</div>
                                </div>
                                <div className="slm-stat-box">
                                    <div className="slm-stat-number">{accuracy}%</div>
                                    <div className="slm-stat-label">Tỷ lệ đúng (bài học)</div>
                                </div>
                            </div>

                            {/* Lesson overview */}
                            <div className="slm-overview-section">
                                <h4>Tiến độ kiến thức tổng quan</h4>
                                <div className="slm-overview-bar-wrap">
                                    <div className="slm-overview-bar completed" style={{ width: `${(completedLessons / totalLessons) * 100}%` }} />
                                    <div className="slm-overview-bar in-progress" style={{ width: `${(inProgressLessons / totalLessons) * 100}%` }} />
                                </div>
                                <div className="slm-overview-legend">
                                    <span><span className="dot completed" /> Hoàn thành: {completedLessons}/{totalLessons}</span>
                                    <span><span className="dot in-progress" /> Đang học: {inProgressLessons}</span>
                                    <span><span className="dot not-started" /> Chưa học: {totalLessons - completedLessons - inProgressLessons}</span>
                                </div>
                            </div>

                            {/* Questions stats */}
                            <div className="slm-overview-section">
                                <h4>Câu hỏi trong bài giảng</h4>
                                <div className="slm-q-stats">
                                    <span>Tổng câu hỏi: <strong>{totalQuestionsAsked}</strong></span>
                                    <span>Trả lời đúng: <strong>{totalQuestionsCorrect}</strong></span>
                                    <span>Trả lời sai: <strong>{totalQuestionsAsked - totalQuestionsCorrect}</strong></span>
                                </div>
                            </div>

                            {/* Custom Timeline */}
                            {student.customTimeline && student.customTimeline.length > 0 && (
                                <div className="slm-overview-section">
                                    <h4>Lộ trình cá nhân hoá</h4>
                                    <div className="slm-timeline">
                                        {student.customTimeline.map((item, i) => (
                                            <div key={i} className="slm-timeline-item">
                                                <div className="slm-timeline-dot" />
                                                <div className="slm-timeline-content">
                                                    <span className="slm-timeline-time">{item.time}</span>
                                                    <strong>{item.title}</strong>
                                                    <p>{item.desc}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Active lesson */}
                            {student.activeLesson && (
                                <div className="slm-overview-section">
                                    <h4>Bài đang học dở</h4>
                                    <p className="slm-active-lesson">
                                        Section: <code>{student.activeLesson.sectionId}</code> · Lesson: <code>{student.activeLesson.lessonId}</code>
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
