import { initializeApp } from 'firebase/app';
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    updateProfile,
    sendPasswordResetEmail,
    updatePassword,
    updateEmail,
    type User,
} from 'firebase/auth';
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    where,
    serverTimestamp,
    increment,
    onSnapshot,
    getCountFromServer
} from 'firebase/firestore';
import { getDatabase, ref as rtdbRef, onValue, onDisconnect, set, push } from 'firebase/database';
import type { UserProfile, ExamSubmission, ExamGrade, LessonProgress, TeacherProfile } from '../types';

const firebaseConfig = {
    apiKey: "AIzaSyCOwsJrIX6Ni1eWNzo4ytjdrNeVYiEJMjc",
    authDomain: "van-master.firebaseapp.com",
    projectId: "van-master",
    storageBucket: "van-master.firebasestorage.app",
    messagingSenderId: "574744377166",
    appId: "1:574744377166:web:1a0677e6d163bab27a101f",
    measurementId: "G-PZCF297MCQ",
    databaseURL: "https://van-master-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

const googleProvider = new GoogleAuthProvider();

// ─── Auth helpers ──────────────────────────────────────────────────────────────

export async function loginWithEmail(email: string, password: string) {
    return signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(email: string, password: string, displayName: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    return cred;
}

export async function directUpdatePassword(newPassword: string) {
    if (!auth.currentUser) throw new Error("Chưa đăng nhập");
    return updatePassword(auth.currentUser, newPassword);
}

export async function directUpdateEmail(newEmail: string) {
    if (!auth.currentUser) throw new Error("Chưa đăng nhập");
    return updateEmail(auth.currentUser, newEmail);
}

export async function sendResetPasswordEmail(email: string) {
    return sendPasswordResetEmail(auth, email);
}

export async function loginWithGoogle() {
    return signInWithPopup(auth, googleProvider);
}

export async function logout() {
    return signOut(auth);
}

// ─── Firestore – User Profile ──────────────────────────────────────────────────

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
    const docRef = doc(db, 'users', uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        const data = snap.data() as UserProfile;
        // Auto-upgrade admin@vanmaster.com to teacher if it was created as student
        if (data.email?.toLowerCase() === 'admin@vanmaster.com' && data.role !== 'teacher') {
            await setDoc(docRef, { role: 'teacher' }, { merge: true });
            data.role = 'teacher';
        }
        return data;
    }
    return null;
}

export function listenToUserProfile(uid: string, callback: (profile: UserProfile | null) => void): () => void {
    const docRef = doc(db, 'users', uid);
    return onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
            callback(snap.data() as UserProfile);
        } else {
            callback(null);
        }
    });
}

export async function createUserProfile(user: User): Promise<UserProfile> {
    const isTeacherEmail = user.email?.toLowerCase() === 'admin@vanmaster.com';
    const profile: UserProfile = {
        uid: user.uid,
        name: user.displayName || 'Bạn',
        email: user.email || '',
        role: isTeacherEmail ? 'teacher' : 'student',
        targetScore: null,
        voiceGender: 'male',
        isOnboarded: false,
        assessmentDone: false,
        avgScore: null,
        submissionCount: 0,
        weaknesses: [],
        strengths: [],
        level: 'Tân Binh',
        xp: 0,
        streak: 1,
        progress: 5,
    };
    await setDoc(doc(db, 'users', user.uid), profile);
    return profile;
}

/**
 * Save target score only. Does NOT set isOnboarded.
 * isOnboarded is only set after assessment is complete.
 */
export async function saveTargetScore(uid: string, score: number) {
    await updateDoc(doc(db, 'users', uid), { targetScore: score });
}

/**
 * Mark assessment as done. This is the final onboarding step.
 */
export async function completeAssessment(uid: string, diagnosticScore: number) {
    await updateDoc(doc(db, 'users', uid), {
        isOnboarded: true,
        assessmentDone: true,
        diagnosticScore,
        avgScore: diagnosticScore,
        bestScore: diagnosticScore,
        submissionCount: 1,
    });
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>) {
    await updateDoc(doc(db, 'users', uid), data as Record<string, unknown>);
}

