import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, getUserProfile, createUserProfile } from '../services/firebaseService';
import type { UserProfile } from '../types';

interface AuthContextValue {
    user: User | null;
    userProfile: UserProfile | null;
    loading: boolean;
    refreshProfile: () => Promise<void>;
    setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    userProfile: null,
    loading: true,
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
        const unsub = onAuthStateChanged(auth, async (u) => {
            setUser(u);
            if (u) {
                await loadProfile(u);
            } else {
                setUserProfile(null);
            }
            setLoading(false);
        });
        return unsub;
    }, []);

    return (
        <AuthContext.Provider value={{ user, userProfile, loading, refreshProfile, setUserProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
