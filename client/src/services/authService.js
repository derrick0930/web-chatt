import { supabase, isSupabaseConfigured } from './supabaseClient';

const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

export const authService = {
  /**
   * Validate that a username is lowercase, contains no spaces, and only uses a-z, 0-9, and _
   * @param {string} username 
   */
  validateUsername(username) {
    if (!username) return 'Username is required.';
    const trimmed = username.trim();
    if (trimmed !== username) return 'Username cannot contain leading or trailing spaces.';
    if (/\s/.test(username)) return 'Username cannot contain spaces.';
    if (username !== username.toLowerCase()) return 'Username must be all lowercase.';
    if (!/^[a-z0-9_]+$/.test(username)) return 'Username can only contain lowercase letters, numbers, and underscores (_).';
    if (username.length < 3) return 'Username must be at least 3 characters long.';
    if (username.length > 25) return 'Username must be 25 characters or fewer.';
    return null;
  },

  /**
   * Register a new user with Supabase Auth (Auto-confirming, no SMTP error)
   * @param {string} username 
   * @param {string} email 
   * @param {string} password 
   */
  async signUp(username, email, password) {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured yet. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your client/.env file.');
    }

    const cleanUsername = (username || '').toLowerCase().replace(/\s+/g, '');
    const validationError = this.validateUsername(cleanUsername);
    if (validationError) {
      throw new Error(validationError);
    }

    const cleanEmail = (email || '').trim().toLowerCase();

    // 1. Try server auto-confirm endpoint first to avoid SMTP "Error sending confirmation email"
    try {
      const serverRes = await fetch(`${API_BASE_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          email: cleanEmail,
          password
        })
      });

      const serverData = await serverRes.json();
      if (serverRes.ok && serverData.success) {
        return {
          user: serverData.user,
          username: cleanUsername
        };
      } else if (serverData.error) {
        // If username taken or validation error, throw immediately
        if (serverData.error.includes('already taken') || serverData.error.includes('already registered')) {
          throw new Error(serverData.error);
        }
      }
    } catch (serverErr) {
      if (serverErr.message && (serverErr.message.includes('already taken') || serverErr.message.includes('already registered'))) {
        throw serverErr;
      }
      console.warn('[Auth] Server register endpoint fallback:', serverErr);
    }

    // 2. Direct Supabase Client fallback
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          username: cleanUsername
        }
      }
    });

    if (error) {
      if (error.message && error.message.toLowerCase().includes('confirmation email')) {
        throw new Error('Supabase email service error: In your Supabase Dashboard -> Authentication -> Providers -> Email, please toggle off "Confirm email" or check your custom SMTP settings.');
      }
      throw new Error(error.message);
    }

    // 3. Ensure profile is upserted in public.profiles
    if (data.user) {
      try {
        await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            username: cleanUsername,
            is_online: false,
            last_seen: new Date().toISOString()
          }, { onConflict: 'id' });
      } catch (profileErr) {
        console.warn('[Auth] Profile upsert warning:', profileErr);
      }
    }

    return {
      user: data.user,
      session: data.session,
      username: cleanUsername
    };
  },

  /**
   * Sign in with Username or Email and Password
   * @param {string} identifier (username or email)
   * @param {string} password 
   */
  async signIn(identifier, password) {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured yet. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your client/.env file.');
    }

    const cleanIdentifier = (identifier || '').trim().toLowerCase();
    let targetEmail = cleanIdentifier;

    // If identifier is not an email (no @), resolve email via RPC helper
    if (!cleanIdentifier.includes('@')) {
      const cleanUsername = cleanIdentifier.replace(/\s+/g, '');
      const { data: resolvedEmail, error: rpcError } = await supabase
        .rpc('get_email_for_username', { p_username: cleanUsername });

      if (rpcError || !resolvedEmail) {
        console.warn('[Auth] RPC resolve failed, checking profiles:', rpcError);
        throw new Error(`Could not find an account with username "${cleanUsername}". Please verify your username or run the latest supabase/schema.sql script.`);
      }

      targetEmail = resolvedEmail;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password
    });

    if (error) {
      if (error.message.includes('Email not confirmed')) {
        throw new Error('Email not confirmed. In Supabase Dashboard -> Authentication -> Providers -> Email, disable "Confirm email" or verify your account.');
      }
      throw new Error(error.message);
    }

    // Fetch and sync profile
    let profile = null;
    if (data.user) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      profile = profileData;

      // Update online presence
      await supabase
        .from('profiles')
        .update({
          is_online: true,
          last_seen: new Date().toISOString()
        })
        .eq('id', data.user.id);
    }

    return {
      session: data.session,
      user: data.user,
      profile
    };
  },

  /**
   * Sign out the active user and set is_online to false
   */
  async signOut() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({
            is_online: false,
            last_seen: new Date().toISOString()
          })
          .eq('id', user.id);
      }
    } catch (e) {
      console.warn('[Auth] Could not update offline presence on signout:', e);
    }

    await supabase.auth.signOut();
  },

  /**
   * Get the current session user with profile details
   */
  async getCurrentUser() {
    if (!isSupabaseConfigured()) return null;

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session || !session.user) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      return {
        id: session.user.id,
        email: session.user.email,
        username: profile?.username || session.user.user_metadata?.username || session.user.email?.split('@')[0],
        displayName: profile?.username || session.user.user_metadata?.username || session.user.email?.split('@')[0],
        avatar_url: profile?.avatar_url || null,
        is_online: profile?.is_online || true
      };
    } catch {
      return null;
    }
  },

  /**
   * Update presence status
   * @param {string} userId 
   * @param {boolean} isOnline 
   */
  async updatePresence(userId, isOnline) {
    if (!userId || !isSupabaseConfigured()) return;
    try {
      await supabase
        .from('profiles')
        .update({
          is_online: isOnline,
          last_seen: new Date().toISOString()
        })
        .eq('id', userId);
    } catch (err) {
      console.warn('[Presence] Failed to update presence:', err);
    }
  }
};
