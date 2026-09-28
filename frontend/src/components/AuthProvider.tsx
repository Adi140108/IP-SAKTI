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
      if (typeof window !== 'undefined') {
        const localMock = localStorage.getItem('ip_sakti_local_mock_user');
        if (localMock) {
          try {
            setUser(JSON.parse(localMock));
          } catch {
            // ignore
          }
        }
      }
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
    if (!auth || !firebaseConfigured) {
      const mockUser = {
        uid: `local_user_${email.replace(/[^a-zA-Z0-9]/g, '_') || 'demo'}`,
        email: email || 'innovator@ip-sakti.gov.in',
        displayName: email.split('@')[0] || 'Local Innovator',
      } as unknown as User;
      setUser(mockUser);
      if (typeof window !== 'undefined') {
        localStorage.setItem('ip_sakti_user_uid', mockUser.uid);
        localStorage.setItem('ip_sakti_user_email', mockUser.email || '');
        localStorage.setItem('ip_sakti_local_mock_user', JSON.stringify(mockUser));
      }
      return mockUser;
    }
    const res = await signInWithEmailAndPassword(auth, email, pass);
    return res.user;
  };

  const signUpWithEmail = async (
    email: string,
    pass: string,
    displayName?: string,
    role: UserRole = 'practitioner'
  ): Promise<User> => {
    if (!auth || !firebaseConfigured) {
      const mockUser = {
        uid: `local_user_${email.replace(/[^a-zA-Z0-9]/g, '_') || Date.now().toString(36)}`,
        email: email || 'innovator@ip-sakti.gov.in',
        displayName: displayName || email.split('@')[0] || 'Local Innovator',
      } as unknown as User;
      setUser(mockUser);
      setUserRole(role);
      if (typeof window !== 'undefined') {
        localStorage.setItem('ip_sakti_user_uid', mockUser.uid);
        localStorage.setItem('ip_sakti_user_email', mockUser.email || '');
        localStorage.setItem('ip_sakti_local_mock_user', JSON.stringify(mockUser));
      }
      return mockUser;
    }
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    if (displayName && res.user) {
      await updateProfile(res.user, { displayName });
    }
    setUserRole(role);
    return res.user;
  };

  const signInWithGoogle = async (role: UserRole = 'practitioner'): Promise<User> => {
    if (!auth || !googleProvider || !firebaseConfigured) {
      const mockUser = {
        uid: `local_google_${Date.now().toString(36)}`,
        email: 'google_innovator@ip-sakti.gov.in',
        displayName: 'Google Innovator',
      } as unknown as User;
      setUser(mockUser);
      setUserRole(role);
      if (typeof window !== 'undefined') {
        localStorage.setItem('ip_sakti_user_uid', mockUser.uid);
        localStorage.setItem('ip_sakti_user_email', mockUser.email || '');
        localStorage.setItem('ip_sakti_local_mock_user', JSON.stringify(mockUser));
      }
      return mockUser;
    }
    const res = await signInWithPopup(auth, googleProvider);
    setUserRole(role);
    return res.user;
  };

  const signOutUser = async (): Promise<void> => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ip_sakti_local_mock_user');
      localStorage.removeItem('ip_sakti_user_uid');
      localStorage.removeItem('ip_sakti_user_email');
    }
    setUser(null);
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
