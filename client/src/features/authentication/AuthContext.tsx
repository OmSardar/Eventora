"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User } from "@/types";
import { api, resetCsrfToken } from "@/lib/api";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<User>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    role: "ATTENDEE" | "ORGANIZER";
  }) => Promise<User>;
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

  const login = async (credentials: { email: string; password: string }): Promise<User> => {
    const res = await api.post<{ user: User }>("/auth/login", credentials);
    setUser(res.user);
    return res.user;
  };

  const register = async (payload: {
    name: string;
    email: string;
    password: string;
    role: "ATTENDEE" | "ORGANIZER";
  }): Promise<User> => {
    const res = await api.post<{ user: User }>("/auth/register", payload);
    setUser(res.user);
    return res.user;
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

