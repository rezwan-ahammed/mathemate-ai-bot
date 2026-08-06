require('dotenv').config();
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ১. টেক্সট মডারেশন (Groq API - Llama 3 Model)
async function checkTextToxicity(text) {
    try {
        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile", // 🔴 মডেল আপডেট করা হয়েছে
            messages: [
                {
                    role: "system",
                    content: `You are a strict WhatsApp group moderator for the Bengali language. Analyze the following text carefully. 
                    
                    Your goal is to detect profanity, bad words, insults, bullying, and toxic behavior in Bengali or Banglish (Bengali written in English letters). 
                    
                    Examples of TOXIC words (but not limited to): "শালা", "ফাক ইউ", "কুত্তার বাচ্চা", "চুদি", "Fuck you", "bal", "haramjada", "bokachoda", etc.
                    
                    If the text contains any bad words, profanity, or toxic behavior, reply ONLY with the word 'TOXIC'. 
                    If it is a normal, friendly, or safe conversation, reply ONLY with the word 'SAFE'. 
                    Do not provide any other explanations.`
                }, 
                {
                    role: "user",
                    content: text
                }
            ],
            temperature: 0.1,
            max_tokens: 10
        });
        
        const result = completion.choices[0].message.content.trim().toUpperCase();
        return result.includes('TOXIC') ? 'TOXIC' : 'SAFE';
    } catch (error) {
        console.error("Groq Error:", error);
        return 'SAFE'; 
    }
}

// ২. অডিও/ভয়েস ট্রান্সক্রিপ্ট ও মডারেশন (Gemini)
async function processAudio(audioBuffer) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
        const prompt = "Transcribe this Bengali audio into text. If the audio contains bad words, insults, or toxic behavior, add the exact word '[TOXIC]' at the very end of your transcription. If it is normal, just provide the transcription.";
        
        const audioPart = {
            inlineData: {
                data: audioBuffer.toString("base64"),
                mimeType: "audio/ogg" 
            }
        };

        const result = await model.generateContent([prompt, audioPart]);
        const responseText = result.response.text();
        
        const isToxic = responseText.includes('[TOXIC]');
        const cleanTranscript = responseText.replace('[TOXIC]', '').trim();

        return { transcript: cleanTranscript, status: isToxic ? 'TOXIC' : 'SAFE' };
    } catch (error) {
        console.error("Gemini Audio Error:", error);
        return { transcript: "অডিও প্রসেস করতে সমস্যা হয়েছে।", status: 'SAFE' };
    }
}

module.exports = { checkTextToxicity, processAudio };
