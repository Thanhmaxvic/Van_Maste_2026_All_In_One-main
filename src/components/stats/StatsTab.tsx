import React, { useEffect, useState } from 'react';
import { Trophy, BookOpen, Loader2, Medal } from 'lucide-react';
import { listenToLeaderboard, type LeaderboardEntry } from '../../services/firebaseService';

type SubTab = 'score' | 'exams';

/** Motivational label based on avgScore (0–10 scale) */
function getMotivationLabel(avg: number): string {
    if (avg >= 9) return '🌟 Xuất sắc!';
    if (avg >= 8) return '🔥 Giỏi lắm!';
    if (avg >= 7) return '💪 Tiến bộ rõ!';
    if (avg >= 6) return '👍 Khá tốt!';
    if (avg >= 5) return '🌱 Đang lên!';
    if (avg >= 3) return '🚀 Sắp bứt phá!';
    return '✨ Khởi đầu tốt!';
}

/** Rank badge for top 3 */
function RankBadge({ rank }: { rank: number }) {
    if (rank === 1) return <span className="lb-rank-badge lb-gold">🥇</span>;
    if (rank === 2) return <span className="lb-rank-badge lb-silver">🥈</span>;
    if (rank === 3) return <span className="lb-rank-badge lb-bronze">🥉</span>;
    return <span className="lb-rank-num">{rank}</span>;
}

interface StatsTabProps {
    currentUid: string;
}

const StatsTab: React.FC<StatsTabProps> = ({ currentUid }) => {
    const [subTab, setSubTab] = useState<SubTab>('score');
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = listenToLeaderboard((data) => {
            setEntries(data);
            setLoading(false);
        });
        return unsub;
    }, []);

    // Sort based on active sub-tab
    const sorted = [...entries].sort((a, b) =>
        subTab === 'score'
            ? b.avgScore - a.avgScore
            : b.submissionCount - a.submissionCount
    );

    if (loading) {
        return (
            <div className="lb-loading">
                <Loader2 size={32} className="lb-spinner" />
                <p>Đang tải bảng xếp hạng…</p>
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="lb-empty">
                <Trophy size={48} />
                <h3>Chưa có dữ liệu</h3>
                <p>Hãy luyện đề để xuất hiện trên bảng xếp hạng!</p>
            </div>
        );
    }

    return (
        <div className="lb-container">
            {/* Header */}
            <div className="lb-header">
                <div className="lb-header-icon">
                    <Trophy size={22} />
                </div>
                <h2 className="lb-title">Bảng xếp hạng</h2>
                <p className="lb-subtitle">{sorted.length} thành viên</p>
            </div>

            {/* Sub-tab toggle */}
            <div className="lb-toggle">
                <button
                    className={`lb-toggle-btn ${subTab === 'score' ? 'active' : ''}`}
                    onClick={() => setSubTab('score')}
                >
                    <Medal size={14} /> Điểm TB
                </button>
                <button
                    className={`lb-toggle-btn ${subTab === 'exams' ? 'active' : ''}`}
                    onClick={() => setSubTab('exams')}
                >
                    <BookOpen size={14} /> Số đề luyện
                </button>
            </div>

            {/* Top 3 Podium */}
            {sorted.length >= 3 && (
                <div className="lb-podium">
                    {[sorted[1], sorted[0], sorted[2]].map((entry, i) => {
                        const actualRank = i === 0 ? 2 : i === 1 ? 1 : 3;
                        const isMe = entry.uid === currentUid;
                        return (
                            <div
                                key={entry.uid}
                                className={`lb-podium-card lb-podium-${actualRank} ${isMe ? 'lb-me' : ''}`}
                            >
                                <div className="lb-podium-avatar">
                                    {entry.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="lb-podium-medal">
                                    {actualRank === 1 ? '👑' : actualRank === 2 ? '🥈' : '🥉'}
                                </div>
                                <span className="lb-podium-name">{entry.name}</span>
                                <span className="lb-podium-stat">
                                    {subTab === 'score'
                                        ? `${entry.avgScore.toFixed(1)} đ`
                                        : `${entry.submissionCount} đề`
                                    }
                                </span>
                                {subTab === 'score' && (
                                    <span className="lb-podium-label">
                                        {getMotivationLabel(entry.avgScore)}
                                    </span>
                                )}
                                {subTab === 'exams' && entry.bestScore > 0 && (
                                    <span className="lb-podium-best">
                                        ⭐ Cao nhất: {entry.bestScore.toFixed(1)}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Table */}
            <div className="lb-table-wrapper">
                <table className="lb-table">
                    <thead>
                        <tr>
                            <th className="lb-th-rank">#</th>
                            <th className="lb-th-name">Tên</th>
                            {subTab === 'score' ? (
                                <>
                                    <th className="lb-th-val">Điểm TB</th>
                                    <th className="lb-th-label">Đánh giá</th>
                                </>
                            ) : (
                                <>
                                    <th className="lb-th-val">Số đề</th>
                                    <th className="lb-th-val">Điểm cao nhất</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.slice(0, 10).map((entry, idx) => {
                            const rank = idx + 1;
                            const isMe = entry.uid === currentUid;
                            return (
                                <tr
                                    key={entry.uid}
                                    className={`lb-row ${isMe ? 'lb-row-me' : ''} ${rank <= 3 ? 'lb-row-top' : ''}`}
                                >
                                    <td className="lb-td-rank">
                                        <RankBadge rank={rank} />
                                    </td>
                                    <td className="lb-td-name">
                                        <div className="lb-name-cell">
                                            <span className="lb-avatar-sm">
                                                {entry.name.charAt(0).toUpperCase()}
                                            </span>
                                            <span className="lb-name-text">
                                                {entry.name}
                                                {isMe && <span className="lb-me-badge">Bạn</span>}
                                            </span>
                                        </div>
                                    </td>
                                    {subTab === 'score' ? (
                                        <>
                                            <td className="lb-td-score">
                                                <span className="lb-score-pill">
                                                    {entry.avgScore.toFixed(1)}
                                                </span>
                                            </td>
                                            <td className="lb-td-label">
                                                <span className="lb-motivation">
                                                    {getMotivationLabel(entry.avgScore)}
                                                </span>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="lb-td-score">
                                                <span className="lb-count-pill">
                                                    {entry.submissionCount}
                                                </span>
                                            </td>
                                            <td className="lb-td-score">
                                                <span className="lb-best-pill">
                                                    {entry.bestScore > 0
                                                        ? `⭐ ${entry.bestScore.toFixed(1)}`
                                                        : '—'
                                                    }
                                                </span>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default StatsTab;