export async function saveDiagnosticScore(uid: string, score: number) {
    await updateDoc(doc(db, 'users', uid), { diagnosticScore: score });
}

/** Number of consecutive clean submissions required to auto-resolve a weakness */
const RESOLVE_THRESHOLD = 2;
/** Max number of weaknesses / strengths to surface in the UI */
const MAX_WEAKNESSES = 5;
const MAX_STRENGTHS = 4;
/** These ephemeral flags expire after just 1 clean submission */
const EPHEMERAL_WEAKNESS_KEYS = new Set(['không viết bài', 'không nộp bài', 'bức sang không viết']);

/**
 * Smart weakness/strength tracking with auto-resolution.
 *
 * Rules:
 * - Ephemeral weaknesses (e.g. 'không viết bài') expire after 1 clean submission
 * - Weaknesses auto-resolve after RESOLVE_THRESHOLD=2 consecutive clean submissions
 * - New weaknesses are only added if they DIDN'T appear as a contradiction to an existing strength
 * - Strengths require appearing in >=2 submissions before being surfaced
 * - Strengths that are contradicted by current weaknesses are removed
 * - Caps: MAX_WEAKNESSES=5, MAX_STRENGTHS=4
 */
export async function saveExamInsights(
    uid: string,
    grade: ExamGrade,
    currentProfile: UserProfile,
) {
    const newWeaknessKeys = new Set((grade.weaknesses || []).map(w => w.toLowerCase().trim()));
    const existingWeaknesses: string[] = currentProfile.weaknesses || [];
    const cleanStreak: Record<string, number> = { ...(currentProfile.weaknessCleanStreak || {}) };
    const hasRealContent = (grade.score || 0) > 0 || !newWeaknessKeys.has('không viết bài');
    const scoreOutOf10 = grade.maxScore ? +(grade.score / grade.maxScore * 10).toFixed(2) : 0;
    // Only treat this submission as "clean evidence" to resolve weaknesses
    // when there is real content AND the score is not quá thấp.
    // Ví dụ: bài 0 điểm hoặc rất thấp không được dùng để xóa điểm yếu cũ.
    const canResolveFromThisSubmission = hasRealContent && scoreOutOf10 >= 4;

    // ── Step 1: Process existing weaknesses ─────────────────────────────
    const resolvedWeaknesses: string[] = [];
    const survivingWeaknesses: string[] = [];

    for (const w of existingWeaknesses) {
        const key = w.toLowerCase().trim();
        const isEphemeral = EPHEMERAL_WEAKNESS_KEYS.has(key);
        // Ephemeral weakness (e.g. 'không viết bài') clears after just 1 clean submission
        const threshold = isEphemeral ? 1 : RESOLVE_THRESHOLD;

        if (newWeaknessKeys.has(key)) {
            // Reappeared → reset streak, keep it
            cleanStreak[key] = 0;
            survivingWeaknesses.push(w);
        } else {
            // Nếu bài hiện tại quá thấp / không đủ dữ liệu, KHÔNG coi là "bài sạch".
            // Giữ nguyên streak, không tăng, không xóa điểm yếu.
            if (!canResolveFromThisSubmission) {
                survivingWeaknesses.push(w);
                continue;
            }

            const streak = (cleanStreak[key] || 0) + 1;
            cleanStreak[key] = streak;
            if (streak >= threshold) {
                resolvedWeaknesses.push(w);
                delete cleanStreak[key];
            } else {
                survivingWeaknesses.push(w);
            }
        }
    }

    // ── Step 2: Add new weaknesses not already tracked ──────────────────
    const existingKeys = new Set(existingWeaknesses.map(w => w.toLowerCase().trim()));
    for (const w of grade.weaknesses || []) {
        const key = w.toLowerCase().trim();
        if (!existingKeys.has(key)) {
            survivingWeaknesses.push(w);
            cleanStreak[key] = 0;
        }
    }

    // Cap at MAX_WEAKNESSES (prioritize by lowest clean streak = most persistent)
    const mergedWeaknesses = survivingWeaknesses
        .sort((a, b) => (cleanStreak[a.toLowerCase().trim()] || 0) - (cleanStreak[b.toLowerCase().trim()] || 0))
        .slice(0, MAX_WEAKNESSES);

    // ── Step 3: Strengths — require >=2 appearances, remove contradictions ───
    // Build a frequency map of strengths across submissions
    const strengthFreqMap: Record<string, number> = {};
    // Carry over existing strengths (each occurrence counted once from before)
    for (const s of currentProfile.strengths || []) {
        const key = s.toLowerCase().trim();
        strengthFreqMap[key] = (strengthFreqMap[key] || 1) + 1; // already appeared before
    }
    // Add new strengths from this submission
    for (const s of grade.strengths || []) {
        const key = s.toLowerCase().trim();
        strengthFreqMap[key] = (strengthFreqMap[key] || 0) + 1;
    }

    // A strength must appear >=2 total across all submissions
    // AND must not be contradicted by a current weakness
    const weaknessKeywords = new Set(
        mergedWeaknesses.flatMap(w => w.toLowerCase().split(/\s+/))
    );
    const mergedStrengths = Object.entries(strengthFreqMap)
        .filter(([key, count]) => {
            if (count < 2) return false; // not yet confirmed
            if (hasRealContent && EPHEMERAL_WEAKNESS_KEYS.has(key)) return false;
            // Remove strength if its keywords appear in current weaknesses (contradiction)
            const words = key.split(/\s+/);
            const hasContradiction = words.some(word => {
                if (word.length <= 3) return false; // skip short words like "văn"
                return weaknessKeywords.has(word);
            });
            return !hasContradiction;
        })
        .sort(([, a], [, b]) => b - a) // most frequent first
        .slice(0, MAX_STRENGTHS)
        .map(([key]) => {
            // Prefer the original casing from grade.strengths or existing profile
            return [...(grade.strengths || []), ...(currentProfile.strengths || [])]
                .find(s => s.toLowerCase().trim() === key) || key;
        });

    // ── Step 4: Running average ───────────────────────────────────
    const prevCount = currentProfile.submissionCount || 0;
    const prevAvg = currentProfile.avgScore || 0;
    const newCount = prevCount + 1;
    const newAvg = +((prevAvg * prevCount + scoreOutOf10) / newCount).toFixed(2);

    const newBest = Math.max(currentProfile.bestScore || 0, scoreOutOf10);

    await updateDoc(doc(db, 'users', uid), {
        weaknesses: mergedWeaknesses,
        weaknessCleanStreak: cleanStreak,
        strengths: mergedStrengths,
        avgScore: newAvg,
        submissionCount: newCount,
        bestScore: newBest,
        xp: (currentProfile.xp || 0) + Math.round(grade.score * 20),
    });

    return { mergedWeaknesses, resolvedWeaknesses, mergedStrengths, newAvg };
}

