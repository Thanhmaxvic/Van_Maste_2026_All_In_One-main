import { useEffect, useState } from 'react';
import type { UserProfile } from '../types';
import { generateWeaknessAdvice, isApiKeyConfigured } from '../services/geminiApi';

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
    const [aiTip, setAiTip] = useState<string>('');

    useEffect(() => {
        const baseTip = () => {
            if (avg >= target) {
                return `Xuất sắc! Em đã đạt mục tiêu ${target}/10. Thầy sẽ nâng khó để em tiến xa hơn.`;
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

        let cancelled = false;

        // Gợi ý tạm thời trong lúc chờ AI
        setAiTip(`Điểm yếu chính: ${weaknesses.slice(0, 2).join(', ')}. Thầy đang chuẩn bị gợi ý khắc phục cho em...`);

        const run = async () => {
            try {
                const tip = await generateWeaknessAdvice(weaknesses);
                if (!cancelled) {
                    setAiTip(tip || baseTip());
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
    }, [avg, target, weaknesses]);

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

            {/* Level */}
            <div className="stat-row">
                <span className="stat-row-label">Cấp độ</span>
                <span className="stat-row-val">{profile.level}</span>
            </div>
        </aside>
    );
}
