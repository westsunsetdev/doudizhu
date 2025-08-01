
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
    origin: '*', // Allow all origins for now
    methods: ['GET', 'POST'],
    credentials: true
  }
});


const PORT = process.env.PORT || 3001;

const ROOM_NAME = "The Pitstop";
const MAX_PLAYERS = 3;

let gameState = {
  players: {}, // socketId -> { name, hand }
  playerOrder: [],
  currentTurn: 0,
  deck: [],
  started: false,
  tableCards: [],
  lastPlayedBy: "",
  currentPlayerIndex: 0
};

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('joinGame', (playerName) => {
    console.log(`${playerName} attempting to join. Current players: ${Object.keys(gameState.players).length}`);
    
    if (Object.keys(gameState.players).length >= MAX_PLAYERS) {
      socket.emit('roomFull', { roomName: ROOM_NAME });
      return;
    }

    gameState.players[socket.id] = { name: playerName, hand: [] };
    gameState.playerOrder.push(socket.id);

    console.log('Current game state after join:', {
      playerCount: Object.keys(gameState.players).length,
      players: Object.values(gameState.players).map(p => p.name)
    });

    // Send updated player list to all clients
    const playerData = {
      players: Object.values(gameState.players).map(p => p.name),
      roomName: ROOM_NAME
    };
    console.log('Broadcasting player list to all clients:', playerData);
    io.emit('playerList', playerData);

    // Also send specifically to the joining user after a small delay
    setTimeout(() => {
      console.log('Sending delayed player list to joining user:', playerData);
      socket.emit('playerList', playerData);
    }, 200);

    if (Object.keys(gameState.players).length === MAX_PLAYERS) {
      startGame();
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    io.emit('gamePaused', gameState.players[socket.id]?.name || 'A player');
  });

  socket.on('playCards', ({ cards }) => {
    const playerId = socket.id;
    const playerName = gameState.players[playerId]?.name;
    
    if (!playerName || gameState.playerOrder[gameState.currentPlayerIndex] !== playerId) {
      return; // Not this player's turn
    }

    // Remove cards from player's hand
    const playerHand = gameState.players[playerId].hand;
    cards.forEach(card => {
      const cardIndex = playerHand.indexOf(card);
      if (cardIndex > -1) {
        playerHand.splice(cardIndex, 1);
      }
    });

    // Update game state
    gameState.tableCards = cards;
    gameState.lastPlayedBy = playerName;

    // Check if player won (no cards left)
    if (playerHand.length === 0) {
      io.emit('gameMessage', `${playerName} wins the game!`);
      // Reset game state for new game
      gameState.started = false;
      gameState.players = {};
      gameState.playerOrder = [];
      return;
    }

    // Move to next turn
    nextTurn();

    // Notify all players
    io.emit('cardsPlayed', {
      playerName,
      cards,
      nextPlayer: gameState.players[gameState.playerOrder[gameState.currentPlayerIndex]].name
    });
  });

  socket.on('pass', () => {
    const playerId = socket.id;
    const playerName = gameState.players[playerId]?.name;
    
    if (!playerName || gameState.playerOrder[gameState.currentPlayerIndex] !== playerId) {
      return; // Not this player's turn
    }

    // Clear table if everyone has passed
    if (gameState.lastPlayedBy === "") {
      // This is the first pass, clear the table
      gameState.tableCards = [];
    }

    // Move to next turn
    nextTurn();

    // Notify all players
    io.emit('playerPassed', {
      playerName,
      nextPlayer: gameState.players[gameState.playerOrder[gameState.currentPlayerIndex]].name
    });
  });

  function startGame() {
    gameState.started = true;
    gameState.deck = shuffleDeck();
    const hands = dealCards(gameState.deck, 3);
    gameState.currentPlayerIndex = 0;
    gameState.tableCards = [];
    gameState.lastPlayedBy = "";

    gameState.playerOrder.forEach((id, index) => {
      gameState.players[id].hand = hands[index];
      io.to(id).emit('startGame', {
        hand: hands[index],
        yourTurn: index === 0
      });
    });

    io.emit('gameMessage', `${gameState.players[gameState.playerOrder[0]].name}'s turn`);
  }

  function nextTurn() {
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.playerOrder.length;
    const currentPlayerId = gameState.playerOrder[gameState.currentPlayerIndex];
    const currentPlayerName = gameState.players[currentPlayerId].name;
    
    io.emit('turnUpdate', { currentPlayer: currentPlayerName });
    io.emit('gameMessage', `${currentPlayerName}'s turn`);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});