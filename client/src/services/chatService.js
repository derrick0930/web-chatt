import { supabase } from './supabaseClient';

const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

export const chatService = {
  /**
   * Search registered users by username (public profiles only, no emails)
   * @param {string} query 
   * @param {string} currentUserId 
   * @returns {Promise<Array<{ id: string, username: string, avatar_url: string, is_online: boolean, last_seen: string }>>}
   */
  async searchUsers(query, currentUserId) {
    if (!query || !query.trim()) return [];

    const cleanQuery = query.trim().toLowerCase();

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, is_online, last_seen')
      .ilike('username', `%${cleanQuery}%`)
      .neq('id', currentUserId)
      .limit(15);

    if (error) {
      console.error('[Search] Error querying profiles:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Get all conversations with prior chat history only (conversations with at least 1 message)
   * @param {string} currentUserId 
   */
  async getUserConversations(currentUserId) {
    if (!currentUserId) return [];

    // Method 1: Try Backend API (fastest, pre-filtered & guaranteed)
    try {
      const res = await fetch(`${API_BASE_URL}/api/conversations/${currentUserId}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.conversations)) {
        return json.conversations;
      }
    } catch (apiErr) {
      console.warn('[Chat] Backend API conversations fallback:', apiErr);
    }

    // Method 2: Direct Supabase client fetch
    try {
      const { data: userMemberships, error: memberError } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', currentUserId);

      if (memberError || !userMemberships || userMemberships.length === 0) {
        return [];
      }

      const conversationIds = userMemberships.map((m) => m.conversation_id);

      const { data: allMembers, error: allMembersError } = await supabase
        .from('conversation_members')
        .select(`
          conversation_id,
          user_id,
          profiles:user_id (id, username, avatar_url, is_online, last_seen)
        `)
        .in('conversation_id', conversationIds)
        .neq('user_id', currentUserId);

      if (allMembersError || !allMembers) {
        return [];
      }

      const conversations = [];

      for (const member of allMembers) {
        const { data: lastMessages } = await supabase
          .from('messages')
          .select('id, content, sender_id, created_at')
          .eq('conversation_id', member.conversation_id)
          .order('created_at', { ascending: false })
          .limit(1);

        // ONLY add if there is at least one message!
        if (lastMessages && lastMessages.length > 0) {
          const peerProfile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;

          if (peerProfile) {
            conversations.push({
              id: member.conversation_id,
              peer: {
                id: peerProfile.id,
                username: peerProfile.username,
                displayName: peerProfile.username ? peerProfile.username.charAt(0).toUpperCase() + peerProfile.username.slice(1) : 'User',
                avatar_url: peerProfile.avatar_url,
                is_online: Boolean(peerProfile.is_online),
                last_seen: peerProfile.last_seen
              },
              lastMessage: lastMessages[0]
            });
          }
        }
      }

      // Sort by newest message at the top
      conversations.sort((a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at));

      return conversations;
    } catch (err) {
      console.error('[Chat] Error getting conversations:', err);
      return [];
    }
  },

  /**
   * Find an existing 1-on-1 conversation or create a new one reliably
   * @param {string} currentUserId 
   * @param {string} peerUserId 
   */
  async getOrCreateConversation(currentUserId, peerUserId) {
    if (!currentUserId || !peerUserId) {
      throw new Error('Both user IDs are required to start a conversation');
    }

    // Method 1: Try database RPC function (atomic and fastest)
    try {
      const { data: rpcConvId, error: rpcError } = await supabase
        .rpc('get_or_create_conversation', { p_user_id: peerUserId });

      if (!rpcError && rpcConvId) {
        return rpcConvId;
      }
    } catch (rpcErr) {
      console.warn('[Chat] RPC get_or_create_conversation failed, trying backend API:', rpcErr);
    }

    // Method 2: Try Backend API endpoint (bypasses RLS issues)
    try {
      const res = await fetch(`${API_BASE_URL}/api/conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUserId, peerUserId })
      });

      const data = await res.json();
      if (res.ok && data.conversationId) {
        return data.conversationId;
      }
    } catch (apiErr) {
      console.warn('[Chat] Backend API get_or_create_conversation fallback:', apiErr);
    }

    // Method 3: Direct Supabase client lookup & create with pre-generated UUID
    const { data: myConvs } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', currentUserId);

    if (myConvs && myConvs.length > 0) {
      const convIds = myConvs.map((c) => c.conversation_id);

      const { data: peerConvs } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', peerUserId)
        .in('conversation_id', convIds);

      if (peerConvs && peerConvs.length > 0) {
        return peerConvs[0].conversation_id;
      }
    }

    const newConvId = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).substring(2));

    await supabase
      .from('conversations')
      .insert({ id: newConvId });

    await supabase
      .from('conversation_members')
      .insert([
        { conversation_id: newConvId, user_id: currentUserId },
        { conversation_id: newConvId, user_id: peerUserId }
      ]);

    return newConvId;
  },

  /**
   * Fetch all messages for a specific conversation
   * @param {string} conversationId 
   */
  async getMessages(conversationId) {
    if (!conversationId) return [];

    // Method 1: Try direct Supabase fetch
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, created_at')
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        return data;
      }
    } catch (supaErr) {
      console.warn('[Messages] Supabase direct getMessages failed:', supaErr);
    }

    // Method 2: Try Backend API fallback
    try {
      const res = await fetch(`${API_BASE_URL}/api/messages/${conversationId}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.messages)) {
        return json.messages;
      }
    } catch (apiErr) {
      console.warn('[Messages] Backend API getMessages fallback:', apiErr);
    }

    return [];
  },

  /**
   * Send a message in a conversation reliably with server fallback
   * @param {string} conversationId 
   * @param {string} senderId 
   * @param {string} content 
   * @param {string} peerUserId
   */
  async sendMessage(conversationId, senderId, content, peerUserId) {
    if (!conversationId || !senderId || !content || !content.trim()) return null;

    const trimmed = content.trim();

    // 1. Try Supabase direct insert
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          content: trimmed
        })
        .select()
        .single();

      if (!error && data) {
        return data;
      }
      console.warn('[Chat] Supabase direct insert failed:', error?.message);
    } catch (insertErr) {
      console.warn('[Chat] Supabase insert exception:', insertErr);
    }

    // 2. Fallback to server endpoint
    try {
      const res = await fetch(`${API_BASE_URL}/api/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          senderId,
          content: trimmed,
          peerUserId
        })
      });

      const json = await res.json();
      if (res.ok && json.message) {
        return json.message;
      }
    } catch (serverErr) {
      console.error('[Chat] Server message endpoint fallback failed:', serverErr);
    }

    // 3. Optimistic fallback object if network issue
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      conversation_id: conversationId,
      sender_id: senderId,
      content: trimmed,
      created_at: new Date().toISOString()
    };
  }
};
