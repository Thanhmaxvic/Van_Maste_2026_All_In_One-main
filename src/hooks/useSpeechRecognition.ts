import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Custom hook for Web Speech API speech recognition.
 * - interimResults: true  → updates input in real-time as you speak
 * - continuous: true      → keeps listening until manually stopped
 * - onInterim: live callback for partial transcripts
 * - onFinal:   called when a sentence is finalized
 */
export function useSpeechRecognition(
    onFinal: (transcript: string) => void,
    onInterim?: (transcript: string) => void,
) {
    const [isRecording, setIsRecording] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognitionRef = useRef<any>(null);
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
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) {
                    finalText += t;
                } else {
                    interim += t;
                }
            }

            // Show interim text live in the input box
            if (interim) {
                onInterimRef.current?.(interim);
            }

            // Commit final text
            if (finalText) {
                onFinalRef.current(finalText);
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
