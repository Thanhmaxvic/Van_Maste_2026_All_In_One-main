/**
 * TTS Controller — Proxies Google Cloud Text-to-Speech API.
 * Keeps TTS API key server-side.
 */
import type { Request, Response } from 'express';

/**
 * POST /api/tts/synthesize
 * Body: { text, voiceGender }
 * Returns: { audioContent: base64 }
 */
export async function synthesizeHandler(req: Request, res: Response): Promise<void> {
    try {
        const ttsApiKey = process.env.GOOGLE_TTS_API_KEY || '';
        if (!ttsApiKey) {
            res.status(500).json({ error: 'TTS API key not configured' });
            return;
        }

        const { text, voiceName } = req.body;

        if (!text || !voiceName) {
            res.status(400).json({ error: 'Missing text or voiceName' });
            return;
        }

        const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${ttsApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input: { text },
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
            const errText = await response.text();
            console.error('[TTS] Google API error:', errText);
            res.status(response.status).json({ error: 'Google TTS API Error' });
            return;
        }

        const data = await response.json();
        res.json({ audioContent: data.audioContent });
    } catch (error: any) {
        console.error('[TTS] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
}
