import { useState } from 'react';
import { MessageSquare, LayoutDashboard, Settings, LogOut, PenTool } from 'lucide-react';
import { logout } from '../../services/firebaseService';
import { useAuth } from '../../context/AuthContext';
import TeacherChatPanel from './TeacherChatPanel';
import TeacherDashboard from './TeacherDashboard';
import TeacherSettings from './TeacherSettings';
import TeacherGrading from './TeacherGrading';

type TeacherTab = 'chat' | 'dashboard' | 'grading' | 'settings';

const NAV_ITEMS: { id: TeacherTab; label: string; icon: React.ReactNode }[] = [
    { id: 'chat', label: 'Tin nhắn', icon: <MessageSquare size={18} /> },
    { id: 'dashboard', label: 'Quản lý', icon: <LayoutDashboard size={18} /> },
    { id: 'grading', label: 'Chấm thi', icon: <PenTool size={18} /> },
    { id: 'settings', label: 'Cài đặt', icon: <Settings size={18} /> },
];

export default function TeacherApp() {
    const { userProfile } = useAuth();
    const [activeTab, setActiveTab] = useState<TeacherTab>('chat');

    const handleLogout = async () => {
        await logout();
    };

    return (
        <div className="teacher-app">
            {/* Sidebar Navigation */}
            <nav className="teacher-nav">
                <div className="teacher-nav-logo">
                    <img src="/images/logo.webp" alt="Logo" className="teacher-nav-logo-img" />
                    <span className="teacher-nav-logo-text">Ngữ văn Master</span>
                    <span className="teacher-nav-badge">Giáo viên</span>
                </div>

                <div className="teacher-nav-items">
                    {NAV_ITEMS.map(item => (
                        <button
                            key={item.id}
                            className={`teacher-nav-btn ${activeTab === item.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(item.id)}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </button>
                    ))}
                </div>

                <div className="teacher-nav-footer">
                    <div className="teacher-nav-user">
                        <div className="teacher-nav-avatar">
                            {userProfile?.name?.charAt(0)?.toUpperCase() || 'T'}
                        </div>
                        <div className="teacher-nav-user-info">
                            <div className="teacher-nav-user-name">{userProfile?.name || 'Giáo viên'}</div>
                            <div className="teacher-nav-user-email">{userProfile?.email}</div>
                        </div>
                    </div>
                    <button className="teacher-nav-logout" onClick={handleLogout}>
                        <LogOut size={16} />
                        <span>Đăng xuất</span>
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main className="teacher-main">
                {activeTab === 'chat' && <TeacherChatPanel />}
                {activeTab === 'dashboard' && <TeacherDashboard />}
                {activeTab === 'grading' && <TeacherGrading />}
                {activeTab === 'settings' && <TeacherSettings />}
            </main>
        </div>
    );
}
