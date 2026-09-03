import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:5000';

async function runE2ETest() {
  console.log('=== STARTING SUPABASE DYNAMIC USERS & WEBRTC SIGNALING E2E TEST ===\n');

  // 1. Health check
  console.log('[Test 1] Testing Server Health Check:');
  const healthRes = await fetch(`${SERVER_URL}/api/health`);
  const healthJson = await healthRes.json();
  console.log('  Health check status:', healthJson.status);
  if (healthJson.status !== 'ok') throw new Error('Health check failed');
  console.log('  ✓ Server health verified!\n');

  // 2. Connect Dynamic Supabase User Sockets
  console.log('[Test 2] Connecting Dynamic Supabase Sockets:');
  const user1 = { userId: 'usr-uuid-1111', username: 'alex_dynamic' };
  const user2 = { userId: 'usr-uuid-2222', username: 'jordan_dynamic' };

  const socket1 = io(SERVER_URL, { transports: ['websocket'] });
  const socket2 = io(SERVER_URL, { transports: ['websocket'] });

  await new Promise((resolve) => {
    socket1.on('connect', () => {
      socket1.emit('user:join', user1);
      resolve();
    });
  });

  await new Promise((resolve) => {
    socket2.on('connect', () => {
      socket2.emit('user:join', user2);
      resolve();
    });
  });
  console.log('  ✓ Sockets registered with dynamic user IDs and usernames!\n');

  // 3. Test Dynamic Voice Call Flow
  console.log('[Test 3] Testing Dynamic Voice Call Signaling:');
  const voiceAcceptPromise = new Promise((resolve) => {
    socket2.once('call:incoming', ({ from, fromUsername, offer, callType }) => {
      if (from === user1.userId && callType === 'audio') {
        socket2.emit('call:accept', {
          to: from,
          answer: { type: 'answer', sdp: 'dyn-voice-answer' },
          callType: 'audio'
        });
        resolve();
      }
    });
  });

  const voiceAcceptedPromise = new Promise((resolve) => {
    socket1.once('call:accepted', ({ from, answer, callType }) => {
      if (from === user2.userId && callType === 'audio') {
        resolve();
      }
    });
  });

  socket1.emit('call:initiate', {
    to: user2.userId,
    toUsername: user2.username,
    fromUsername: user1.username,
    offer: { type: 'offer', sdp: 'dyn-voice-offer' },
    callType: 'audio'
  });

  await voiceAcceptPromise;
  await voiceAcceptedPromise;
  console.log('  ✓ Voice call accepted between dynamic Supabase users!\n');

  // 4. Test Dynamic Video Call Flow with ICE exchange
  console.log('[Test 4] Testing Dynamic Video Call Signaling & ICE:');
  const videoAcceptPromise = new Promise((resolve) => {
    socket2.once('call:incoming', ({ from, fromUsername, offer, callType }) => {
      if (from === user1.userId && callType === 'video') {
        socket2.emit('call:accept', {
          to: from,
          answer: { type: 'answer', sdp: 'dyn-video-answer' },
          callType: 'video'
        });
        resolve();
      }
    });
  });

  const videoAcceptedPromise = new Promise((resolve) => {
    socket1.once('call:accepted', ({ from, answer, callType }) => {
      if (from === user2.userId && callType === 'video') {
        resolve();
      }
    });
  });

  const videoIcePromise = new Promise((resolve) => {
    socket2.once('call:ice-candidate', ({ from, candidate }) => {
      if (from === user1.userId && candidate.candidate === 'mock-ice-dynamic') {
        resolve();
      }
    });
  });

  socket1.emit('call:initiate', {
    to: user2.userId,
    toUsername: user2.username,
    fromUsername: user1.username,
    offer: { type: 'offer', sdp: 'dyn-video-offer' },
    callType: 'video'
  });

  await videoAcceptPromise;
  await videoAcceptedPromise;

  socket1.emit('call:ice-candidate', {
    to: user2.userId,
    candidate: { candidate: 'mock-ice-dynamic', sdpMid: '0', sdpMLineIndex: 0 }
  });
  await videoIcePromise;
  console.log('  ✓ Video call accepted and ICE exchanged between dynamic users!\n');

  // 5. Test Call Termination
  console.log('[Test 5] Testing Call Termination:');
  const callEndedPromise = new Promise((resolve) => {
    socket2.once('call:ended', ({ from, durationText, callType }) => {
      if (from === user1.userId && durationText === '01:45' && callType === 'video') {
        resolve();
      }
    });
  });

  socket1.emit('call:end', {
    to: user2.userId,
    durationText: '01:45',
    callType: 'video'
  });

  await callEndedPromise;
  console.log('  ✓ Call ended and notified to peer cleanly!\n');

  socket2.disconnect();
  socket1.disconnect();

  console.log('=== ALL DYNAMIC SIGNALLING & WEBRTC TESTS PASSED! ===');
  setTimeout(() => process.exit(0), 100);
}

runE2ETest().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
