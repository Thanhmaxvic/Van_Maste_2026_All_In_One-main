/**
 * ProgressDashboard — Tổng hợp tiến trình & năng lực cá nhân hoá
 * 
 * Hiển thị: Lộ trình giai đoạn hiện tại, gợi ý hành động, thống kê tổng quát.
 */

import { useMemo } from 'react';
import { Zap, Calendar, ArrowRight, Target } from 'lucide-react';
import type { UserProfile, TimelineItem } from '../../types';
import { getWeaknessRecommendations, getSpacedRepetitionLessons, generateAdaptiveTimeline } from '../../services/recommendationService';
import { CURRICULUM, getLessonKey } from '../../constants/curriculum';

interface ProgressDashboardProps {
    userProfile: UserProfile;
    onGoToLesson?: (sectionId: string, lessonId: string) => void;
    onGoToExam?: () => void;
}

/** Parse a lesson key like "s2-b1" into { sectionId, lessonId } */
function parseLessonKey(key: string): { sectionId: string; lessonId: string } | null {
    const m = key.match(/^(s\d+)-(b\d+)$/);
    return m ? { sectionId: m[1], lessonId: m[2] } : null;
}

// ── Main Dashboard ──────────────────────────────────────────────────────────

export default function ProgressDashboard({ userProfile, onGoToLesson, onGoToExam }: ProgressDashboardProps) {
    const weaknessRecs = useMemo(() => getWeaknessRecommendations(userProfile).slice(0, 3), [userProfile]);
    const reviewRecs = useMemo(() => getSpacedRepetitionLessons(userProfile).slice(0, 3), [userProfile]);

    const lp = userProfile.lessonProgress || {};
    const allLessons = CURRICULUM.flatMap(s => s.lessons.map(l => ({ sectionId: s.id, lessonId: l.id })));
    const completedCount = allLessons.filter(l => lp[getLessonKey(l.sectionId, l.lessonId)]?.status === 'completed').length;
    const inProgressCount = allLessons.filter(l => lp[getLessonKey(l.sectionId, l.lessonId)]?.status === 'in_progress').length;
    const totalLessons = allLessons.length;
    const overallPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

    // ── Adaptive Timeline — same data as Sidebar ──
    const timeline = useMemo(() => generateAdaptiveTimeline(userProfile), [userProfile]);
    const currentMilestone = timeline.find(i => i.status === 'in_progress');
    const completedMilestones = timeline.filter(i => i.status === 'done').length;
    const timelinePct = timeline.length > 0 ? Math.round((completedMilestones / timeline.length) * 100) : 0;

    // Build a set of lessonKeys in the current phase for badge matching
    const currentPhaseKeys = useMemo(() => {
        const keys = new Set<string>();
        if (!currentMilestone) return keys;
        const phase = currentMilestone.time;
        timeline.filter(i => i.time === phase && i.lessonKey).forEach(i => keys.add(i.lessonKey!));
        return keys;
    }, [timeline, currentMilestone]);

    const handleMilestoneClick = (item: TimelineItem) => {
        if (item.type === 'exam') {
            onGoToExam?.();
        } else if (item.lessonKey) {
            const parsed = parseLessonKey(item.lessonKey);
            if (parsed) onGoToLesson?.(parsed.sectionId, parsed.lessonId);
        }
    };

    return (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ── Overall Progress Bar ── */}
            <div style={{
                background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #be185d 100%)',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 4px 15px rgba(190, 24, 93, 0.3)',
                padding: '10px 16px',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', letterSpacing: '0.3px' }}>🎮 Tiến độ học tập</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: overallPct === 100 ? '#4ade80' : '#fef08a' }}>{overallPct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(255, 255, 255, 0.2)', overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', borderRadius: 3,
                        width: `${overallPct}%`,
                        background: overallPct === 100 ? '#4ade80' : 'linear-gradient(90deg, #fde047, #f97316)',
                        transition: 'width 0.5s ease',
                        boxShadow: '0 0 10px rgba(253, 224, 71, 0.5)',
                    }} />
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.85)', marginTop: 5, fontWeight: 500 }}>
                    <span style={{ color: '#4ade80', fontWeight: 700 }}>{completedCount}</span> hoàn thành • <span style={{ color: '#fcd34d', fontWeight: 700 }}>{inProgressCount}</span> đang học • {totalLessons - completedCount - inProgressCount} chưa bắt đầu
                </div>
            </div>

            {/* ── Current Phase / Roadmap ── */}
            {currentMilestone && (
                <div style={{
                    background: 'linear-gradient(135deg, #064E3B, #065F46)',
                    borderRadius: 12,
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    padding: '12px 16px',
                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Target size={14} color="#34D399" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#D1FAE5' }}>
                            Lộ trình hiện tại — {currentMilestone.time}
                        </span>
                        <span style={{
                            marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                            color: '#6EE7B7', background: 'rgba(16, 185, 129, 0.2)',
                            padding: '2px 8px', borderRadius: 6,
                        }}>
                            {completedMilestones}/{timeline.length} mốc ({timelinePct}%)
                        </span>
                    </div>
                    <div
                        onClick={() => handleMilestoneClick(currentMilestone)}
                        style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            borderRadius: 8, padding: '10px 12px',
                            cursor: 'pointer', transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16 }}>🔄</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#ECFDF5' }}>
                                    {currentMilestone.title}
                                </div>
                                <div style={{ fontSize: 11, color: '#A7F3D0', marginTop: 2, lineHeight: 1.4 }}>
                                    {currentMilestone.desc}
                                </div>
                            </div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                color: '#FCD34D', fontWeight: 700, fontSize: 12,
                                flexShrink: 0,
                            }}>
                                {currentMilestone.type === 'exam' ? '📝 Luyện đề' : '▶ Học ngay'}
                                <ArrowRight size={14} />
                            </div>
                        </div>
                    </div>
                    {/* Roadmap progress bar */}
                    <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', borderRadius: 2,
                            width: `${timelinePct}%`,
                            background: 'linear-gradient(90deg, #34D399, #6EE7B7)',
                            transition: 'width 0.5s ease',
                        }} />
                    </div>
                </div>
            )}

            {/* ── Action Suggestions (weakness-based) ── */}
            {weaknessRecs.length > 0 && (
                <div style={{
                    background: 'var(--color-surface)',
                    borderRadius: 12,
                    border: '1px solid var(--color-border)',
                    padding: '12px 16px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <Zap size={14} color="#6366F1" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Gợi ý bài học cho em</span>
                    </div>
                    {weaknessRecs.map((rec, i) => {
                        const recKey = getLessonKey(rec.sectionId, rec.lessonId);
                        const isInRoadmap = currentPhaseKeys.has(recKey);
                        return (
                            <div
                                key={i}
                                onClick={() => onGoToLesson?.(rec.sectionId, rec.lessonId)}
                                style={{
                                    fontSize: 12, color: 'var(--color-text)', padding: '8px 10px',
                                    background: 'var(--color-surface-2)', borderRadius: 8, marginBottom: 6,
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                }}
                            >
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {rec.title}
                                        {isInRoadmap && (
                                            <span style={{
                                                fontSize: 10, fontWeight: 700, color: '#059669',
                                                background: '#D1FAE5', padding: '1px 6px', borderRadius: 4,
                                            }}>
                                                📌 Lộ trình
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{rec.reason}</div>
                                </div>
                                <ArrowRight size={14} color="var(--color-primary)" style={{ flexShrink: 0 }} />
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Spaced Repetition Suggestions ── */}
            {reviewRecs.length > 0 && (
                <div style={{
                    background: '#F0F9FF',
                    borderRadius: 12,
                    border: '1px solid #BAE6FD',
                    padding: '12px 16px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <Calendar size={14} color="#0369A1" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0369A1' }}>Nên ôn lại</span>
                    </div>
                    {reviewRecs.map((rec, i) => (
                        <div
                            key={i}
                            onClick={() => onGoToLesson?.(rec.sectionId, rec.lessonId)}
                            style={{
                                fontSize: 12, color: '#0C4A6E', padding: '8px 10px',
                                background: '#E0F2FE', borderRadius: 8, marginBottom: 6,
                                cursor: 'pointer', transition: 'all 0.2s',
                                display: 'flex', alignItems: 'center', gap: 8,
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600 }}>{rec.title}</div>
                                <div style={{ fontSize: 11, color: '#075985', marginTop: 2 }}>{rec.reason}</div>
                            </div>
                            <ArrowRight size={14} color="#0369A1" style={{ flexShrink: 0 }} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
