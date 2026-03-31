export interface LevelInfo {
    level: string;
    levelName: string;
    badges: string[];
}

/**
 * Tính toán cấp độ người dùng và phần thưởng Huy hiệu dựa vào điểm trung bình (avgScore).
 * 
 * Logic các mốc điểm:
 * 1. Sĩ tử nhập môn: < 4 điểm
 * 2. Tú tài khai bút: 4 - 6.9 điểm
 * 3. Cử Nhân bút nghiên: 7 - 8.9 điểm
 * 4. Bảng nhãn: 9 - 9.49 điểm
 * 5. Trạng nguyên: 9.5 - 10 điểm
 * 
 * @param avgScore Điểm trung bình từ 0 đến 10
 * @param isProfileComplete Tùy chọn, dùng để cấp "Huy hiệu Nhập môn" cho Tân binh
 */
export function calculateUserLevel(avgScore: number, isProfileComplete: boolean = true): LevelInfo {
    // 5. Trạng nguyên (9.5 - 10.0 điểm)
    if (avgScore >= 9.5) {
        return {
            level: 'Trạng nguyên',
            levelName: 'Trạng nguyên',
            badges: ['✨ Kim bảng đề danh']
        };
    }

    // 4. Bảng Nhãn (9.0 - 9.49 điểm)
    if (avgScore >= 9.0) {
        return {
            level: 'Bảng nhãn',
            levelName: 'Bảng nhãn',
            badges: ['🌺 Bút hoa']
        };
    }

    // 3. Cử Nhân Bút Nghiên (7.0 - 8.9 điểm)
    if (avgScore >= 7.0) {
        const badges = [];
        badges.push('🌸 Giấy hoa tiên');
        if (avgScore >= 8.0) {
            badges.push('🔖 Nghiên mực đá trầm');
        }
        return {
            level: 'Cử nhân bút nghiên',
            levelName: 'Cử nhân bút nghiên',
            badges
        };
    }

    // 2. Tú Tài Khai Bút (4.0 - 6.9 điểm)
    if (avgScore >= 4.0) {
        return {
            level: 'Tú tài khai bút',
            levelName: 'Tú tài khai bút',
            badges: ['🎒 Tráp bút', '🖌️ Bút lông']
        };
    }

    // 1. Sĩ Tử Nhập Môn (< 4.0 điểm)
    return {
        level: 'Sĩ tử nhập môn',
        levelName: 'Sĩ tử nhập môn',
        badges: isProfileComplete ? ['🪔 Đèn khuya', '📜 Thẻ Tre'] : []
    };
}
