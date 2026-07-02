import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Backend proxy to upload images to ImgBB.
 * Keeps the IMGBB_API_KEY secret on the server side.
 *
 * POST /api/upload/image
 * Body (JSON): { base64: string }   — raw base64 image data (no data: prefix)
 * Returns:     { url: string }       — public image URL
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const apiKey = process.env.IMGBB_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'IMGBB_API_KEY chưa được cấu hình trên server.' });
        }

        const { base64 } = req.body;
        if (!base64 || typeof base64 !== 'string') {
            return res.status(400).json({ error: 'Thiếu trường "base64" trong body.' });
        }

        // Build form data for ImgBB API
        const formData = new URLSearchParams();
        formData.append('key', apiKey);
        formData.append('image', base64);

        const imgbbRes = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData,
        });

        if (!imgbbRes.ok) {
            const errText = await imgbbRes.text().catch(() => '');
            console.error('[ImgBB] Upload failed:', imgbbRes.status, errText);
            return res.status(502).json({
                error: `ImgBB trả về lỗi (${imgbbRes.status}). Vui lòng thử lại.`,
            });
        }

        const data = await imgbbRes.json();
        const imageUrl = data?.data?.display_url || data?.data?.url;

        if (!imageUrl) {
            console.error('[ImgBB] No URL in response:', JSON.stringify(data));
            return res.status(502).json({ error: 'ImgBB không trả về URL ảnh.' });
        }

        return res.json({ url: imageUrl });
    } catch (err: any) {
        console.error('[ImgBB] Unexpected error:', err);
        return res.status(500).json({ error: 'Lỗi server khi tải ảnh lên. ' + (err?.message || '') });
    }
}
