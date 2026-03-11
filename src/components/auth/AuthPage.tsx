import React, { useState } from 'react';
import { Mail, Lock, User, Eye, EyeOff, LogIn, UserPlus, Sparkles } from 'lucide-react';
import { loginWithEmail, registerWithEmail, loginWithGoogle } from '../../services/firebaseService';

export default function AuthPage() {
    const [tab, setTab] = useState<'login' | 'register'>('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (tab === 'login') {
                await loginWithEmail(email, password);
            } else {
                if (!name.trim()) { setError('Vui lòng nhập tên của bạn.'); setLoading(false); return; }
                await registerWithEmail(email, password, name.trim());
            }
        } catch (err: unknown) {
            const code = (err as { code?: string }).code || '';
            if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential')
                setError('Email hoặc mật khẩu không đúng.');
            else if (code === 'auth/email-already-in-use')
                setError('Email này đã được đăng ký rồi!');
            else if (code === 'auth/weak-password')
                setError('Mật khẩu phải có ít nhất 6 ký tự.');
            else if (code === 'auth/invalid-email')
                setError('Định dạng email không hợp lệ.');
            else
                setError('Đã có lỗi xảy ra. Vui lòng thử lại.');
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
            setError('Đăng nhập Google thất bại. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0c1445] via-[#0a2a6e] to-[#0c1445] relative overflow-hidden">
            {/* Animated background blobs */}
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-sky-500/20 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-indigo-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1.5s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-cyan-400/10 rounded-full blur-[100px]" />

            <div className="relative z-10 w-full max-w-md mx-4">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-3 mb-3">
                        <div className="w-14 h-14 bg-gradient-to-br from-sky-400 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-sky-500/30">
                            <Sparkles className="text-white" size={28} />
                        </div>
                        <div className="text-left">
                            <h1 className="text-3xl font-black text-white tracking-tight">Văn Master</h1>
                            <p className="text-sky-300 text-sm font-medium">AI Gia sư Ngữ văn 2026</p>
                        </div>
                    </div>
                    <p className="text-slate-400 text-sm">Chinh phục Ngữ văn cùng trợ lý AI thông minh</p>
                </div>

                {/* Card */}
                <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl p-8 shadow-2xl shadow-black/40">
                    {/* Tabs */}
                    <div className="flex rounded-2xl bg-white/10 p-1 mb-6">
                        {(['login', 'register'] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => { setTab(t); setError(''); }}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${tab === t
                                    ? 'bg-white text-[#0a2a6e] shadow-md'
                                    : 'text-white/60 hover:text-white'
                                    }`}
                            >
                                {t === 'login' ? '🔑 Đăng nhập' : '✨ Đăng ký'}
                            </button>
                        ))}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {tab === 'register' && (
                            <div className="relative">
                                <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-300" />
                                <input
                                    type="text"
                                    placeholder="Tên của bạn"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full bg-white/10 border border-white/20 rounded-2xl pl-11 pr-4 py-3.5 text-white placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:bg-white/15 transition-all text-sm"
                                />
                            </div>
                        )}

                        <div className="relative">
                            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-300" />
                            <input
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full bg-white/10 border border-white/20 rounded-2xl pl-11 pr-4 py-3.5 text-white placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:bg-white/15 transition-all text-sm"
                                required
                            />
                        </div>

                        <div className="relative">
                            <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-300" />
                            <input
                                type={showPass ? 'text' : 'password'}
                                placeholder="Mật khẩu"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full bg-white/10 border border-white/20 rounded-2xl pl-11 pr-12 py-3.5 text-white placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:bg-white/15 transition-all text-sm"
                                required
                            />
                            <button type="button" onClick={() => setShowPass(!showPass)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-300">
                                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>

                        {error && (
                            <div className="bg-red-500/20 border border-red-400/30 rounded-2xl px-4 py-3 text-red-300 text-sm text-center">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-bold py-4 rounded-2xl hover:from-sky-400 hover:to-indigo-500 transition-all duration-300 shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : tab === 'login' ? (
                                <><LogIn size={18} /> Đăng nhập</>
                            ) : (
                                <><UserPlus size={18} /> Tạo tài khoản</>
                            )}
                        </button>
                    </form>

                    <div className="flex items-center gap-3 my-5">
                        <div className="flex-1 h-px bg-white/20" />
                        <span className="text-slate-400 text-xs">hoặc</span>
                        <div className="flex-1 h-px bg-white/20" />
                    </div>

                    <button
                        onClick={handleGoogle}
                        disabled={loading}
                        className="w-full bg-white text-slate-800 font-bold py-4 rounded-2xl hover:bg-slate-100 transition-all duration-300 shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Đăng nhập với Google
                    </button>
                </div>

                <p className="text-center text-slate-500 text-xs mt-6">
                    © 2026 Văn Master AI · Powered by Google Gemini
                </p>
            </div>
        </div>
    );
}
