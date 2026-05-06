import { useEffect, useState } from 'react';
import { Settings, Bell } from 'lucide-react';
import { EXAM_DATE } from '../constants';
import { useAuth } from '../context/AuthContext';
import { listenToStats, listenToOnlineUsers, getRegisteredUsersCount, listenToSystemConfig } from '../services/firebaseService';

interface HeaderProps {
    onOpenPanel: (mode: 'settings' | 'profile') => void;
}

function daysLeft() {
    return Math.max(0, Math.ceil(
        (new Date(EXAM_DATE).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    ));
}

export default function Header({ onOpenPanel }: HeaderProps) {
    const { userProfile } = useAuth();
    const diff = daysLeft();
    const pct = Math.min(100, Math.round(100 - (diff / 365) * 100));

    const [stats, setStats] = useState({ totalRegistered: 0, totalVisits: 0 });
    const [onlineUsers, setOnlineUsers] = useState(0);
    const [registeredCount, setRegisteredCount] = useState(0);
    const [globalNotif, setGlobalNotif] = useState<{ text: string, active: boolean } | null>(null);
    const [showNotif, setShowNotif] = useState(false);

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
                    <img src="/images/logo.webp" alt="Văn Master Logo" className="logo-img" />
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

                {/* Notification */}
                <div style={{ position: 'relative' }}>
                    <button 
                        className="hdr-icon-btn hdr-bell-btn" 
                        title="Thông báo"
                        onClick={() => setShowNotif(!showNotif)}
                    >
                        <Bell size={17} />
                        {(globalNotif?.active || userProfile?.level === 'Sĩ Tử Nhập Môn') && <span className="notif-dot" />}
                    </button>

                    {showNotif && (
                        <div style={{
                            position: 'absolute',
                            top: '120%',
                            right: 0,
                            width: 300,
                            background: '#fff',
                            borderRadius: 12,
                            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                            padding: 16,
                            zIndex: 1000,
                            color: '#1e293b',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            border: '1px solid rgba(0,0,0,0.05)'
                        }}>
                            <div style={{ fontWeight: 600, fontSize: 14, borderBottom: '1px solid #eee', paddingBottom: 8 }}>Thông báo</div>
                            {userProfile?.level === 'Sĩ Tử Nhập Môn' && (
                                <div style={{ fontSize: 13, background: '#f8fafc', padding: 10, borderRadius: 8, borderLeft: '3px solid #3b82f6' }}>
                                    <strong style={{ color: '#3b82f6' }}>Hệ thống:</strong> Chào mừng bạn! Hành trình vạn dặm bắt đầu từ bước chân đầu tiên. Thay đổi trong Cài đặt để nhận Đèn Khuya.
                                </div>
                            )}
                            {globalNotif?.active && globalNotif?.text && (
                                <div style={{ fontSize: 13, background: '#fff5f5', padding: 10, borderRadius: 8, borderLeft: '3px solid #ef4444' }}>
                                    <strong style={{ color: '#ef4444' }}>Giáo viên:</strong> {globalNotif.text}
                                </div>
                            )}
                            {!(globalNotif?.active) && userProfile?.level !== 'Sĩ Tử Nhập Môn' && (
                                <div style={{ fontSize: 13, opacity: 0.6, textAlign: 'center', padding: '10px 0' }}>Không có thông báo mới.</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Settings */}
                <button className="hdr-icon-btn" onClick={() => onOpenPanel('settings')} title="Cài đặt">
                    <Settings size={17} />
                </button>

                {/* User avatar */}
                <button
                    className="hdr-avatar"
                    onClick={() => onOpenPanel('profile')}
                    title="Hồ sơ của bạn"
                >
                    {initial}
                </button>
            </header>
        </div>
    );
}
