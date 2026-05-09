import { useEffect, useState } from 'react';
import type { UserProfile } from '../types';
import { PRONOUN_MAP } from '../constants';
import { generateWeaknessAdvice, isApiKeyConfigured } from '../services/geminiApi';
import { CURRICULUM, getLessonKey } from '../constants/curriculum';
import { generateDefaultTimeline } from '../services/recommendationService';

interface SidebarProps {
    profile: UserProfile;
}

function ProgressRing({ pct, size = 70 }: { pct: number; size?: number }) {
    const r = (size - 10) / 2;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    return (
        <svg width={size} height={size} className="ring-svg" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="8" />
            <circle
                cx={size / 2} cy={size / 2} r={r}
                fill="none"
                stroke="#FCD34D"
                strokeWidth="8"
                strokeDasharray={`${dash} ${circ}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray .6s ease-out' }}
            />
        </svg>
    );
}

export default function Sidebar({ profile }: SidebarProps) {
    const avg = profile.avgScore ?? 0;
    const target = profile.targetScore ?? 8;
    const pct = Math.min(Math.round((avg / target) * 100), 100);

    const weaknesses = profile.weaknesses || [];
    const strengths = profile.strengths || [];
    const pronoun = PRONOUN_MAP[profile.voiceGender || 'male'];
    const Pronoun = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);
    const [aiTip, setAiTip] = useState<string>('');

    // Calculate progress percentage to determine if we should show the default timeline
    const lp = profile.lessonProgress || {};
    const allLessons = CURRICULUM.flatMap(s => s.lessons.map(l => ({ sectionId: s.id, lessonId: l.id })));
    const completedCount = allLessons.filter(l => lp[getLessonKey(l.sectionId, l.lessonId)]?.status === 'completed').length;

    const inProgressCount = allLessons.filter(l => lp[getLessonKey(l.sectionId, l.lessonId)]?.status === 'in_progress').length;
    const hasInteracted = completedCount > 0 || inProgressCount > 0 || (profile.submissionCount && profile.submissionCount > 0);

    // Lọc bỏ những dòng tiêu đề vô nghĩa do AI tự sinh ra (ví dụ: Thời gian | Nội dung)
    const validCustomTimeline = profile.customTimeline?.filter(
        ev => ev.time.toLowerCase() !== 'thời gian' && !ev.title.toLowerCase().includes('nội dung') && !ev.title.toLowerCase().includes('sự kiện')
    );

    // Use custom timeline if it exists and has real content, otherwise generate a default one if user has interacted
    const timelineToDisplay = validCustomTimeline && validCustomTimeline.length > 0 
        ? validCustomTimeline 
        : (hasInteracted ? generateDefaultTimeline(profile) : null);

    useEffect(() => {
        const baseTip = () => {
            if (avg >= target) {
                return `Xuất sắc! Em đã đạt mục tiêu ${target}/10. ${Pronoun} sẽ nâng khó để em tiến xa hơn.`;
            }
            if (avg >= target * 0.85) {
                return `Em đang tiến sát mục tiêu. Chỉ cần cố gắng thêm là đạt ${target}/10.`;
            }
            if (weaknesses.length > 0) {
                return `Điểm yếu chính: ${weaknesses.slice(0, 2).join(', ')}. Em nên tập trung vào đây trước.`;
            }
            return `Em cần ôn luyện thêm. Điểm trung bình hiện tại là ${avg.toFixed(1)}/10.`;
        };

        // Nếu không có API Key hoặc không có điểm yếu, dùng gợi ý tĩnh
        if (!isApiKeyConfigured() || weaknesses.length === 0) {
            setAiTip(baseTip());
            return;
        }

        // Check sessionStorage cache to avoid redundant API calls
        const cacheKey = `aiTip::${weaknesses.join('|')}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            setAiTip(cached);
            return;
        }

        let cancelled = false;

        // Gợi ý tạm thời trong lúc chờ AI
        setAiTip(`Điểm yếu chính: ${weaknesses.slice(0, 2).join(', ')}. ${Pronoun} đang chuẩn bị gợi ý khắc phục cho em...`);

        const run = async () => {
            try {
                const tip = await generateWeaknessAdvice(weaknesses, pronoun);
                if (!cancelled) {
                    const finalTip = tip || baseTip();
                    setAiTip(finalTip);
                    // Cache the result for this session
                    try { sessionStorage.setItem(cacheKey, finalTip); } catch { /* quota exceeded — ignore */ }
                }
            } catch {
                if (!cancelled) {
                    setAiTip(baseTip());
                }
            }
        };

        run();

        return () => {
            cancelled = true;
        };
    }, [avg, target, weaknesses.join('|')]); // use joined string to avoid re-render on reference change

    return (
        <aside className="sidebar">
            {/* Score Card */}
            <div className="score-card">
                <div className="score-ring-wrap">
                    <ProgressRing pct={pct} />
                    <div className="score-card-labels">
                        <div className="score-card-main">
                            {avg > 0 ? avg.toFixed(1) : '--'}
                            <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.7 }}>/10</span>
                        </div>
                        <div className="score-card-sub">Điểm trung bình</div>
                        <div className="score-card-target">Mục tiêu: {target}/10 ({pct}%)</div>
                    </div>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,.1)', borderRadius: 8, padding: '8px 4px' }}>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{profile.submissionCount ?? 0}</div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>Bài đã nộp</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,.1)', borderRadius: 8, padding: '8px 4px' }}>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{profile.streak ?? 1}</div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>Streak (ngày)</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,.1)', borderRadius: 8, padding: '8px 4px' }}>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{profile.xp ?? 0}</div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>XP</div>
                    </div>
                </div>
            </div>

            {/* AI Tip */}
            <div>
                <div className="sidebar-section-title">Gợi ý từ AI</div>
                <div className="ai-tip-box">{aiTip}</div>
            </div>

            {/* Custom AI Timeline (Lộ trình cá nhân hoá) */}
            {timelineToDisplay && timelineToDisplay.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <div className="sidebar-section-title" style={{ color: '#059669', marginTop: 12 }}>Lộ trình cá nhân hoá</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {timelineToDisplay.map((ev, i) => (
                            <div key={i} style={{
                                background: 'var(--color-surface)',
                                borderLeft: '4px solid #10B981',
                                borderTop: '1px solid var(--color-border)',
                                borderRight: '1px solid var(--color-border)',
                                borderBottom: '1px solid var(--color-border)',
                                borderRadius: '0 8px 8px 0',
                                padding: '10px 12px',
                                boxShadow: 'var(--shadow-sm)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: '#047857', background: '#D1FAE5', padding: '2px 6px', borderRadius: 4 }}>
                                        {ev.time}
                                    </span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.2 }}>
                                        {ev.title}
                                    </span>
                                </div>
                                {ev.desc && (
                                    <div style={{ color: 'var(--color-text-muted)', fontSize: 12, lineHeight: 1.4 }}>
                                        {ev.desc}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Weaknesses */}
            {weaknesses.length > 0 && (
                <div>
                    <div className="sidebar-section-title">Điểm yếu cần cải thiện</div>
                    <div>{weaknesses.map((w: string, i: number) => (
                        <span key={i} className="weakness-tag">{w}</span>
                    ))}</div>
                </div>
            )}

            {/* Strengths */}
            {strengths.length > 0 && (
                <div>
                    <div className="sidebar-section-title">Điểm mạnh</div>
                    <div>{strengths.map((s: string, i: number) => (
                        <span key={i} className="strength-tag">{s}</span>
                    ))}</div>
                </div>
            )}

            {/* Badges */}
            {profile.badges && profile.badges.length > 0 && (
                <div>
                    <div className="sidebar-section-title" style={{ color: '#FCD34D' }}>Danh hiệu & Vật phẩm</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {profile.badges.map((badge, i) => (
                            <span key={i} style={{
                                background: 'rgba(252,211,77,0.1)',
                                border: '1px solid rgba(252,211,77,0.3)',
                                color: '#FCD34D',
                                padding: '4px 8px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: 600
                            }}>
                                {badge}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Level */}
            <div className="stat-row">
                <span className="stat-row-label">Cấp độ</span>
                <span className="stat-row-val">{profile.level}</span>
            </div>
        </aside>
    );
}
