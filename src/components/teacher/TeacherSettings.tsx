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

    useEffect(() => {
        getTeacherProfile().then(p => {
            if (p) setProfile(p);
            else if (user) {
                setProfile(prev => ({ ...prev, uid: user.uid, name: 'Giáo viên Văn Master' }));
            }
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
