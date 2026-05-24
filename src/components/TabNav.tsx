import { BookOpen, FileText, Trophy, Map, GraduationCap, Gamepad2, Sparkles } from 'lucide-react';

export type Tab = 'chat' | 'learn' | 'exam' | 'stats' | 'games' | 'practice' | 'roadmap';

interface TabNavProps {
    active: Tab;
    onChange: (t: Tab) => void;
    showPracticeTab?: boolean;
}

export default function TabNav({ active, onChange, showPracticeTab }: TabNavProps) {
    const tabs = [
        { id: 'chat', label: 'Học bài', icon: <BookOpen size={15} />, emoji: '📚' },
        { id: 'learn', label: 'Tiến trình', icon: <GraduationCap size={15} />, emoji: '🎓' },
        { id: 'exam', label: 'Luyện đề', icon: <FileText size={15} />, emoji: '✍️' },
        { id: 'stats', label: 'Kỷ Lục', icon: <Trophy size={15} />, emoji: '🏆' },
        { id: 'games', label: 'Giải Trí', icon: <Gamepad2 size={15} />, emoji: '🎮' },
        ...((showPracticeTab || active === 'practice') ? [{ id: 'practice', label: 'Thực hành', icon: <Sparkles size={15} />, emoji: '🧠' }] : []),
        // Chỉ hiện trên mobile: trang Lộ Trình chứa nội dung sidebar
        { id: 'roadmap', label: 'Lộ trình', icon: <Map size={15} />, emoji: '🗺️', mobileOnly: true },
    ];

    return (
        <nav className="tab-nav">
            <div className="tab-track">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        className={`tab-btn ${t.mobileOnly ? 'tab-mobile-only' : ''} ${active === t.id ? 'active' : ''}`}
                        onClick={() => onChange(t.id as Tab)}
                    >
                        <span className="tab-icon">{t.icon}</span>
                        <span className="tab-label">{t.label}</span>
                        {active === t.id && <span className="tab-indicator" />}
                    </button>
                ))}
            </div>
        </nav>
    );
}

