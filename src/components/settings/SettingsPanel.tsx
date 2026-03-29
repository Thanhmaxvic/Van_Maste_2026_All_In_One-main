import { useState } from 'react';
import { X, Volume2, LogOut, User, Trophy, Zap, ChevronRight, Settings, ImagePlus, Loader2 } from 'lucide-react';
import { logout, updateUserProfile } from '../../services/firebaseService';
import { uploadChatImage } from '../../services/chatService';
import { useAuth } from '../../context/AuthContext';
import { PRONOUN_MAP, TTS_VOICE_MAP } from '../../constants';

interface SettingsPanelProps {
    open: boolean;
    mode?: 'settings' | 'profile';
    onClose: () => void;
}

export default function SettingsPanel({ open, mode = 'settings', onClose }: SettingsPanelProps) {
    const { userProfile, setUserProfile } = useAuth();
    const [saving, setSaving] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState('');
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

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

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userProfile) return;
        setUploadingAvatar(true);
        try {
            const url = await uploadChatImage(file);
            if (url) {
                await updateUserProfile(userProfile.uid, { avatarUrl: url });
                setUserProfile({ ...userProfile, avatarUrl: url });
            }
        } catch (err: any) {
            alert('Lỗi tải ảnh: ' + err.message);
        } finally {
            setUploadingAvatar(false);
            e.target.value = '';
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
            <aside 
                className={`sp-drawer ${open ? 'sp-open' : ''}`}
                style={{ height: 'auto', bottom: 'auto', maxHeight: '100vh', paddingBottom: 20, borderRadius: '0 0 0 24px' }}
            >

                {/* ── Top bar ── */}
                <div className="sp-topbar">
                    <div className="sp-title">
                        {mode === 'settings' ? <Settings size={18} /> : <User size={18} />}
                        <span>{mode === 'settings' ? 'Cài đặt' : 'Hồ sơ của bạn'}</span>
                    </div>
                    <button className="sp-close-btn" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* ── Scrollable body ── */}
                <div className="sp-body">

                    {/* Profile card: Settings mode */}
                    {userProfile && mode === 'settings' && (
                        <div className="sp-profile-card">
                            <div className="sp-avatar relative group overflow-hidden">
                                {userProfile.avatarUrl ? (
                                    <img src={userProfile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <span>{userProfile.name.charAt(0).toUpperCase()}</span>
                                )}
                                <label className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-white text-[10px] gap-1">
                                    {uploadingAvatar ? <Loader2 className="animate-spin" size={16} /> : <ImagePlus size={16} />}
                                    <span>Đổi ảnh</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                                </label>
                            </div>
                            <div className="sp-profile-info">
                                {isEditingName ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px', width: '100%', minWidth: '220px' }}>
                                        <input
                                            type="text"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            style={{
                                                background: 'rgba(255,255,255,0.1)',
                                                border: '1px solid rgba(255,255,255,0.2)',
                                                borderRadius: '6px',
                                                color: '#fff',
                                                padding: '8px 12px',
                                                fontSize: '15px',
                                                outline: 'none',
                                                width: '100%',
                                            }}
                                            autoFocus
                                            onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
                                            disabled={saving}
                                        />
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={handleNameSave}
                                                disabled={saving}
                                                style={{
                                                    background: 'var(--sp-accent)',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    color: '#fff',
                                                    padding: '6px 12px',
                                                    cursor: 'pointer',
                                                    fontSize: '13px',
                                                    flex: 1
                                                }}
                                            >
                                                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                                            </button>
                                            <button
                                                onClick={() => setIsEditingName(false)}
                                                disabled={saving}
                                                style={{
                                                    background: 'transparent',
                                                    border: '1px solid rgba(255,255,255,0.2)',
                                                    borderRadius: '4px',
                                                    color: '#fff',
                                                    padding: '6px 12px',
                                                    cursor: 'pointer',
                                                    fontSize: '13px',
                                                    flex: 1
                                                }}
                                            >
                                                Hủy
                                            </button>
                                        </div>
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
                        </div>
                    )}

                    {/* Profile Banner: Profile mode only */}
                    {userProfile && mode === 'profile' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 20px 8px' }}>
                            <div className="sp-avatar" style={{ width: 64, height: 64, fontSize: 28, margin: '0 auto 12px' }}>
                                {userProfile.avatarUrl ? (
                                    <img src={userProfile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <span>{userProfile.name.charAt(0).toUpperCase()}</span>
                                )}
                            </div>
                            <div className="sp-level-badge" style={{ alignSelf: 'center', margin: 0, fontSize: 13, padding: '6px 14px' }}>
                                {userProfile.level}
                            </div>
                        </div>
                    )}

                    {/* Stats and Badges: Only in Profile mode */}
                    {mode === 'profile' && (
                        <>
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

                            {userProfile?.badges && userProfile.badges.length > 0 && (
                                <div className="sp-section">
                                    <div className="sp-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fcd34d' }}>
                                        <Trophy size={15} />
                                        Thành tích & Vật phẩm
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                                        {userProfile.badges.map((badge, idx) => (
                                            <div key={idx} style={{ 
                                                background: 'linear-gradient(135deg, rgba(252, 211, 77, 0.15), rgba(252, 211, 77, 0.05))', 
                                                border: '1px solid rgba(252, 211, 77, 0.3)', 
                                                color: '#fcd34d', 
                                                padding: '6px 12px', 
                                                borderRadius: '20px', 
                                                fontSize: '13px', 
                                                fontWeight: 600, 
                                                boxShadow: '0 2px 10px rgba(0,0,0,0.2)' 
                                            }}>
                                                {badge}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Voice and App Info: Only in Settings mode */}
                    {mode === 'settings' && (
                        <>
                            <div className="sp-section">
                                <div className="sp-section-title">Giọng gia sư</div>
                                <p className="sp-section-desc">
                                    AI sẽ xưng "<strong>{pronoun}</strong>" với bạn
                                </p>

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

                            <div className="sp-section">
                                <div className="sp-section-title">Ứng dụng</div>
                                <div className="sp-info-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                                    <div className="sp-info-main">Chuyên gia Ngữ văn THPT v1.1</div>
                                    <div className="sp-info-sub">Powered by Google Gemini 2.5 Flash</div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer: logout (Available in both modes but particularly fits settings) */}
                {mode === 'settings' && (
                    <div className="sp-footer">
                        <button className="sp-logout-btn" onClick={handleLogout}>
                            <LogOut size={16} />
                            Đăng xuất
                        </button>
                    </div>
                )}
            </aside>
        </>
    );
}
