import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { chatService } from '../services/chatService';

const ChatContext = createContext(null);

const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '/';
const LAST_CONV_STORAGE_KEY = 'chat_last_active_conv';

export function ChatProvider({ children }) {
  const { user } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef(null);
  const activeConversationRef = useRef(activeConversation);
  activeConversationRef.current = activeConversation;

  // Active Peer shortcut
  const activePeer = activeConversation?.peer || null;

  // =========================================================================
  // 1. Fetch Conversations List & Restore Active Conversation from Storage
  // =========================================================================
  const loadConversations = useCallback(async () => {
    if (!user || !user.id || !isSupabaseConfigured()) return;
    try {
      const convs = await chatService.getUserConversations(user.id);
      setConversations(convs);

      // Check if there was a saved active conversation in localStorage
      let savedConv = null;
      try {
        const stored = localStorage.getItem(LAST_CONV_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.id) {
            savedConv = convs.find((c) => c.id === parsed.id) || parsed;
          }
        }
      } catch {
        // Ignore parse error
      }

      // If active conversation is not set yet:
      if (!activeConversationRef.current) {
        if (savedConv) {
          setActiveConversation(savedConv);
        } else if (convs.length > 0 && window.innerWidth >= 768) {
          setActiveConversation(convs[0]);
        }
      }
    } catch (err) {
      console.error('[Chat] Failed to load conversations:', err);
    }
  }, [user]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // =========================================================================
  // 2. Fetch Messages when active conversation changes
  // =========================================================================
  useEffect(() => {
    if (!activeConversation || !activeConversation.id) {
      setMessages([]);
      return;
    }

    // Persist active conversation in localStorage for refresh persistence
    try {
      localStorage.setItem(LAST_CONV_STORAGE_KEY, JSON.stringify(activeConversation));
    } catch {
      // Ignore storage error
    }

    let isMounted = true;
    setIsLoadingMessages(true);

    async function loadMessages() {
      try {
        const history = await chatService.getMessages(activeConversation.id);
        if (isMounted) {
          setMessages(history);
        }
      } catch (err) {
        console.error('[Chat] Failed to load messages:', err);
      } finally {
        if (isMounted) setIsLoadingMessages(false);
      }
    }

    loadMessages();

    return () => {
      isMounted = false;
    };
  }, [activeConversation]);

  // =========================================================================
  // 3. Supabase Realtime Subscriptions (Messages & Presence)
  // =========================================================================
  useEffect(() => {
    if (!isSupabaseConfigured() || !user) return;

    // A. Subscribe to Realtime Messages
    const messagesChannel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new;
          console.log('[Supabase Realtime] New message received:', newMsg);

          // If message belongs to active conversation, append it
          if (activeConversationRef.current && activeConversationRef.current.id === newMsg.conversation_id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }

          // Update last message in conversations list
          setConversations((prevConvs) => {
            const exists = prevConvs.some((c) => c.id === newMsg.conversation_id);
            if (!exists) {
              // Reload conversations so the new conversation appears in the list
              loadConversations();
              return prevConvs;
            }
            return prevConvs.map((conv) => {
              if (conv.id === newMsg.conversation_id) {
                return {
                  ...conv,
                  lastMessage: newMsg
                };
              }
              return conv;
            });
          });
        }
      )
      .subscribe();

    // B. Subscribe to Realtime Profiles (Live Presence updates)
    const profilesChannel = supabase
      .channel('public:profiles')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const updatedProfile = payload.new;

          // Update active peer presence
          if (activeConversationRef.current?.peer?.id === updatedProfile.id) {
            setActiveConversation((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                peer: {
                  ...prev.peer,
                  is_online: Boolean(updatedProfile.is_online),
                  last_seen: updatedProfile.last_seen
                }
              };
            });
          }

          // Update conversation list peer presence
          setConversations((prevConvs) =>
            prevConvs.map((conv) => {
              if (conv.peer.id === updatedProfile.id) {
                return {
                  ...conv,
                  peer: {
                    ...conv.peer,
                    is_online: Boolean(updatedProfile.is_online),
                    last_seen: updatedProfile.last_seen
                  }
                };
              }
              return conv;
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(profilesChannel);
    };
  }, [user, loadConversations]);

  // =========================================================================
  // 4. Socket.IO Connection for Instant Messaging & WebRTC Signaling
  // =========================================================================
  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected for messaging & signaling:', socket.id);
      setIsConnected(true);
      socket.emit('user:join', {
        userId: user.id,
        username: user.username
      });
    });

    // Instant Socket message delivery
    socket.on('message:receive', (newMsg) => {
      console.log('[Socket] Instant message received:', newMsg);
      if (activeConversationRef.current && activeConversationRef.current.id === newMsg.conversation_id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }

      setConversations((prevConvs) => {
        const exists = prevConvs.some((c) => c.id === newMsg.conversation_id);
        if (!exists) {
          loadConversations();
          return prevConvs;
        }
        return prevConvs.map((conv) => {
          if (conv.id === newMsg.conversation_id) {
            return {
              ...conv,
              lastMessage: newMsg
            };
          }
          return conv;
        });
      });
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected from signaling server');
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, loadConversations]);

  // =========================================================================
  // 5. User Search & Conversation Actions
  // =========================================================================
  const handleSearchUsers = useCallback(
    async (query) => {
      setSearchQuery(query);
      if (!query || !query.trim() || !user) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const results = await chatService.searchUsers(query, user.id);
        setSearchResults(results);
      } catch (err) {
        console.error('[Chat] Search error:', err);
      } finally {
        setIsSearching(false);
      }
    },
    [user]
  );

  const openConversationWithUser = useCallback(
    async (peerUser) => {
      if (!user || !peerUser) return;
      try {
        const convId = await chatService.getOrCreateConversation(user.id, peerUser.id);
        const convObj = {
          id: convId,
          peer: {
            id: peerUser.id,
            username: peerUser.username,
            displayName: peerUser.username.charAt(0).toUpperCase() + peerUser.username.slice(1),
            avatar_url: peerUser.avatar_url,
            is_online: Boolean(peerUser.is_online),
            last_seen: peerUser.last_seen
          },
          lastMessage: null
        };

        setActiveConversation(convObj);
        setSearchQuery('');
        setSearchResults([]);
      } catch (err) {
        console.error('[Chat] Failed to open/create conversation:', err);
      }
    },
    [user]
  );

  const selectConversation = useCallback((conv) => {
    setActiveConversation(conv);
  }, []);

  const closeActiveConversation = useCallback(() => {
    setActiveConversation(null);
    localStorage.removeItem(LAST_CONV_STORAGE_KEY);
  }, []);

  // Send message
  const sendMessage = useCallback(
    async (text) => {
      if (!activeConversation || !user || !text || !text.trim()) return;

      const trimmed = text.trim();
      const peerId = activeConversation.peer?.id;
      const peerUsername = activeConversation.peer?.username;

      try {
        const sentMsg = await chatService.sendMessage(activeConversation.id, user.id, trimmed, peerId);
        if (sentMsg) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === sentMsg.id)) return prev;
            return [...prev, sentMsg];
          });

          // Broadcast via Socket.IO for instant zero-latency peer delivery
          if (socketRef.current) {
            socketRef.current.emit('message:send', {
              toUserId: peerId,
              toUsername: peerUsername,
              message: sentMsg
            });
          }

          // Update local conversation list snippet and ensure it is in the list
          setConversations((prevConvs) => {
            const exists = prevConvs.some((c) => c.id === activeConversation.id);
            if (!exists) {
              const newEntry = {
                ...activeConversation,
                lastMessage: sentMsg
              };
              return [newEntry, ...prevConvs];
            }
            return prevConvs.map((conv) => {
              if (conv.id === activeConversation.id) {
                return {
                  ...conv,
                  lastMessage: sentMsg
                };
              }
              return conv;
            });
          });
        }
      } catch (err) {
        console.error('[Chat] Failed to send message:', err);
      }
    },
    [activeConversation, user]
  );

  return (
    <ChatContext.Provider
      value={{
        socket: socketRef.current,
        conversations,
        activeConversation,
        activePeer,
        messages,
        isLoadingMessages,
        searchResults,
        searchQuery,
        isSearching,
        isConnected,
        searchUsers: handleSearchUsers,
        openConversationWithUser,
        selectConversation,
        closeActiveConversation,
        sendMessage
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
