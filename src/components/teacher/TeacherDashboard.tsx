import { useState, useEffect } from 'react';
import { Users, FileText, Clock, RefreshCw, Award, Search, Upload } from 'lucide-react';
import {
    getAllUsers,
    getRegisteredUsersCount,
    getSystemConfig,
    updateSystemConfig,
    updateUserProfile,
    type AdminUserEntry,
} from '../../services/firebaseService';
import { detectAvailableExams } from '../../services/examService';

export default function TeacherDashboard() {
    const [users, setUsers] = useState<AdminUserEntry[]>([]);
    const [totalExams, setTotalExams] = useState(0);
    const [registeredCount, setRegisteredCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [examDate, setExamDate] = useState('');
    const [dailyExamHour, setDailyExamHour] = useState('08:00');
    const [savingConfig, setSavingConfig] = useState(false);
    const [configSaved, setConfigSaved] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<'name' | 'avgScore' | 'submissionCount' | 'bestScore'>('name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editFormData, setEditFormData] = useState({ name: '', email: '', avgScore: 0, bestScore: 0 });
    const [savingUser, setSavingUser] = useState(false);

    // File upload state
    const [uploadFolder, setUploadFolder] = useState('dethi');
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [isUploadingDoc, setIsUploadingDoc] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const [usersData, exams, registered, sysConfig] = await Promise.all([
                getAllUsers(),
                detectAvailableExams(),
                getRegisteredUsersCount(),
                getSystemConfig(),
            ]);
            setUsers(usersData); // show all users so we can manage roles
            setTotalExams(exams);
            setRegisteredCount(registered);
            setExamDate((sysConfig.examDate as string) || '2026-06-11');
            setDailyExamHour((sysConfig.dailyExamHour as string) || '08:00');
        } catch (e) {
            console.error('Dashboard load error:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleSaveConfig = async () => {
        setSavingConfig(true);
        setConfigSaved(false);
        try {
            await updateSystemConfig({
                examDate,
                dailyExamHour,
            });
            setConfigSaved(true);
            setTimeout(() => setConfigSaved(false), 2000);
        } finally {
            setSavingConfig(false);
        }
    };

    const handleToggleRole = async (uid: string, currentRole?: string) => {
        const newRole = currentRole === 'teacher' ? 'student' : 'teacher';
        if (!window.confirm(`Bạn có chắc muốn chuyển tài khoản này thành ${newRole === 'teacher' ? 'Giáo viên/Admin' : 'Học sinh'}?`)) {
            return;
        }
        try {
            // TypeScript might complain depending on how UserProfile is typed in updateUserProfile, but ‘role’ is optional.
            await updateUserProfile(uid, { role: newRole as any });
            setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role: newRole } : u));
        } catch (error) {
            console.error('Error updating role:', error);
            alert('Có lỗi xảy ra khi cập nhật quyền.');
        }
    };

    const handleSort = (field: 'name' | 'avgScore' | 'submissionCount' | 'bestScore') => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder(field === 'name' ? 'asc' : 'desc');
        }
    };

    const handleDocUpload = async () => {
        if (!uploadFile) return;
        setIsUploadingDoc(true);
        try {
            const { storage } = await import('../../services/firebaseService');
            const { ref, uploadBytes } = await import('firebase/storage');
            const fileRef = ref(storage, `${uploadFolder}/${uploadFile.name}`);
            await uploadBytes(fileRef, uploadFile);
            alert('Tải tài liệu lên thành công!');
            setUploadFile(null);
            // Optionally clear the input
            const fileInput = document.getElementById('admin-doc-upload') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
        } catch (e: any) {
            console.error('Upload error:', e);
            alert('Lỗi tải lên: ' + e.message);
        } finally {
            setIsUploadingDoc(false);
        }
    };

    const handleEditClick = (user: AdminUserEntry) => {
        setEditingUserId(user.uid);
        setEditFormData({ name: user.name, email: user.email || '', avgScore: user.avgScore, bestScore: user.bestScore ?? 0 });
    };

    const handleSaveUser = async () => {
        if (!editingUserId) return;
        setSavingUser(true);
        try {
            const dataToUpdate = {
                name: editFormData.name,
                email: editFormData.email,
                avgScore: Number(editFormData.avgScore),
                bestScore: Number(editFormData.bestScore),
            };
            await updateUserProfile(editingUserId, dataToUpdate);
            setUsers(prev => prev.map(u => u.uid === editingUserId ? { ...u, ...dataToUpdate } : u));
            setEditingUserId(null);
        } catch (error) {
            console.error('Error updating user:', error);
            alert('Lỗi cập nhật thông tin người dùng.');
        } finally {
            setSavingUser(false);
        }
    };

    const avgScoreAll = users.length > 0
        ? (users.reduce((s, u) => s + u.avgScore, 0) / users.length).toFixed(1)
        : '0.0';

    const activeUsers = users.filter(u => u.submissionCount > 0).length;

    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => {
        let valA: string | number = a[sortField] ?? 0;
        let valB: string | number = b[sortField] ?? 0;
        if (sortField === 'name') {
            valA = (valA as string).toLowerCase();
            valB = (valB as string).toLowerCase();
        }
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    return (
        <div className="td-container">
            <div className="td-header">
                <div>
                    <h1>Bảng Quản Lý</h1>
                    <p>Tổng quan hệ thống Ngữ Văn Master</p>
                </div>
                <button className="td-refresh-btn" onClick={loadData} disabled={loading}>
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Làm mới
                </button>
            </div>

            {/* Stats Cards */}
            <div className="td-stats-grid">
                <div className="td-stat-card td-stat-blue">
                    <div className="td-stat-icon"><Users size={22} /></div>
                    <div className="td-stat-info">
                        <div className="td-stat-value">{registeredCount}</div>
                        <div className="td-stat-label">Tổng tài khoản</div>
                    </div>
                </div>
                <div className="td-stat-card td-stat-green">
                    <div className="td-stat-icon"><Award size={22} /></div>
                    <div className="td-stat-info">
                        <div className="td-stat-value">{activeUsers}</div>
                        <div className="td-stat-label">Đã nộp bài</div>
                    </div>
                </div>
                <div className="td-stat-card td-stat-purple">
                    <div className="td-stat-icon"><FileText size={22} /></div>
                    <div className="td-stat-info">
                        <div className="td-stat-value">{totalExams}</div>
                        <div className="td-stat-label">Đề thi hiện có</div>
                    </div>
                </div>
                <div className="td-stat-card td-stat-amber">
                    <div className="td-stat-icon"><Award size={22} /></div>
                    <div className="td-stat-info">
                        <div className="td-stat-value">{avgScoreAll}</div>
                        <div className="td-stat-label">Điểm TB chung</div>
                    </div>
                </div>
            </div>

            <div className="td-grid-2col">
                {/* Config Panel */}
                <div className="td-card">
                    <h3 className="td-card-title">
                        <Clock size={16} /> Cấu hình hệ thống
                    </h3>
                    <div className="td-form-group">
                        <label>Ngày thi chính thức</label>
                        <input
                            type="date"
                            value={examDate}
                            onChange={e => setExamDate(e.target.value)}
                            className="td-input"
                        />
                    </div>
                    <div className="td-form-group">
                        <label>Giờ thi hàng ngày</label>
                        <input
                            type="time"
                            value={dailyExamHour}
                            onChange={e => setDailyExamHour(e.target.value)}
                            className="td-input"
                        />
                    </div>
                    <button
                        className="td-save-btn"
                        onClick={handleSaveConfig}
                        disabled={savingConfig}
                    >
                        {savingConfig ? 'Đang lưu...' : configSaved ? '✓ Đã lưu' : 'Lưu cấu hình'}
                    </button>
                </div>

                {/* Quick Stats */}
                <div className="td-card">
                    <h3 className="td-card-title">
                        <FileText size={16} /> Thông tin nhanh
                    </h3>
                    <div className="td-info-list">
                        <div className="td-info-row">
                            <span>Tổng đề thi DOCX</span>
                            <strong>{totalExams} đề</strong>
                        </div>
                        <div className="td-info-row">
                            <span>Học sinh đã onboard</span>
                            <strong>{users.filter(u => u.isOnboarded).length}</strong>
                        </div>
                        <div className="td-info-row">
                            <span>Ngày thi</span>
                            <strong>{examDate}</strong>
                        </div>
                        <div className="td-info-row">
                            <span>Giờ thi hàng ngày</span>
                            <strong>{dailyExamHour}</strong>
                        </div>
                    </div>
                </div>
            </div>

            {/* Document Upload Panel */}
            <div className="td-card td-full-width" style={{ marginTop: '24px', marginBottom: '24px' }}>
                <h3 className="td-card-title">
                    <Upload size={16} /> Quản lý tài liệu hệ thống
                </h3>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 300px', paddingRight: '20px', borderRight: '1px solid #f1f5f9' }}>
                        <div className="td-form-group">
                            <label>Chọn thư mục đích</label>
                            <select className="td-input" value={uploadFolder} onChange={e => setUploadFolder(e.target.value)}>
                                <option value="dethi">Đề thi (dethi/)</option>
                                <option value="huongdancham">Hướng dẫn chấm (huongdancham/)</option>
                                <option value="lythuyet">Lý thuyết (lythuyet/)</option>
                            </select>
                        </div>
                        <div className="td-form-group">
                            <label>Chọn file tải lên</label>
                            <input
                                id="admin-doc-upload"
                                type="file"
                                accept=".pdf,.doc,.docx"
                                className="td-input bg-white"
                                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                            />
                        </div>
                        <button
                            className="td-save-btn bg-pink-500 hover:bg-pink-600 border-pink-500 text-white"
                            style={{ width: '100%' }}
                            onClick={handleDocUpload}
                            disabled={!uploadFile || isUploadingDoc}
                        >
                            {isUploadingDoc ? 'Đang tải lên...' : 'Tải lên cơ sở dữ liệu'}
                        </button>
                    </div>
                    <div style={{ flex: '1 1 300px' }} className="text-sm">
                        <h4 className="font-semibold text-gray-800 mb-2">Hướng dẫn đặt tên file:</h4>
                        <ul className="list-disc pl-5 space-y-2 text-gray-600">
                            <li><strong>Đề thi:</strong> Đặt tên theo số thứ tự bài thi (Ví dụ: <code>1.docx</code>, <code>2.pdf</code>).</li>
                            <li><strong>Hướng dẫn chấm:</strong> Thêm hậu tố "_key" sau tên đề thi tương ứng (Ví dụ: <code>1_key.docx</code>).</li>
                            <li><strong>Lý thuyết:</strong> Đặt tên theo ID bài học kết hợp chủ đề (Ví dụ: <code>vnl-1.docx</code> cho Vợ Nhặt bài 1).</li>
                            <li className="text-pink-600 mt-2 font-medium">Lưu ý: Chỉ hỗ trợ các định dạng <code>.docx</code>, <code>.doc</code>, <code>.pdf</code>.</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* User Management Table */}
            <div className="td-card td-full-width">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="td-card-title mb-0">
                        <Users size={16} /> Quản lý người dùng ({filteredUsers.length}/{users.length})
                    </h3>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Tìm kiếm theo tên hoặc email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 w-[300px] transition-colors"
                        />
                    </div>
                </div>
                <div className="td-table-wrap">
                    <table className="td-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }} className="hover:text-white transition-colors">
                                    Tên {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                                </th>
                                <th>Email</th>
                                <th>Quyền</th>
                                <th>Cấp độ</th>
                                <th onClick={() => handleSort('avgScore')} style={{ cursor: 'pointer' }} className="hover:text-white transition-colors">
                                    Điểm TB {sortField === 'avgScore' && (sortOrder === 'asc' ? '↑' : '↓')}
                                </th>
                                <th onClick={() => handleSort('submissionCount')} style={{ cursor: 'pointer' }} className="hover:text-white transition-colors">
                                    Bài nộp {sortField === 'submissionCount' && (sortOrder === 'asc' ? '↑' : '↓')}
                                </th>
                                <th onClick={() => handleSort('bestScore')} style={{ cursor: 'pointer' }} className="hover:text-white transition-colors">
                                    Điểm luyện đề {sortField === 'bestScore' && (sortOrder === 'asc' ? '↑' : '↓')}
                                </th>
                                <th>Trạng thái</th>
                                <th>Hành động</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map((u, i) => (
                                <tr key={u.uid}>
                                    <td>{i + 1}</td>
                                    {editingUserId === u.uid ? (
                                        <>
                                            <td className="td-cell-name">
                                                <input type="text" value={editFormData.name} onChange={e => setEditFormData({ ...editFormData, name: e.target.value })} className="td-input text-xs p-1 h-auto" />
                                            </td>
                                            <td className="td-cell-email">
                                                <input type="email" value={editFormData.email} onChange={e => setEditFormData({ ...editFormData, email: e.target.value })} className="td-input text-xs p-1 h-auto" />
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="td-cell-name">{u.name}</td>
                                            <td className="td-cell-email">{u.email}</td>
                                        </>
                                    )}
                                    <td>
                                        <span className={`td-level-badge ${u.role === 'teacher' ? 'bg-indigo-500/20 text-indigo-400' : ''}`}>
                                            {u.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                                        </span>
                                    </td>
                                    <td><span className="td-level-badge">{u.level}</span></td>
                                    <td className="td-cell-score">
                                        {editingUserId === u.uid ? (
                                            <input type="number" step="0.1" value={editFormData.avgScore} onChange={e => setEditFormData({ ...editFormData, avgScore: Number(e.target.value) })} className="td-input text-xs p-1 h-auto w-16" />
                                        ) : (
                                            u.avgScore > 0 ? u.avgScore.toFixed(1) : '--'
                                        )}
                                    </td>
                                    <td>{u.submissionCount}</td>
                                    <td className="td-cell-score">
                                        {editingUserId === u.uid ? (
                                            <input type="number" step="0.1" value={editFormData.bestScore} onChange={e => setEditFormData({ ...editFormData, bestScore: Number(e.target.value) })} className="td-input text-xs p-1 h-auto w-16" />
                                        ) : (
                                            u.bestScore != null && u.bestScore > 0 ? u.bestScore.toFixed(1) : '--'
                                        )}
                                    </td>
                                    <td>
                                        <span className={`td-status-badge ${u.isOnboarded ? 'active' : 'pending'}`}>
                                            {u.isOnboarded ? 'Hoạt động' : 'Chưa onboard'}
                                        </span>
                                    </td>
                                    <td className="flex gap-2 flex-wrap">
                                        {editingUserId === u.uid ? (
                                            <>
                                                <button onClick={handleSaveUser} disabled={savingUser} className="px-3 py-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-xs font-semibold text-green-400 transition-colors">
                                                    {savingUser ? '...' : 'Lưu'}
                                                </button>
                                                <button onClick={() => setEditingUserId(null)} disabled={savingUser} className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-semibold text-white/80 transition-colors">
                                                    Hủy
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleEditClick(u)}
                                                    className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-xs font-semibold text-blue-400 transition-colors"
                                                    title="Sửa thông tin"
                                                >
                                                    Sửa
                                                </button>
                                                <button
                                                    onClick={() => handleToggleRole(u.uid, u.role)}
                                                    className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-semibold text-white/80 transition-colors"
                                                    title="Chuyển đổi Học sinh / Giáo viên"
                                                >
                                                    Đổi quyền
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        if (!u.email) return alert('Người dùng này không có email hợp lệ.');
                                                        if (window.confirm(`Gửi email khôi phục mật khẩu đến ${u.email}?`)) {
                                                            try {
                                                                const { sendResetPasswordEmail } = await import('../../services/firebaseService');
                                                                await sendResetPasswordEmail(u.email);
                                                                alert('Đã gửi email khôi phục mật khẩu thành công. Lời khuyên: báo người dùng kiểm tra hộp thư (cả hộp thư rác).');
                                                            } catch (e: any) {
                                                                alert('Lỗi: ' + e.message);
                                                            }
                                                        }
                                                    }}
                                                    className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-red-400 text-xs font-semibold transition-colors"
                                                    title="Gửi email đặt lại mật khẩu"
                                                >
                                                    Mật khẩu
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredUsers.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="td-empty-row">
                                        {loading ? 'Đang tải...' : 'Không tìm thấy người dùng nào phù hợp'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
