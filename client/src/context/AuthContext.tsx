/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface User {
  _id: string;
  name: string;
  email: string;
  role: 'SuperAdmin' | 'RegionalAdmin' | 'Admin' | 'Manager' | 'Staff' | 'IndustryPartner';
  status: string;
  institution: string;
  phone?: string;
  region?: string;
  profilePicture?: string;
  partnerId?: {
    _id: string;
    name: string;
  };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  passwordChangeRequired: boolean;
  login: (email: string, password: string) => Promise<{ passwordChangeRequired: boolean }>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  changePassword: (newPassword: string) => Promise<void>;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  institution: string;
  role?: string;
  phone?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);
import { API_BASE } from '@/config';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(!!token);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState<boolean>(
    localStorage.getItem('passwordChangeRequired') === 'true'
  );

  // Load user from token on mount
  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error('Invalid token');
        return res.json();
      })
      .then(userData => {
        if (isMounted) {
            setUser(userData);
            setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
            localStorage.removeItem('token');
            setToken(null);
            setUser(null);
            setIsLoading(false);
        }
      });
      
    return () => { isMounted = false; };
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Login failed');
    }

    const data = await res.json();
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);

    // Handle password change requirement
    if (data.passwordChangeRequired) {
      localStorage.setItem('passwordChangeRequired', 'true');
      setPasswordChangeRequired(true);
    } else {
      localStorage.removeItem('passwordChangeRequired');
      setPasswordChangeRequired(false);
    }

    return { passwordChangeRequired: data.passwordChangeRequired || false };
  }, []);

  const register = useCallback(async (registerData: RegisterData) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerData),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Registration failed');
    }

    const data = await res.json();
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('passwordChangeRequired');
    setToken(null);
    setUser(null);
    setPasswordChangeRequired(false);
  }, []);

  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  }, [token]);

  const changePassword = useCallback(async (newPassword: string) => {
    const res = await authFetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to change password');
    }

    localStorage.removeItem('passwordChangeRequired');
    setPasswordChangeRequired(false);
  }, [authFetch]);



  return (
    <AuthContext.Provider value={{
      user,
      token,
      isAuthenticated: !!user && !passwordChangeRequired,
      isLoading,
      passwordChangeRequired,
      login,
      register,
      logout,
      authFetch,
      changePassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
