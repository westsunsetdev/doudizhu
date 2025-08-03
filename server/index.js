
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { shuffleDeck, dealCards } = require('./game/deck');
const { canPlayCards, identifyCardType } = require('./game/rules');

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
  currentPlayerIndex: 0,
  consecutivePasses: 0
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
      players: Object.values(gameState.players).map(p => ({ name: p.name, cardCount: p.hand.length })),
      roomName: ROOM_NAME
    };
    console.log('Broadcasting player list to all clients:', playerData);
    io.emit('playerList', playerData);

    // Also send specifically to the joining user immediately
    console.log('Sending player list to joining user:', playerData);
    socket.emit('playerList', playerData);

    if (Object.keys(gameState.players).length === MAX_PLAYERS) {
      startGame();
    }
  });

  socket.on('requestPlayerList', () => {
    const playerData = {
      players: Object.values(gameState.players).map(p => ({ name: p.name, cardCount: p.hand.length })),
      roomName: ROOM_NAME
    };
    console.log('Sending player list on request:', playerData);
    socket.emit('playerList', playerData);
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    const disconnectedPlayerName = gameState.players[socket.id]?.name || 'A player';
    
    // Remove the disconnected player from the game state
    delete gameState.players[socket.id];
    const playerIndex = gameState.playerOrder.indexOf(socket.id);
    if (playerIndex > -1) {
      gameState.playerOrder.splice(playerIndex, 1);
    }
    
    // If game was in progress, reset it
    if (gameState.started) {
      gameState.started = false;
      gameState.deck = [];
      gameState.tableCards = [];
      gameState.lastPlayedBy = "";
      gameState.currentPlayerIndex = 0;
      gameState.consecutivePasses = 0;
      
      io.emit('gameReset', { message: `${disconnectedPlayerName} disconnected. Game reset.` });
    }
    
    // Update remaining players
    if (Object.keys(gameState.players).length > 0) {
      const playerData = {
        players: Object.values(gameState.players).map(p => ({ name: p.name, cardCount: p.hand.length })),
        roomName: ROOM_NAME
      };
      io.emit('playerList', playerData);
    }
    
    io.emit('gamePaused', disconnectedPlayerName);
  });

  socket.on('playCards', ({ cards }) => {
    const playerId = socket.id;
    const playerName = gameState.players[playerId]?.name;
    
    if (!playerName || gameState.playerOrder[gameState.currentPlayerIndex] !== playerId) {
      return; // Not this player's turn
    }

    // Validate the card combination
    const isFirstPlay = gameState.tableCards.length === 0;
    const isValidPlay = canPlayCards(cards, gameState.tableCards, isFirstPlay);
    
    if (!isValidPlay) {
      socket.emit('invalidPlay', { 
        message: 'Invalid card combination or cannot beat the previous play' 
      });
      return;
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
    gameState.consecutivePasses = 0; // Reset consecutive passes when cards are played

    // Check if player won (no cards left)
    if (playerHand.length === 0) {
      io.emit('gameMessage', `${playerName} wins the game!`);
      // Reset game state for new game
      gameState.started = false;
      gameState.players = {};
      gameState.playerOrder = [];
      return;
    }

    // Update player list with current card counts
    const playerData = {
      players: Object.values(gameState.players).map(p => ({ name: p.name, cardCount: p.hand.length })),
      roomName: ROOM_NAME
    };
    io.emit('playerList', playerData);

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

    // Increment consecutive passes
    gameState.consecutivePasses++;

    // Check if table should be cleared (before resetting)
    const shouldClearTable = gameState.consecutivePasses >= 2;

    // Clear table only after 2 consecutive passes
    if (shouldClearTable) {
      gameState.tableCards = [];
      gameState.lastPlayedBy = "";
      gameState.consecutivePasses = 0;
    }

    // Move to next turn
    nextTurn();

    // Notify all players
    io.emit('playerPassed', {
      playerName,
      nextPlayer: gameState.players[gameState.playerOrder[gameState.currentPlayerIndex]].name,
      consecutivePasses: gameState.consecutivePasses,
      tableCleared: shouldClearTable
    });
  });

  function startGame() {
    gameState.started = true;
    gameState.deck = shuffleDeck();
    const hands = dealCards(gameState.deck, 3);
    gameState.currentPlayerIndex = 0;
    gameState.tableCards = [];
    gameState.lastPlayedBy = "";
    gameState.consecutivePasses = 0;

    gameState.playerOrder.forEach((id, index) => {
      gameState.players[id].hand = hands[index];
      io.to(id).emit('startGame', {
        hand: hands[index],
        yourTurn: index === 0
      });
    });

    // Update player list with card counts after dealing
    const playerData = {
      players: Object.values(gameState.players).map(p => ({ name: p.name, cardCount: p.hand.length })),
      roomName: ROOM_NAME
    };
    io.emit('playerList', playerData);

    io.emit('turnUpdate', { currentPlayer: gameState.players[gameState.playerOrder[0]].name });
  }

  function nextTurn() {
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.playerOrder.length;
    const currentPlayerId = gameState.playerOrder[gameState.currentPlayerIndex];
    const currentPlayerName = gameState.players[currentPlayerId].name;
    
    io.emit('turnUpdate', { currentPlayer: currentPlayerName });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});