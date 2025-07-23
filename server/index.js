
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { shuffleDeck, dealCards } = require('./game/deck');

const app = express();

// Add a simple route handler for the root path
app.get('/', (req, res) => {
  res.send('Dou Dizhu Game Server is running. Connect via the client application.');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3001;

const ROOM_NAME = "The Pitstop";
const MAX_PLAYERS = 3;

let gameState = {
  players: {}, // socketId -> { name, hand }
  playerOrder: [],
  currentTurn: 0,
  deck: [],
  started: false
};

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('joinGame', (playerName) => {
    if (Object.keys(gameState.players).length >= MAX_PLAYERS) {
      socket.emit('roomFull', { roomName: ROOM_NAME });
      return;
    }

    gameState.players[socket.id] = { name: playerName, hand: [] };
    gameState.playerOrder.push(socket.id);

    // Send updated player list to all clients
    const playerData = {
      players: Object.values(gameState.players).map(p => p.name),
      roomName: ROOM_NAME
    };
    io.emit('playerList', playerData);

    if (Object.keys(gameState.players).length === MAX_PLAYERS) {
      startGame();
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    io.emit('gamePaused', gameState.players[socket.id]?.name || 'A player');
  });

  function startGame() {
    gameState.started = true;
    gameState.deck = shuffleDeck();
    const hands = dealCards(gameState.deck, 3);

    gameState.playerOrder.forEach((id, index) => {
      gameState.players[id].hand = hands[index];
      io.to(id).emit('startGame', {
        hand: hands[index],
        yourTurn: index === 0
      });
    });

    io.emit('gameMessage', `${gameState.players[gameState.playerOrder[0]].name}'s turn`);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
