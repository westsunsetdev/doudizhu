import React, { useEffect, useState } from "react";
import io from "socket.io-client";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
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
  const [currentTurnPlayer, setCurrentTurnPlayer] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isMyPickupTurn, setIsMyPickupTurn] = useState(false);

  useEffect(() => {
    // Request player list periodically when in lobby
    const interval = setInterval(() => {
      if (gamePhase === "LOBBY") {
        socket.emit("requestPlayerList");
      }
    }, 2000);

    socket.on("initialDeal", ({ hand }) => {
      setHand(hand);
      setGamePhase("PICKING");
      setIsMyTurn(false);
      setIsMyPickupTurn(false);
      setSelectedCards([]);
      setTableCards([]);
    });

    socket.on("pickupTurn", ({ playerName }) => {
      setCurrentTurnPlayer(playerName);
      setIsMyPickupTurn(playerName === name);
    });

    socket.on("startGame", ({ hand, yourTurn }) => {
      setHand(hand);
      setIsMyTurn(yourTurn);
      setIsMyPickupTurn(false);
      setGamePhase("PLAYING");
      setSelectedCards([]);
      setTableCards([]);
      // The turnUpdate event will set the current turn player
    });

    socket.on("gameMessage", setMessage);

    socket.on("playerList", (data) => {
      console.log("Received player list:", data); // Debug log
      console.log("Current game phase:", gamePhase); // Debug log
      console.log("Setting player list to:", data.players || []); // Debug log
      setPlayerList(data.players || []);
      setRoomName(data.roomName);
    });

    socket.on("gamePaused", (player) => {
      alert(`${player} disconnected. Game paused.`);
    });

    socket.on("gameReset", ({ message }) => {
      setGamePhase("LOBBY");
      setHand([]);
      setSelectedCards([]);
      setTableCards([]);
      setLastPlayedBy("");
      setCurrentTurnPlayer("");
      setIsMyTurn(false);
      alert(message);
    });

    socket.on("roomFull", (data) => {
      alert(`${data.roomName} is currently full! Please try again later.`);
      setGamePhase("LOGIN");
    });

    socket.on("cardsPlayed", ({ playerName, cards, nextPlayer }) => {
      setTableCards(cards);
      setLastPlayedBy(playerName);
      setIsMyTurn(nextPlayer === name);
    });

    socket.on("playerPassed", ({ playerName, nextPlayer, consecutivePasses, tableCleared }) => {
      if (tableCleared) {
        setLastPlayedBy("");
        setTableCards([]);
      }
      setIsMyTurn(nextPlayer === name);
    });

    socket.on("turnUpdate", ({ currentPlayer }) => {
      setIsMyTurn(currentPlayer === name);
      setCurrentTurnPlayer(currentPlayer);
    });

    socket.on("invalidPlay", ({ message }) => {
      setErrorMessage(message);
      // Clear error message after 3 seconds
      setTimeout(() => setErrorMessage(""), 3000);
    });

    return () => {
      clearInterval(interval);
      socket.off("initialDeal");
      socket.off("pickupTurn");
      socket.off("startGame");
      socket.off("gameMessage");
      socket.off("playerList");
      socket.off("gamePaused");
      socket.off("gameReset");
      socket.off("roomFull");
      socket.off("cardsPlayed");
      socket.off("playerPassed");
      socket.off("turnUpdate");
      socket.off("invalidPlay");
    };
  }, [name]);

  const joinGame = () => {
    if (name.trim()) {
      socket.emit("joinGame", name.trim());
      setGamePhase("LOBBY");
      // Request current player list after joining
      setTimeout(() => {
        socket.emit("requestPlayerList");
      }, 100);
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

  const handleTakeBottom = () => {
    if (!isMyPickupTurn) return;
    socket.emit('pickupDecision', { take: true });
  };

  const handlePassBottom = () => {
    if (!isMyPickupTurn) return;
    socket.emit('pickupDecision', { take: false });
  };

  const getCardValue = (card) => {
    const rank = card.replace(/[♠♣♦♥]/g, '');
    
    if (rank === 'JOKER-HIGH') return 16;
    if (rank === 'JOKER-LOW') return 15;
    if (rank === '2') return 14;
    if (rank === 'A') return 13;
    if (rank === 'K') return 12;
    if (rank === 'Q') return 11;
    if (rank === 'J') return 10;
    if (rank === '10') return 9;
    if (rank === '9') return 8;
    if (rank === '8') return 7;
    if (rank === '7') return 6;
    if (rank === '6') return 5;
    if (rank === '5') return 4;
    if (rank === '4') return 3;
    if (rank === '3') return 2;
    
    return 1; // fallback
  };

  const getCardImage = (card) => {
    const rank = card.replace(/[♠♣♦♥]/g, '');
    const suit = card.match(/[♠♣♦♥]/)?.[0] || '';
    
    // Handle jokers
    if (rank === 'JOKER-HIGH') return '/playing_card_images/black_joker.svg';
    if (rank === 'JOKER-LOW') return '/playing_card_images/red_joker.svg';
    
    // Map suits to their names
    const suitMap = {
      '♠': 'spades',
      '♣': 'clubs', 
      '♦': 'diamonds',
      '♥': 'hearts'
    };
    
    const suitName = suitMap[suit];
    if (!suitName) return '/playing_card_images/back.svg'; // fallback
    
    // Map ranks to their names
    const rankMap = {
      'A': 'ace',
      'K': 'king',
      'Q': 'queen',
      'J': 'jack',
      '10': '10',
      '9': '9',
      '8': '8',
      '7': '7',
      '6': '6',
      '5': '5',
      '4': '4',
      '3': '3',
      '2': '2'
    };
    
    const rankName = rankMap[rank];
    if (!rankName) return '/playing_card_images/back.svg'; // fallback
    
    return `/playing_card_images/${rankName}_of_${suitName}.svg`;
  };

  const sortHandLowToHigh = () => {
    const sortedHand = [...hand].sort((a, b) => getCardValue(a) - getCardValue(b));
    setHand(sortedHand);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(hand);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setHand(items);
    
    // Update selected cards indices after reordering
    setSelectedCards(prev => {
      const newSelected = [];
      selectedCards.forEach(oldIndex => {
        const card = hand[oldIndex];
        const newIndex = items.findIndex(item => item === card);
        if (newIndex !== -1) {
          newSelected.push(newIndex);
        }
      });
      return newSelected;
    });
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="app">
        <div className="background-pattern"></div>

      {gamePhase === "LOGIN" ? (
        <div className="login-container">
          <div className="login-card">
            <h1 className="game-title">Dou Dizhu</h1>
            <h2 className="game-subtitle">v1</h2>
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
            <h1 className="game-title-small">Dou Dizhu - {roomName}</h1>
            <div className="game-status">
              <p className="status-message">Waiting for players to join...</p>
            </div>
          </header>

          <div className="players-section">
            <h3>Players ({playerList.length}/3)</h3>
            {console.log("Rendering lobby with playerList:", playerList)}
            <div className="players-list">
              {playerList.map((player, index) => (
                <div
                  key={index}
                  className={`player-card ${player.name === name ? "current-player" : ""}`}
                >
                  <div className="player-avatar">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="player-name">{player.name}</span>
                  {player.name === name && (
                    <span className="you-label">(You)</span>
                  )}
                  <span className="card-count">{player.cardCount} cards</span>
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
      ) : gamePhase === "PICKING" ? (
        <div className="game-container">
          <header className="game-header">
            <h1 className="game-title-small">Dou Dizhu - {roomName}</h1>
            <div className="game-status">
              {message && <p className="status-message">{message}</p>}
            </div>
          </header>

          <div className="players-section">
            <div>
              <h3>Players ({playerList.length}/3) - {currentTurnPlayer}'s decision</h3>
              <div className="players-list">
                {playerList.map((player, index) => (
                  <div
                    key={index}
                    className={`player-card ${player.name === currentTurnPlayer ? "active-turn" : ""}`}
                  >
                    <div className="player-avatar">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="player-name">{player.name}</span>
                    {player.name === name && (
                      <span className="you-label">(You)</span>
                    )}
                    <span className="card-count">{player.cardCount} cards</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="table-section">
              <h3>Table</h3>
              <div className="cards-container table-cards">
                {[...Array(3)].map((_, index) => (
                  <div key={index} className="playing-card table-card">
                    <img
                      src="/playing_card_images/back.svg"
                      alt="Face down card"
                      className="card-image"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="game-actions">
            <button
              className="action-button"
              disabled={!isMyPickupTurn}
              onClick={handleTakeBottom}
            >
              Take Cards
            </button>
            <button
              className="action-button secondary"
              disabled={!isMyPickupTurn}
              onClick={handlePassBottom}
            >
              Pass
            </button>
          </div>

          <div className="hand-section">
            <h3>Your Hand</h3>
            <Droppable droppableId="hand" direction="horizontal">
              {(provided) => (
                <div
                  className="cards-container"
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                >
                  {hand.length > 0 ? (
                    hand.map((card, index) => (
                      <Draggable key={`${card}-${index}`} draggableId={`${card}-${index}`} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`playing-card ${snapshot.isDragging ? 'dragging' : ''}`}
                          >
                            <img
                              src={getCardImage(card)}
                              alt={card}
                              className="card-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'block';
                              }}
                            />
                            <div className="card-content fallback">{card}</div>
                          </div>
                        )}
                      </Draggable>
                    ))
                  ) : (
                    <p className="no-cards">Waiting for cards...</p>
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      ) : (
        <div className="game-container">
          <header className="game-header">
            <h1 className="game-title-small">Dou Dizhu - {roomName}</h1>
            <div className="game-status">
              {message && <p className="status-message">{message}</p>}
            </div>
          </header>

          <div className="players-section">
            <div>
              <h3>Players ({playerList.length}/3) - {currentTurnPlayer}'s turn</h3>
              <div className="players-list">
                {playerList.map((player, index) => (
                  <div
                    key={index}
                    className={`player-card ${player.name === currentTurnPlayer ? "active-turn" : ""}`}
                  >
                    <div className="player-avatar">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="player-name">{player.name}</span>
                    {player.name === name && (
                      <span className="you-label">(You)</span>
                    )}
                    <span className="card-count">{player.cardCount} cards</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="table-section">
              <h3>Table</h3>
              <div className="cards-container table-cards">
                {tableCards.length > 0 ? (
                  <>
                    {tableCards.map((card, index) => (
                      <div key={index} className="playing-card table-card">
                        <img
                          src={getCardImage(card)}
                          alt={card}
                          className="card-image"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'block';
                          }}
                        />
                        <div className="card-content fallback">{card}</div>
                      </div>
                    ))}
                    <p className="played-by">Played by {lastPlayedBy}</p>
                  </>
                ) : (
                  <p className="no-cards">No cards on table</p>
                )}
              </div>
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
          {errorMessage && (
            <div className="error-message">
              {errorMessage}
            </div>
          )}

          <div className="hand-section">
            <h3>Your Hand</h3>
            <Droppable droppableId="hand" direction="horizontal">
              {(provided) => (
                <div 
                  className="cards-container"
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                >
                  {hand.length > 0 ? (
                    hand.map((card, index) => (
                      <Draggable key={`${card}-${index}`} draggableId={`${card}-${index}`} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`playing-card ${selectedCards.includes(index) ? 'selected' : ''} ${snapshot.isDragging ? 'dragging' : ''}`}
                            onClick={() => handleCardClick(index)}
                          >
                            <img 
                              src={getCardImage(card)} 
                              alt={card}
                              className="card-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'block';
                              }}
                            />
                            <div className="card-content fallback">{card}</div>
                          </div>
                        )}
                      </Draggable>
                    ))
                  ) : (
                    <p className="no-cards">Waiting for cards...</p>
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
            <div className="hand-actions">
              <button 
                className="sort-button" 
                onClick={sortHandLowToHigh}
                disabled={hand.length === 0}
              >
                Sort Low to High
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </DragDropContext>
  );
}

export default App;