// ─── Firestore – Exam Submissions ──────────────────────────────────────────────

export async function saveExamSubmission(uid: string, examId: number, studentAnswer: string, cheating = false): Promise<string> {
    const ref = await addDoc(collection(db, 'users', uid, 'submissions'), {
        examId,
        studentAnswer,
        cheating,
        status: 'pending',
        createdAt: serverTimestamp(),
    });
    return ref.id;
}

export async function updateSubmissionGrade(uid: string, submissionId: string, grade: ExamSubmission['grade']) {
    await updateDoc(doc(db, 'users', uid, 'submissions', submissionId), {
        status: 'graded',
        grade,
        gradedAt: serverTimestamp(),
    });
}

/**
 * Get exam completion history for a user.
 * Returns a Map of examId -> best score out of 10.
 */
export async function getExamHistory(uid: string): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    try {
        const q = query(collection(db, 'users', uid, 'submissions'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        snap.forEach(d => {
            const data = d.data() as { examId?: number; grade?: { score: number; maxScore: number } };
            if (!data.examId || !data.grade) return;
            const scoreOutOf10 = +(data.grade.score / data.grade.maxScore * 10).toFixed(1);
            // Keep best score per examId
            const existing = map.get(data.examId);
            if (existing === undefined || scoreOutOf10 > existing) {
                map.set(data.examId, scoreOutOf10);
            }
        });
    } catch (e) {
        console.error('getExamHistory error:', e);
    }
    return map;
}

// ─── Chat Memory (AI persistent context) ────────────────────────────────────

/** Save the last N chat messages for persistent AI memory */
export async function saveChatMemory(uid: string, messages: { role: string; content: string }[]) {
    await setDoc(doc(db, 'users', uid, 'memory', 'chatHistory'), {
        messages: messages.slice(-15), // keep last 15
        updatedAt: serverTimestamp(),
    });
}

/** Load saved chat memory */
export async function loadChatMemory(uid: string): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    try {
        const snap = await getDoc(doc(db, 'users', uid, 'memory', 'chatHistory'));
        if (snap.exists()) {
            const data = snap.data() as { messages?: { role: 'user' | 'assistant'; content: string }[] };
            return data.messages || [];
        }
    } catch (e) {
        console.error('loadChatMemory error:', e);
    }
    return [];
}

