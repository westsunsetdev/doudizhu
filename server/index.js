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
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3001;

const ROOM_NAME = 'The Pitstop';
const MAX_PLAYERS = 3;

let gameState = {
  players: {}, // socketId -> { name, hand }
  playerOrder: [],
  currentTurn: 0,
  deck: [],
  bottomCards: [],
  faceUp: null,
  passes: 0,
  started: false,
};

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('joinGame', (playerName) => {
    console.log(
      `${playerName} attempting to join. Current players: ${Object.keys(gameState.players).length}`
    );

    if (Object.keys(gameState.players).length >= MAX_PLAYERS) {
      socket.emit('roomFull', { roomName: ROOM_NAME });
      return;
    }

    gameState.players[socket.id] = { name: playerName, hand: [] };
    gameState.playerOrder.push(socket.id);

    // Send updated player list to all clients
    const playerData = {
      players: Object.values(gameState.players).map((p) => p.name),
      roomName: ROOM_NAME,
    };
    io.emit('playerList', playerData);

    // Also send specifically to the joining user after a small delay
    setTimeout(() => {
      socket.emit('playerList', playerData);
    }, 200);

    if (Object.keys(gameState.players).length === MAX_PLAYERS) {
      startInitialDeal();
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    io.emit('gamePaused', gameState.players[socket.id]?.name || 'A player');
  });

  socket.on('bottomDecision', (take) => {
    if (gameState.playerOrder[gameState.currentChooser] !== socket.id) return;

    if (take) {
      assignBottomAndStart();
    } else {
      gameState.passes += 1;
      gameState.currentChooser = (gameState.currentChooser + 1) % MAX_PLAYERS;
      if (gameState.passes === 2) {
        assignBottomAndStart();
      } else {
        promptCurrentChooser();
      }
    }
  });

  function startInitialDeal() {
    gameState.started = true;
    gameState.deck = shuffleDeck();

    const faceUpIndex = Math.floor(Math.random() * (gameState.deck.length / 2));
    const faceUpCard = gameState.deck[faceUpIndex];
    const dealt = gameState.deck.slice(0, 51);
    gameState.bottomCards = gameState.deck.slice(51);
    const hands = dealCards(dealt, MAX_PLAYERS);

    const faceUpPlayerIndex = faceUpIndex % MAX_PLAYERS;
    gameState.faceUp = { card: faceUpCard, playerIndex: faceUpPlayerIndex };

    gameState.playerOrder.forEach((id, index) => {
      gameState.players[id].hand = hands[index];
      const previewHand = Array(17).fill('back');
      if (index === faceUpPlayerIndex) previewHand[0] = faceUpCard;
      io.to(id).emit('initialDeal', {
        hand: previewHand,
        faceUpInfo: {
          player: gameState.players[gameState.playerOrder[faceUpPlayerIndex]].name,
          card: faceUpCard,
        },
      });
    });

    gameState.currentChooser = faceUpPlayerIndex;
    gameState.passes = 0;
    io.emit(
      'gameMessage',
      `${gameState.players[gameState.playerOrder[faceUpPlayerIndex]].name} drew ${faceUpCard}`
    );
    promptCurrentChooser();
  }

  function promptCurrentChooser() {
    const id = gameState.playerOrder[gameState.currentChooser];
    io.to(id).emit('promptBottom');
    io.emit('gameMessage', `${gameState.players[id].name}, take the bottom cards?`);
  }

  function assignBottomAndStart() {
    const id = gameState.playerOrder[gameState.currentChooser];
    gameState.players[id].hand.push(...gameState.bottomCards);
    io.emit('gameMessage', `${gameState.players[id].name} takes the bottom cards.`);
    startGame(gameState.currentChooser);
  }

  function startGame(startIndex) {
    gameState.playerOrder.forEach((id, index) => {
      io.to(id).emit('startGame', {
        hand: gameState.players[id].hand,
        yourTurn: index === startIndex,
      });
    });

    io.emit(
      'gameMessage',
      `${gameState.players[gameState.playerOrder[startIndex]].name}'s turn`
    );
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

