const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { checkTextToxicity, processAudio } = require('./ai_handlers');
const { handleWarning, resetWarning } = require('./firebase_handlers');

// Render-এর জন্য ডামি HTTP সার্ভার
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.write('Mathemate AI is running perfectly!');
    res.end();
}).listen(PORT, () => console.log(`🌐 Server is listening on port ${PORT}`));

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    // 🔴 ক্লাউড ফ্রেন্ডলি প্যারিং কোড জেনারেটর
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            const phoneNumber = process.env.BOT_NUMBER; 
            
            if (!phoneNumber) {
                console.error("❌ ERROR: Render-এর Environment Variables-এ BOT_NUMBER সেট করা নেই!");
                return;
            }

            const cleanNumber = phoneNumber.replace(/[^0-9]/g, ''); 
            try {
                const code = await sock.requestPairingCode(cleanNumber);
                console.log(`\n🔑 আপনার Pairing Code: ${code}`);
            } catch (err) {
                console.error('Code Error:', err.message);
            }
        }, 4000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (lastDisconnect.error?.output?.statusCode === 428) return;
            if (shouldReconnect) setTimeout(connectToWhatsApp, 3000); 
        } else if (connection === 'open') {
            console.log('✅ Mathemate AI সফলভাবে কানেক্ট হয়েছে! সিস্টেম অনলাইনে আছে...');
            console.log('--------------------------------------------------');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // 📩 মেসেজ লিসেনার
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];

        if (!msg.message) return;
        if (msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        const participant = isGroup ? msg.key.participant : sender;
        const messageType = Object.keys(msg.message)[0];

        if (messageType === 'videoMessage') return;

        // 🟢 টেক্সট মডারেশন
        if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
            const textContent = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if(!textContent) return;

            console.log(`\n📩 নতুন টেক্সট রিসিভড: "${textContent}"`);
            const status = await checkTextToxicity(textContent);
            
            if (status === 'TOXIC') {
                if (isGroup) {
                    const warnings = await handleWarning(sender, participant);

                    if (warnings >= 3) {
                        const kickMsg = `🚨 *Security Action Taken* 🚨\n\nগ্রুপের শিষ্টাচার বারবার ভঙ্গ করার কারণে @${participant.split('@')[0]} কে রিমুভ করা হয়েছে।\n\n*Powered by -*\n*Mathemate AI*`;
                        await sock.sendMessage(sender, { text: kickMsg, mentions: [participant] });
                        await sock.groupParticipantsUpdate(sender, [participant], "remove");
                        await resetWarning(sender, participant);
                    } else {
                        const warnMsg = `⚠️ *System Warning [${warnings}/3]* ⚠️\n\nহ্যালো @${participant.split('@')[0]},\nআপনার মেসেজে আপত্তিকর ভাষা রয়েছে। বিরত থাকুন। \n\n*Powered by -*\n*Mathemate AI*`;
                        await sock.sendMessage(sender, { text: warnMsg, mentions: [participant] }, { quoted: msg });
                    }
                } else {
                    const dmMsg = `⚠️ *Security Alert* ⚠️\n\nদয়া করে প্রফেশনাল ও মার্জিত ভাষা ব্যবহার করুন।\n\n*Powered by -*\n*Mathemate AI*`;
                    await sock.sendMessage(sender, { text: dmMsg }, { quoted: msg });
                }
            }
        }

        // 🔵 অডিও মডারেশন
        if (messageType === 'audioMessage') {
            const buffer = await downloadMediaMessage(msg, 'buffer', { }, { logger: pino({ level: 'silent' }) });
            const { transcript, status } = await processAudio(buffer);
            let replyText = `🎙️ *Audio Transcript:*\n\n"${transcript}"`;

            if (status === 'TOXIC') {
                if (isGroup) {
                    const warnings = await handleWarning(sender, participant);
                    if (warnings >= 3) {
                        replyText += `\n\n🚨 *Action:* আপত্তিকর ভাষার জন্য @${participant.split('@')[0]} কে রিমুভ করা হয়েছে।\n\n*Powered by -*\n*Mathemate AI*`;
                        await sock.sendMessage(sender, { text: replyText, mentions: [participant] }, { quoted: msg });
                        await sock.groupParticipantsUpdate(sender, [participant], "remove");
                        await resetWarning(sender, participant);
                    } else {
                        replyText += `\n\n⚠️ *Warning [${warnings}/3]:* @${participant.split('@')[0]}, আপত্তিকর ভাষা পাওয়া গেছে। সতর্ক হোন।\n\n*Powered by -*\n*Mathemate AI*`;
                        await sock.sendMessage(sender, { text: replyText, mentions: [participant] }, { quoted: msg });
                    }
                } else {
                    replyText += `\n\n⚠️ *Alert:* আপত্তিকর ভাষা পাওয়া গেছে। সংযত হোন।\n\n*Powered by -*\n*Mathemate AI*`;
                    await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
                }
            } else if (status === 'SAFE') {
                 replyText += `\n\n*Powered by -*\n*Mathemate AI*`;
                 await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
            }
        }
    });
}

connectToWhatsApp();
