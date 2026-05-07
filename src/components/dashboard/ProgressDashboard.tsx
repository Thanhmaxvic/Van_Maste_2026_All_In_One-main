/**
 * ProgressDashboard — Tổng hợp tiến trình & năng lực cá nhân hoá
 * 
 * Hiển thị: Radar chart năng lực, điểm yếu/mạnh, gợi ý hành động, thống kê tổng quát.
 * Dùng SVG thuần cho radar chart (không thêm dependency).
 */

import { useMemo } from 'react';
import { Zap, Calendar, ArrowRight } from 'lucide-react';
import type { UserProfile } from '../../types';
import { getWeaknessRecommendations, getSpacedRepetitionLessons } from '../../services/recommendationService';
import { CURRICULUM, getLessonKey } from '../../constants/curriculum';

interface ProgressDashboardProps {
    userProfile: UserProfile;
    onGoToLesson?: (sectionId: string, lessonId: string) => void;
}

// ── Main Dashboard ──────────────────────────────────────────────────────────

export default function ProgressDashboard({ userProfile, onGoToLesson }: ProgressDashboardProps) {
    const weaknessRecs = useMemo(() => getWeaknessRecommendations(userProfile).slice(0, 3), [userProfile]);
    const reviewRecs = useMemo(() => getSpacedRepetitionLessons(userProfile).slice(0, 3), [userProfile]);

    const lp = userProfile.lessonProgress || {};
    const allLessons = CURRICULUM.flatMap(s => s.lessons.map(l => ({ sectionId: s.id, lessonId: l.id })));
    const completedCount = allLessons.filter(l => lp[getLessonKey(l.sectionId, l.lessonId)]?.status === 'completed').length;
    const inProgressCount = allLessons.filter(l => lp[getLessonKey(l.sectionId, l.lessonId)]?.status === 'in_progress').length;
    const totalLessons = allLessons.length;
    const overallPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

    return (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ── Overall Progress Bar ── */}
            <div style={{
                background: 'var(--color-surface)',
                borderRadius: 12,
                border: '1px solid var(--color-border)',
                padding: '12px 16px',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Tiến độ học tập</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: overallPct === 100 ? '#10B981' : '#6366F1' }}>{overallPct}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--color-border)', overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', borderRadius: 4,
                        width: `${overallPct}%`,
                        background: overallPct === 100 ? '#10B981' : 'linear-gradient(90deg, #6366F1, #8B5CF6)',
                        transition: 'width 0.5s ease',
                    }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                    {completedCount} hoàn thành • {inProgressCount} đang học • {totalLessons - completedCount - inProgressCount} chưa bắt đầu
                </div>
            </div>

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
                    {weaknessRecs.map((rec, i) => (
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
                                <div style={{ fontWeight: 600 }}>{rec.title}</div>
                                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{rec.reason}</div>
                            </div>
                            <ArrowRight size={14} color="var(--color-primary)" style={{ flexShrink: 0 }} />
                        </div>
                    ))}
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
