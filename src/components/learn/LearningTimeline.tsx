import { useState } from 'react';
import { CheckCircle, Lock, Play, ChevronRight } from 'lucide-react';
import { CURRICULUM } from '../../constants/curriculum';
import type { LessonProgress } from '../../types';

interface LearningTimelineProps {
    lessonProgress: Record<string, LessonProgress>;
    onSelectLesson: (sectionId: string, lessonId: string) => void;
}

function getProgressPct(lp: LessonProgress | undefined): number {
    if (!lp || lp.sectionsTotal === 0) return 0;
    if (lp.status === 'completed') return 100;
    const sectionPct = (lp.sectionsDone / lp.sectionsTotal) * 70;
    const questionPct = lp.questionsAsked > 0
        ? (lp.questionsCorrect / lp.questionsAsked) * 30
        : 0;
    return Math.min(Math.round(sectionPct + questionPct), 99);
}

function getSectionPct(sectionId: string, progress: Record<string, LessonProgress>): number {
    const section = CURRICULUM.find(s => s.id === sectionId);
    if (!section || section.lessons.length === 0) return 0;
    let total = 0;
    section.lessons.forEach(l => {
        total += getProgressPct(progress[`${sectionId}-${l.id}`]);
    });
    return Math.round(total / section.lessons.length);
}