export async function incrementTotalVisits() {
    try {
        const statsRef = doc(db, 'system', 'stats');
        await setDoc(statsRef, {
            totalVisits: increment(1)
        }, { merge: true });
    } catch (e) {
        console.error("Could not update totalVisits:", e);
    }
}

export function listenToStats(callback: (data: { totalRegistered: number, totalVisits: number }) => void) {
    const statsRef = doc(db, 'system', 'stats');
    return onSnapshot(statsRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            callback({
                totalRegistered: data.totalRegistered || 0,
                totalVisits: data.totalVisits || 0
            });
        }
    });
}

// ─── Registered Users Count (from actual users collection) ────────────────────

export async function getRegisteredUsersCount(): Promise<number> {
    try {
        const usersCol = collection(db, 'users');
        const snapshot = await getCountFromServer(usersCol);
        return snapshot.data().count;
    } catch (e) {
        console.error('getRegisteredUsersCount error:', e);
        return 0;
    }
}

// ─── Realtime Database (Online Presence) ──────────────────────────────────────

export function trackOnlinePresence() {
    const connectedRef = rtdbRef(rtdb, ".info/connected");
    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            const myPresenceRef = push(rtdbRef(rtdb, 'system/online_users'));
            // Cài đặt xóa khi ngắt kết nối
            onDisconnect(myPresenceRef).remove().catch(console.error);
            // Đánh dấu là đang online
            set(myPresenceRef, true).catch(console.error);
        }
    });
}

export function listenToOnlineUsers(callback: (count: number) => void) {
    const onlineUsersRef = rtdbRef(rtdb, 'system/online_users');
    return onValue(onlineUsersRef, (snap) => {
        callback(snap.size);
    });
}

/** Save user personality traits extracted by AI */
export async function saveUserTraits(uid: string, traits: string[]) {
    await updateDoc(doc(db, 'users', uid), { userTraits: traits });
}

// ─── Lesson Progress ────────────────────────────────────────────────────────

/** Update lesson progress for a specific lesson */
export async function updateLessonProgress(uid: string, lessonKey: string, progress: LessonProgress) {
    await updateDoc(doc(db, 'users', uid), {
        [`lessonProgress.${lessonKey}`]: progress,
    });
}

/** Save currently active lesson to resume later */
export async function saveActiveLesson(uid: string, sectionId: string, lessonId: string) {
    await updateDoc(doc(db, 'users', uid), {
        activeLesson: { sectionId, lessonId },
    });
}

/** Clear active lesson (when lesson is completed or user starts new lesson) */
export async function clearActiveLesson(uid: string) {
    await updateDoc(doc(db, 'users', uid), {
        activeLesson: null,
    });
}

