import fs from 'fs';

const API_KEY = 'AIzaSyB21GPzCTWVEy822v44LLsPRn6h7UmEGGM';

async function checkModels() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        if (!response.ok) {
            console.error('Lỗi khi gọi API:', response.status, response.statusText);
            return;
        }

        const data = await response.json();
        const models = data.models;

        let output = `Tìm thấy ${models.length} models:\n==================================\n`;
        
        const geminiModels = models.filter(m => m.name.includes('gemini'));
        
        for (const model of geminiModels) {
            output += `- Tên Model: ${model.name}\n`;
            output += `  Hiển thị: ${model.displayName}\n`;
            output += `  Phương thức hỗ trợ: ${model.supportedGenerationMethods.join(', ')}\n\n`;
        }
        fs.writeFileSync('models.txt', output);
        console.log("Saved to models.txt");
    } catch (error) {
        console.error('Lỗi script:', error);
    }
}

checkModels();
