'use strict';

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const crypto  = require('crypto');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// ── Room management ─────────────────────────────────────────
const rooms = new Map();
let pendingRoom = null;           // roomId waiting for 2nd player

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  let roomId, playerIndex;

  if (pendingRoom) {
    // Second player: join existing room
    roomId      = pendingRoom;
    playerIndex = 1;
    pendingRoom = null;

    const room = rooms.get(roomId);
    room.sockets[1] = socket;
    socket.join(roomId);
    socket.roomId      = roomId;
    socket.playerIndex = 1;

    socket.emit('joined', { playerIndex: 1, roomId });

    // Both players present – start the game with a shared random seed
    const seed = crypto.randomInt(1, 999999);
    console.log(`[*] Game start  room=${roomId}  seed=${seed}`);
    io.to(roomId).emit('game_start', { seed });

  } else {
    // First player: create new room
    roomId      = crypto.randomBytes(4).toString('hex');
    playerIndex = 0;
    pendingRoom = roomId;

    rooms.set(roomId, { id: roomId, sockets: [socket, null] });
    socket.join(roomId);
    socket.roomId      = roomId;
    socket.playerIndex = 0;

    socket.emit('joined', { playerIndex: 0, roomId });
    console.log(`[*] Room created  ${roomId}  – waiting for player 2`);
  }

  // ── Relay game commands to the other player ────────────────
  socket.on('cmd', (data) => {
    socket.to(socket.roomId).emit('cmd', data);
  });

  // ── Simple chat (server-side sanitised) ───────────────────
  socket.on('chat', (msg) => {
    const clean = String(msg).slice(0, 200).replace(/[<>&"']/g, '');
    io.to(socket.roomId).emit('chat', { player: socket.playerIndex, msg: clean });
  });

  // ── Disconnect ─────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    if (pendingRoom === socket.roomId) pendingRoom = null;
    socket.to(socket.roomId).emit('opponent_left');
    rooms.delete(socket.roomId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`War Game server  →  http://localhost:${PORT}`)
);
