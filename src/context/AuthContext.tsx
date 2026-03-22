import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, getUserProfile, createUserProfile, listenToUserProfile } from '../services/firebaseService';
import type { UserProfile } from '../types';

interface AuthContextValue {
    user: User | null;
    userProfile: UserProfile | null;
    loading: boolean;
    isTeacher: boolean;
    refreshProfile: () => Promise<void>;
    setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    userProfile: null,
    loading: true,
    isTeacher: false,
    refreshProfile: async () => { },
    setUserProfile: () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const loadProfile = async (u: User) => {
        let profile = await getUserProfile(u.uid);
        if (!profile) {
            profile = await createUserProfile(u);
        }
        setUserProfile(profile);
    };

    const refreshProfile = async () => {
        if (user) await loadProfile(user);
    };

    useEffect(() => {
        let profileUnsub: (() => void) | undefined;

        const unsubAuth = onAuthStateChanged(auth, async (u) => {
            setUser(u);
            if (u) {
                let profile = await getUserProfile(u.uid);
                if (!profile) {
                    await createUserProfile(u);
                }
                profileUnsub = listenToUserProfile(u.uid, (p) => {
                    setUserProfile(p);
                    setLoading(false);
                });
            } else {
                if (profileUnsub) {
                    profileUnsub();
                    profileUnsub = undefined;
                }
                setUserProfile(null);
                setLoading(false);
            }
        });

        return () => {
            unsubAuth();
            if (profileUnsub) profileUnsub();
        };
    }, []);

    const isTeacher = userProfile?.role === 'teacher';

    return (
        <AuthContext.Provider value={{ user, userProfile, loading, isTeacher, refreshProfile, setUserProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
