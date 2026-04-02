import React from 'react';
import { BookOpen, FileText, Trophy, Map, GraduationCap } from 'lucide-react';

type Tab = 'chat' | 'learn' | 'exam' | 'stats' | 'roadmap';

interface TabNavProps {
    active: Tab;
    onChange: (t: Tab) => void;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode; emoji: string; mobileOnly?: boolean }[] = [
    { id: 'chat', label: 'Học bài', icon: <BookOpen size={15} />, emoji: '📚' },
    { id: 'learn', label: 'Tiến trình', icon: <GraduationCap size={15} />, emoji: '🎓' },
    { id: 'exam', label: 'Luyện đề', icon: <FileText size={15} />, emoji: '✍️' },
    { id: 'stats', label: 'Kỷ Lục', icon: <Trophy size={15} />, emoji: '🏆' },
    // Chỉ hiện trên mobile: trang Lộ Trình chứa nội dung sidebar
    { id: 'roadmap', label: 'Lộ trình', icon: <Map size={15} />, emoji: '🗺️', mobileOnly: true },
];

export default function TabNav({ active, onChange }: TabNavProps) {
    return (
        <nav className="tab-nav">
            <div className="tab-track">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        className={`tab-btn ${t.mobileOnly ? 'tab-mobile-only' : ''} ${active === t.id ? 'active' : ''}`}
                        onClick={() => onChange(t.id)}
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
