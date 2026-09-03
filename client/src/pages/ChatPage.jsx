import React from 'react';
import { ChatProvider, useChat } from '../context/ChatContext';
import { VoiceCallProvider } from '../context/VoiceCallContext';
import { Sidebar } from '../components/Sidebar';
import { ChatHeader } from '../components/ChatHeader';
import { MessageList } from '../components/MessageList';
import { MessageInput } from '../components/MessageInput';
import { VoiceCallModal } from '../components/VoiceCallModal';

function ChatContent() {
  const { activeConversation } = useChat();
  const hasActiveConversation = Boolean(activeConversation);

  return (
    <div className="chat-app-wrapper">
      <div className="chat-window">
        {/* Classic Window Titlebar */}
        <div className="window-titlebar">
          <div className="window-titlebar-title">
            <span>&#9993;</span>
            <span>Desktop Messenger - Supabase Realtime</span>
          </div>
          <div>[ _ &#9633; &#10005; ]</div>
        </div>

        <div className={`chat-main-container ${hasActiveConversation ? 'mobile-show-chat' : 'mobile-show-sidebar'}`}>
          {/* Sidebar with Search & Conversations */}
          <Sidebar />

          {/* Main Chat Area */}
          <main className="chat-area">
            {hasActiveConversation ? (
              <>
                <ChatHeader />
                <MessageList />
                <MessageInput />
              </>
            ) : (
              <div className="empty-chat-welcome">
                <div className="welcome-box">
                  <div className="welcome-icon">&#9993;</div>
                  <h3>Welcome to Messenger</h3>
                  <p>Select a conversation from the sidebar or search for a username to start a real-time chat, voice call, or video call.</p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export function ChatPage() {
  return (
    <ChatProvider>
      <VoiceCallProvider>
        <ChatContent />
        <VoiceCallModal />
      </VoiceCallProvider>
    </ChatProvider>
  );
}
