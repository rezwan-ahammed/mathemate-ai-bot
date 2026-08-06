const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const readline = require('readline');
const { checkTextToxicity, processAudio } = require('./ai_handlers');
const { handleWarning, resetWarning } = require('./firebase_handlers');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

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

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            const phoneNumber = await question('আপনার WhatsApp নম্বর দিন (যেমন: 8801XXXXXXXXX): ');
            const cleanNumber = phoneNumber.replace(/[^0-9]/g, ''); 
            try {
                const code = await sock.requestPairingCode(cleanNumber);
                console.log(`\n🔑 আপনার Pairing Code: ${code}`);
            } catch (err) {
                console.error('Code Error:', err.message);
            }
        }, 3000);
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
            console.log(`🔍 Mathemate AI স্ক্যান করছে...`);

            const status = await checkTextToxicity(textContent);
            console.log(`🤖 AI রেজাল্ট: ${status}`);
            
            if (status === 'TOXIC') {
                if (isGroup) {
                    const warnings = await handleWarning(sender, participant);

                    if (warnings >= 3) {
                        console.log(`🚫 অ্যাকশন: কিক করা হচ্ছে।`);
                        const kickMsg = `🚨 *Security Action Taken* 🚨\n\nগ্রুপের শিষ্টাচার ও গাইডলাইন বারবার ভঙ্গ করার কারণে @${participant.split('@')[0]} কে সিস্টেম কর্তৃক রিমুভ করা হয়েছে।\n\nসুস্থ ও সুন্দর পরিবেশ বজায় রাখতে আমাদের সহায়তা করুন।\n\n*Powered by -*\n*Mathemate AI*`;

                        await sock.sendMessage(sender, { text: kickMsg, mentions: [participant] });
                        await sock.groupParticipantsUpdate(sender, [participant], "remove");
                        await resetWarning(sender, participant);
                    } else {
                        console.log(`⚠️ অ্যাকশন: ওয়ার্নিং দেওয়া হচ্ছে (${warnings}/3)।`);
                        const warnMsg = `⚠️ *System Warning [${warnings}/3]* ⚠️\n\nহ্যালো @${participant.split('@')[0]},\nআমি লক্ষ্য করেছি আপনার মেসেজে আপত্তিকর ভাষার প্রয়োগ রয়েছে। দয়া করে এই ধরনের শব্দ ব্যবহার থেকে বিরত থাকুন। \n\n(পরপর ৩ বার এমন আচরণ করলে সিস্টেম আপনাকে স্বয়ংক্রিয়ভাবে রিমুভ করবে।)\n\n*Powered by -*\n*Mathemate AI*`;

                        await sock.sendMessage(sender, { text: warnMsg, mentions: [participant] }, { quoted: msg });
                    }
                } else {
                    const dmMsg = `⚠️ *Security Alert* ⚠️\n\nহ্যালো, আপনার পাঠানো মেসেজটিতে আপত্তিকর ভাষার প্রয়োগ পাওয়া গেছে, যা আমাদের কমিউনিটি গাইডলাইনের পরিপন্থী। দয়া করে প্রফেশনাল ও মার্জিত ভাষা ব্যবহার করুন।\n\n*Powered by -*\n*Mathemate AI*`;
                    await sock.sendMessage(sender, { text: dmMsg }, { quoted: msg });
                }
            }
        }

        // 🔵 অডিও মডারেশন
        if (messageType === 'audioMessage') {
            console.log(`\n🎙️ অডিও রিসিভড। ট্রান্সক্রিপ্ট করা হচ্ছে...`);

            const buffer = await downloadMediaMessage(msg, 'buffer', { }, { logger: pino({ level: 'silent' }) });
            const { transcript, status } = await processAudio(buffer);

            console.log(`🤖 AI রেজাল্ট: ${status}`);

            let replyText = `🎙️ *Audio Transcript:*\n\n"${transcript}"`;

            if (status === 'TOXIC') {
                if (isGroup) {
                    const warnings = await handleWarning(sender, participant);

                    if (warnings >= 3) {
                        replyText += `\n\n🚨 *Action:* অডিওতে আপত্তিকর ভাষার জন্য @${participant.split('@')[0]} কে রিমুভ করা হয়েছে।\n\n*Powered by -*\n*Mathemate AI*`;
                        await sock.sendMessage(sender, { text: replyText, mentions: [participant] }, { quoted: msg });
                        await sock.groupParticipantsUpdate(sender, [participant], "remove");
                        await resetWarning(sender, participant);
                    } else {
                        replyText += `\n\n⚠️ *Warning [${warnings}/3]:* @${participant.split('@')[0]}, আপনার অডিওতে আপত্তিকর ভাষা পাওয়া গেছে। দয়া করে সতর্ক হোন।\n\n*Powered by -*\n*Mathemate AI*`;
                        await sock.sendMessage(sender, { text: replyText, mentions: [participant] }, { quoted: msg });
                    }
                } else {
                    replyText += `\n\n⚠️ *Alert:* আপনার অডিওতে আপত্তিকর ভাষা পাওয়া গেছে। দয়া করে সংযত হোন।\n\n*Powered by -*\n*Mathemate AI*`;
                    await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
                }
            } else if (status === 'SAFE') {
                 replyText += `\n\n*Powered by -*\n*Mathemate AI*`;
                 await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
            }
        }
    });
}

// Render-এর জন্য ডামি HTTP সার্ভার (যাতে সার্ভার ক্র্যাশ না করে)
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.write('Mathemate AI is running perfectly!');
    res.end();
}).listen(PORT, () => console.log(`🌐 Server is listening on port ${PORT}`));

// Render-এ readline কাজ করবে না, তাই env থেকে নম্বর নেওয়ার ব্যবস্থা
async function startBot() {
    // আগের কোডের readline-এর পরিবর্তে এটি ব্যবহার করুন
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            // Render-এর Environment Variable থেকে নম্বর নেবে
            const phoneNumber = process.env.BOT_NUMBER || await question('আপনার WhatsApp নম্বর দিন: ');
            const cleanNumber = phoneNumber.replace(/[^0-9]/g, ''); 
            try {
                const code = await sock.requestPairingCode(cleanNumber);
                console.log(`\n🔑 আপনার Pairing Code: ${code}`);
            } catch (err) {
                console.error('Code Error:', err.message);
            }
        }, 3000);
    }
}

connectToWhatsApp();

