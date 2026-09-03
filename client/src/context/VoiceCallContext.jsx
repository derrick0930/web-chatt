import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';

const VoiceCallContext = createContext(null);

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export function VoiceCallProvider({ children }) {
  const { user } = useAuth();
  const { socket, activePeer, activeConversation, sendMessage } = useChat();

  // Call state machine: 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected' | 'rejected' | 'cancelled' | 'ended' | 'failed'
  const [callState, setCallState] = useState('idle');
  const [callType, setCallType] = useState('audio'); // 'audio' | 'video'
  const [caller, setCaller] = useState(null); // { id, username }
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const iceCandidatesQueueRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const stateResetTimeoutRef = useRef(null);

  // Format call duration into MM:SS (e.g. 02:45)
  const formatDuration = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, []);

  // Cleanup WebRTC streams, peer connection, and timers
  const cleanupCall = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    pendingOfferRef.current = null;
    iceCandidatesQueueRef.current = [];
    setIsMuted(false);
    setIsCameraOff(false);
  }, []);

  // Helper to schedule reset to 'idle'
  const scheduleResetToIdle = useCallback((delayMs = 2500) => {
    if (stateResetTimeoutRef.current) clearTimeout(stateResetTimeoutRef.current);
    stateResetTimeoutRef.current = setTimeout(() => {
      setCallState('idle');
      setCaller(null);
      setErrorMessage('');
      setCallDuration(0);
      setCallType('audio');
    }, delayMs);
  }, []);

  // Handle duration timer when call is active
  useEffect(() => {
    if (callState === 'connected') {
      setCallDuration(0);
      timerIntervalRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  }, [callState]);

  // Attach local stream to local video element whenever it mounts/updates
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current && callType === 'video') {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [callState, callType]);

  // Create peer connection with standard event handlers
  const createPeerConnection = useCallback((targetUserId) => {
    const pc = new RTCPeerConnection(ICE_CONFIG);

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('call:ice-candidate', {
          to: targetUserId,
          candidate: event.candidate
        });
      }
    };

    // Remote audio / video track handler
    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote stream track:', event.track.kind);
      const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play().catch((err) => console.warn('[WebRTC] Remote video play error:', err));
      }

      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch((err) => console.warn('[WebRTC] Remote audio play error:', err));
      }
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state changed:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallState('connected');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (callState === 'connected' || callState === 'connecting') {
          cleanupCall();
          setCallState('ended');
          scheduleResetToIdle(2000);
        }
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [socket, callState, cleanupCall, scheduleResetToIdle]);

  // =========================================================================
  // Call Actions
  // =========================================================================

  // 1. Start Outgoing Call (Audio or Video)
  const startCall = useCallback(async (type = 'audio') => {
    if (callState !== 'idle' || !activePeer || !socket || !user) return;

    setCallType(type);
    setCallState('calling');
    setCaller({ id: user.id, username: user.username });
    setErrorMessage('');
    setCallDuration(0);
    setIsMuted(false);
    setIsCameraOff(false);

    try {
      const constraints = type === 'video'
        ? { audio: true, video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } }
        : { audio: true, video: false };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      if (localVideoRef.current && type === 'video') {
        localVideoRef.current.srcObject = stream;
      }

      const pc = createPeerConnection(activePeer.id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video'
      });
      await pc.setLocalDescription(offer);

      socket.emit('call:initiate', {
        to: activePeer.id,
        toUsername: activePeer.username,
        fromUsername: user.username,
        offer,
        callType: type
      });
    } catch (err) {
      console.error('[WebRTC] Failed to acquire media / initiate call:', err);
      cleanupCall();
      setCallState('failed');
      setErrorMessage(
        type === 'video'
          ? 'Camera and microphone permissions are required for a video call.'
          : 'Microphone permission is required to make a voice call.'
      );
      scheduleResetToIdle(3500);
    }
  }, [callState, activePeer, socket, user, createPeerConnection, cleanupCall, scheduleResetToIdle]);

  // 2. Accept Incoming Call
  const acceptCall = useCallback(async () => {
    if (callState !== 'incoming' || !pendingOfferRef.current || !socket || !caller) return;

    setCallState('connecting');

    try {
      const constraints = callType === 'video'
        ? { audio: true, video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } }
        : { audio: true, video: false };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      if (localVideoRef.current && callType === 'video') {
        localVideoRef.current.srcObject = stream;
      }

      const pc = createPeerConnection(caller.id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(pendingOfferRef.current));

      // Process queued ICE candidates
      while (iceCandidatesQueueRef.current.length > 0) {
        const candidate = iceCandidatesQueueRef.current.shift();
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('call:accept', {
        to: caller.id,
        answer,
        callType
      });

      setCallState('connected');
    } catch (err) {
      console.error('[WebRTC] Failed to accept call:', err);
      if (socket && caller) {
        socket.emit('call:reject', { to: caller.id });
      }
      cleanupCall();
      setCallState('failed');
      setErrorMessage(
        callType === 'video'
          ? 'Camera and microphone permissions are required for a video call.'
          : 'Microphone permission is required to accept call.'
      );
      scheduleResetToIdle(3500);
    }
  }, [callState, callType, socket, caller, createPeerConnection, cleanupCall, scheduleResetToIdle]);

  // 3. Reject Incoming Call
  const rejectCall = useCallback(() => {
    if (socket && caller) {
      socket.emit('call:reject', { to: caller.id });
    }
    cleanupCall();
    setCallState('idle');
    setCaller(null);
  }, [socket, caller, cleanupCall]);

  // 4. Cancel Outgoing Call
  const cancelCall = useCallback(() => {
    if (socket && activePeer) {
      socket.emit('call:cancel', { to: activePeer.id });
    }
    cleanupCall();
    setCallState('idle');
    setCaller(null);
  }, [socket, activePeer, cleanupCall]);

  // 5. End Active or Connecting Call
  const endCall = useCallback(() => {
    const durationText = callDuration > 0 ? formatDuration(callDuration) : '';
    const targetPeerId = activePeer?.id || caller?.id;

    if (socket && targetPeerId) {
      socket.emit('call:end', {
        to: targetPeerId,
        durationText,
        callType
      });
    }

    // Insert system call log if in an active conversation
    if (activeConversation && durationText) {
      const icon = callType === 'video' ? '📹' : '📞';
      const label = callType === 'video' ? 'Video call ended' : 'Voice call ended';
      sendMessage(`${icon} ${label} — ${durationText}`);
    }

    cleanupCall();
    setCallState('ended');
    scheduleResetToIdle(1800);
  }, [callDuration, formatDuration, socket, activePeer, caller, callType, activeConversation, sendMessage, cleanupCall, scheduleResetToIdle]);

  // 6. Toggle Microphone Mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextMutedState = !isMuted;
        audioTracks.forEach((track) => {
          track.enabled = !nextMutedState;
        });
        setIsMuted(nextMutedState);
      }
    }
  }, [isMuted]);

  // 7. Toggle Camera On / Off
  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        const nextCameraOffState = !isCameraOff;
        videoTracks.forEach((track) => {
          track.enabled = !nextCameraOffState;
        });
        setIsCameraOff(nextCameraOffState);
      }
    }
  }, [isCameraOff]);

  // =========================================================================
  // Socket.IO Signaling Event Listeners
  // =========================================================================
  useEffect(() => {
    if (!socket) return;

    // Incoming Call from peer
    const handleIncomingCall = async ({ from, fromUsername, offer, callType: incomingType = 'audio' }) => {
      console.log(`[Socket] Received incoming ${incomingType} call from ${fromUsername || from}`);

      if (callState !== 'idle') {
        socket.emit('call:reject', { to: from });
        return;
      }

      pendingOfferRef.current = offer;
      setCallType(incomingType);
      setCaller({ id: from, username: fromUsername || 'User' });
      setCallState('incoming');
    };

    // Call accepted by peer
    const handleCallAccepted = async ({ from, answer, callType: acceptedType }) => {
      console.log(`[Socket] ${acceptedType || 'call'} accepted by ${from}`);
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));

          while (iceCandidatesQueueRef.current.length > 0) {
            const candidate = iceCandidatesQueueRef.current.shift();
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          }

          setCallState('connected');
        } catch (err) {
          console.error('[WebRTC] Error setting remote description on accept:', err);
        }
      }
    };

    // Call rejected by peer
    const handleCallRejected = ({ from }) => {
      console.log(`[Socket] Call was rejected by ${from}`);
      cleanupCall();
      setCallState('rejected');
      scheduleResetToIdle(2500);
    };

    // Call cancelled by caller
    const handleCallCancelled = ({ from }) => {
      console.log(`[Socket] Call was cancelled by ${from}`);
      cleanupCall();
      setCallState('cancelled');
      scheduleResetToIdle(2000);
    };

    // Remote ICE candidate received
    const handleIceCandidate = async ({ candidate }) => {
      if (candidate) {
        const pc = peerConnectionRef.current;
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error('[WebRTC] Error adding ICE candidate:', err);
          }
        } else {
          iceCandidatesQueueRef.current.push(candidate);
        }
      }
    };

    // Call ended by peer
    const handleCallEnded = ({ callType: endedType }) => {
      console.log(`[Socket] ${endedType || 'Call'} ended by remote peer`);
      cleanupCall();
      setCallState('ended');
      scheduleResetToIdle(2000);
    };

    socket.on('call:incoming', handleIncomingCall);
    socket.on('call:accepted', handleCallAccepted);
    socket.on('call:rejected', handleCallRejected);
    socket.on('call:cancelled', handleCallCancelled);
    socket.on('call:ice-candidate', handleIceCandidate);
    socket.on('call:ended', handleCallEnded);

    return () => {
      socket.off('call:incoming', handleIncomingCall);
      socket.off('call:accepted', handleCallAccepted);
      socket.off('call:rejected', handleCallRejected);
      socket.off('call:cancelled', handleCallCancelled);
      socket.off('call:ice-candidate', handleIceCandidate);
      socket.off('call:ended', handleCallEnded);
    };
  }, [socket, callState, cleanupCall, scheduleResetToIdle]);

  return (
    <VoiceCallContext.Provider
      value={{
        callState,
        callType,
        caller,
        isMuted,
        isCameraOff,
        callDuration: formatDuration(callDuration),
        errorMessage,
        localVideoRef,
        remoteVideoRef,
        startCall,
        acceptCall,
        rejectCall,
        cancelCall,
        endCall,
        toggleMute,
        toggleCamera
      }}
    >
      {children}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
    </VoiceCallContext.Provider>
  );
}

export function useVoiceCall() {
  const context = useContext(VoiceCallContext);
  if (!context) {
    throw new Error('useVoiceCall must be used within a VoiceCallProvider');
  }
  return context;
}
