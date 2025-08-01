import React, { useEffect, useState } from "react";
import io from "socket.io-client";
import "./App.css";

const socket = io( 
  // Comment out the version you're not using.
  
  // Replit version:
  // 'https://5838ae2e-a904-45d9-b4ea-0cfac1ad43bb-00-12jnvqrv7ilzh.kirk.replit.dev/',
  
  // Cursor / local version:
  `${window.location.protocol}//${window.location.hostname}:3001`,
  {
    transports: ["websocket", "polling"],
    forceNew: true,
  },
);

function App() {
  const [name, setName] = useState("");
  const [hand, setHand] = useState([]);
  const [gamePhase, setGamePhase] = useState("LOGIN"); // LOGIN, LOBBY, PLAYING
  const [message, setMessage] = useState("");
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [playerList, setPlayerList] = useState([]);
  const [roomName, setRoomName] = useState("The Pitstop");
  const [selectedCards, setSelectedCards] = useState([]);
  const [tableCards, setTableCards] = useState([]);
  const [lastPlayedBy, setLastPlayedBy] = useState("");

  useEffect(() => {
    socket.on("startGame", ({ hand, yourTurn }) => {
      setHand(hand);
      setIsMyTurn(yourTurn);
      setGamePhase("PLAYING");
      setSelectedCards([]);
      setTableCards([]);
    });

    socket.on("gameMessage", setMessage);

    socket.on("playerList", (data) => {
      console.log("Received player list:", data); // Debug log
      console.log("Current game phase:", gamePhase); // Debug log
      setPlayerList(data.players || []);
      setRoomName(data.roomName);
    });

    socket.on("gamePaused", (player) => {
      alert(`${player} disconnected. Game paused.`);
    });

    socket.on("roomFull", (data) => {
      alert(`${data.roomName} is currently full! Please try again later.`);
      setGamePhase("LOGIN");
    });

    socket.on("cardsPlayed", ({ playerName, cards, nextPlayer }) => {
      setTableCards(cards);
      setLastPlayedBy(playerName);
      setIsMyTurn(nextPlayer === name);
      setMessage(`${playerName} played ${cards.length} card(s)`);
    });

    socket.on("playerPassed", ({ playerName, nextPlayer }) => {
      setLastPlayedBy("");
      setTableCards([]);
      setIsMyTurn(nextPlayer === name);
      setMessage(`${playerName} passed`);
    });

    socket.on("turnUpdate", ({ currentPlayer }) => {
      setIsMyTurn(currentPlayer === name);
    });

    return () => {
      socket.off("startGame");
      socket.off("gameMessage");
      socket.off("playerList");
      socket.off("gamePaused");
      socket.off("roomFull");
      socket.off("cardsPlayed");
      socket.off("playerPassed");
      socket.off("turnUpdate");
    };
  }, [name]);

  const joinGame = () => {
    if (name.trim()) {
      socket.emit("joinGame", name.trim());
      setGamePhase("LOBBY");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      joinGame();
    }
  };

  const handleCardClick = (cardIndex) => {
    if (!isMyTurn) return;
    
    setSelectedCards(prev => {
      const isSelected = prev.includes(cardIndex);
      if (isSelected) {
        return prev.filter(index => index !== cardIndex);
      } else {
        return [...prev, cardIndex];
      }
    });
  };

  const handlePlayCards = () => {
    if (!isMyTurn || selectedCards.length === 0) return;
    
    const cardsToPlay = selectedCards.map(index => hand[index]);
    const newHand = hand.filter((_, index) => !selectedCards.includes(index));
    
    socket.emit("playCards", { cards: cardsToPlay });
    setHand(newHand);
    setSelectedCards([]);
  };

  const handlePass = () => {
    if (!isMyTurn) return;
    
    socket.emit("pass");
    setSelectedCards([]);
  };

  return (
    <div className="app">
      <div className="background-pattern"></div>

      {gamePhase === "LOGIN" ? (
        <div className="login-container">
          <div className="login-card">
            <h1 className="game-title">斗地主</h1>
            <h2 className="game-subtitle">Dou Dizhu</h2>
            <p className="room-info">{roomName}</p>

            <div className="input-group">
              <input
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyPress={handleKeyPress}
                className="name-input"
                maxLength="20"
              />
              <button
                onClick={joinGame}
                className="join-button"
                disabled={!name.trim()}
              >
                Join Game
              </button>
            </div>
          </div>
        </div>
      ) : gamePhase === "LOBBY" ? (
        <div className="game-container">
          <header className="game-header">
            <h1 className="game-title-small">斗地主 - {roomName}</h1>
            <div className="game-status">
              <p className="status-message">Waiting for players to join...</p>
            </div>
          </header>

          <div className="players-section">
            <h3>Players ({playerList.length}/3)</h3>
            {console.log("Rendering lobby with playerList:", playerList)}
            <div className="players-list">
              {playerList.map((playerName, index) => (
                <div
                  key={index}
                  className={`player-card ${playerName === name ? "current-player" : ""}`}
                >
                  <div className="player-avatar">
                    {playerName.charAt(0).toUpperCase()}
                  </div>
                  <span className="player-name">{playerName}</span>
                  {playerName === name && (
                    <span className="you-label">(You)</span>
                  )}
                </div>
              ))}
              {[...Array(3 - playerList.length)].map((_, index) => (
                <div key={`waiting-${index}`} className="player-card waiting">
                  <div className="player-avatar waiting-avatar">?</div>
                  <span className="player-name">Waiting...</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lobby-info">
            <p>Game will start automatically when 3 players join!</p>
          </div>
        </div>
      ) : (
        <div className="game-container">
          <header className="game-header">
            <h1 className="game-title-small">斗地主 - {roomName}</h1>
            <div className="game-status">
              {message && <p className="status-message">{message}</p>}
              {isMyTurn && <p className="turn-indicator">🎯 Your Turn!</p>}
            </div>
          </header>

          <div className="players-section">
            <h3>Players ({playerList.length}/3)</h3>
            <div className="players-list">
              {playerList.map((playerName, index) => (
                <div
                  key={index}
                  className={`player-card ${playerName === name ? "current-player" : ""}`}
                >
                  <div className="player-avatar">
                    {playerName.charAt(0).toUpperCase()}
                  </div>
                  <span className="player-name">{playerName}</span>
                  {playerName === name && (
                    <span className="you-label">(You)</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {tableCards.length > 0 && (
            <div className="table-section">
              <h3>Table - {lastPlayedBy}</h3>
              <div className="cards-container table-cards">
                {tableCards.map((card, index) => (
                  <div key={index} className="playing-card table-card">
                    <div className="card-content">{card}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="hand-section">
            <h3>Your Hand</h3>
            <div className="cards-container">
              {hand.length > 0 ? (
                hand.map((card, index) => (
                  <div 
                    key={index} 
                    className={`playing-card ${selectedCards.includes(index) ? 'selected' : ''}`}
                    onClick={() => handleCardClick(index)}
                  >
                    <div className="card-content">{card}</div>
                  </div>
                ))
              ) : (
                <p className="no-cards">Waiting for cards...</p>
              )}
            </div>
          </div>

          <div className="game-actions">
            <button 
              className="action-button" 
              disabled={!isMyTurn || selectedCards.length === 0}
              onClick={handlePlayCards}
            >
              Play Cards ({selectedCards.length})
            </button>
            <button 
              className="action-button secondary" 
              disabled={!isMyTurn}
              onClick={handlePass}
            >
              Pass
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
