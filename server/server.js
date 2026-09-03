import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Enable CORS for Express and Socket.IO
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));
app.use(express.json());

const PORT = process.env.PORT || 5000;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Supabase Admin Client (for reliable database operations)
let supabaseAdmin = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// In-memory connected users map: userId or username -> Set of socket IDs
const connectedUsers = new Map();

// Helper to emit an event to all socket connections of a specific user ID or username
function emitToUser(userIdentifier, eventName, data) {
  if (!userIdentifier) return;
  const key = String(userIdentifier).toLowerCase();
  const userSockets = connectedUsers.get(key);
  if (userSockets && userSockets.size > 0) {
    for (const socketId of userSockets) {
      io.to(socketId).emit(eventName, data);
    }
  }
}

// REST Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    connectedUserCount: connectedUsers.size,
    hasSupabaseAdmin: Boolean(supabaseAdmin)
  });
});

// Admin Registration Endpoint (Bypasses SMTP and auto-confirms email)
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    const cleanUsername = String(username).toLowerCase().replace(/\s+/g, '');
    const cleanEmail = String(email).trim().toLowerCase();

    if (!/^[a-z0-9_]{3,25}$/.test(cleanUsername)) {
      return res.status(400).json({
        error: 'Username must be 3-25 characters long and contain only lowercase letters, numbers, and underscores.'
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase admin client not initialized on server.' });
    }

    // 1. Check if username is taken in profiles
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('username')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (existingProfile) {
      return res.status(400).json({ error: `Username "${cleanUsername}" is already taken.` });
    }

    // 2. Create user with email_confirm = true
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username: cleanUsername
      }
    });

    if (authError) {
      console.error('[Admin Register] Auth error:', authError);
      return res.status(400).json({ error: authError.message });
    }

    // 3. Ensure profile is upserted into profiles table
    if (authData.user) {
      await supabaseAdmin
        .from('profiles')
        .upsert({
          id: authData.user.id,
          username: cleanUsername,
          is_online: false,
          last_seen: new Date().toISOString()
        }, { onConflict: 'id' });
    }

    console.log(`[Admin Register] Successfully registered user: @${cleanUsername} (${cleanEmail})`);

    return res.json({
      success: true,
      user: authData.user,
      username: cleanUsername
    });
  } catch (err) {
    console.error('[Admin Register] Server exception:', err);
    return res.status(500).json({ error: err.message || 'Registration failed.' });
  }
});

