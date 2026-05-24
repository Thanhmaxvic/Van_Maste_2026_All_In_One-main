/**
 * Speech recognition utility helpers.
 *
 * These functions address a well-known issue on mobile browsers (especially
 * Android Chrome) where the Web Speech API emits duplicate or overlapping
 * transcripts, causing the user to see repeated words such as
 * "câu câu 1 câu 1 câu 1".
 */

/**
 * Remove excessive consecutive duplicate words from a string.
 *
 * Vietnamese has "từ láy" (reduplicative words) where repeating a word
 * twice is grammatically correct: "luôn luôn", "mãi mãi", "thường thường",
 * "đẹp đẹp", "xa xa", etc.
 *
 * Therefore this function only collapses when a word appears **3 or more**
 * times in a row, keeping at most 2 consecutive identical words.
 *
 * Examples:
 *   "câu câu câu 1"   → "câu câu 1"     (3→2, safe)
 *   "luôn luôn"        → "luôn luôn"     (2→2, preserved ✓)
 *   "mãi mãi mãi mãi"  → "mãi mãi"      (4→2, collapsed)
 *   "câu 1 câu 1 câu 1" — not handled here (see deduplicateRepeatedPhrases)
 */
export function deduplicateConsecutive(text: string): string {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';

    const result: string[] = [words[0]];
    let streak = 1; // how many times current word has appeared consecutively

    for (let i = 1; i < words.length; i++) {
        if (words[i] === words[i - 1]) {
            streak++;
            // Allow up to 2 consecutive identical words (từ láy safe)
            if (streak <= 2) {
                result.push(words[i]);
            }
            // 3+ → skip (collapse)
        } else {
            streak = 1;
            result.push(words[i]);
        }
    }
    return result.join(' ');
}

/**
 * Remove repeated multi-word phrases (2–4 word patterns) that appear
 * 3+ times consecutively.
 *
 * This catches patterns like: "câu 1 câu 1 câu 1" → "câu 1"
 * but preserves valid 2-occurrence patterns.
 *
 * Example:
 *   "câu 1 câu 1 câu 1 ngôi kể"  → "câu 1 ngôi kể"
 *   "câu 1 câu 1 ngôi kể"         → "câu 1 câu 1 ngôi kể" (2 = kept)
 */
export function deduplicateRepeatedPhrases(text: string): string {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 6) return words.join(' '); // too short for 3× phrase

    let result = words.join(' ');

    // Check phrase lengths from 4 down to 2
    for (let phraseLen = 4; phraseLen >= 2; phraseLen--) {
        const cleaned: string[] = [];
        let i = 0;
        const ws = result.split(/\s+/);

        while (i < ws.length) {
            // Try to detect a phrase of `phraseLen` words repeating 3+ times
            if (i + phraseLen * 3 <= ws.length) {
                const phrase = ws.slice(i, i + phraseLen).join(' ');
                let reps = 1;
                let j = i + phraseLen;

                while (j + phraseLen <= ws.length) {
                    const next = ws.slice(j, j + phraseLen).join(' ');
                    if (next === phrase) {
                        reps++;
                        j += phraseLen;
                    } else {
                        break;
                    }
                }

                if (reps >= 3) {
                    // Collapse 3+ repetitions to just 1
                    cleaned.push(...ws.slice(i, i + phraseLen));
                    i = j;
                    continue;
                }
            }

            cleaned.push(ws[i]);
            i++;
        }

        result = cleaned.join(' ');
    }

    return result;
}

/**
 * Merge `existing` text with a `newChunk` that may partially overlap at the
 * boundary (the end of `existing` matches the beginning of `newChunk`).
 *
 * The function finds the *longest* suffix of `existing` (measured in words)
 * that equals a prefix of `newChunk`, then removes that overlap so the
 * merged result does not contain duplicated phrases.
 *
 * A maximum overlap window of 12 words is used to keep the comparison fast.
 *
 * Examples:
 *   mergeWithOverlap("câu 1",       "câu 1 ngôi kể")    → "câu 1 ngôi kể"
 *   mergeWithOverlap("tôi thích",   "thích ăn phở")      → "tôi thích ăn phở"
 *   mergeWithOverlap("xin chào",    "hôm nay trời đẹp") → "xin chào hôm nay trời đẹp"
 */
export function mergeWithOverlap(existing: string, newChunk: string): string {
    const trimmedExisting = existing.trimEnd();
    const trimmedNew = newChunk.trimStart();

    if (!trimmedExisting) return trimmedNew;
    if (!trimmedNew) return trimmedExisting;

    const existingWords = trimmedExisting.split(/\s+/);
    const newWords = trimmedNew.split(/\s+/);

    // Check up to MAX_OVERLAP words at the boundary
    const MAX_OVERLAP = Math.min(12, existingWords.length, newWords.length);

    let bestOverlap = 0;

    for (let overlap = 1; overlap <= MAX_OVERLAP; overlap++) {
        // Take the last `overlap` words of existing
        const suffix = existingWords.slice(-overlap).join(' ');
        // Take the first `overlap` words of new
        const prefix = newWords.slice(0, overlap).join(' ');

        if (suffix === prefix) {
            bestOverlap = overlap;
        }
    }

    if (bestOverlap > 0) {
        // Remove the overlapping prefix from newChunk
        const uniquePart = newWords.slice(bestOverlap).join(' ');
        return uniquePart ? trimmedExisting + ' ' + uniquePart : trimmedExisting;
    }

    // No overlap found – simply concatenate with a space
    return trimmedExisting + ' ' + trimmedNew;
}

