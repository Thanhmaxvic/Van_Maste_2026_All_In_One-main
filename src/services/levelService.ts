export interface LevelInfo {
    level: string;
    levelName: string;
    badges: string[];
}

/**
 * Tính toán cấp độ người dùng và phần thưởng Huy hiệu dựa vào điểm trung bình (avgScore).
 * 
 * Logic các mốc điểm:
 * 1. Tân binh Khám phá: < 4 điểm
 * 2. Người Chinh phục: 4 - 6.9 điểm
 * 3. Người Uyên bác: 7 - 8.9 điểm
 * 4. Bậc thầy / Người dẫn đường: 9 - 10 điểm
 * 
 * @param avgScore Điểm trung bình từ 0 đến 10
 * @param isProfileComplete Tùy chọn, dùng để cấp "Huy hiệu Nhập môn" cho Tân binh
 */
export function calculateUserLevel(avgScore: number, isProfileComplete: boolean = true): LevelInfo {
    // 4. Bậc thầy (9 - 10 điểm)
    if (avgScore >= 9) {
        const badges = [];
        badges.push('🥇 Huy chương Vàng');
        if (avgScore >= 9.5) {
            badges.push('🏆 Cúp Bậc Thầy');
        }
        return {
            level: 'Bậc thầy / Người dẫn đường',
            levelName: 'Bậc thầy / Người dẫn đường',
            badges
        };
    }

    // 3. Người Uyên bác (7 - 8.9 điểm)
    if (avgScore >= 7) {
        const badges = [];
        badges.push('🥉 Huy chương Đồng');
        if (avgScore >= 8) {
            badges.push('🥈 Huy chương Bạc');
        }
        return {
            level: 'Người Uyên bác',
            levelName: 'Người Uyên bác',
            badges
        };
    }

    // 2. Người Chinh phục (4 - 6.9 điểm)
    if (avgScore >= 4) {
        return {
            level: 'Người Chinh phục',
            levelName: 'Người Chinh phục',
            badges: ['🔥 Streak', '❤️ Tim']
        };
    }

    // 1. Tân binh Khám phá (0 - 3.9 điểm)
    return {
        level: 'Tân binh Khám phá',
        levelName: 'Tân binh Khám phá',
        badges: isProfileComplete ? ['⭐ Huy hiệu Nhập môn'] : []
    };
}
