const { io } = require('socket.io-client');

// Change if your API runs elsewhere
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:4000';
const cookie = process.argv[2] || ''; // pass your session cookie from Insomnia/DevTools

const socket = io(SOCKET_URL, {
  path: '/socket.io',
  transports: ['websocket'],
  withCredentials: true,
  // If your server uses cookie-based auth, pass it here:
  extraHeaders: cookie ? { Cookie: cookie } : undefined,
});

socket.on('connect', () => console.log('[client] connected', socket.id));
socket.on('disconnect', (reason) => console.log('[client] disconnected', reason));
socket.on('connect_error', (err) => console.error('[client] connect_error', err.message));

socket.on('presence:init', (list) => console.log('[client] presence:init', list));
socket.on('presence:update', (u) => console.log('[client] presence:update', u));

// Try flipping your own status for testing:
setTimeout(() => socket.emit('presence:set', { presence: 'online' }), 500);
setInterval(() => socket.emit('presence:ping'), 25000);