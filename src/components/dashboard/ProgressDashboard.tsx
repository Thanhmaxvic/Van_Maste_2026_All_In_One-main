/**
 * ProgressDashboard — Tổng hợp tiến trình & năng lực cá nhân hoá
 * 
 * Hiển thị: Radar chart năng lực, điểm yếu/mạnh, gợi ý hành động, thống kê tổng quát.
 * Dùng SVG thuần cho radar chart (không thêm dependency).
 */

import React, { useMemo } from 'react';
import { Target, TrendingUp, TrendingDown, BookOpen, Zap, Calendar, Award, ArrowRight } from 'lucide-react';
import type { UserProfile } from '../../types';
import { calculateSkillScores, getWeaknessRecommendations, getSpacedRepetitionLessons } from '../../services/recommendationService';
import { CURRICULUM, getLessonKey } from '../../constants/curriculum';

interface ProgressDashboardProps {
    userProfile: UserProfile;
    onGoToLesson?: (sectionId: string, lessonId: string) => void;
}

// ── SVG Radar Chart ──────────────────────────────────────────────────────────

function RadarChart({ scores }: { scores: Record<string, number> }) {
    const labels = Object.keys(scores);
    const values = Object.values(scores);
    const n = labels.length;
    if (n < 3) return null;

    const size = 200;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = 75;
    const levels = [25, 50, 75, 100];

    const getPoint = (idx: number, value: number) => {
        const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
        const r = (value / 100) * maxR;
        return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    };

    const dataPoints = values.map((v, i) => getPoint(i, v));
    const polygon = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

    return (
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: 220, margin: '0 auto', display: 'block' }}>
            {/* Grid levels */}
            {levels.map(level => {
                const pts = Array.from({ length: n }, (_, i) => getPoint(i, level));
                return (
                    <polygon
                        key={level}
                        points={pts.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke="var(--color-border)"
                        strokeWidth={0.5}
                        opacity={0.5}
                    />
                );
            })}

            {/* Axis lines */}
            {Array.from({ length: n }, (_, i) => {
                const p = getPoint(i, 100);
                return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--color-border)" strokeWidth={0.5} opacity={0.4} />;
            })}

            {/* Data polygon */}
            <polygon points={polygon} fill="rgba(99, 102, 241, 0.15)" stroke="#6366F1" strokeWidth={2} />
            
            {/* Data points */}
            {dataPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#6366F1" stroke="#fff" strokeWidth={1.5} />
            ))}

            {/* Labels */}
            {labels.map((label, i) => {
                const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
                const labelR = maxR + 18;
                const lx = cx + labelR * Math.cos(angle);
                const ly = cy + labelR * Math.sin(angle);
                return (
                    <text
                        key={i}
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{ fontSize: 10, fontWeight: 600, fill: 'var(--color-text-secondary)' }}
                    >
                        {label.length > 10 ? label.slice(0, 9) + '…' : label}
                    </text>
                );
            })}

            {/* Center score */}
            {(() => {
                const avg = Math.round(values.reduce((a, b) => a + b, 0) / n);
                return (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                        style={{ fontSize: 16, fontWeight: 800, fill: '#6366F1' }}>
                        {avg}%
                    </text>
                );
            })()}
        </svg>
    );
}

// ── Main Dashboard ──────────────────────────────────────────────────────────