// ─── Vietnamese Auto-Punctuation ──────────────────────────────────────────────

// Vietnamese lowercase letters (for capitalization regex)
const VN_LOWER = 'a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ';

/** Question-ending words */
const QUESTION_ENDERS = new RegExp(
    `(?:^|\\s)(không|chưa|chứ|hả|hở|nhỉ|sao|gì|nào|đâu|chăng|ư` +
    `|phải không|có không|được không|hay không|hay chưa` +
    `|bao giờ|bao nhiêu|thế nào|là gì|ra sao|thế à|vậy à|vậy sao)\\s*$`, 'i'
);

/** Question-starting words */
const QUESTION_STARTERS = /^\s*(tại sao|vì sao|làm sao|ai là|cái gì|điều gì|ở đâu|khi nào|bao giờ|bao nhiêu|như thế nào|có phải|liệu)\b/i;

/** Exclamation-ending words */
const EXCLAMATION_ENDERS = /(?:^|\s)(quá|lắm|ghê|thật|biết bao|biết mấy|xiết bao|thay|quá đi|quá trời)\s*$/i;

/** Exclamation-starting words */
const EXCLAMATION_STARTERS = /^\s*(ôi|trời ơi|chao ôi|ồ|ôi chao|than ôi|hỡi ôi|tuyệt vời|tuyệt quá|hay quá|đẹp quá|giỏi quá)\b/i;

/** Subordinating conjunctions / connectors → comma before them */
const CONTINUATION_STARTERS = new RegExp(
    `^\\s*(và|hoặc|hay|nhưng|mà|nên|nếu|vì|do|bởi|tuy|dù|khi|để|rồi|còn|song` +
    `|mặc dù|cho dù|thế nhưng|tuy nhiên|ngoài ra|hơn nữa|mặt khác` +
    `|bên cạnh đó|do đó|vì vậy|cho nên|thêm vào đó|đồng thời` +
    `|từ đó|nhờ đó|bởi vậy|thế nên|như vậy|ví dụ|chẳng hạn` +
    `|cũng như|cùng với|theo đó|nhất là|đặc biệt|đặc biệt là` +
    `|trong khi|sau khi|trước khi|ngược lại|trái lại)\\b`, 'i'
);

/**
 * Capitalize the first letter of a string (Vietnamese-aware).
 */
function capitalizeFirst(text: string): string {
    if (!text) return '';
    return text.replace(
        new RegExp(`^([^${VN_LOWER}A-Z]*?)([${VN_LOWER}])`, 'i'),
        (_, before, letter: string) => before + letter.toUpperCase()
    );
}

/**
 * Add punctuation to a raw speech transcript segment.
 *
 * - Detects question patterns → "?"
 * - Detects exclamation patterns → "!"
 * - Default → "."
 */
export function punctuateVietnamese(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return '';

    // Already has ending punctuation → return as-is
    if (/[.!?,;:…]$/.test(trimmed)) return trimmed;

    const lower = trimmed.toLowerCase();

    if (QUESTION_ENDERS.test(lower) || QUESTION_STARTERS.test(lower)) {
        return trimmed + '?';
    }

    if (EXCLAMATION_ENDERS.test(lower) || EXCLAMATION_STARTERS.test(lower)) {
        return trimmed + '!';
    }

    return trimmed + '.';
}

/**
 * Returns true if `text` starts with a Vietnamese conjunction/connector,
 * meaning the previous segment should end with a comma instead of a period.
 */
export function startsWithContinuation(text: string): boolean {
    return CONTINUATION_STARTERS.test(text.trim());
}

/**
 * Capitalize after every sentence-ending punctuation mark (. ? !)
 * throughout the entire text, and capitalize the very first letter.
 */
export function ensureCapitalization(text: string): string {
    if (!text) return '';
    let result = capitalizeFirst(text);
    result = result.replace(
        new RegExp(`([.!?])\\s+([${VN_LOWER}])`, 'g'),
        (_, punct: string, letter: string) => punct + ' ' + letter.toUpperCase()
    );
    return result;
}

/**
 * Smart merge: combines existing text with a new punctuated segment.
 *
 * 1. If the new segment starts with a connector (và, nhưng, vì...),
 *    the trailing "." on existing text is changed to ","
 * 2. Applies overlap merge to avoid duplicates.
 * 3. Ensures proper capitalization throughout.
 */
export function smartMergeWithPunctuation(existing: string, newSegment: string): string {
    if (!existing.trim()) return ensureCapitalization(newSegment);
    if (!newSegment.trim()) return existing;

    let base = existing.trimEnd();

    // If new segment starts with a continuation word, remove trailing period
    if (startsWithContinuation(newSegment)) {
        base = base.replace(/\.\s*$/, '');
    }

    const merged = mergeWithOverlap(base, newSegment);
    return ensureCapitalization(merged);
}
