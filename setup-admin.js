require('dotenv').config();
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

const firebaseConfig = {
    apiKey: "AIzaSyCOwsJrIX6Ni1eWNzo4ytjdrNeVYiEJMjc",
    authDomain: "van-master-2026.firebaseapp.com",
    projectId: "van-master-2026",
    storageBucket: "van-master-2026.firebasestorage.app",
    messagingSenderId: "847253556397",
    appId: "1:847253556397:web:86e39266f8ea73e262174c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const email = 'admin@vanmaster.com';
const password = '123456';

async function setupAdmin() {
    try {
        console.log('Attempting to create admin user...');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log('Created user:', user.uid);

        // Ensure profile is created with teacher role
        const profileRef = doc(db, 'users', user.uid);
        await setDoc(profileRef, {
            uid: user.uid,
            name: 'Giáo viên Văn Master',
            email: email,
            role: 'teacher',
            isOnboarded: false,
            submissionCount: 0
        }, { merge: true });

        console.log('Successfully set teacher role for admin.');
        process.exit(0);
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            console.log('User already exists. Logging in and updating role...');
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            const profileRef = doc(db, 'users', user.uid);
            await setDoc(profileRef, {
                role: 'teacher'
            }, { merge: true });

            console.log('Successfully updated teacher role.');
            process.exit(0);
        } else {
            console.error('Error:', error);
            process.exit(1);
        }
    }
}

setupAdmin();
