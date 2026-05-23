require('dotenv').config();
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

const firebaseConfig = {
    apiKey: "AIzaSyCOwsJrIX6Ni1eWNzo4ytjdrNeVYiEJMjc",
    authDomain: "van-master.firebaseapp.com",
    projectId: "van-master",
    storageBucket: "van-master.firebasestorage.app",
    messagingSenderId: "574744377166",
    appId: "1:574744377166:web:1a0677e6d163bab27a101f",
    measurementId: "G-PZCF297MCQ",
    databaseURL: "https://van-master-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const email = 'admin@vanmaster.com';
const password = '123456';

async function setupAdmin() {
    try {
        console.log('Attempting to create admin user in project "van-master"...');
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
            console.log('User already exists in "van-master". Logging in to update role...');
            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                const profileRef = doc(db, 'users', user.uid);
                await setDoc(profileRef, {
                    role: 'teacher'
                }, { merge: true });

                console.log('Successfully verified and updated teacher role.');
                process.exit(0);
            } catch (loginError) {
                if (loginError.code === 'auth/invalid-credential') {
                    console.error('\n[LỖI] Tài khoản admin@vanmaster.com đã tồn tại nhưng mật khẩu hiện tại trong database không phải là "123456".');
                    console.error('Để đổi mật khẩu, vui lòng dùng chức năng "Quên mật khẩu" trên trang đăng nhập của web app.');
                } else {
                    console.error('Lỗi đăng nhập:', loginError);
                }
                process.exit(1);
            }
        } else {
            console.error('Error:', error);
            process.exit(1);
        }
    }
}

setupAdmin();
