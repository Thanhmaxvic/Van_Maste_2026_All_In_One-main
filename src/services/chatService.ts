import { rtdb, storage, getAllUsers } from './firebaseService';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
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

/** Upload a document using Firebase Storage */
export async function uploadChatDocument(file: File): Promise<string> {
    const ext = file.name.split('.').pop() || 'bin';
    const fileName = `chat_docs/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    const fileRef = storageRef(storage, fileName);
    await uploadBytes(fileRef, file);
    return await getDownloadURL(fileRef);
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
                }).then(() => resolve(convId));
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
    fileUrl?: string,
    fileName?: string
): Promise<void> {
    const msgRef = push(ref(rtdb, `chats/${conversationId}/messages`));
    const now = Date.now();
    const msg: ChatMessage = {
        senderId,
        text,
        timestamp: now,
        read: false,
    };
    if (imageUrl) msg.imageUrl = imageUrl;
    if (fileUrl) {
        msg.fileUrl = fileUrl;
        msg.fileName = fileName;
    }
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

            const infoUpdates: Record<string, any> = {
                lastMessage: text || (imageUrl ? '📷 Hình ảnh' : ''),
                lastTimestamp: now,
                lastSenderId: senderId,
                [unreadField]: currentUnread + 1,
            };

            if (fileUrl) {
                infoUpdates.lastMessage = fileName ? `Tệp đính kèm: ${fileName}` : 'Tài liệu đính kèm';
            }

            update(convInfoRef, infoUpdates).then(() => resolve());
        }, { onlyOnce: true });
    });
}

/** Broadcast a message to all students */
export async function broadcastMessage(
    senderId: string,
    text: string,
    imageUrl?: string
): Promise<void> {
    const users = await getAllUsers();
    const promises = users.map(async (u) => {
        if (u.role === 'teacher') return;
        try {
            const convId = await getOrCreateConversation(u.uid, u.name);
            await sendMessage(convId, senderId, text, imageUrl, true);
        } catch (e) {
            console.error(`Error sending broadcast to ${u.uid}:`, e);
        }
    });

    await Promise.allSettled(promises);
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

// ─── Delete conversation ──────────────────────────────────────────────────────

/** Delete a whole conversation and all its messages */
export async function deleteConversation(conversationId: string): Promise<void> {
    await set(ref(rtdb, `chats/${conversationId}`), null);
}