export default function ProgressDashboard({ userProfile, onGoToLesson }: ProgressDashboardProps) {
    const skills = useMemo(() => calculateSkillScores(userProfile), [userProfile]);
    const weaknessRecs = useMemo(() => getWeaknessRecommendations(userProfile).slice(0, 3), [userProfile]);
    const reviewRecs = useMemo(() => getSpacedRepetitionLessons(userProfile).slice(0, 3), [userProfile]);

    const lp = userProfile.lessonProgress || {};
    const allLessons = CURRICULUM.flatMap(s => s.lessons.map(l => ({ sectionId: s.id, lessonId: l.id })));
    const completedCount = allLessons.filter(l => lp[getLessonKey(l.sectionId, l.lessonId)]?.status === 'completed').length;
    const inProgressCount = allLessons.filter(l => lp[getLessonKey(l.sectionId, l.lessonId)]?.status === 'in_progress').length;
    const totalLessons = allLessons.length;
    const overallPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

    const weaknesses = userProfile.weaknesses || [];
    const strengths = userProfile.strengths || [];

    return (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ── Header ── */}
            <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 4px 0' }}>
                    Năng lực của em
                </h2>
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
                    Dựa trên kết quả học tập và bài kiểm tra
                </p>
            </div>

            {/* ── Radar Chart ── */}
            <div style={{
                background: 'var(--color-surface)',
                borderRadius: 16,
                border: '1px solid var(--color-border)',
                padding: '16px 12px',
                boxShadow: 'var(--shadow-sm)',
            }}>
                <RadarChart scores={skills} />
            </div>

            {/* ── Stats Cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <StatCard icon={<BookOpen size={14} />} label="Đã học" value={`${completedCount}/${totalLessons}`} color="#10B981" />
                <StatCard icon={<Target size={14} />} label="Mục tiêu" value={`${userProfile.targetScore ?? '?'}/10`} color="#6366F1" />
                <StatCard icon={<Award size={14} />} label="Điểm TB" value={userProfile.avgScore != null ? `${userProfile.avgScore.toFixed(1)}` : '—'} color="#F59E0B" />
            </div>

            {/* ── Overall Progress Bar ── */}
            <div style={{
                background: 'var(--color-surface)',
                borderRadius: 12,
                border: '1px solid var(--color-border)',
                padding: '12px 16px',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Tiến độ tổng</span>
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

            {/* ── Weaknesses ── */}
            {weaknesses.length > 0 && (
                <div style={{
                    background: '#FFF7ED',
                    borderRadius: 12,
                    border: '1px solid #FED7AA',
                    padding: '12px 16px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <TrendingDown size={14} color="#C2410C" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#C2410C' }}>Điểm yếu cần cải thiện</span>
                    </div>
                    {weaknesses.map((w, i) => (
                        <div key={i} style={{
                            fontSize: 12, color: '#92400E', padding: '4px 0',
                            borderBottom: i < weaknesses.length - 1 ? '1px solid #FED7AA' : 'none',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <span style={{ width: 18, height: 18, borderRadius: 4, background: '#FFEDD5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#C2410C', flexShrink: 0 }}>{i + 1}</span>
                            {w}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Strengths ── */}
            {strengths.length > 0 && (
                <div style={{
                    background: '#F0FDF4',
                    borderRadius: 12,
                    border: '1px solid #BBF7D0',
                    padding: '12px 16px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <TrendingUp size={14} color="#15803D" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#15803D' }}>Điểm mạnh</span>
                    </div>
                    {strengths.map((s, i) => (
                        <div key={i} style={{
                            fontSize: 12, color: '#166534', padding: '4px 0',
                            borderBottom: i < strengths.length - 1 ? '1px solid #BBF7D0' : 'none',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <span style={{ fontSize: 11 }}>✓</span>
                            {s}
                        </div>
                    ))}
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

            {/* Empty state */}
            {weaknesses.length === 0 && strengths.length === 0 && completedCount === 0 && (
                <div style={{
                    textAlign: 'center', padding: '24px 16px',
                    color: 'var(--color-text-muted)', fontSize: 13,
                }}>
                    Bắt đầu học bài và làm bài kiểm tra để xem phân tích năng lực chi tiết!
                </div>
            )}
        </div>
    );
}

// ── Stat Card Helper ──────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
    return (
        <div style={{
            background: 'var(--color-surface)',
            borderRadius: 12,
            border: '1px solid var(--color-border)',
            padding: '10px 12px',
            textAlign: 'center',
            boxShadow: 'var(--shadow-sm)',
        }}>
            <div style={{ color, marginBottom: 4, display: 'flex', justifyContent: 'center' }}>{icon}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text)' }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 600 }}>{label}</div>
        </div>
    );
}