// ─── Teacher Profile ──────────────────────────────────────────────────────────

/** Get the teacher profile doc from Firestore system collection */
export async function getTeacherProfile(): Promise<TeacherProfile | null> {
    try {
        const snap = await getDoc(doc(db, 'system', 'teacherProfile'));
        return snap.exists() ? (snap.data() as TeacherProfile) : null;
    } catch (e) {
        console.error('getTeacherProfile error:', e);
        return null;
    }
}

/** Update teacher display profile */
export async function updateTeacherProfile(data: Partial<TeacherProfile>) {
    await setDoc(doc(db, 'system', 'teacherProfile'), data, { merge: true });
}

/** Listen to teacher profile changes in real-time */
export function listenToTeacherProfile(callback: (p: TeacherProfile | null) => void) {
    return onSnapshot(doc(db, 'system', 'teacherProfile'), (snap) => {
        callback(snap.exists() ? (snap.data() as TeacherProfile) : null);
    });
}

// ─── Admin: All Users ─────────────────────────────────────────────────────────

export interface AdminUserEntry {
    uid: string;
    name: string;
    email: string;
    role?: string;
    avgScore: number;
    submissionCount: number;
    level: string;
    isOnboarded: boolean;
}

/** Get all users for admin panel */
export async function getAllUsers(): Promise<AdminUserEntry[]> {
    const snap = await getDocs(collection(db, 'users'));
    const users: AdminUserEntry[] = [];
    snap.forEach(d => {
        const data = d.data();
        users.push({
            uid: d.id,
            name: data.name || 'Bạn',
            email: data.email || '',
            role: data.role || 'student',
            avgScore: data.avgScore ?? 0,
            submissionCount: data.submissionCount ?? 0,
            level: data.level || 'Tân Binh',
            isOnboarded: data.isOnboarded ?? false,
        });
    });
    return users;
}

// ─── System Config ────────────────────────────────────────────────────────────

export async function getSystemConfig(): Promise<Record<string, unknown>> {
    try {
        const snap = await getDoc(doc(db, 'system', 'config'));
        return snap.exists() ? snap.data() : {};
    } catch {
        return {};
    }
}

export async function updateSystemConfig(data: Record<string, unknown>) {
    await setDoc(doc(db, 'system', 'config'), data, { merge: true });
}

export function listenToSystemConfig(callback: (config: Record<string, unknown>) => void) {
    return onSnapshot(doc(db, 'system', 'config'), (snap) => {
        callback(snap.exists() ? (snap.data() as Record<string, unknown>) : {});
    });
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
    uid: string;
    name: string;
    avgScore: number;
    submissionCount: number;
    bestScore: number;
}

/**
 * Real-time leaderboard listener.
 * Each user has a unique UID in Firestore so no deduplication is needed.
 * Users with the default name 'Bạn' get their email username displayed instead.
 */
export function listenToLeaderboard(
    callback: (entries: LeaderboardEntry[]) => void,
): () => void {
    const q = query(
        collection(db, 'users'),
        where('submissionCount', '>', 0),
    );
    return onSnapshot(q, (snap) => {
        const entries: LeaderboardEntry[] = [];
        snap.forEach(d => {
            const data = d.data();
            let displayName = (data.name || '').trim();
            // If user still has the default name 'Bạn', show email username instead
            if (!displayName || displayName === 'Bạn') {
                const email: string = data.email || '';
                displayName = email.split('@')[0] || `User ${d.id.slice(-4)}`;
            }
            const avgScore = data.avgScore ?? 0;
            const bestScore = data.bestScore ?? 0;
            entries.push({
                uid: d.id,
                name: displayName,
                avgScore,
                submissionCount: data.submissionCount ?? 0,
                bestScore: bestScore > 0 ? bestScore : avgScore,
            });
        });
        entries.sort((a, b) => b.avgScore - a.avgScore);
        callback(entries);
    }, (err) => {
        console.error('listenToLeaderboard error:', err);
        callback([]);
    });
}