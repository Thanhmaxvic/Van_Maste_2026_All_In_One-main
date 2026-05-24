import { useState, useRef, useEffect, useCallback } from 'react';
import { deduplicateConsecutive, deduplicateRepeatedPhrases, punctuateVietnamese } from '../utils/speechUtils';

/**
 * Custom hook for Web Speech API speech recognition.
 * - interimResults: true  → updates input in real-time as you speak
 * - continuous: true      → keeps listening until manually stopped
 * - onInterim: live callback for partial transcripts
 * - onFinal:   called when a sentence is finalized
 *
 * Mobile-specific fixes:
 * - Debounce: ignores duplicate final transcripts (common on Android Chrome)
 * - Confidence check: skips results with confidence === 0
 * - Consecutive word deduplication: cleans stutters like "câu câu 1"
 */
export function useSpeechRecognition(
    onFinal: (transcript: string) => void,
    onInterim?: (transcript: string) => void,
) {
    const [isRecording, setIsRecording] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognitionRef = useRef<any>(null);
    const lastFinalIndexRef = useRef(-1);
    const lastFinalTranscriptRef = useRef('');
    const onFinalRef = useRef(onFinal);
    const onInterimRef = useRef(onInterim);

    // Keep refs up-to-date without recreating the recognition instance
    useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);
    useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);

    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SpeechRecognitionAPI =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognitionAPI) return;

        const recognition = new SpeechRecognitionAPI();
        recognition.lang = 'vi-VN';
        recognition.continuous = true;      // keep mic open
        recognition.interimResults = true;  // fire on every word

        recognition.onresult = (e: any) => {
            let interim = '';
            let finalText = '';

            for (let i = e.resultIndex; i < e.results.length; i++) {
                const result = e.results[i];
                const t = result[0].transcript;

                if (result.isFinal) {
                    if (i > lastFinalIndexRef.current) {
                        // Skip ghost results with zero confidence (common on Android)
                        if (result[0].confidence === 0) {
                            lastFinalIndexRef.current = i;
                            continue;
                        }

                        const trimmed = t.trim();

                        // Skip exact duplicate of the last final transcript (mobile debounce)
                        if (trimmed && trimmed === lastFinalTranscriptRef.current) {
                            lastFinalIndexRef.current = i;
                            continue;
                        }

                        finalText += t;
                        lastFinalIndexRef.current = i;
                        lastFinalTranscriptRef.current = trimmed;
                    }
                } else {
                    interim += t;
                }
            }

            // Show interim text live in the input box
            if (interim) {
                onInterimRef.current?.(interim);
            }

            // Commit final text (with dedup + auto-punctuation)
            if (finalText) {
                const cleaned = deduplicateRepeatedPhrases(deduplicateConsecutive(finalText));
                onFinalRef.current(punctuateVietnamese(cleaned));
            }
        };

        recognition.onend = () => setIsRecording(false);
        recognition.onerror = (e: any) => {
            // 'no-speech' is a common non-critical event – don't treat as error
            if (e.error !== 'no-speech') {
                console.warn('STT error:', e.error);
            }
            setIsRecording(false);
        };

        recognitionRef.current = recognition;

        return () => {
            recognition.abort();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const startRecording = useCallback(() => {
        try {
            lastFinalIndexRef.current = -1;
            lastFinalTranscriptRef.current = '';
            recognitionRef.current?.start();
            setIsRecording(true);
        } catch {
            // already started — ignore
        }
    }, []);

    const stopRecording = useCallback(() => {
        recognitionRef.current?.stop();
        setIsRecording(false);
    }, []);

    const toggleRecording = useCallback(() => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }, [isRecording, startRecording, stopRecording]);

    return { isRecording, toggleRecording };
}
