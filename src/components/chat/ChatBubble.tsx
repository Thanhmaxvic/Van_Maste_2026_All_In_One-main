import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, ImagePlus, Loader2, GripHorizontal } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { listenToTeacherProfile } from '../../services/firebaseService';
import {
    getOrCreateConversation,
    sendMessage,
    listenToMessages,
    listenToStudentUnread,
    uploadChatImage,
    markAsRead,
} from '../../services/chatService';
import type { ChatMessage, TeacherProfile } from '../../types';

export default function ChatBubble() {
    const { user, userProfile } = useAuth();
    const [open, setOpen] = useState(false);
    const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [convId, setConvId] = useState<string | null>(null);
    const [unread, setUnread] = useState(0);
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Dragging state
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef({ startX: 0, startY: 0, currentX: 0, currentY: 0 });

    // Load teacher profile
    useEffect(() => {
        const unsub = listenToTeacherProfile(setTeacher);
        return unsub;
    }, []);

    // Create conversation on first open
    useEffect(() => {
        if (!user || !userProfile) return;
        getOrCreateConversation(user.uid, userProfile.name || 'Học sinh').then(setConvId);
    }, [user, userProfile]);

    // Listen to messages
    useEffect(() => {
        if (!convId) return;
        const unsub = listenToMessages(convId, setMessages);
        return unsub;
    }, [convId]);

    // Listen to unread count
    useEffect(() => {
        if (!convId) return;
        const unsub = listenToStudentUnread(convId, setUnread);
        return unsub;
    }, [convId]);

    // Mark read when opening
    useEffect(() => {
        if (open && convId) {
            markAsRead(convId, 'student');
        }
    }, [open, convId]);

    // Auto scroll
    useEffect(() => {
        if (open) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, open]);

    const handleSend = async () => {
        if (!input.trim() || !convId || !user) return;
        setSending(true);
        try {
            await sendMessage(convId, user.uid, input.trim(), undefined, false);
            setInput('');
        } finally {
            setSending(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !convId || !user) return;
        setUploading(true);
        try {
            const url = await uploadChatImage(file);
            await sendMessage(convId, user.uid, '', url, false);
        } catch (err) {
            console.error('Upload error:', err);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // --- Drag Logic ---
    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        setIsDragging(true);
        dragRef.current.startX = e.clientX - position.x;
        dragRef.current.startY = e.clientY - position.y;
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        const newX = e.clientX - dragRef.current.startX;
        const newY = e.clientY - dragRef.current.startY;
        setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    return (
        <>
            {/* Floating Bubble */}
            <button
                className={`cb-bubble ${open ? 'cb-hidden' : ''}`}
                onClick={() => setOpen(true)}
                title="Nhắn tin với giáo viên"
            >
                {teacher?.avatarUrl ? (
                    <img src={teacher.avatarUrl} alt="Giáo viên" className="w-full h-full object-cover rounded-full" />
                ) : (
                    <MessageCircle size={24} />
                )}
                {unread > 0 && <span className="cb-unread">{unread}</span>}
            </button>

            {/* Chat Panel */}
            {open && (
                <div
                    className="cb-panel"
                    style={{ transform: `translate(calc(0px + ${position.x}px), calc(0px + ${position.y}px))` }}
                >
                    {/* Header */}
                    <div
                        className="cb-header"
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
                    >
                        <div className="cb-header-info">
                            <div className="cb-avatar">
                                {teacher?.avatarUrl ? (
                                    <img src={teacher.avatarUrl} alt="" />
                                ) : (
                                    <span>{(teacher?.name || 'G').charAt(0).toUpperCase()}</span>
                                )}
                            </div>
                            <div>
                                <div className="cb-teacher-name">{teacher?.name || 'Giáo viên'}</div>
                                <div className="cb-teacher-spec">{teacher?.specialization || 'Giáo viên Ngữ văn'}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <GripHorizontal size={16} className="text-white/40 mr-2" />
                            <button
                                className="cb-close"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => { setOpen(false); setPosition({ x: 0, y: 0 }); }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Teacher Bio Card (if first visit / no messages) */}
                    {messages.length === 0 && teacher && (
                        <div className="cb-bio-card">
                            <div className="cb-bio-avatar">
                                {teacher.avatarUrl ? (
                                    <img src={teacher.avatarUrl} alt="" />
                                ) : (
                                    <span>{teacher.name.charAt(0).toUpperCase()}</span>
                                )}
                            </div>
                            <div className="cb-bio-name">{teacher.name}</div>
                            <div className="cb-bio-spec">{teacher.specialization}</div>
                            {teacher.bio && <div className="cb-bio-text">{teacher.bio}</div>}
                            <div className="cb-bio-hint">Gửi tin nhắn để bắt đầu trò chuyện</div>
                        </div>
                    )}

                    {/* Messages */}
                    <div className="cb-messages">
                        {messages.map((msg, i) => {
                            const isStudent = msg.senderId === user?.uid;
                            return (
                                <div key={msg.id || i} className={`cb-msg ${isStudent ? 'sent' : 'received'}`}>
                                    <div className="cb-msg-bubble">
                                        {msg.imageUrl && (
                                            <img src={msg.imageUrl} alt="" className="cb-msg-img" />
                                        )}
                                        {msg.text && <p>{msg.text}</p>}
                                        <span className="cb-msg-time">
                                            {new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="cb-input-bar">
                        <button
                            className="cb-input-btn"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                        >
                            {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleImageUpload}
                        />
                        <input
                            className="cb-input"
                            type="text"
                            placeholder="Nhập tin nhắn..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <button
                            className="cb-send"
                            onClick={handleSend}
                            disabled={!input.trim() || sending}
                        >
                            <Send size={14} />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
