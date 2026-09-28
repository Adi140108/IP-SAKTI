'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from 'firebase/auth';
import { auth, googleProvider, firebaseConfigured } from '@/lib/firebase';

export type UserRole = 'practitioner' | 'facilitator';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  signInWithEmail: (email: string, pass: string) => Promise<User>;
  signUpWithEmail: (email: string, pass: string, displayName?: string, role?: UserRole) => Promise<User>;
  signInWithGoogle: (role?: UserRole) => Promise<User>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  userRole: 'practitioner',
  setUserRole: () => {},
  signInWithEmail: async () => { throw new Error('Auth not ready'); },
  signUpWithEmail: async () => { throw new Error('Auth not ready'); },
  signInWithGoogle: async () => { throw new Error('Auth not ready'); },
  signOutUser: async () => { throw new Error('Auth not ready'); },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [userRole, setUserRoleState] = useState<UserRole>('practitioner');

  // Load saved role on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedRole = localStorage.getItem('ip_sakti_user_role') as UserRole;
      if (savedRole === 'facilitator' || savedRole === 'practitioner') {
        setUserRoleState(savedRole);
      }
    }
  }, []);

  const setUserRole = (role: UserRole) => {
    setUserRoleState(role);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ip_sakti_user_role', role);
    }
  };

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        localStorage.setItem('ip_sakti_user_uid', currentUser.uid);
        if (currentUser.email) {
          localStorage.setItem('ip_sakti_user_email', currentUser.email);
        }
      } else {
        localStorage.removeItem('ip_sakti_user_uid');
        localStorage.removeItem('ip_sakti_user_email');
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithEmail = async (email: string, pass: string): Promise<User> => {
    if (!auth) throw new Error('Authentication is not configured (missing Firebase API key). Contact the administrator.');
    const res = await signInWithEmailAndPassword(auth, email, pass);
    return res.user;
  };

  const signUpWithEmail = async (
    email: string,
    pass: string,
    displayName?: string,
    role: UserRole = 'practitioner'
  ): Promise<User> => {
    if (!auth) throw new Error('Authentication is not configured (missing Firebase API key). Contact the administrator.');
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    if (displayName && res.user) {
      await updateProfile(res.user, { displayName });
    }
    setUserRole(role);
    return res.user;
  };

  const signInWithGoogle = async (role: UserRole = 'practitioner'): Promise<User> => {
    if (!auth || !googleProvider) throw new Error('Authentication is not configured (missing Firebase API key). Contact the administrator.');
    const res = await signInWithPopup(auth, googleProvider);
    setUserRole(role);
    return res.user;
  };

  const signOutUser = async (): Promise<void> => {
    if (!auth) return;
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        userRole,
        setUserRole,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
