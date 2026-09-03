import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch complete profile for a Supabase session user
  const fetchUserProfile = useCallback(async (sessionUser) => {
    if (!sessionUser) return null;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sessionUser.id)
        .maybeSingle();

      const username = profile?.username || sessionUser.user_metadata?.username || sessionUser.email?.split('@')[0];

      return {
        id: sessionUser.id,
        email: sessionUser.email,
        username,
        displayName: username.charAt(0).toUpperCase() + username.slice(1),
        avatar_url: profile?.avatar_url || null,
        is_online: true
      };
    } catch {
      const fallbackName = sessionUser.user_metadata?.username || sessionUser.email?.split('@')[0] || 'User';
      return {
        id: sessionUser.id,
        email: sessionUser.email,
        username: fallbackName,
        displayName: fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1),
        avatar_url: null,
        is_online: true
      };
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      if (!isSupabaseConfigured()) {
        if (mounted) setIsLoading(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user && mounted) {
          const profileUser = await fetchUserProfile(session.user);
          setUser(profileUser);
          authService.updatePresence(session.user.id, true);
        }
      } catch (err) {
        console.error('[Auth] Error getting initial session:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] State change event:', event);
      if (session && session.user) {
        const profileUser = await fetchUserProfile(session.user);
        if (mounted) {
          setUser(profileUser);
          setIsLoading(false);
        }
        if (event === 'SIGNED_IN') {
          authService.updatePresence(session.user.id, true);
        }
      } else {
        if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
      }
    });

    // Window unload presence cleanup
    const handleUnload = () => {
      if (user && user.id) {
        authService.updatePresence(user.id, false);
      }
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      mounted = false;
      subscription?.unsubscribe();
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [fetchUserProfile]);

  const login = async (email, password) => {
    const res = await authService.signIn(email, password);
    const profileUser = await fetchUserProfile(res.user);
    setUser(profileUser);
    return profileUser;
  };

  const register = async (username, email, password) => {
    const res = await authService.signUp(username, email, password);
    if (res.user && res.session) {
      const profileUser = await fetchUserProfile(res.user);
      setUser(profileUser);
    }
    return res;
  };

  const logout = async () => {
    await authService.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading, isConfigured: isSupabaseConfigured() }}>
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
