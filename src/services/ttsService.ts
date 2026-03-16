import { TTS_VOICE_MAP } from '../constants';

// Module-level audio reference (singleton pattern for audio playback)
let currentAudio: HTMLAudioElement | null = null;

// ── TTS Queue ────────────────────────────────────────────────────────────────
interface TTSQueueItem {
    text: string;
    voiceGender: 'male' | 'female';
    onStart?: () => void;
    onEnd?: () => void;
}

const ttsQueue: TTSQueueItem[] = [];
let isProcessingQueue = false;
/** Incremented on every stopCurrentAudio() call — queue loops check this to bail out. */
let queueGeneration = 0;

/**
 * Clean text by removing special markers and markdown characters.
 */
function cleanTextForTTS(text: string): string {
    return text
        .replace(/\[TIMELINE\]|\[GEN_IMAGE\]|\[EXAM_PAPER\]|\[\/EXAM_PAPER\]|\[SECTION_DONE\]|\[QUESTION_CORRECT\]|\[LESSON_DONE\]|[*#_\[\]()]/g, '')
        .replace(/\*\*/g, '')
        .trim();
}

/** Max chars per TTS API request (~4500 bytes safe for Vietnamese UTF-8) */
const CHUNK_SIZE = 500;

/**
 * Split long text into chunks at sentence boundaries so each chunk
 * can be sent as a separate TTS API request.
 */
function splitTextIntoChunks(text: string): string[] {
    if (text.length <= CHUNK_SIZE) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= CHUNK_SIZE) {
            chunks.push(remaining.trim());
            break;
        }

        // Find the last sentence boundary within CHUNK_SIZE
        const slice = remaining.substring(0, CHUNK_SIZE);
        let splitAt = -1;

        // Prefer splitting at sentence-ending punctuation
        for (let i = slice.length - 1; i >= Math.floor(CHUNK_SIZE * 0.4); i--) {
            const ch = slice[i];
            if (ch === '.' || ch === '!' || ch === '?' || ch === '\n' || ch === ';') {
                splitAt = i + 1;
                break;
            }
        }

        // Fallback: split at last comma or space
        if (splitAt === -1) {
            for (let i = slice.length - 1; i >= Math.floor(CHUNK_SIZE * 0.4); i--) {
                if (slice[i] === ',' || slice[i] === ' ') {
                    splitAt = i + 1;
                    break;
                }
            }
        }

        // Last resort: hard cut
        if (splitAt === -1) splitAt = CHUNK_SIZE;

        const chunk = remaining.substring(0, splitAt).trim();
        if (chunk) chunks.push(chunk);
        remaining = remaining.substring(splitAt).trim();
    }

    return chunks.filter(c => c.length > 0);
}

/**
 * Internal: synthesize and play a single TTS segment.
 * Returns a Promise that resolves when playback ends (or errors).
 */
function playSingleTTS(
    text: string,
    voiceGender: 'male' | 'female',
    onStart?: () => void,
    onEnd?: () => void,
): Promise<void> {
    const clean = cleanTextForTTS(text);
    if (!clean.trim()) {
        onEnd?.();
        return Promise.resolve();
    }

    onStart?.();

    return new Promise<void>(async (resolve) => {
        try {
            const API_KEY = import.meta.env.VITE_GOOGLE_TTS_API_KEY || '';
            const voiceName = TTS_VOICE_MAP[voiceGender];

            const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: { text: clean },
                    voice: {
                        languageCode: 'vi-VN',
                        name: voiceName,
                    },
                    audioConfig: {
                        audioEncoding: 'MP3',
                        speakingRate: 1.0,
                        pitch: 0,
                    },
                }),
            });

            if (!response.ok) {
                throw new Error('Google TTS API Error');
            }

            const data = await response.json();
            const audioSrc = `data:audio/mp3;base64,${data.audioContent}`;
            currentAudio = new Audio(audioSrc);

            currentAudio.onended = () => {
                onEnd?.();
                currentAudio = null;
                resolve();
            };

            currentAudio.onerror = () => {
                console.error('❌ Audio playback error');
                onEnd?.();
                currentAudio = null;
                resolve();
            };

            await currentAudio.play();
        } catch (error) {
            console.error('❌ Failed to play Google Cloud TTS:', error);
            onEnd?.();
            currentAudio = null;
            resolve();
        }
    });
}

/**
 * Process the TTS queue sequentially — each item finishes before the next starts.
 * Uses queueGeneration to detect cancellation mid-processing.
 */
async function processQueue(): Promise<void> {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    const myGeneration = queueGeneration;

    while (ttsQueue.length > 0) {
        // If queue was cleared (stopCurrentAudio called), bail out
        if (queueGeneration !== myGeneration) break;

        const item = ttsQueue.shift()!;
        await playSingleTTS(item.text, item.voiceGender, item.onStart, item.onEnd);
    }

    // Only reset if we're still the active processor
    if (queueGeneration === myGeneration) {
        isProcessingQueue = false;
    }
}

/**
 * Queued TTS — adds text to a queue so segments play sequentially.
 * Long text is split into chunks at sentence boundaries.
 * If nothing is playing, starts immediately.
 * Use this for auto-spoken messages (lesson mode, assistant replies).
 */
export function queueTTS(
    text: string,
    voiceGender: 'male' | 'female' = 'female',
    onStart?: () => void,
    onEnd?: () => void,
): void {
    if (!text) return;
    const clean = cleanTextForTTS(text);
    if (!clean) return;

    const chunks = splitTextIntoChunks(clean);
    chunks.forEach((chunk, i) => {
        ttsQueue.push({
            text: chunk,
            voiceGender,
            // Only fire onStart for the first chunk
            onStart: i === 0 ? onStart : undefined,
            // Only fire onEnd for the last chunk
            onEnd: i === chunks.length - 1 ? onEnd : undefined,
        });
    });
    processQueue();
}

/**
 * Immediate TTS — stops any current audio, clears queue, plays this text now.
 * Long text is split into chunks and played sequentially.
 * Use this for manual play button (user explicitly clicks speaker icon).
 */
export async function playTTS(
    text: string,
    voiceGender: 'male' | 'female' = 'female',
    onStart?: () => void,
    onEnd?: () => void
): Promise<void> {
    if (!text) return;

    // Stop everything and clear queue
    stopCurrentAudio();

    const clean = cleanTextForTTS(text);
    if (!clean) { onEnd?.(); return; }

    const chunks = splitTextIntoChunks(clean);
    for (let i = 0; i < chunks.length; i++) {
        await playSingleTTS(
            chunks[i],
            voiceGender,
            i === 0 ? onStart : undefined,
            i === chunks.length - 1 ? onEnd : undefined,
        );
    }
}

/**
 * Stop the currently playing audio and clear the TTS queue.
 */
export function stopCurrentAudio(): void {
    // Increment generation to signal any running processQueue loop to stop
    queueGeneration++;

    // Clear pending queue items
    ttsQueue.length = 0;
    isProcessingQueue = false;

    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
}

