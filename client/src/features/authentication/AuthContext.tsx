"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, MfaLoginChallenge, MfaFactor } from "@/types";
import { api, resetCsrfToken } from "@/lib/api";

export interface LoginResult {
  user?: User;
  mfa?: MfaLoginChallenge;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<LoginResult>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    role: "ATTENDEE" | "ORGANIZER";
  }) => Promise<{ user: User; verifyUrl?: string }>;
  verifyMfaOtp: (params: { challengeId: string; otp: string }) => Promise<User>;
  verifyMfaTotp: (params: { challengeId: string; code: string }) => Promise<User>;
  verifyMfaRecovery: (params: { challengeId: string; recoveryCode: string }) => Promise<User>;
  resendMfaOtp: (challengeId: string) => Promise<void>;
  switchMfaFactor: (params: { challengeId: string; factor: MfaFactor }) => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const data = await api.get<{ user: User | null }>("/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const login = async (credentials: { email: string; password: string }): Promise<LoginResult> => {
    const res = await api.post<{ user?: User; mfaRequired?: boolean; challengeId?: string; factor?: MfaFactor; availableFactors?: MfaFactor[]; maskedEmail?: string }>("/auth/login", credentials);
    if (res.mfaRequired && res.challengeId && res.factor) {
      return {
        mfa: {
          mfaRequired: true,
          challengeId: res.challengeId,
          factor: res.factor,
          availableFactors: res.availableFactors || [res.factor],
          maskedEmail: res.maskedEmail || ""
        }
      };
    }
    if (res.user) {
      setUser(res.user);
      resetCsrfToken();
      return { user: res.user };
    }
    throw new Error("Unexpected login response");
  };

  const verifyMfaOtp = async (params: { challengeId: string; otp: string }): Promise<User> => {
    const res = await api.post<{ user: User }>("/auth/mfa/verify-otp", params);
    setUser(res.user);
    resetCsrfToken();
    return res.user;
  };

  const verifyMfaTotp = async (params: { challengeId: string; code: string }): Promise<User> => {
    const res = await api.post<{ user: User }>("/auth/mfa/verify-totp", params);
    setUser(res.user);
    resetCsrfToken();
    return res.user;
  };

  const verifyMfaRecovery = async (params: { challengeId: string; recoveryCode: string }): Promise<User> => {
    const res = await api.post<{ user: User }>("/auth/mfa/verify-recovery", params);
    setUser(res.user);
    resetCsrfToken();
    return res.user;
  };

  const resendMfaOtp = async (challengeId: string): Promise<void> => {
    await api.post("/auth/mfa/resend-otp", { challengeId });
  };

  const switchMfaFactor = async (params: { challengeId: string; factor: MfaFactor }): Promise<void> => {
    await api.post("/auth/mfa/switch-factor", params);
  };

  const register = async (payload: {
    name: string;
    email: string;
    password: string;
    role: "ATTENDEE" | "ORGANIZER";
  }): Promise<{ user: User; verifyUrl?: string }> => {
    const res = await api.post<{ user: User; verifyUrl?: string }>("/auth/register", payload);
    const data = (res as any)?.data || res;
    if (data.user) {
      setUser(data.user);
    }
    resetCsrfToken();
    return data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
      resetCsrfToken();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        verifyMfaOtp,
        verifyMfaTotp,
        verifyMfaRecovery,
        resendMfaOtp,
        switchMfaFactor,
        logout,
        refetchUser: fetchCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
