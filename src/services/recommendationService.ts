/**
 * Recommendation Engine — Cá nhân hoá lộ trình học tập
 * 
 * Maps student weaknesses → relevant lessons, detects spaced repetition needs,
 * and provides personalized learning suggestions.
 */

import { CURRICULUM, getLessonKey } from '../constants/curriculum';
import type { UserProfile } from '../types';

// ── Weakness → Tag keyword mapping ──────────────────────────────────────────
// Maps common AI-generated weakness strings to lesson tags
const WEAKNESS_TAG_MAP: Record<string, string[]> = {
    // Đọc hiểu
    'đọc hiểu': ['đọc hiểu', 'phân tích', 'nhận biết'],
    'phân tích': ['phân tích', 'đọc hiểu', 'phân tích tác phẩm'],
    'nhận biết': ['nhận biết', 'đọc hiểu'],
    'biện pháp tu từ': ['biện pháp tu từ', 'đọc hiểu'],
    'nội dung chính': ['nội dung chính', 'đọc hiểu'],
    'trả lời câu hỏi': ['trả lời câu hỏi', 'đọc hiểu'],
    // Viết
    'viết': ['viết', 'đoạn văn', 'bài văn', 'lập luận'],
    'diễn đạt': ['diễn đạt', 'viết', 'cấu trúc'],
    'lập luận': ['lập luận', 'viết', 'cấu trúc'],
    'cấu trúc bài': ['cấu trúc', 'mở bài', 'kết bài'],
    'dẫn chứng': ['dẫn chứng', 'NLXH', 'NLVH', 'dẫn chứng văn học'],
    'thiếu dẫn chứng': ['dẫn chứng', 'NLXH', 'NLVH'],
    'nghị luận xã hội': ['NLXH', 'nghị luận xã hội', 'dẫn chứng'],
    'nghị luận văn học': ['NLVH', 'nghị luận văn học', 'phân tích tác phẩm'],
    'nlxh': ['NLXH', 'nghị luận xã hội'],
    'nlvh': ['NLVH', 'nghị luận văn học'],
    // Tri thức
    'kiến thức nền': ['tri thức', 'lý thuyết', 'thể loại'],
    'thể loại': ['thể loại', 'tri thức'],
    'tác phẩm': ['tác phẩm', 'tri thức'],
};

export interface LessonRecommendation {
    sectionId: string;
    lessonId: string;
    title: string;
    sectionTitle: string;
    /** Why this lesson is recommended */
    reason: string;
    /** Type of recommendation */
    type: 'weakness' | 'review' | 'next';
    /** Priority score (higher = more important) */
    priority: number;
}

/**
 * Get lessons recommended based on student's weaknesses.
 * Matches weakness strings against lesson tags using fuzzy keyword matching.
 */
