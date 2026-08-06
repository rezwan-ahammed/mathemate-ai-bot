const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require("./firebase-key.json"); 

// নতুন নিয়মে Firebase ইনিশিয়ালাইজ করা
initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

// ওয়ার্নিং কাউন্ট করার ফাংশন
async function handleWarning(groupId, userId) {
    const userRef = db.collection('groups').doc(groupId).collection('users').doc(userId);
    const doc = await userRef.get();

    let warningCount = 1;
    if (doc.exists) {
        warningCount = doc.data().warnings + 1;
    }

    await userRef.set({ warnings: warningCount }, { merge: true });
    return warningCount;
}

// ওয়ার্নিং রিসেট করার ফাংশন
async function resetWarning(groupId, userId) {
    const userRef = db.collection('groups').doc(groupId).collection('users').doc(userId);
    await userRef.set({ warnings: 0 }, { merge: true });
}

module.exports = { handleWarning, resetWarning };
