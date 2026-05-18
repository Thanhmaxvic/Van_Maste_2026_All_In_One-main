import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const ttsApiKey = process.env.GOOGLE_TTS_API_KEY || '';
        if (!ttsApiKey) return res.status(500).json({ error: 'TTS API key not configured' });

        const { text, voiceName } = req.body;
        if (!text || !voiceName) return res.status(400).json({ error: 'Missing text or voiceName' });

        const response = await fetch(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${ttsApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: { text },
                    voice: { languageCode: 'vi-VN', name: voiceName },
                    audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0 },
                }),
            }
        );

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.error('[TTS] Google API error:', errText);
            return res.status(response.status).json({ error: 'Google TTS API Error' });
        }

        const data = await response.json();
        return res.json({ audioContent: data.audioContent });
    } catch (error: any) {
        console.error('[TTS] Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