export default function LearningTimeline({ lessonProgress, onSelectLesson }: LearningTimelineProps) {
    const [activeSection, setActiveSection] = useState(CURRICULUM[0].id);
    const currentSection = CURRICULUM.find(s => s.id === activeSection) || CURRICULUM[0];

    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-surface-2)',
            overflow: 'hidden',
        }}>
            {/* ── Section Tabs ── */}
            <div style={{
                display: 'flex',
                gap: 0,
                background: 'var(--color-surface)',
                borderBottom: '1px solid var(--color-border)',
                overflowX: 'auto',
                flexShrink: 0,
            }}>
                {CURRICULUM.map(sec => {
                    const pct = getSectionPct(sec.id, lessonProgress);
                    const isActive = sec.id === activeSection;
                    return (
                        <button
                            key={sec.id}
                            onClick={() => setActiveSection(sec.id)}
                            style={{
                                flex: '1 0 auto',
                                minWidth: 0,
                                padding: '10px 12px 10px',
                                background: isActive ? 'var(--color-surface-3)' : 'transparent',
                                border: 'none',
                                borderBottom: isActive ? `2px solid var(--color-primary)` : '2px solid transparent',
                                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                cursor: 'pointer',
                                textAlign: 'center',
                                transition: 'all 0.2s',
                                fontFamily: 'inherit',
                                position: 'relative',
                            }}
                        >
                            <div style={{
                                width: 20, height: 20, margin: '0 auto 4px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                                transition: 'color 0.2s, transform 0.2s',
                                transform: isActive ? 'scale(1.1)' : 'scale(1)'
                            }}>
                                {sec.icon && <sec.icon size={isActive ? 20 : 18} strokeWidth={isActive ? 2.5 : 2} />}
                            </div>
                            <div style={{
                                fontSize: 13,
                                fontWeight: isActive ? 700 : 600,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}>{sec.title}</div>
                            {pct > 0 && (
                                <div style={{
                                    fontSize: 10,
                                    color: pct === 100 ? 'var(--color-success)' : 'var(--color-text-muted)',
                                    fontWeight: 700,
                                    marginTop: 4,
                                    display: 'inline-block'
                                }}>{pct === 100 ? 'Hoàn thành' : `${pct}%`}</div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Section Header + Overall Progress ── */}
            <div style={{
                padding: '20px 24px 12px',
                flexShrink: 0,
                background: 'var(--color-surface-2)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{
                        width: 40, height: 40, background: 'var(--color-surface)', borderRadius: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: currentSection.color,
                        boxShadow: 'var(--shadow-sm)',
                        border: '1px solid var(--color-border)'
                    }}>
                        {currentSection.icon && <currentSection.icon size={20} strokeWidth={2.5} />}
                    </div>
                    <div>
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 2px 0' }}>{currentSection.title}</h2>
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Lộ trình học tập cơ bản</div>
                    </div>
                </div>

                {/* Overall section progress bar */}
                {(() => {
                    const pct = getSectionPct(activeSection, lessonProgress);
                    return (
                        <div>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', fontSize: 12,
                                fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6,
                            }}>
                                <span>Tiến độ phần này</span>
                                <span style={{ color: pct > 0 ? (pct === 100 ? 'var(--color-success)' : 'var(--color-primary)') : 'var(--color-text-muted)' }}>{pct}%</span>
                            </div>
                            <div style={{
                                height: 6, borderRadius: 3, background: 'var(--color-border)',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    height: '100%', borderRadius: 3,
                                    width: `${pct}%`,
                                    background: pct === 100
                                        ? 'var(--color-success)'
                                        : 'var(--color-primary)',
                                    transition: 'width .5s ease',
                                }} />
                            </div>
                        </div>
                    );
                })()}

                {/* Section complete banner */}
                {getSectionPct(activeSection, lessonProgress) === 100 && (
                    <div style={{
                        marginTop: 12,
                        background: '#dcfce7',
                        border: '1px solid #bbf7d0',
                        borderRadius: 8,
                        padding: '8px 12px',
                        display: 'flex', alignItems: 'center', gap: 6,
                        animation: 'slideUp 0.3s ease-out'
                    }}>
                        <CheckCircle size={16} color="var(--color-success)" />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#166534' }}>
                            Đã hoàn thành phần này!
                        </span>
                    </div>
                )}
            </div>

            {/* ── Lesson Cards ── */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0 24px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
            }}>
                {currentSection.lessons.map((lesson, idx) => {
                    const key = `${currentSection.id}-${lesson.id}`;
                    const lp = lessonProgress[key];
                    const pct = getProgressPct(lp);
                    const status = lp?.status || 'not_started';
                    const isCompleted = status === 'completed';
                    const isInProgress = status === 'in_progress';

                    return (
                        <div
                            key={lesson.id}
                            style={{
                                background: 'var(--color-surface)',
                                border: '1px solid',
                                borderColor: isCompleted ? '#bbf7d0' : isInProgress ? 'var(--color-primary-light)' : 'var(--color-border)',
                                borderRadius: 12,
                                padding: '12px 16px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                opacity: status === 'not_started' && idx > 0 ? 0.7 : 1,
                            }}
                            className="hover-card"
                            onClick={() => onSelectLesson(currentSection.id, lesson.id)}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = isCompleted ? '#86efac' : isInProgress ? 'var(--color-primary)' : 'var(--color-border-hover)';
                                e.currentTarget.style.background = 'var(--color-surface-hover)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = isCompleted ? '#bbf7d0' : isInProgress ? 'var(--color-primary-light)' : 'var(--color-border)';
                                e.currentTarget.style.background = 'var(--color-surface)';
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                {/* Status icon */}
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: isCompleted ? '#dcfce7' : isInProgress ? '#eff6ff' : 'var(--color-surface-3)',
                                    color: isCompleted ? 'var(--color-success)' : isInProgress ? 'var(--color-primary)' : 'var(--color-text-muted)',
                                    flexShrink: 0,
                                }}>
                                    {isCompleted
                                        ? <CheckCircle size={18} />
                                        : isInProgress
                                            ? <Play size={16} fill="currentColor" />
                                            : <Lock size={14} />
                                    }
                                </div>

                                {/* Lesson info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: 14, fontWeight: 600,
                                        color: 'var(--color-text)',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                        {idx + 1}. {lesson.title}
                                    </div>
                                    {(isInProgress || isCompleted) && lp && (
                                        <div style={{
                                            fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2,
                                        }}>
                                            {lp.sectionsDone}/{lp.sectionsTotal} phần
                                            {lp.questionsAsked > 0 && ` • ${lp.questionsCorrect}/${lp.questionsAsked} câu`}
                                        </div>
                                    )}
                                </div>

                                {/* Action / badge */}
                                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {isCompleted ? (
                                        <span style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 600 }}>Xong</span>
                                    ) : isInProgress ? (
                                        <span style={{ fontSize: 13, color: 'var(--color-primary)', fontWeight: 600 }}>Tiếp tục</span>
                                    ) : null}
                                    <ChevronRight size={18} color="var(--color-text-muted)" />
                                </div>
                            </div>

                            {/* Progress bar (visible when in-progress) */}
                            {isInProgress && pct > 0 && (
                                <div style={{ marginTop: 12, marginLeft: 48, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{
                                        height: 4, borderRadius: 2, background: 'var(--color-border)', flex: 1, overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            height: '100%', borderRadius: 2,
                                            width: `${pct}%`,
                                            background: 'var(--color-primary)',
                                            transition: 'width .3s ease',
                                        }} />
                                    </div>
                                    <div style={{
                                        fontSize: 11, color: 'var(--color-primary)', fontWeight: 600, minWidth: 28, textAlign: 'right'
                                    }}>{pct}%</div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
