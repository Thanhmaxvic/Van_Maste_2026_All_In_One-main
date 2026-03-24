import { useEffect, useState } from 'react';
import { Settings, Bell } from 'lucide-react';
import { EXAM_DATE } from '../constants';
import { useAuth } from '../context/AuthContext';
import { listenToStats, listenToOnlineUsers, getRegisteredUsersCount, listenToSystemConfig } from '../services/firebaseService';

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
    const [globalNotif, setGlobalNotif] = useState<{ text: string, active: boolean } | null>(null);

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
        const unsubscribeConfig = listenToSystemConfig((config: any) => {
            setGlobalNotif({
                text: config.globalNotification || '',
                active: !!config.globalNotificationActive
            });
        });

        return () => {
            unsubscribeStats();
            unsubscribeOnline();
            unsubscribeConfig();
        };
    }, []);

    const initial = userProfile?.name?.charAt(0)?.toUpperCase() || 'U';

    return (
        <div style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', flexDirection: 'column', width: '100%' }}>
            {globalNotif?.active && globalNotif?.text && (
                <div className="bg-gradient-to-r from-pink-600 to-rose-600 text-white/90 text-[13px] font-medium py-1.5 px-4 overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.2)] border-b border-pink-500/30 flex items-center shrink-0">
                    {/* Speaker icon */}
                    <Bell size={14} className="mr-3 shrink-0 text-white/80 animate-pulse" />

                    <div className="relative flex-1 overflow-hidden h-[18px]">
                        <div
                            className="absolute left-0 whitespace-nowrap animate-[marquee_20s_linear_infinite] hover:[animation-play-state:paused] cursor-default"
                            style={{
                                animation: 'marquee 25s linear infinite',
                                paddingLeft: '100%'
                            }}
                        >
                            <span className="text-white drop-shadow-sm tracking-wide">
                                {globalNotif.text}
                            </span>
                        </div>
                    </div>

                    <style dangerouslySetInnerHTML={{
                        __html: `
                        @keyframes marquee {
                            0% { transform: translateX(0); }
                            100% { transform: translateX(-100%); }
                        }
                    `}} />
                </div>
            )}

            <header className="app-header !relative !top-0 !z-auto h-[60px] shrink-0 border-b border-white/5 shadow-none" style={{ position: 'relative', top: 'unset', zIndex: 'unset' }}>
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
        </div>
    );
}
