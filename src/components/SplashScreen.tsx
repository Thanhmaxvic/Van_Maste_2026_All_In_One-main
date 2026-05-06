import React, { useState } from 'react';
import { loginWithEmail, registerWithEmail, loginWithGoogle } from '../services/firebaseService';

export default function SplashScreen() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isLogin) {
                await loginWithEmail(email, password);
            } else {
                await registerWithEmail(email, password, name);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Lỗi đăng nhập';
            setError(
                msg.includes('wrong-password') ? 'Sai mật khẩu.' :
                    msg.includes('user-not-found') ? 'Email không tồn tại.' :
                        msg.includes('email-already') ? 'Email đã được sử dụng.' :
                            'Lỗi: ' + msg
            );
        } finally {
            setLoading(false);
        }
    };

    const handleGoogle = async () => {
        setError('');
        setLoading(true);
        try {
            await loginWithGoogle();
        } catch {
            setError('Không thể đăng nhập với Google.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="splash">
            <div className="splash-logo-wrap">
                <img src="/images/logo.webp" alt="Văn Master Logo" className="splash-logo-img" />
            </div>

            <form className="splash-card" onSubmit={handleSubmit}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                    {isLogin ? 'Đăng nhập' : 'Tạo tài khoản'}
                </div>

                {!isLogin && (
                    <input
                        className="splash-input"
                        type="text"
                        placeholder="Họ và tên"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        required
                    />
                )}
                <input
                    className="splash-input"
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                />
                <input
                    className="splash-input"
                    type="password"
                    placeholder="Mật khẩu"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                />

                {error && (
                    <div style={{ color: '#FCA5A5', fontSize: 12, fontWeight: 500 }}>{error}</div>
                )}

                <button className="splash-btn" type="submit" disabled={loading}>
                    {loading ? 'Đang xử lý...' : isLogin ? 'Đăng nhập' : 'Tạo tài khoản'}
                </button>

                <div className="splash-divider">hoặc</div>

                <button type="button" className="splash-google-btn" onClick={handleGoogle} disabled={loading}>
                    <svg width="18" height="18" viewBox="0 0 18 18">
                        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
                        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                        <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
                        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
                    </svg>
                    Tiếp tục với Google
                </button>

                <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
                    {isLogin ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}{' '}
                    <button
                        type="button"
                        onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        style={{ color: '#FCD34D', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}
                    >
                        {isLogin ? 'Đăng ký ngay' : 'Đăng nhập'}
                    </button>
                </div>
            </form>
        </div>
    );
}
