import { useState, useEffect } from 'react';
import { Save, Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getTeacherProfile, updateTeacherProfile } from '../../services/firebaseService';
import { uploadChatImage } from '../../services/chatService';
import type { TeacherProfile } from '../../types';

export default function TeacherSettings() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<Partial<TeacherProfile>>({
        name: '',
        avatarUrl: '',
        bio: '',
        specialization: '',
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [updatingSecurity, setUpdatingSecurity] = useState(false);

    const [globalNotif, setGlobalNotif] = useState({ text: '', active: false });
    const [savingNotif, setSavingNotif] = useState(false);

    useEffect(() => {
        getTeacherProfile().then(p => {
            if (p) setProfile(p);
            else if (user) {
                setProfile(prev => ({ ...prev, uid: user.uid, name: 'Giáo viên Văn Master' }));
            }
        });

        // Load System Config for Global Notification
        import('../../services/firebaseService').then(({ getSystemConfig }) => {
            getSystemConfig().then(config => {
                setGlobalNotif({
                    text: (config.globalNotification as string) || '',
                    active: !!config.globalNotificationActive,
                });
            });
        });
    }, [user]);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        setSaved(false);
        try {
            await updateTeacherProfile({ ...profile, uid: user.uid } as TeacherProfile);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="ts-container">
            <div className="ts-header">
                <div>
                    <h1>Cài đặt hiển thị</h1>
                    <p>Thông tin này sẽ hiển thị cho học sinh trong cửa sổ chat</p>
                </div>
                <button className="ts-preview-btn" onClick={() => setShowPreview(!showPreview)}>
                    <Eye size={16} />
                    {showPreview ? 'Ẩn xem trước' : 'Xem trước'}
                </button>
            </div>

            <div className="ts-layout">
                {/* Form */}
                <div className="ts-form-card">
                    <div className="ts-form-group">
                        <label>Tên hiển thị</label>
                        <input
                            type="text"
                            value={profile.name || ''}
                            onChange={e => setProfile({ ...profile, name: e.target.value })}
                            placeholder="VD: Thầy Nguyễn Văn A"
                            className="ts-input"
                        />
                    </div>

                    <div className="ts-form-group">
                        <label>Ảnh đại diện</label>
                        <div className="flex gap-2 items-center">
                            <input
                                type="url"
                                value={profile.avatarUrl || ''}
                                onChange={e => setProfile({ ...profile, avatarUrl: e.target.value })}
                                placeholder="https://example.com/avatar.jpg"
                                className="ts-input flex-1"
                            />
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                id="avatar-upload"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setUploadingAvatar(true);
                                    try {
                                        const url = await uploadChatImage(file);
                                        if (url) {
                                            setProfile({ ...profile, avatarUrl: url });
                                        } else {
                                            alert('Lỗi tải ảnh lên. Vui lòng thử lại.');
                                        }
                                    } catch (err) {
                                        alert('Lỗi tải ảnh lên.');
                                    } finally {
                                        setUploadingAvatar(false);
                                        e.target.value = ''; // Reset input
                                    }
                                }}
                            />
                            <label htmlFor="avatar-upload" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg cursor-pointer text-sm font-medium transition-colors whitespace-nowrap">
                                {uploadingAvatar ? 'Đang tải...' : 'Tải lên từ máy'}
                            </label>
                        </div>
                        <span className="ts-hint">Paste link ảnh từ internet hoặc upload từ máy tính</span>
                    </div>

                    <div className="ts-form-group">
                        <label>Chuyên môn</label>
                        <input
                            type="text"
                            value={profile.specialization || ''}
                            onChange={e => setProfile({ ...profile, specialization: e.target.value })}
                            placeholder="VD: Thạc sĩ Ngữ văn, 10 năm kinh nghiệm"
                            className="ts-input"
                        />
                    </div>

                    <div className="ts-form-group">
                        <label>Giới thiệu bản thân</label>
                        <textarea
                            value={profile.bio || ''}
                            onChange={e => setProfile({ ...profile, bio: e.target.value })}
                            placeholder="Viết vài dòng giới thiệu để học sinh biết về bạn..."
                            className="ts-textarea"
                            rows={4}
                        />
                    </div>

                    <button className="ts-save-btn" onClick={handleSave} disabled={saving}>
                        <Save size={16} />
                        {saving ? 'Đang lưu...' : saved ? '✓ Đã lưu thành công' : 'Lưu thông tin'}
                    </button>

                    <h2 className="text-xl font-bold mt-12 mb-4">Thông báo Hệ thống (Toàn trang)</h2>
                    <div className="bg-white/5 rounded-xl p-6 border border-white/10 flex flex-col gap-6">
                        <div className="ts-form-group mb-0">
                            <label className="flex items-center gap-2 cursor-pointer mb-2 w-max text-white">
                                <input
                                    type="checkbox"
                                    checked={globalNotif.active}
                                    onChange={e => setGlobalNotif(prev => ({ ...prev, active: e.target.checked }))}
                                    className="w-4 h-4 rounded cursor-pointer"
                                />
                                <span className="font-medium">Bật dòng chạy thông báo trên Header</span>
                            </label>

                            <textarea
                                value={globalNotif.text}
                                onChange={e => setGlobalNotif(prev => ({ ...prev, text: e.target.value }))}
                                placeholder="Nhập nội dung thông báo chung (VD: Chào mừng các em đến với hệ thống Văn Master, hôm nay chúng ta sẽ ôn luyện...)"
                                className="ts-textarea mb-4 text-white"
                                rows={2}
                                disabled={!globalNotif.active}
                            />

                            <button
                                disabled={savingNotif}
                                className="px-5 py-2.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors w-max"
                                onClick={async () => {
                                    setSavingNotif(true);
                                    try {
                                        const { updateSystemConfig } = await import('../../services/firebaseService');
                                        await updateSystemConfig({
                                            globalNotification: globalNotif.text,
                                            globalNotificationActive: globalNotif.active,
                                        });
                                        alert('Lưu thông báo hệ thống thành công!');
                                    } catch (e: any) {
                                        alert('Lỗi khi lưu thông báo: ' + e.message);
                                    } finally {
                                        setSavingNotif(false);
                                    }
                                }}
                            >
                                {savingNotif ? 'Đang lưu...' : 'Lưu Thông báo'}
                            </button>
                        </div>
                    </div>

                    <h2 className="text-xl font-bold mt-12 mb-4">Bảo mật tài khoản Admin</h2>
                    <div className="bg-white/5 rounded-xl p-6 border border-white/10 flex flex-col gap-6">

                        <div className="ts-form-group mb-0">
                            <label>Đổi Email đăng nhập</label>
                            <div className="flex gap-2 items-center">
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={e => setNewEmail(e.target.value)}
                                    placeholder={user?.email || "Nhập email mới..."}
                                    className="ts-input flex-1 m-0"
                                    autoComplete="off"
                                />
                                <button
                                    disabled={updatingSecurity || !newEmail}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                                    onClick={async () => {
                                        if (!newEmail) return;
                                        setUpdatingSecurity(true);
                                        try {
                                            const { directUpdateEmail } = await import('../../services/firebaseService');
                                            await directUpdateEmail(newEmail);
                                            alert('Đổi email thành công!');
                                            setNewEmail('');
                                        } catch (e: any) {
                                            alert('Lỗi (Có thể bạn cần đăng xuất và đăng nhập lại trước khi đổi email): ' + e.message);
                                        } finally {
                                            setUpdatingSecurity(false);
                                        }
                                    }}
                                >
                                    Cập nhật Email
                                </button>
                            </div>
                        </div>

                        <div className="border-t border-white/10"></div>

                        <div className="ts-form-group mb-0">
                            <label>Đổi Mật khẩu trực tiếp</label>
                            <div className="flex gap-2 items-center">
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)..."
                                    className="ts-input flex-1 m-0"
                                    autoComplete="off"
                                />
                                <button
                                    disabled={updatingSecurity || !newPassword || newPassword.length < 6}
                                    className="px-4 py-2 bg-red-500/10 text-red-500 disabled:opacity-50 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-sm font-semibold transition whitespace-nowrap"
                                    onClick={async () => {
                                        if (!newPassword || newPassword.length < 6) return;
                                        setUpdatingSecurity(true);
                                        try {
                                            const { directUpdatePassword } = await import('../../services/firebaseService');
                                            await directUpdatePassword(newPassword);
                                            alert('Đổi mật khẩu trực tiếp thành công!');
                                            setNewPassword('');
                                        } catch (e: any) {
                                            alert('Lỗi (Có thể bạn cần đăng xuất và đăng nhập lại trước khi đổi mật khẩu): ' + e.message);
                                        } finally {
                                            setUpdatingSecurity(false);
                                        }
                                    }}
                                >
                                    Đổi Mật khẩu
                                </button>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Preview */}
                {showPreview && (
                    <div className="ts-preview">
                        <div className="ts-preview-label">Xem trước (góc nhìn học sinh)</div>
                        <div className="ts-preview-card">
                            <div className="ts-preview-avatar">
                                {profile.avatarUrl ? (
                                    <img src={profile.avatarUrl} alt="" />
                                ) : (
                                    <span>{(profile.name || 'T').charAt(0).toUpperCase()}</span>
                                )}
                            </div>
                            <div className="ts-preview-name">{profile.name || 'Giáo viên'}</div>
                            <div className="ts-preview-spec">{profile.specialization || 'Chuyên môn'}</div>
                            <div className="ts-preview-bio">{profile.bio || 'Giới thiệu...'}</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
