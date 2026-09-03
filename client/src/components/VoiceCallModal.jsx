import React from 'react';
import { useVoiceCall } from '../context/VoiceCallContext';
import { useChat } from '../context/ChatContext';

export function VoiceCallModal() {
  const {
    callState,
    callType,
    caller,
    isMuted,
    isCameraOff,
    callDuration,
    errorMessage,
    localVideoRef,
    remoteVideoRef,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
    toggleMute,
    toggleCamera
  } = useVoiceCall();

  const { activePeer } = useChat();

  if (callState === 'idle') {
    return null;
  }

  const targetDisplayName = activePeer ? `@${activePeer.username}` : caller ? `@${caller.username}` : 'User';
  const targetAvatarChar = (activePeer?.username || caller?.username || 'U')[0].toUpperCase();
  const isVideo = callType === 'video';

  return (
    <div className="call-modal-overlay">
      <div className={`call-modal-window ${isVideo && (callState === 'connected' || callState === 'connecting') ? 'video-mode' : ''}`}>
        {/* Window Titlebar */}
        <div className="window-titlebar">
          <div className="window-titlebar-title">
            <span>{isVideo ? '📹' : '📞'}</span>
            <span>
              {callState === 'calling' && (isVideo ? 'Outgoing Video Call' : 'Outgoing Voice Call')}
              {callState === 'incoming' && (isVideo ? 'Incoming Video Call' : 'Incoming Voice Call')}
              {(callState === 'connected' || callState === 'connecting') && (isVideo ? 'Video Call - In Progress' : 'Voice Call - In Progress')}
              {callState === 'rejected' && 'Call Declined'}
              {callState === 'cancelled' && 'Call Cancelled'}
              {callState === 'ended' && (isVideo ? 'Video Call Ended' : 'Voice Call Ended')}
              {callState === 'failed' && 'Call Error'}
            </span>
          </div>
          <div>[ _ &#9633; &#10005; ]</div>
        </div>

        {/* Modal Body */}
        <div className={`call-modal-body ${isVideo && callState === 'connected' ? 'video-body' : ''}`}>
          {/* Outgoing Call View */}
          {callState === 'calling' && (
            <div className="call-view-content">
              <div className={`call-avatar-large ${isVideo ? 'video-avatar' : ''}`}>
                {targetAvatarChar}
              </div>
              <div className="call-target-name">{targetDisplayName}</div>
              <div className="call-status-indicator calling">
                <span className="status-dot online"></span>
                <span>{isVideo ? 'Video Calling... Connecting...' : 'Calling... Connecting...'}</span>
              </div>
              <div className="call-actions-row">
                <button className="btn-call-action btn-cancel" onClick={cancelCall}>
                  Cancel Call
                </button>
              </div>
            </div>
          )}

          {/* Incoming Call View */}
          {callState === 'incoming' && (
            <div className="call-view-content">
              <div className="call-avatar-large incoming">
                {targetAvatarChar}
              </div>
              <div className="call-target-name">{caller ? `@${caller.username}` : 'Incoming Caller'}</div>
              <div className="call-status-indicator incoming">
                <span>{isVideo ? 'Incoming video call...' : 'Incoming voice call...'}</span>
              </div>
              <div className="call-actions-row">
                <button className="btn-call-action btn-accept" onClick={acceptCall}>
                  Accept
                </button>
                <button className="btn-call-action btn-reject" onClick={rejectCall}>
                  Reject
                </button>
              </div>
            </div>
          )}

          {/* Connecting State */}
          {callState === 'connecting' && (
            <div className="call-view-content">
              <div className="call-avatar-large">
                {targetAvatarChar}
              </div>
              <div className="call-target-name">{targetDisplayName}</div>
              <div className="call-status-indicator connecting">
                <span>{isVideo ? 'Establishing video connection...' : 'Establishing audio connection...'}</span>
              </div>
              <div className="call-actions-row">
                <button className="btn-call-action btn-end-call" onClick={endCall}>
                  End Call
                </button>
              </div>
            </div>
          )}

          {/* Connected Active Call View */}
          {callState === 'connected' && (
            <>
              {isVideo ? (
                /* Active Video Call View */
                <div className="video-call-viewport">
                  {/* Remote Video (Main Display) */}
                  <div className="remote-video-wrapper">
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="remote-video-element"
                    />
                    <div className="video-overlay-header">
                      <span>{targetDisplayName}</span>
                      <span className="video-timer-badge">● {callDuration}</span>
                    </div>
                  </div>

                  {/* Local Video Preview (PiP Overlay) */}
                  <div className="local-video-preview">
                    {isCameraOff ? (
                      <div className="camera-off-placeholder">Camera Off</div>
                    ) : (
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="local-video-element"
                      />
                    )}
                    <div className="local-video-label">You</div>
                  </div>

                  {/* Video Control Bar */}
                  <div className="video-controls-bar">
                    <div className="video-controls-left">
                      <span className="status-dot online"></span>
                      <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Connected</span>
                    </div>

                    <div className="video-controls-center">
                      <button
                        className={`btn-call-action btn-mute ${isMuted ? 'muted' : ''}`}
                        onClick={toggleMute}
                      >
                        {isMuted ? 'Unmute' : 'Mute'}
                      </button>
                      <button
                        className={`btn-call-action btn-camera-toggle ${isCameraOff ? 'camera-off' : ''}`}
                        onClick={toggleCamera}
                      >
                        {isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
                      </button>
                      <button className="btn-call-action btn-end-call" onClick={endCall}>
                        End Call
                      </button>
                    </div>

                    <div className="video-controls-right">
                      <span className="video-duration-text">Duration: {callDuration}</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Active Voice Call View */
                <div className="call-view-content">
                  <div className="call-avatar-large connected">
                    {targetAvatarChar}
                  </div>
                  <div className="call-target-name">{targetDisplayName}</div>
                  <div className="call-status-indicator online">
                    <span className="status-dot online"></span>
                    <span>Connected</span>
                  </div>
                  <div className="call-duration-timer">
                    Duration: <strong>{callDuration}</strong>
                  </div>
                  <div className="call-actions-row">
                    <button
                      className={`btn-call-action btn-mute ${isMuted ? 'muted' : ''}`}
                      onClick={toggleMute}
                    >
                      {isMuted ? 'Unmute' : 'Mute'}
                    </button>
                    <button className="btn-call-action btn-end-call" onClick={endCall}>
                      End Call
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Call Rejected */}
          {callState === 'rejected' && (
            <div className="call-view-content">
              <div className="call-avatar-large rejected">&#10005;</div>
              <div className="call-target-name">Call Declined</div>
              <p style={{ fontSize: '12px', color: '#64748b' }}>
                {targetDisplayName} declined the {isVideo ? 'video' : 'voice'} call.
              </p>
            </div>
          )}

          {/* Call Cancelled */}
          {callState === 'cancelled' && (
            <div className="call-view-content">
              <div className="call-avatar-large rejected">&#10005;</div>
              <div className="call-target-name">Call Cancelled</div>
              <p style={{ fontSize: '12px', color: '#64748b' }}>
                The caller cancelled the {isVideo ? 'video' : 'voice'} call.
              </p>
            </div>
          )}

          {/* Call Ended */}
          {callState === 'ended' && (
            <div className="call-view-content">
              <div className="call-avatar-large">{isVideo ? '📹' : '📞'}</div>
              <div className="call-target-name">{isVideo ? 'Video Call Ended' : 'Voice Call Ended'}</div>
              {callDuration !== '00:00' && (
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Duration: {callDuration}
                </div>
              )}
            </div>
          )}

          {/* Call Failed (e.g. Permission Denied) */}
          {callState === 'failed' && (
            <div className="call-view-content">
              <div className="call-avatar-large error">&#9888;</div>
              <div className="call-target-name" style={{ color: '#dc2626' }}>Call Error</div>
              <p className="call-error-text">
                {errorMessage || 'Unable to establish WebRTC connection.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
