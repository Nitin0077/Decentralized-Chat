const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.static('uploads'));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
});

// In-memory stores
const users = new Map(); // username -> { socketId, avatar, groupId }
const groups = new Map(); // groupId -> Set of usernames
const waitingUsers = [];  // For random chat matchmaking

// File Upload Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads';
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });
const BASE_URL = process.env.BASE_URL || 'https://decentralized-chat.onrender.com';

// Upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = `${BASE_URL}/${req.file.filename}`;  // Use BASE_URL here
  res.json({ url: fileUrl });
});


// Socket.io logic
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Join a group
  socket.on('join', ({ username, avatar, groupId }) => {
    users.set(username, { socketId: socket.id, avatar, groupId });

    if (!groups.has(groupId)) {
      groups.set(groupId, new Set());
    }
    groups.get(groupId).add(username);

    console.log(`📥 ${username} joined group ${groupId}`);
    emitOnlineUsers(groupId);
  });

  // Random Chat Match
  socket.on('find-random-user', (username) => {
    const user = users.get(username);
    if (!user) return;

    if (waitingUsers.length > 0) {
      const partnerName = waitingUsers.shift();
      const partner = users.get(partnerName);

      if (partner && partner.socketId !== user.socketId) {
        io.to(user.socketId).emit('match', { username: partnerName, avatar: partner.avatar });
        io.to(partner.socketId).emit('match', { username, avatar: user.avatar });
      } else {
        waitingUsers.push(username); // re-add self if no valid partner
      }
    } else {
      waitingUsers.push(username);
    }
    console.log('Waiting list:', waitingUsers);
    console.log('Users:', [...users.entries()].map(([name, u]) => [name, u.socketId]));
  });

  // Send Message
  socket.on('chat message', (msg) => {
    const { from, to, groupId } = msg;

    const fromUser = users.get(from);
    const toUser = users.get(to);

    if (fromUser) {
      io.to(fromUser.socketId).emit('chat message', { ...msg, seen: true });
    }

    if (toUser && toUser.socketId !== fromUser?.socketId) {
      io.to(toUser.socketId).emit('chat message', { ...msg, seen: false });
    }
  });

  // Typing Indicator
  socket.on('typing', ({ from, to }) => {
    const toUser = users.get(to);
    if (toUser) {
      io.to(toUser.socketId).emit('typing', from);
    }
  });

  // Seen Indicator
  socket.on('message seen', ({ from, to }) => {
    const fromUser = users.get(from);
    if (fromUser) {
      io.to(fromUser.socketId).emit('update seen', { from, to });
    }
  });

  // Leave Group
  socket.on('leave', ({ username, groupId }) => {
    const group = groups.get(groupId);
    if (group) {
      group.delete(username);
      if (group.size === 0) {
        groups.delete(groupId);
      }
    }
    users.delete(username);
    removeFromWaiting(username);
    emitOnlineUsers(groupId);
  });

  // Leave Random
  socket.on('leave-random', (username) => {
    const user = users.get(username);
    if (!user) return;
    const groupId = user.groupId;

    const group = groups.get(groupId);
    if (group) {
      group.delete(username);
      if (group.size === 0) {
        groups.delete(groupId);
      }
    }

    users.delete(username);
    removeFromWaiting(username);
    emitOnlineUsers(groupId);
  });

  // Voice Call Signaling
  socket.on('voice-offer', ({ to, from, offer }) => {
    const toUser = users.get(to);
    if (toUser) {
      io.to(toUser.socketId).emit('voice-offer', { from, offer });
    }
  });

  socket.on('voice-answer', ({ to, from, answer }) => {
    const toUser = users.get(to);
    if (toUser) {
      io.to(toUser.socketId).emit('voice-answer', { from, answer });
    }
  });

  socket.on('ice-candidate', ({ to, from, candidate }) => {
    const toUser = users.get(to);
    if (toUser) {
      io.to(toUser.socketId).emit('ice-candidate', { from, candidate });
    }
  });

  // Voice Call Indicators
  socket.on('voice-started', ({ to, from }) => {
    const toUser = users.get(to);
    if (toUser) {
      io.to(toUser.socketId).emit('voice-started', { from });
    }
  });

  socket.on('voice-ended', ({ to, from }) => {
    const toUser = users.get(to);
    if (toUser) {
      io.to(toUser.socketId).emit('voice-ended', { from });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    let disconnectedUser = null;

    for (const [username, data] of users.entries()) {
      if (data.socketId === socket.id) {
        disconnectedUser = { username, groupId: data.groupId };
        users.delete(username);
        break;
      }
    }

    if (disconnectedUser) {
      const { username, groupId } = disconnectedUser;

      const group = groups.get(groupId);
      if (group) {
        group.delete(username);
        if (group.size === 0) {
          groups.delete(groupId);
        }
      }

      removeFromWaiting(username);
      console.log(`❌ ${username} disconnected from group ${groupId}`);
      emitOnlineUsers(groupId);
    }
  });
  

  // Helper: Emit updated online users to a group
  function emitOnlineUsers(groupId) {
    const usernames = groups.get(groupId);
    if (!usernames) return;

    const userList = Array.from(usernames).map(username => {
      const { avatar } = users.get(username);
      return { username, avatar, groupId };
    });

    usernames.forEach(username => {
      const user = users.get(username);
      if (user) {
        io.to(user.socketId).emit('onlineUsers', userList);
      }
    });
  }

  // Helper: Remove from waiting list
  function removeFromWaiting(username) {
    const index = waitingUsers.indexOf(username);
    if (index !== -1) {
      waitingUsers.splice(index, 1);
    }
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

