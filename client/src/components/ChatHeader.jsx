import React from 'react';
import { useChat } from '../context/ChatContext';
import { useVoiceCall } from '../context/VoiceCallContext';
import { StatusBadge } from './StatusBadge';

export function ChatHeader() {
  const { activePeer, isConnected, closeActiveConversation } = useChat();
  const { startCall, callState } = useVoiceCall();

  if (!activePeer) return null;

  const isOnline = Boolean(activePeer.is_online);
  const isCallDisabled = !isOnline || !isConnected || callState !== 'idle';

  return (
    <header className="chat-header">
      <div className="chat-header-user">
        {/* Mobile Back Button */}
        <button
          className="btn-mobile-back"
          onClick={closeActiveConversation}
          title="Back to conversation list"
        >
          &larr; Back
        </button>

        <div className="chat-header-title">
          Chat with @{activePeer.username}
        </div>
        <StatusBadge isOnline={isOnline} />
      </div>

      <div className="chat-header-actions">
        {/* Voice Call Button */}
        <button
          className="btn-call"
          onClick={() => startCall('audio')}
          disabled={isCallDisabled}
          title={
            !isOnline
              ? `@${activePeer.username} is offline`
              : callState !== 'idle'
              ? 'Call in progress'
              : `Start voice call with @${activePeer.username}`
          }
        >
          <span>&#9742;</span>
          <span>Call</span>
        </button>

        {/* Video Call Button */}
        <button
          className="btn-video-call"
          onClick={() => startCall('video')}
          disabled={isCallDisabled}
          title={
            !isOnline
              ? `@${activePeer.username} is offline`
              : callState !== 'idle'
              ? 'Call in progress'
              : `Start video call with @${activePeer.username}`
          }
        >
          <span>&#128249;</span>
          <span>Video Call</span>
        </button>

        <div className="server-connection-tag">
          <span>Server:</span>
          <span style={{ color: isConnected ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
            {isConnected ? 'Connected' : 'Connecting...'}
          </span>
        </div>
      </div>
    </header>
  );
}