export function getWeaknessRecommendations(profile: UserProfile): LessonRecommendation[] {
    const weaknesses = profile.weaknesses || [];
    if (weaknesses.length === 0) return [];

    const lp = profile.lessonProgress || {};
    const recommendations: LessonRecommendation[] = [];
    const addedKeys = new Set<string>();

    for (const weakness of weaknesses) {
        const wLower = weakness.toLowerCase();
        
        // Find matching tags from the weakness map
        let matchingTags: string[] = [];
        for (const [key, tags] of Object.entries(WEAKNESS_TAG_MAP)) {
            if (wLower.includes(key) || key.includes(wLower)) {
                matchingTags = [...matchingTags, ...tags];
            }
        }
        
        // Also do direct keyword matching against lesson tags
        const wWords = wLower.split(/[\s,;]+/).filter(w => w.length > 2);

        for (const section of CURRICULUM) {
            for (const lesson of section.lessons) {
                const key = getLessonKey(section.id, lesson.id);
                if (addedKeys.has(key)) continue;

                const lessonStatus = lp[key]?.status;
                // Skip completed lessons for weakness recommendations
                if (lessonStatus === 'completed') continue;

                // Calculate match score
                let matchScore = 0;
                const lessonTagsLower = lesson.tags.map(t => t.toLowerCase());

                // Check mapped tags
                for (const tag of matchingTags) {
                    if (lessonTagsLower.includes(tag.toLowerCase())) {
                        matchScore += 3;
                    }
                }

                // Check direct word matches
                for (const word of wWords) {
                    for (const tag of lessonTagsLower) {
                        if (tag.includes(word) || word.includes(tag)) {
                            matchScore += 1;
                        }
                    }
                }

                if (matchScore >= 2) {
                    addedKeys.add(key);
                    recommendations.push({
                        sectionId: section.id,
                        lessonId: lesson.id,
                        title: lesson.title,
                        sectionTitle: section.title,
                        reason: `Giúp cải thiện: ${weakness}`,
                        type: 'weakness',
                        priority: matchScore + (lessonStatus === 'in_progress' ? 5 : 0),
                    });
                }
            }
        }
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
}

/** Days after completion before suggesting review */
const REVIEW_DAYS = 7;
/** Minimum accuracy to NOT suggest review */
const REVIEW_ACCURACY_THRESHOLD = 0.7;

/**
 * Get lessons that need spaced repetition review.
 * Criteria: completed > 7 days ago, OR completed with low accuracy.
 */
export function getSpacedRepetitionLessons(profile: UserProfile): LessonRecommendation[] {
    const lp = profile.lessonProgress || {};
    const now = Date.now();
    const recommendations: LessonRecommendation[] = [];

    for (const section of CURRICULUM) {
        for (const lesson of section.lessons) {
            const key = getLessonKey(section.id, lesson.id);
            const progress = lp[key];
            if (!progress || progress.status !== 'completed') continue;

            const daysSinceComplete = progress.completedAt
                ? Math.floor((now - progress.completedAt) / (1000 * 60 * 60 * 24))
                : 999; // If no completedAt, assume old

            const accuracy = progress.questionsAsked > 0
                ? progress.questionsCorrect / progress.questionsAsked
                : 1;

            let reason = '';
            let priority = 0;

            if (accuracy < REVIEW_ACCURACY_THRESHOLD) {
                reason = `Chỉ trả lời đúng ${Math.round(accuracy * 100)}% câu hỏi — nên ôn lại`;
                priority = 8 + Math.round((1 - accuracy) * 5);
            } else if (daysSinceComplete >= REVIEW_DAYS) {
                reason = `Đã ${daysSinceComplete} ngày kể từ khi hoàn thành — ôn lại để nhớ lâu`;
                priority = Math.min(daysSinceComplete / 7, 5);
            }

            if (reason) {
                recommendations.push({
                    sectionId: section.id,
                    lessonId: lesson.id,
                    title: lesson.title,
                    sectionTitle: section.title,
                    reason,
                    type: 'review',
                    priority,
                });
            }
        }
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
}

/**
 * Get the next recommended lesson for the student based on their level.
 * Considers diagnostic score to skip basic lessons for advanced students.
 */
export function getNextRecommendedLesson(profile: UserProfile): LessonRecommendation | null {
    const lp = profile.lessonProgress || {};
    const diagScore = profile.diagnosticScore ?? 0;

    // Determine starting difficulty based on diagnostic score
    let minDifficulty: 'basic' | 'standard' | 'advanced' = 'basic';
    if (diagScore >= 8) minDifficulty = 'advanced';
    else if (diagScore >= 6) minDifficulty = 'standard';

    const difficultyOrder = { basic: 0, standard: 1, advanced: 2 };

    for (const section of CURRICULUM) {
        for (const lesson of section.lessons) {
            const key = getLessonKey(section.id, lesson.id);
            const status = lp[key]?.status;
            
            if (status === 'in_progress') {
                return {
                    sectionId: section.id,
                    lessonId: lesson.id,
                    title: lesson.title,
                    sectionTitle: section.title,
                    reason: 'Bài đang học dang dở',
                    type: 'next',
                    priority: 100,
                };
            }

            if (!status || status === 'not_started') {
                // Skip lessons below student's level (if diagnostic shows they're advanced)
                if (difficultyOrder[lesson.difficulty] < difficultyOrder[minDifficulty]) {
                    continue;
                }

                return {
                    sectionId: section.id,
                    lessonId: lesson.id,
                    title: lesson.title,
                    sectionTitle: section.title,
                    reason: diagScore >= 6
                        ? `Phù hợp trình độ hiện tại (${lesson.difficulty === 'advanced' ? 'nâng cao' : 'chuẩn'})`
                        : 'Bài tiếp theo trong lộ trình',
                    type: 'next',
                    priority: 50,
                };
            }
        }
    }

    return null;
}

/**
 * Calculate skill scores for radar chart (0-100 per skill area).
 * Based on lesson progress + quiz accuracy in each section.
 */
export function calculateSkillScores(profile: UserProfile): Record<string, number> {
    const lp = profile.lessonProgress || {};
    const scores: Record<string, number> = {};

    for (const section of CURRICULUM) {
        let totalWeight = 0;
        let earnedWeight = 0;

        for (const lesson of section.lessons) {
            const key = getLessonKey(section.id, lesson.id);
            const progress = lp[key];
            const weight = lesson.difficulty === 'advanced' ? 3 : lesson.difficulty === 'standard' ? 2 : 1;
            totalWeight += weight;

            if (!progress) continue;

            if (progress.status === 'completed') {
                // Completion = 60% of weight
                earnedWeight += weight * 0.6;
                // Accuracy = remaining 40%
                if (progress.questionsAsked > 0) {
                    const accuracy = progress.questionsCorrect / progress.questionsAsked;
                    earnedWeight += weight * 0.4 * accuracy;
                } else {
                    earnedWeight += weight * 0.2; // Some credit for completing without questions
                }
            } else if (progress.status === 'in_progress') {
                const sectionPct = progress.sectionsTotal > 0
                    ? progress.sectionsDone / progress.sectionsTotal
                    : 0;
                earnedWeight += weight * 0.4 * sectionPct;
            }
        }

        scores[section.title] = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
    }

    return scores;
}

export function getAllRecommendations(profile: UserProfile): {
    weakness: LessonRecommendation[];
    review: LessonRecommendation[];
    next: LessonRecommendation | null;
} {
    return {
        weakness: getWeaknessRecommendations(profile).slice(0, 3),
        review: getSpacedRepetitionLessons(profile).slice(0, 3),
        next: getNextRecommendedLesson(profile),
    };
}

/**
 * Generate a default personalized timeline for users who have engaged >= 20%
 * but haven't received a custom timeline from the AI yet.
 */
export function generateDefaultTimeline(profile: UserProfile): { time: string; title: string; desc: string }[] {
    const recs = getAllRecommendations(profile);
    const timeline = [];
    
    // Tuần 1: Khắc phục điểm yếu
    if (recs.weakness.length > 0) {
        timeline.push({
            time: 'Tuần 1',
            title: `Cải thiện: ${profile.weaknesses?.[0] || 'Điểm yếu'}`,
            desc: `Tập trung vào bài "${recs.weakness[0].title}" để lấp lỗ hổng kiến thức nền tảng.`
        });
    } else {
        timeline.push({
            time: 'Tuần 1',
            title: 'Củng cố kiến thức nền tảng',
            desc: 'Ôn tập lại các khái niệm cơ bản đã học để xây dựng gốc rễ vững chắc.'
        });
    }

    // Tuần 2: Ôn tập ngắt quãng hoặc Điểm yếu thứ 2
    if (recs.review.length > 0) {
        timeline.push({
            time: 'Tuần 2',
            title: 'Ôn tập ngắt quãng (Spaced Repetition)',
            desc: `Hệ thống nhận thấy em cần ôn lại "${recs.review[0].title}" để nhớ lâu hơn.`
        });
    } else if (recs.weakness.length > 1) {
        timeline.push({
            time: 'Tuần 2',
            title: `Cải thiện: ${profile.weaknesses?.[1]}`,
            desc: `Học bài "${recs.weakness[1].title}" để nâng cao kỹ năng xử lý đề.`
        });
    } else {
        timeline.push({
            time: 'Tuần 2',
            title: 'Nâng cao kỹ năng phân tích',
            desc: 'Luyện tập tư duy sâu và các biện pháp nghệ thuật trong văn bản.'
        });
    }

    // Tuần 3: Bài học tiếp theo
    if (recs.next) {
        timeline.push({
            time: 'Tuần 3',
            title: `Học mới: ${recs.next.title}`,
            desc: `Tiếp tục lộ trình với bài học phù hợp với trình độ hiện tại của em.`
        });
    } else {
        timeline.push({
            time: 'Tuần 3',
            title: 'Thực hành nâng cao',
            desc: 'Chuyển sang các bài học có độ khó cao hơn để bứt phá điểm số.'
        });
    }

    // Tuần 4: Đề thi thử
    timeline.push({
        time: 'Tuần 4',
        title: 'Thực chiến đề thi thử',
        desc: 'Làm đề kiểm tra tổng hợp 120 phút để rèn áp lực thời gian và tâm lý phòng thi.'
    });

    return timeline;
}
