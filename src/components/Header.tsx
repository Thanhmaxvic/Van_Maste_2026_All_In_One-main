import { Settings, Bell } from 'lucide-react';
import { EXAM_DATE } from '../constants';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
    onOpenSettings: () => void;
    onOpenSidebar?: () => void;
}

function daysLeft() {
    return Math.max(0, Math.ceil(
        (new Date(EXAM_DATE).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    ));
}

export default function Header({ onOpenSettings, onOpenSidebar }: HeaderProps) {
    const { userProfile } = useAuth();
    const diff = daysLeft();
    const pct = Math.min(100, Math.round(100 - (diff / 365) * 100));

    const initial = userProfile?.name?.charAt(0)?.toUpperCase() || 'U';

    return (
        <header className="app-header">
            {/* Logo */}
            <div className="app-header-logo">
                <img src="/images/logo.png" alt="Văn Master Logo" className="logo-img" />
            </div>

            {/* Countdown chip */}
            <div className="countdown-chip">
                <div className="countdown-bar-wrap">
                    <div className="countdown-bar" style={{ width: `${pct}%` }} />
                </div>
                <span>Còn <strong>{diff}</strong> ngày</span>
            </div>

            <div style={{ flex: 1 }} />

            {/* Notification (future feature placeholder) */}
            <button className="hdr-icon-btn hdr-bell-btn" title="Thông báo" style={{ position: 'relative' }}>
                <Bell size={17} />
                <span className="notif-dot" />
            </button>

            {/* Settings */}
            <button className="hdr-icon-btn" onClick={onOpenSettings} title="Cài đặt">
                <Settings size={17} />
            </button>

            {/* User avatar (desktop: mở cài đặt, mobile: mở sidebar) */}
            <button
                className="hdr-avatar"
                onClick={onOpenSidebar || onOpenSettings}
                title="Hồ sơ của bạn"
            >
                {initial}
            </button>
        </header>
    );
}
