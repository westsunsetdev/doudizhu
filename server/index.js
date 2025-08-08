const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { shuffleDeckWithFaceUp } = require("./game/deck");
const { canPlayCards, identifyCardType } = require("./game/rules");

const app = express();

// Add a simple route handler for the root path
app.get("/", (req, res) => {
  res.send(
    "Dou Dizhu Game Server is running. Connect via the client application.",
  );
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for now
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3001;

const ROOM_NAME = "The Pitstop";
const MAX_PLAYERS = 3;

let gameState = {
  players: {}, // socketId -> { name, hand, points }
  playerOrder: [],
  currentTurn: 0,
  deck: [],
  started: false,
  tableCards: [],
  lastPlayedBy: "",
  currentPlayerIndex: 0,
  consecutivePasses: 0,
  bottomCards: [],
  faceUpCard: "",
  pickUpIndex: 0,
  pickUpAttempts: 0,
  initialPickUpIndex: 0,
  handsRevealed: false,
  landlordId: null,
  wagerMultiplier: 1,
  paused: false,
  disconnectedPlayer: null,
  pauseTimer: null,
};

function getWager() {
  return {
    landlord: 2 * gameState.wagerMultiplier,
    farmer: 1 * gameState.wagerMultiplier,
  };
}

function broadcastWager() {
  io.emit("wagerUpdate", getWager());
}

function getPlayerData() {
  return {
    players: gameState.playerOrder.map((id) => ({
      name: gameState.players[id].name,
      cardCount: gameState.players[id].hand.length,
      points: gameState.players[id].points,
    })),
    roomName: ROOM_NAME,
    landlord: gameState.landlordId
      ? gameState.players[gameState.landlordId].name
      : null,
  };
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("joinGame", (playerName) => {
    console.log(
      `${playerName} attempting to join. Current players: ${Object.keys(gameState.players).length}`,
    );

    // Handle rejoining when game is paused
    if (
      gameState.paused &&
      gameState.disconnectedPlayer &&
      gameState.disconnectedPlayer.name === playerName
    ) {
      const oldId = gameState.disconnectedPlayer.id;
      const playerData = gameState.players[oldId];
      gameState.players[socket.id] = playerData;
      delete gameState.players[oldId];
      const idx = gameState.playerOrder.indexOf(oldId);
      if (idx !== -1) gameState.playerOrder[idx] = socket.id;
      if (gameState.landlordId === oldId) gameState.landlordId = socket.id;
      gameState.disconnectedPlayer = null;
      gameState.paused = false;
      if (gameState.pauseTimer) {
        clearTimeout(gameState.pauseTimer);
        gameState.pauseTimer = null;
      }
      const currentPlayerName =
        gameState.players[gameState.playerOrder[gameState.currentPlayerIndex]]
          .name;
      socket.emit("rejoinState", {
        hand: playerData.hand,
        tableCards: gameState.tableCards,
        lastPlayedBy: gameState.lastPlayedBy,
        currentPlayer: currentPlayerName,
        playerList: getPlayerData().players,
        landlord: gameState.landlordId
          ? gameState.players[gameState.landlordId].name
          : null,
        wager: getWager(),
      });
      io.emit("playerList", getPlayerData());
      broadcastWager();
      io.emit("gameResumed", playerName);
      io.emit("turnUpdate", { currentPlayer: currentPlayerName });
      return;
    }

    if (Object.keys(gameState.players).length >= MAX_PLAYERS) {
      socket.emit("roomFull", { roomName: ROOM_NAME });
      return;
    }

    gameState.players[socket.id] = { name: playerName, hand: [], points: 0 };
    gameState.playerOrder.push(socket.id);

    const playerData = getPlayerData();
    io.emit("playerList", playerData);
    broadcastWager();

    socket.emit("playerList", playerData);
    socket.emit("wagerUpdate", getWager());

    if (Object.keys(gameState.players).length === MAX_PLAYERS) {
      startGame();
    }
  });

  socket.on("requestPlayerList", () => {
    const playerData = getPlayerData();
    console.log("Sending player list on request:", playerData);
    socket.emit("playerList", playerData);
    socket.emit("wagerUpdate", getWager());
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    const disconnectedPlayerName =
      gameState.players[socket.id]?.name || "A player";

    if (gameState.started && gameState.players[socket.id]) {
      gameState.paused = true;
      gameState.disconnectedPlayer = {
        id: socket.id,
        name: disconnectedPlayerName,
      };
      io.emit("gamePaused", { player: disconnectedPlayerName, countdown: 60 });
      io.emit("playerList", getPlayerData());
    } else {
      delete gameState.players[socket.id];
      const playerIndex = gameState.playerOrder.indexOf(socket.id);
      if (playerIndex > -1) {
        gameState.playerOrder.splice(playerIndex, 1);
      }

      const playerData = getPlayerData();
      io.emit("playerList", playerData);
    }
  });

  socket.on("playCards", ({ cards }) => {
    const playerId = socket.id;
    const playerName = gameState.players[playerId]?.name;

    if (gameState.paused) {
      return;
    }

    if (
      !playerName ||
      gameState.playerOrder[gameState.currentPlayerIndex] !== playerId
    ) {
      return; // Not this player's turn
    }

    // Validate the card combination
    const isFirstPlay = gameState.tableCards.length === 0;
    const isValidPlay = canPlayCards(cards, gameState.tableCards, isFirstPlay);

    if (!isValidPlay) {
      socket.emit("invalidPlay", {
        message: "Invalid card combination or cannot beat the previous play",
      });
      return;
    }

    const playType = identifyCardType(cards);

    // Remove cards from player's hand
    const playerHand = gameState.players[playerId].hand;
    cards.forEach((card) => {
      const cardIndex = playerHand.indexOf(card);
      if (cardIndex > -1) {
        playerHand.splice(cardIndex, 1);
      }
    });

    if (playType.type === "bomb" || playType.type === "rocket") {
      gameState.wagerMultiplier *= 2;
      broadcastWager();
    }

    // Update game state
    gameState.tableCards = cards;
    gameState.lastPlayedBy = playerName;
    gameState.consecutivePasses = 0; // Reset consecutive passes when cards are played

    // Check if player won (no cards left)
    if (playerHand.length === 0) {
      // Broadcast the final play so it remains visible on the table
      io.emit("cardsPlayed", {
        playerName,
        cards,
        nextPlayer: "",
      });
      io.emit("gameMessage", `${playerName} wins the game!`);
      endRound(playerId);
      return;
    }

    // Update player list with current card counts
    const playerData = getPlayerData();
    io.emit("playerList", playerData);

    // Move to next turn
    nextTurn();

    // Notify all players
    io.emit("cardsPlayed", {
      playerName,
      cards,
      nextPlayer:
        gameState.players[gameState.playerOrder[gameState.currentPlayerIndex]]
          .name,
    });
  });

  socket.on("pass", () => {
    const playerId = socket.id;
    const playerName = gameState.players[playerId]?.name;

    if (gameState.paused) {
      return;
    }

    if (
      !playerName ||
      gameState.playerOrder[gameState.currentPlayerIndex] !== playerId
    ) {
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
    io.emit("playerPassed", {
      playerName,
      nextPlayer:
        gameState.players[gameState.playerOrder[gameState.currentPlayerIndex]]
          .name,
      consecutivePasses: gameState.consecutivePasses,
      tableCleared: shouldClearTable,
    });
  });

  socket.on("pickupDecision", ({ take }) => {
    const playerId = socket.id;
    const playerIndex = gameState.playerOrder.indexOf(playerId);
    if (playerIndex !== gameState.pickUpIndex || gameState.started) return;

    if (take) {
      assignBottom(playerIndex, false);
    } else {
      io.emit(
        "gameMessage",
        `${gameState.players[playerId].name} passed on the bottom cards`,
      );
      gameState.pickUpAttempts++;
      if (!gameState.handsRevealed) {
        if (gameState.pickUpAttempts >= 3) {
          revealHands();
          gameState.handsRevealed = true;
          gameState.pickUpIndex = gameState.initialPickUpIndex;
          gameState.pickUpAttempts = 0;
          promptPickup();
        } else {
          gameState.pickUpIndex =
            (gameState.pickUpIndex + 1) % gameState.playerOrder.length;
          promptPickup();
        }
      } else {
        if (gameState.pickUpAttempts >= 2) {
          const nextIndex =
            (gameState.pickUpIndex + 1) % gameState.playerOrder.length;
          assignBottom(nextIndex, true);
        } else {
          gameState.pickUpIndex =
            (gameState.pickUpIndex + 1) % gameState.playerOrder.length;
          promptPickup();
        }
      }
    }
  });

  socket.on("resetGame", () => {
    if (!gameState.paused) return;

    if (gameState.disconnectedPlayer) {
      const oldId = gameState.disconnectedPlayer.id;
      delete gameState.players[oldId];
      const idx = gameState.playerOrder.indexOf(oldId);
      if (idx > -1) gameState.playerOrder.splice(idx, 1);
      gameState.disconnectedPlayer = null;
    }

    Object.keys(gameState.players).forEach((id) => {
      gameState.players[id].hand = [];
      gameState.players[id].points = 0;
    });

    gameState.started = false;
    gameState.deck = [];
    gameState.tableCards = [];
    gameState.lastPlayedBy = "";
    gameState.currentPlayerIndex = 0;
    gameState.consecutivePasses = 0;
    gameState.bottomCards = [];
    gameState.faceUpCard = "";
    gameState.pickUpIndex = 0;
    gameState.pickUpAttempts = 0;
    gameState.initialPickUpIndex = 0;
    gameState.handsRevealed = false;
    gameState.landlordId = null;
    gameState.wagerMultiplier = 1;
    gameState.paused = false;
    if (gameState.pauseTimer) {
      clearTimeout(gameState.pauseTimer);
      gameState.pauseTimer = null;
    }
    broadcastWager();
    const playerData = getPlayerData();
    io.emit("gameReset", { message: "Game has been reset." });
    io.emit("playerList", playerData);
  });

  socket.on("startNextGame", () => {
    if (
      gameState.deck.length === 0 &&
      Object.keys(gameState.players).length === MAX_PLAYERS &&
      !gameState.started
    ) {
      startGame();
    }
  });

  function endRound(winnerId) {
    const landlordId = gameState.landlordId;
    if (landlordId) {
      const landlordPoints = 2 * gameState.wagerMultiplier;
      const farmerPoints = 1 * gameState.wagerMultiplier;
      if (winnerId === landlordId) {
        gameState.players[landlordId].points += landlordPoints;
        gameState.playerOrder.forEach((id) => {
          if (id !== landlordId) gameState.players[id].points -= farmerPoints;
        });
      } else {
        gameState.players[landlordId].points -= landlordPoints;
        gameState.playerOrder.forEach((id) => {
          if (id !== landlordId) gameState.players[id].points += farmerPoints;
        });
      }
    }

    gameState.playerOrder.forEach((id) => {
      gameState.players[id].hand = [];
      io.to(id).emit("handReveal", { hand: [] });
    });

    const playerData = getPlayerData();
    io.emit("playerList", playerData);

    gameState.started = false;
    gameState.deck = [];
    gameState.tableCards = [];
    gameState.lastPlayedBy = "";
    gameState.currentPlayerIndex = 0;
    gameState.consecutivePasses = 0;
    gameState.bottomCards = [];
    gameState.faceUpCard = "";
    gameState.pickUpIndex = 0;
    gameState.pickUpAttempts = 0;
    gameState.initialPickUpIndex = 0;
    gameState.handsRevealed = false;
    gameState.wagerMultiplier = 1;
    broadcastWager();

    const winnerName = gameState.players[winnerId].name;
    io.emit("roundOver", { winner: winnerName });
  }

  function startGame() {
    gameState.started = false;
    gameState.wagerMultiplier = 1;
    gameState.landlordId = null;
    const { deck, faceUpIndex, faceUpCard } = shuffleDeckWithFaceUp();
    gameState.deck = deck;
    gameState.faceUpCard = faceUpCard;
    gameState.tableCards = [];
    gameState.lastPlayedBy = "";
    gameState.consecutivePasses = 0;
    gameState.currentPlayerIndex = 0;

    const hands = [[], [], []];
    let faceUpPlayerIndex = 0;
    for (let i = 0; i < 51; i++) {
      const card = deck[i];
      const playerIdx = i % 3;
      if (i === faceUpIndex) faceUpPlayerIndex = playerIdx;
      hands[playerIdx].push(card);
    }
    gameState.bottomCards = deck.slice(51);

    gameState.playerOrder.forEach((id, index) => {
      gameState.players[id].hand = hands[index];
      const concealed = hands[index].map((card) =>
        index === faceUpPlayerIndex && card === faceUpCard ? card : "BACK",
      );
      io.to(id).emit("initialDeal", { hand: concealed });
    });

    const faceUpPlayerName =
      gameState.players[gameState.playerOrder[faceUpPlayerIndex]].name;
    io.emit(
      "gameMessage",
      `${faceUpPlayerName} received the ${faceUpCard} face up`,
    );

    const playerData = getPlayerData();
    io.emit("playerList", playerData);

    gameState.pickUpIndex = faceUpPlayerIndex;
    gameState.initialPickUpIndex = faceUpPlayerIndex;
    gameState.pickUpAttempts = 0;
    gameState.handsRevealed = false;
    promptPickup();
    broadcastWager();
  }

  function nextTurn() {
    gameState.currentPlayerIndex =
      (gameState.currentPlayerIndex + 1) % gameState.playerOrder.length;
    const currentPlayerId = gameState.playerOrder[gameState.currentPlayerIndex];
    const currentPlayerName = gameState.players[currentPlayerId].name;

    io.emit("turnUpdate", { currentPlayer: currentPlayerName });
  }

  function promptPickup() {
    const playerId = gameState.playerOrder[gameState.pickUpIndex];
    const playerName = gameState.players[playerId].name;
    io.emit("pickupTurn", { playerName });
  }

  function revealHands() {
    gameState.playerOrder.forEach((id) => {
      io.to(id).emit("handReveal", { hand: gameState.players[id].hand });
    });
    io.emit("gameMessage", "All hands have been revealed");
  }

  function assignBottom(playerIndex, forced) {
    const playerId = gameState.playerOrder[playerIndex];
    const playerName = gameState.players[playerId].name;
    const pickedUp = [...gameState.bottomCards];
    gameState.players[playerId].hand.push(...pickedUp);
    gameState.bottomCards = [];
    gameState.currentPlayerIndex = playerIndex;
    gameState.started = true;
    gameState.landlordId = playerId;
    if (!forced && !gameState.handsRevealed) {
      gameState.wagerMultiplier *= 2;
      broadcastWager();
    }

    const publicMessage = `${playerName} ${forced ? "was forced to pick up" : "picked up"} the bottom cards`;
    const cardDetails = ` (${pickedUp.join(", ")})`;
    io.emit(
      "gameMessage",
      gameState.handsRevealed ? publicMessage + cardDetails : publicMessage,
    );
    if (!gameState.handsRevealed) {
      io.to(playerId).emit("gameMessage", publicMessage + cardDetails);
    }

    gameState.playerOrder.forEach((id, idx) => {
      io.to(id).emit("startGame", {
        hand: gameState.players[id].hand,
        yourTurn: idx === gameState.currentPlayerIndex,
      });
    });

    const playerData = getPlayerData();
    io.emit("playerList", playerData);

    const currentPlayerName =
      gameState.players[gameState.playerOrder[gameState.currentPlayerIndex]]
        .name;
    io.emit("turnUpdate", { currentPlayer: currentPlayerName });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
