
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { shuffleDeck, dealCards } = require('./game/deck');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3001;

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
    if (Object.keys(gameState.players).length >= 3) {
      socket.emit('roomFull');
      return;
    }

    gameState.players[socket.id] = { name: playerName, hand: [] };
    gameState.playerOrder.push(socket.id);

    io.emit('playerList', Object.values(gameState.players).map(p => p.name));

    if (Object.keys(gameState.players).length === 3) {
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
