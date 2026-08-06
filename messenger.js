const login = require("@xaviabot/fca-unofficial");
const fs = require("fs");
const { checkTextToxicity } = require('./ai_handlers'); 
const { handleWarning, resetWarning } = require('./firebase_handlers'); 

let rawData = fs.readFileSync('appstate.json', 'utf8');
let appStateData = JSON.parse(rawData);

if (appStateData.cookies) {
    appStateData = appStateData.cookies;
}

// 🔴 পরিচ্ছন্ন কুকি ফরম্যাট (কোনো ডুপ্লিকেট ছাড়া)
let formattedCookies = appStateData.map(c => ({
    key: c.name || c.key,
    value: c.value,
    domain: c.domain,
    path: c.path
}));

// Android User-Agent দিয়ে ফেসবুককে বোঝানো হচ্ছে যে এটি একটি মোবাইল
const customOptions = {
    userAgent: "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
    listenEvents: true,
    updatePresence: true,
    selfListen: false
};

login({ appState: formattedCookies }, customOptions, (err, api) => {
    if (err) {
        console.error("❌ লগইন এরর:", err.error || err);
        return;
    }

    console.log('✅ Sentinel X (Messenger) সফলভাবে কানেক্ট হয়েছে! সিস্টেম অনলাইনে আছে...');

    api.listenMqtt(async (err, message) => {
        if (err) return console.error("MQTT Error:", err);

        if (message.type === "message" && message.body) {
            const senderId = message.senderID;
            const threadId = message.threadID; 
            const isGroup = message.isGroup;
            const textContent = message.body;

            // বটের নিজের মেসেজ ইগনোর করা
            if (senderId === api.getCurrentUserID()) return;

            console.log(`\n📩 [Messenger] নতুন টেক্সট রিসিভড: "${textContent}"`);
            console.log(`🔍 Sentinel X স্ক্যান করছে...`);
            
            const status = await checkTextToxicity(textContent);
            console.log(`🤖 AI রেজাল্ট: ${status}`);

            if (status === 'TOXIC') {
                if (isGroup) {
                    const warnings = await handleWarning(threadId, senderId);
                    
                    if (warnings >= 3) {
                        const kickMsg = `🚨 *Security Action Taken* 🚨\n\nগ্রুপের শিষ্টাচার ও গাইডলাইন বারবার ভঙ্গ করার কারণে এই ইউজারকে সিস্টেম কর্তৃক রিমুভ করা হয়েছে।\n\n*Powered by -*\n*Sentinel X*`;
                        api.sendMessage(kickMsg, threadId);
                        api.removeUserFromGroup(senderId, threadId); 
                        await resetWarning(threadId, senderId);
                    } else {
                        const warnMsg = `⚠️ *System Warning [${warnings}/3]* ⚠️\n\nআপনার মেসেজে আপত্তিকর ভাষার প্রয়োগ রয়েছে। দয়া করে বিরত থাকুন।\n\n*Powered by -*\n*Sentinel X*`;
                        api.sendMessage(warnMsg, threadId, message.messageID); 
                    }
                } else {
                    api.sendMessage("⚠️ *Security Alert* ⚠️\n\nদয়া করে প্রফেশনাল ও মার্জিত ভাষা ব্যবহার করুন।\n\n*Powered by -*\n*Sentinel X*", threadId, message.messageID);
                }
            }
        }
    });
});
