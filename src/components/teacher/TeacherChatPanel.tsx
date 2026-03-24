import { useState, useEffect, useRef } from 'react';
import { Send, ImagePlus, Search, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
    listenToConversations,
    listenToMessages,
    sendMessage,
    uploadChatImage,
    markAsRead,
} from '../../services/chatService';
import type { ChatMessage, ChatConversation } from '../../types';

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Vừa xong';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} phút`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ`;
    return `${Math.floor(diff / 86400000)} ngày`;
}

export default function TeacherChatPanel() {
    const { user } = useAuth();
    const [conversations, setConversations] = useState<ChatConversation[]>([]);
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [uploading, setUploading] = useState(false);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Listen to all conversations
    useEffect(() => {
        const unsub = listenToConversations(setConversations);
        return unsub;
    }, []);

    // Listen to messages of active conversation
    useEffect(() => {
        if (!activeConvId) { setMessages([]); return; }
        const unsub = listenToMessages(activeConvId, setMessages);
        // Mark as read when opening
        markAsRead(activeConvId, 'teacher');
        return unsub;
    }, [activeConvId]);

    // Auto scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const activeConv = conversations.find(c => c.id === activeConvId);

    const handleSend = async () => {
        if (!input.trim() || !activeConvId || !user) return;
        setSending(true);
        try {
            if (activeConvId === 'BROADCAST') {
                const { broadcastMessage } = await import('../../services/chatService');
                await broadcastMessage(user.uid, input.trim(), undefined);
                alert('Đã gửi thông báo đến tất cả học sinh!');
            } else {
                await sendMessage(activeConvId, user.uid, input.trim(), undefined, true);
            }
            setInput('');
        } catch (err: any) {
            alert('Lỗi: ' + err.message);
        } finally {
            setSending(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeConvId || !user) return;
        setUploading(true);
        try {
            const url = await uploadChatImage(file);
            if (activeConvId === 'BROADCAST') {
                const { broadcastMessage } = await import('../../services/chatService');
                await broadcastMessage(user.uid, '', url);
                alert('Đã gửi hình ảnh đến tất cả học sinh!');
            } else {
                await sendMessage(activeConvId, user.uid, '', url, true);
            }
        } catch (err) {
            console.error('Upload error:', err);
            alert('Lỗi tải ảnh. Vui lòng thử lại.');
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

    const filteredConvs = searchQuery
        ? conversations.filter(c => c.studentName.toLowerCase().includes(searchQuery.toLowerCase()))
        : conversations;

    return (
        <div className="tc-panel">
            {/* Left: Conversation List */}
            <div className="tc-sidebar">
                <div className="tc-sidebar-header">
                    <h2>Tin nhắn</h2>
                    <span className="tc-sidebar-count">{conversations.length}</span>
                </div>

                <div className="tc-search">
                    <Search size={14} />
                    <input
                        type="text"
                        placeholder="Tìm học sinh..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="tc-conv-list">
                    <button
                        className={`tc-conv-item ${activeConvId === 'BROADCAST' ? 'active' : ''}`}
                        onClick={() => setActiveConvId('BROADCAST')}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 8 }}
                    >
                        <div className="tc-conv-avatar" style={{ background: '#ec4899' }}>
                            <Send size={16} color="white" />
                        </div>
                        <div className="tc-conv-info">
                            <div className="tc-conv-name" style={{ color: '#ec4899', fontWeight: 600 }}>Gửi thông báo chung</div>
                            <div className="tc-conv-last">Đến tất cả học sinh ({conversations.length})</div>
                        </div>
                    </button>

                    {filteredConvs.length === 0 && (
                        <div className="tc-empty">Chưa có tin nhắn nào</div>
                    )}
                    {filteredConvs.map(conv => (
                        <button
                            key={conv.id}
                            className={`tc-conv-item ${activeConvId === conv.id ? 'active' : ''}`}
                            onClick={() => setActiveConvId(conv.id)}
                        >
                            <div className="tc-conv-avatar">
                                {conv.studentName.charAt(0).toUpperCase()}
                            </div>
                            <div className="tc-conv-info">
                                <div className="tc-conv-name">{conv.studentName}</div>
                                <div className="tc-conv-last">{conv.lastMessage || 'Bắt đầu trò chuyện'}</div>
                            </div>
                            <div className="tc-conv-meta">
                                <span className="tc-conv-time">{timeAgo(conv.lastTimestamp)}</span>
                                {conv.unreadCount > 0 && (
                                    <span className="tc-conv-badge">{conv.unreadCount}</span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Right: Chat Window */}
            <div className="tc-chat">
                {!activeConvId ? (
                    <div className="tc-chat-empty">
                        <MessageSquareIcon />
                        <h3>Chọn cuộc trò chuyện</h3>
                        <p>Chọn một học sinh từ danh sách bên trái để bắt đầu trò chuyện</p>
                    </div>
                ) : activeConvId === 'BROADCAST' ? (
                    <>
                        {/* Chat Header for Broadcast */}
                        <div className="tc-chat-header">
                            <div className="tc-chat-header-avatar" style={{ background: '#ec4899' }}>
                                <Send size={20} color="white" />
                            </div>
                            <div>
                                <div className="tc-chat-header-name" style={{ color: '#ec4899' }}>Gửi thông báo chung</div>
                                <div className="tc-chat-header-status">Tin nhắn sẽ được gửi đến tất cả {conversations.length} học sinh</div>
                            </div>
                        </div>

                        {/* Messages placeholder */}
                        <div className="tc-messages" style={{ justifyContent: 'center', alignItems: 'center' }}>
                            <div className="tc-chat-empty" style={{ opacity: 0.5, marginTop: 0 }}>
                                <MessageSquareIcon />
                                <h3>Chế độ Gửi Thông Báo</h3>
                                <p>Nhập và gửi tin nhắn để phát đến tất cả học sinh.</p>
                            </div>
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input bar */}
                        <div className="tc-input-bar">
                            <button
                                className="tc-input-btn"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                title="Gửi hình ảnh chung"
                            >
                                {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleImageUpload}
                            />
                            <textarea
                                className="tc-input"
                                rows={1}
                                placeholder="Nhập thông báo chung..."
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                            <button
                                className="tc-send-btn bg-pink-500 hover:bg-pink-600 border-pink-500"
                                onClick={handleSend}
                                disabled={!input.trim() || sending}
                                title="Gửi thông báo"
                            >
                                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div className="tc-chat-header">
                            <div className="tc-chat-header-avatar">
                                {activeConv?.studentName.charAt(0).toUpperCase() || '?'}
                            </div>
                            <div>
                                <div className="tc-chat-header-name">{activeConv?.studentName}</div>
                                <div className="tc-chat-header-status">Học sinh</div>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="tc-messages">
                            {messages.map((msg, i) => {
                                const isTeacher = msg.senderId === user?.uid;
                                return (
                                    <div key={msg.id || i} className={`tc-msg ${isTeacher ? 'sent' : 'received'}`}>
                                        <div className="tc-msg-bubble">
                                            {msg.imageUrl && (
                                                <img src={msg.imageUrl} alt="" className="tc-msg-img" />
                                            )}
                                            {msg.text && <p>{msg.text}</p>}
                                            <span className="tc-msg-time">
                                                {new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="tc-input-bar">
                            <button
                                className="tc-input-btn"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                            >
                                {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleImageUpload}
                            />
                            <textarea
                                className="tc-input"
                                rows={1}
                                placeholder="Nhập tin nhắn..."
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                            <button
                                className="tc-send-btn"
                                onClick={handleSend}
                                disabled={!input.trim() || sending}
                            >
                                <Send size={16} />
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function MessageSquareIcon() {
    return (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2 }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    );
}
