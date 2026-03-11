import { MAX_TTS_LENGTH, TTS_VOICE_MAP } from '../constants';

// Module-level audio reference (singleton pattern for audio playback)
let currentAudio: HTMLAudioElement | null = null;

/**
 * Clean text by removing special markers and markdown characters.
 */
function cleanTextForTTS(text: string): string {
    return text
        .replace(/\[TIMELINE\]|\[GEN_IMAGE\]|\[EXAM_PAPER\]|\[\/EXAM_PAPER\]|[*#_\[\]()]/g, '')
        .replace(/\*\*/g, '')
        .substring(0, MAX_TTS_LENGTH);
}

/**
 * Play Text-to-Speech using Google Cloud TTS API.
 * Voice is selected based on voiceGender ('male' | 'female').
 */
export async function playTTS(
    text: string,
    voiceGender: 'male' | 'female' = 'female',
    onStart?: () => void,
    onEnd?: () => void
): Promise<void> {
    if (!text) return;

    const clean = cleanTextForTTS(text);
    if (!clean.trim()) return;

    // Stop any currently playing audio
    stopCurrentAudio();

    onStart?.();

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
                    speakingRate: 1.2,
                    pitch: voiceGender === 'female' ? 1.0 : -1.0,
                },
            }),
        });

        if (!response.ok) {
            throw new Error('Google TTS API Error');
        }

        const data = await response.json();

        // Play the audio
        const audioSrc = `data:audio/mp3;base64,${data.audioContent}`;
        currentAudio = new Audio(audioSrc);

        currentAudio.onended = () => {
            onEnd?.();
            currentAudio = null;
        };

        currentAudio.onerror = () => {
            console.error('❌ Audio playback error');
            onEnd?.();
            currentAudio = null;
        };

        await currentAudio.play();
    } catch (error) {
        console.error('❌ Failed to play Google Cloud TTS:', error);
        onEnd?.();
        currentAudio = null;
    }
}

/**
 * Stop the currently playing audio.
 */
export function stopCurrentAudio(): void {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
}
