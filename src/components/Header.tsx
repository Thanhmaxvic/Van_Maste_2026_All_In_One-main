import { useEffect, useState } from 'react';
import { Settings, Bell } from 'lucide-react';
import { EXAM_DATE } from '../constants';
import { useAuth } from '../context/AuthContext';
import { listenToStats, listenToOnlineUsers, getRegisteredUsersCount } from '../services/firebaseService';

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

    const [stats, setStats] = useState({ totalRegistered: 0, totalVisits: 0 });
    const [onlineUsers, setOnlineUsers] = useState(0);
    const [registeredCount, setRegisteredCount] = useState(0);

    useEffect(() => {
        // Lấy số tài khoản thực tế từ collection users
        getRegisteredUsersCount().then(setRegisteredCount);

        const unsubscribeStats = listenToStats((data) => {
            setStats(data);
            // Khi có thay đổi trong system/stats, cập nhật lại số đăng ký thực
            getRegisteredUsersCount().then(setRegisteredCount);
        });
        const unsubscribeOnline = listenToOnlineUsers((count) => {
            setOnlineUsers(count);
        });
        return () => {
            unsubscribeStats();
            unsubscribeOnline();
        };
    }, []);

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
                    <div className="countdown-bar" style={{ width: `${pct}% ` }} />
                </div>
                <span>Còn <strong>{diff}</strong> ngày</span>
            </div>

            <div style={{ flex: 1 }} />

            {/* User Stats */}
            <div className="header-stats">
                <div className="stat-line">
                    <span className="stat-label">Đăng ký:</span>
                    <span className="stat-value">{registeredCount.toLocaleString('en-US')}</span>
                </div>
                <div className="stat-line" title={`Số lượt truy cập: ${stats.totalVisits.toLocaleString('en-US')} `}>
                    <span className="stat-label">Truy cập:</span>
                    <span className="stat-value" style={{ color: '#10b981' }}>
                        <span style={{ display: 'inline-block', width: 6, height: 6, background: '#10b981', borderRadius: '50%', marginRight: 4, marginBottom: 1 }} />
                        {onlineUsers.toLocaleString('en-US')}
                    </span>
                </div>
            </div>

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