// Admin Conversation Endpoint (Find or Create 1-on-1 Conversation reliably)
app.post('/api/conversation', async (req, res) => {
  try {
    const { currentUserId, peerUserId } = req.body;

    if (!currentUserId || !peerUserId) {
      return res.status(400).json({ error: 'currentUserId and peerUserId are required' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase admin client not configured' });
    }

    // 1. Check existing conversation
    const { data: userConvs } = await supabaseAdmin
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', currentUserId);

    if (userConvs && userConvs.length > 0) {
      const convIds = userConvs.map((c) => c.conversation_id);

      const { data: matchedConvs } = await supabaseAdmin
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', peerUserId)
        .in('conversation_id', convIds);

      if (matchedConvs && matchedConvs.length > 0) {
        return res.json({ conversationId: matchedConvs[0].conversation_id });
      }
    }

    // 2. Create new conversation
    const { data: newConv, error: convError } = await supabaseAdmin
      .from('conversations')
      .insert({})
      .select('id')
      .single();

    if (convError || !newConv) {
      console.error('[Admin Conversation] Error inserting conversation:', convError);
      return res.status(500).json({ error: convError?.message || 'Failed to create conversation' });
    }

    // 3. Add members
    const { error: membersError } = await supabaseAdmin
      .from('conversation_members')
      .insert([
        { conversation_id: newConv.id, user_id: currentUserId },
        { conversation_id: newConv.id, user_id: peerUserId }
      ]);

    if (membersError) {
      console.error('[Admin Conversation] Error adding members:', membersError);
      return res.status(500).json({ error: membersError.message });
    }

    console.log(`[Admin Conversation] Created conversation ${newConv.id} between ${currentUserId} and ${peerUserId}`);
    return res.json({ conversationId: newConv.id });
  } catch (err) {
    console.error('[Admin Conversation] Exception:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Admin Fetch Conversations for a User (Only returns conversations with messages)
app.get('/api/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || !supabaseAdmin) {
      return res.json({ conversations: [] });
    }

    const { data: memberships } = await supabaseAdmin
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', userId);

    if (!memberships || memberships.length === 0) {
      return res.json({ conversations: [] });
    }

    const convIds = memberships.map((m) => m.conversation_id);

    const { data: allMembers } = await supabaseAdmin
      .from('conversation_members')
      .select(`
        conversation_id,
        user_id,
        profiles:user_id (id, username, avatar_url, is_online, last_seen)
      `)
      .in('conversation_id', convIds)
      .neq('user_id', userId);

    if (!allMembers || allMembers.length === 0) {
      return res.json({ conversations: [] });
    }

    const validConversations = [];

    for (const member of allMembers) {
      const { data: lastMessages } = await supabaseAdmin
        .from('messages')
        .select('id, content, sender_id, created_at')
        .eq('conversation_id', member.conversation_id)
        .order('created_at', { ascending: false })
        .limit(1);

      // ONLY include conversations that have at least 1 message!
      if (lastMessages && lastMessages.length > 0) {
        const peerProfile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
        if (peerProfile) {
          validConversations.push({
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

    // Sort with most recent chat at the top
    validConversations.sort((a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at));

    return res.json({ conversations: validConversations });
  } catch (err) {
    console.error('[Admin Conversations] Error fetching:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Admin Fetch Messages for a Conversation
app.get('/api/messages/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (!conversationId || !supabaseAdmin) {
      return res.json({ messages: [] });
    }

    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ messages: messages || [] });
  } catch (err) {
    console.error('[Admin Messages] Error fetching:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Admin Message Send Endpoint (Reliable message persistence)
app.post('/api/message', async (req, res) => {
  try {
    const { conversationId, senderId, content, peerUserId } = req.body;

    if (!conversationId || !senderId || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase admin client not initialized' });
    }

    const { data: message, error } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content: content.trim()
      })
      .select()
      .single();

    if (error || !message) {
      console.error('[Admin Message] Error inserting message:', error);
      return res.status(500).json({ error: error?.message || 'Failed to save message' });
    }

    // Relay to peer via Socket.IO if peerUserId provided
    if (peerUserId) {
      emitToUser(peerUserId, 'message:receive', message);
    }

    return res.json({ success: true, message });
  } catch (err) {
    console.error('[Admin Message] Exception:', err);
    return res.status(500).json({ error: err.message });
  }
});

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Socket.IO Real-time Connection Handling for WebRTC Signaling & Instant Messaging
io.on('connection', (socket) => {
  let authenticatedUserId = null;
  let authenticatedUsername = null;

  // Handle user joining/registering socket
  socket.on('user:join', (data) => {
    if (!data) return;

    if (typeof data === 'string') {
      authenticatedUserId = data.toLowerCase();
      authenticatedUsername = data;
    } else {
      authenticatedUserId = String(data.userId || data.username || '').toLowerCase();
      authenticatedUsername = data.username || data.userId;
    }

    if (!authenticatedUserId) return;

    if (!connectedUsers.has(authenticatedUserId)) {
      connectedUsers.set(authenticatedUserId, new Set());
    }
    connectedUsers.get(authenticatedUserId).add(socket.id);

    // Also index by username if different from userId
    if (authenticatedUsername) {
      const usernameKey = String(authenticatedUsername).toLowerCase();
      if (!connectedUsers.has(usernameKey)) {
        connectedUsers.set(usernameKey, new Set());
      }
      connectedUsers.get(usernameKey).add(socket.id);
    }

    console.log(`[Socket] Registered user: ${authenticatedUsername} (ID: ${authenticatedUserId}, Socket: ${socket.id})`);
  });

  // Realtime instant message relay
  socket.on('message:send', ({ toUserId, toUsername, message }) => {
    if (toUserId) {
      emitToUser(toUserId, 'message:receive', message);
    }
    if (toUsername) {
      emitToUser(toUsername, 'message:receive', message);
    }
  });

  // =========================================================================
  // WebRTC Voice & Video Call Signaling Events
  // =========================================================================

  // Caller initiates a call (audio or video) with an SDP offer
  socket.on('call:initiate', ({ to, toUsername, fromUsername, offer, callType = 'audio' }) => {
    if (!authenticatedUserId || !to) return;
    console.log(`[Call Signaling] ${authenticatedUsername || authenticatedUserId} is calling ${toUsername || to} (${callType})`);

    emitToUser(to, 'call:incoming', {
      from: authenticatedUserId,
      fromUsername: fromUsername || authenticatedUsername,
      offer,
      callType
    });
  });

  // Callee accepts the call and responds with an SDP answer
  socket.on('call:accept', ({ to, answer, callType = 'audio' }) => {
    if (!authenticatedUserId || !to) return;
    console.log(`[Call Signaling] ${authenticatedUsername || authenticatedUserId} accepted ${callType} call from ${to}`);

    emitToUser(to, 'call:accepted', {
      from: authenticatedUserId,
      fromUsername: authenticatedUsername,
      answer,
      callType
    });
  });

  // Callee rejects the call
  socket.on('call:reject', ({ to }) => {
    if (!authenticatedUserId || !to) return;
    console.log(`[Call Signaling] ${authenticatedUsername || authenticatedUserId} rejected call from ${to}`);

    emitToUser(to, 'call:rejected', {
      from: authenticatedUserId,
      fromUsername: authenticatedUsername
    });
  });

  // Caller cancels call before it is answered
  socket.on('call:cancel', ({ to }) => {
    if (!authenticatedUserId || !to) return;
    console.log(`[Call Signaling] ${authenticatedUsername || authenticatedUserId} cancelled call to ${to}`);

    emitToUser(to, 'call:cancelled', {
      from: authenticatedUserId,
      fromUsername: authenticatedUsername
    });
  });

  // Peer exchanges ICE Candidate
  socket.on('call:ice-candidate', ({ to, candidate }) => {
    if (!authenticatedUserId || !to || !candidate) return;
    emitToUser(to, 'call:ice-candidate', {
      from: authenticatedUserId,
      candidate
    });
  });

  // Either peer ends active call or hangup
  socket.on('call:end', ({ to, durationText, callType = 'audio' }) => {
    if (!authenticatedUserId || !to) return;
    console.log(`[Call Signaling] ${callType} call ended between ${authenticatedUserId} and ${to}`);

    emitToUser(to, 'call:ended', {
      from: authenticatedUserId,
      durationText,
      callType
    });
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    if (authenticatedUserId && connectedUsers.has(authenticatedUserId)) {
      const userSockets = connectedUsers.get(authenticatedUserId);
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        connectedUsers.delete(authenticatedUserId);
      }
    }
    if (authenticatedUsername) {
      const usernameKey = String(authenticatedUsername).toLowerCase();
      if (connectedUsers.has(usernameKey)) {
        const usernameSockets = connectedUsers.get(usernameKey);
        usernameSockets.delete(socket.id);
        if (usernameSockets.size === 0) {
          connectedUsers.delete(usernameKey);
        }
      }
    }
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`==========================================`);
  console.log(` Chat & WebRTC Signaling Server on http://localhost:${PORT}`);
  console.log(` Auto-Confirm Registration, Conversation & Message APIs Ready`);
  console.log(`==========================================`);
});
