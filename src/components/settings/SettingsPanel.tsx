import { useState } from 'react';
import { X, Volume2, LogOut, User, Trophy, Zap, ChevronRight, Settings } from 'lucide-react';
import { logout, updateUserProfile } from '../../services/firebaseService';
import { useAuth } from '../../context/AuthContext';
import { PRONOUN_MAP, TTS_VOICE_MAP } from '../../constants';

interface SettingsPanelProps {
    open: boolean;
    onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
    const { userProfile, setUserProfile } = useAuth();
    const [saving, setSaving] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState('');

    const handleNameSave = async () => {
        if (!userProfile || !newName.trim()) return;
        setSaving(true);
        try {
            await updateUserProfile(userProfile.uid, { name: newName.trim() });
            setUserProfile({ ...userProfile, name: newName.trim() });
            setIsEditingName(false);
        } catch (error) {
            console.error('Error updating name:', error);
            alert('Có lỗi xảy ra khi cập nhật tên.');
        } finally {
            setSaving(false);
        }
    };

    const handleVoiceChange = async (gender: 'male' | 'female') => {
        if (!userProfile) return;
        setSaving(true);
        try {
            await updateUserProfile(userProfile.uid, { voiceGender: gender });
            setUserProfile({ ...userProfile, voiceGender: gender });
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        onClose();
    };

    const pronoun = userProfile ? PRONOUN_MAP[userProfile.voiceGender] : 'cô';
    const voiceName = userProfile ? TTS_VOICE_MAP[userProfile.voiceGender] : TTS_VOICE_MAP.female;
    const isMale = userProfile?.voiceGender === 'male';
    const avgScore = userProfile?.avgScore?.toFixed(1) ?? '--';
    const target = userProfile?.targetScore ?? '--';

    return (
        <>
            {/* Backdrop */}
            <div
                className={`sp-backdrop ${open ? 'sp-open' : ''}`}
                onClick={onClose}
            />

            {/* Drawer */}
            <aside className={`sp-drawer ${open ? 'sp-open' : ''}`}>

                {/* ── Top bar ── */}
                <div className="sp-topbar">
                    <div className="sp-title">
                        <Settings size={18} />
                        <span>Cài đặt</span>
                    </div>
                    <button className="sp-close-btn" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* ── Scrollable body ── */}
                <div className="sp-body">

                    {/* Profile card */}
                    {userProfile && (
                        <div className="sp-profile-card">
                            <div className="sp-avatar">{userProfile.name.charAt(0).toUpperCase()}</div>
                            <div className="sp-profile-info">
                                {isEditingName ? (
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                                        <input
                                            type="text"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            style={{
                                                background: 'rgba(255,255,255,0.1)',
                                                border: '1px solid rgba(255,255,255,0.2)',
                                                borderRadius: '4px',
                                                color: '#fff',
                                                padding: '4px 8px',
                                                fontSize: '14px',
                                                outline: 'none',
                                                width: '100%',
                                            }}
                                            autoFocus
                                            onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
                                            disabled={saving}
                                        />
                                        <button
                                            onClick={handleNameSave}
                                            disabled={saving}
                                            style={{
                                                background: 'var(--sp-accent)',
                                                border: 'none',
                                                borderRadius: '4px',
                                                color: '#fff',
                                                padding: '4px 8px',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                            }}
                                        >
                                            {saving ? '...' : 'Lưu'}
                                        </button>
                                        <button
                                            onClick={() => setIsEditingName(false)}
                                            disabled={saving}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid rgba(255,255,255,0.2)',
                                                borderRadius: '4px',
                                                color: '#fff',
                                                padding: '4px 8px',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                            }}
                                        >
                                            Hủy
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div className="sp-profile-name">{userProfile.name}</div>
                                        <button
                                            onClick={() => {
                                                setNewName(userProfile.name);
                                                setIsEditingName(true);
                                            }}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--sp-accent)',
                                                cursor: 'pointer',
                                                padding: '2px 4px',
                                                fontSize: '12px',
                                                textDecoration: 'underline'
                                            }}
                                            title="Sửa tên"
                                        >
                                            Sửa
                                        </button>
                                    </div>
                                )}
                                <div className="sp-profile-email">{userProfile.email}</div>
                            </div>
                            <div className="sp-level-badge">{userProfile.level}</div>
                        </div>
                    )}

                    {/* Stats row */}
                    <div className="sp-stats-row">
                        <div className="sp-stat">
                            <div className="sp-stat-icon sp-stat-blue"><Trophy size={14} /></div>
                            <div>
                                <div className="sp-stat-val">{avgScore}/10</div>
                                <div className="sp-stat-lbl">Điểm TB</div>
                            </div>
                        </div>
                        <div className="sp-stat-div" />
                        <div className="sp-stat">
                            <div className="sp-stat-icon sp-stat-gold"><Zap size={14} /></div>
                            <div>
                                <div className="sp-stat-val">{target}/10</div>
                                <div className="sp-stat-lbl">Mục tiêu</div>
                            </div>
                        </div>
                        <div className="sp-stat-div" />
                        <div className="sp-stat">
                            <div className="sp-stat-icon sp-stat-green"><User size={14} /></div>
                            <div>
                                <div className="sp-stat-val">{userProfile?.submissionCount ?? 0}</div>
                                <div className="sp-stat-lbl">Bài nộp</div>
                            </div>
                        </div>
                    </div>

                    {/* Section: Voice */}
                    <div className="sp-section">
                        <div className="sp-section-title">Giọng gia sư</div>
                        <p className="sp-section-desc">
                            AI sẽ xưng "<strong>{pronoun}</strong>" với bạn
                        </p>

                        {/* Toggle switch */}
                        <div className="sp-voice-toggle">
                            <button
                                className={`sp-voice-btn ${!isMale ? 'active female' : ''}`}
                                onClick={() => handleVoiceChange('female')}
                                disabled={saving}
                            >
                                <span>Giọng Nữ</span>
                                <span className="sp-voice-pronoun">Xưng: Cô</span>
                            </button>
                            <button
                                className={`sp-voice-btn ${isMale ? 'active male' : ''}`}
                                onClick={() => handleVoiceChange('male')}
                                disabled={saving}
                            >
                                <span>Giọng Nam</span>
                                <span className="sp-voice-pronoun">Xưng: Thầy</span>
                            </button>
                        </div>
                        {saving && <p className="sp-saving">Đang lưu...</p>}
                    </div>

                    {/* Section: Voice info */}
                    <div className="sp-section">
                        <div className="sp-section-title">Giọng đọc hiện tại</div>
                        <div className="sp-info-row">
                            <Volume2 size={14} style={{ color: 'var(--sp-accent)' }} />
                            <div>
                                <div className="sp-info-main">{voiceName}</div>
                                <div className="sp-info-sub">Google Cloud TTS Wavenet</div>
                            </div>
                            <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.4 }} />
                        </div>
                    </div>

                    {/* Section: App info */}
                    <div className="sp-section">
                        <div className="sp-section-title">Ứng dụng</div>
                        <div className="sp-info-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                            <div className="sp-info-main">Chuyên gia Ngữ văn THPT v1.1</div>
                            <div className="sp-info-sub">Powered by Google Gemini 2.5 Flash</div>
                        </div>
                    </div>
                </div>

                {/* ── Footer: logout ── */}
                <div className="sp-footer">
                    <button className="sp-logout-btn" onClick={handleLogout}>
                        <LogOut size={16} />
                        Đăng xuất
                    </button>
                </div>
            </aside>
        </>
    );
}
