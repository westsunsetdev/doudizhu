import React, { useEffect, useState } from "react";
import io from "socket.io-client";
import "./App.css";

const socket = io(
  "https://5838ae2e-a904-45d9-b4ea-0cfac1ad43bb-00-12jnvqrv7ilzh.kirk.replit.dev/",
  // `${window.location.protocol}//${window.location.hostname}:3001`,
  {
    transports: ["websocket", "polling"],
    forceNew: true,
  }
);

function App() {
  const [name, setName] = useState("");
  const [hand, setHand] = useState([]);
  const [gamePhase, setGamePhase] = useState("LOGIN"); // LOGIN, LOBBY, DEALING, PLAYING
  const [message, setMessage] = useState("");
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [isChooser, setIsChooser] = useState(false);
  const [faceUpInfo, setFaceUpInfo] = useState(null);
  const [playerList, setPlayerList] = useState([]);
  const [roomName, setRoomName] = useState("The Pitstop");

  useEffect(() => {
    socket.on("initialDeal", ({ hand, faceUpInfo }) => {
      setHand(hand);
      setFaceUpInfo(faceUpInfo);
      setGamePhase("DEALING");
      setMessage(`${faceUpInfo.player} drew ${faceUpInfo.card}`);
    });

    socket.on("promptBottom", () => {
      setIsChooser(true);
    });

    socket.on("startGame", ({ hand, yourTurn }) => {
      setHand(hand);
      setIsMyTurn(yourTurn);
      setIsChooser(false);
      setGamePhase("PLAYING");
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

    return () => {
      socket.off("initialDeal");
      socket.off("promptBottom");
      socket.off("startGame");
      socket.off("gameMessage");
      socket.off("playerList");
      socket.off("gamePaused");
      socket.off("roomFull");
    };
  }, []);

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

  const decideBottom = (take) => {
    setIsChooser(false);
    socket.emit("bottomDecision", take);
  };

  const getCardImage = (card) => {
    if (card === "back") return "/playing_card_images/back.svg";
    if (card === "JOKER-HIGH") return "/playing_card_images/black_joker.svg";
    if (card === "JOKER-LOW") return "/playing_card_images/red_joker.svg";
    const suitMap = { "♠": "spades", "♣": "clubs", "♦": "diamonds", "♥": "hearts" };
    const rankMap = {
      A: "ace",
      K: "king",
      Q: "queen",
      J: "jack",
      "10": "10",
      "9": "9",
      "8": "8",
      "7": "7",
      "6": "6",
      "5": "5",
      "4": "4",
      "3": "3",
      "2": "2",
    };
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    return `/playing_card_images/${rankMap[rank]}_of_${suitMap[suit]}.svg`;
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
      ) : gamePhase === "DEALING" ? (
        <div className="game-container">
          <header className="game-header">
            <h1 className="game-title-small">斗地主 - {roomName}</h1>
            <div className="game-status">
              {faceUpInfo && (
                <div className="faceup-info">
                  <span>{faceUpInfo.player} drew </span>
                  <img src={getCardImage(faceUpInfo.card)} alt={faceUpInfo.card} />
                </div>
              )}
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
                  <div className="player-avatar">{playerName.charAt(0).toUpperCase()}</div>
                  <span className="player-name">{playerName}</span>
                  {playerName === name && <span className="you-label">(You)</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="hand-section">
            <h3>Your Hand</h3>
            <div className="cards-container">
              {hand.map((card, index) => (
                <div key={index} className="playing-card">
                  <img src={getCardImage(card)} alt={card} />
                </div>
              ))}
            </div>
          </div>

          {isChooser && (
            <div className="game-actions">
              <button className="action-button" onClick={() => decideBottom(true)}>
                Take Cards
              </button>
              <button
                className="action-button secondary"
                onClick={() => decideBottom(false)}
              >
                Pass
              </button>
            </div>
          )}
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

          <div className="hand-section">
            <h3>Your Hand</h3>
            <div className="cards-container">
              {hand.length > 0 ? (
                hand.map((card, index) => (
                  <div key={index} className="playing-card">
                    <img src={getCardImage(card)} alt={card} />
                  </div>
                ))
              ) : (
                <p className="no-cards">Waiting for cards...</p>
              )}
            </div>
          </div>

          <div className="game-actions">
            <button className="action-button" disabled={!isMyTurn}>
              Play Cards
            </button>
            <button className="action-button secondary" disabled={!isMyTurn}>
              Pass
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
