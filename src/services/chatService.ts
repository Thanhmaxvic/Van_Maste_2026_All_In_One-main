import { rtdb } from './firebaseService';
import {
    ref,
    push,
    onValue,
    set,
    update,
    query,
    orderByChild,
    off,
    type DatabaseReference,
} from 'firebase/database';
import type { ChatMessage, ChatConversation } from '../types';

const UPANHNHANH_API_KEY = 'upanh_sdbeChaTRMsDtXN7JCyitqeFGZJbzVRm7HSez4wirbdPdoeY';
const UPANHNHANH_API_URL = 'https://www.upanhnhanh.com/api/v1/upload';

// ─── Image Upload ─────────────────────────────────────────────────────────────

/** Upload an image file to upanhnhanh and return the URL */
export async function uploadChatImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('images[]', file);

    const res = await fetch(UPANHNHANH_API_URL, {
        method: 'POST',
        headers: { 'X-API-Key': UPANHNHANH_API_KEY },
        body: formData,
    });

    const data = await res.json();
    if (data.success && data.urls && data.urls.length > 0) {
        return data.urls[0];
    }
    throw new Error(data.errors?.[0] || 'Upload ảnh thất bại');
}

// ─── Conversations ────────────────────────────────────────────────────────────

/** Get or create a conversation between a student and the (single) teacher */
export async function getOrCreateConversation(
    studentUid: string,
    studentName: string,
): Promise<string> {
    // Conversation ID is deterministic: student UID
    const convId = `conv_${studentUid}`;
    const convRef = ref(rtdb, `chats/${convId}/info`);

    return new Promise((resolve) => {
        onValue(convRef, (snap) => {
            off(convRef);
            if (snap.exists()) {
                resolve(convId);
            } else {
                // Create new conversation
                set(convRef, {
                    studentUid,
                    studentName,
                    createdAt: Date.now(),
                    lastMessage: '',
                    lastTimestamp: Date.now(),
                    lastSenderId: '',
                    unreadByTeacher: 0,
                    unreadByStudent: 0,
                });
                resolve(convId);
            }
        }, { onlyOnce: true });
    });
}

// ─── Send Message ─────────────────────────────────────────────────────────────

/** Send a message in a conversation */
export async function sendMessage(
    conversationId: string,
    senderId: string,
    text: string,
    imageUrl?: string,
    senderIsTeacher = false,
): Promise<void> {
    const msgRef = push(ref(rtdb, `chats/${conversationId}/messages`));
    const msg: ChatMessage = {
        senderId,
        text,
        imageUrl: imageUrl || '',
        timestamp: Date.now(),
        read: false,
    };
    await set(msgRef, msg);

    // Update conversation info
    const unreadField = senderIsTeacher ? 'unreadByStudent' : 'unreadByTeacher';
    const convInfoRef = ref(rtdb, `chats/${conversationId}/info`);

    // Get current unread count and increment
    return new Promise((resolve) => {
        onValue(convInfoRef, (snap) => {
            off(convInfoRef);
            const data = snap.val() || {};
            const currentUnread = data[unreadField] || 0;
            update(convInfoRef, {
                lastMessage: text || (imageUrl ? '📷 Hình ảnh' : ''),
                lastTimestamp: Date.now(),
                lastSenderId: senderId,
                [unreadField]: currentUnread + 1,
            }).then(() => resolve());
        }, { onlyOnce: true });
    });
}

// ─── Listen to Messages ───────────────────────────────────────────────────────

/** Listen to messages in a conversation in real-time */
export function listenToMessages(
    conversationId: string,
    callback: (messages: ChatMessage[]) => void,
): () => void {
    const messagesRef = query(
        ref(rtdb, `chats/${conversationId}/messages`),
        orderByChild('timestamp'),
    );

    onValue(messagesRef, (snap) => {
        const messages: ChatMessage[] = [];
        snap.forEach((child) => {
            messages.push({ id: child.key!, ...child.val() });
        });
        callback(messages);
    });

    return () => off(messagesRef as DatabaseReference);
}

// ─── Listen to Conversations (Teacher) ────────────────────────────────────────

/** Listen to all conversations for the teacher inbox */
export function listenToConversations(
    callback: (conversations: ChatConversation[]) => void,
): () => void {
    const chatsRef = ref(rtdb, 'chats');

    onValue(chatsRef, (snap) => {
        const conversations: ChatConversation[] = [];
        snap.forEach((child) => {
            const info = child.child('info').val();
            if (info) {
                conversations.push({
                    id: child.key!,
                    studentUid: info.studentUid || '',
                    studentName: info.studentName || 'Học sinh',
                    lastMessage: info.lastMessage || '',
                    lastTimestamp: info.lastTimestamp || 0,
                    lastSenderId: info.lastSenderId || '',
                    unreadCount: info.unreadByTeacher || 0,
                });
            }
        });
        // Sort by last message time, newest first
        conversations.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
        callback(conversations);
    });

    return () => off(chatsRef);
}

// ─── Listen to Student Unread Count ───────────────────────────────────────────

/** Listen to unread count for a student */
export function listenToStudentUnread(
    conversationId: string,
    callback: (count: number) => void,
): () => void {
    const unreadRef = ref(rtdb, `chats/${conversationId}/info/unreadByStudent`);
    onValue(unreadRef, (snap) => {
        callback(snap.val() || 0);
    });
    return () => off(unreadRef);
}

// ─── Mark as Read ─────────────────────────────────────────────────────────────

/** Reset unread count for a specific role */
export async function markAsRead(
    conversationId: string,
    role: 'teacher' | 'student',
): Promise<void> {
    const field = role === 'teacher' ? 'unreadByTeacher' : 'unreadByStudent';
    await update(ref(rtdb, `chats/${conversationId}/info`), { [field]: 0 });
}
