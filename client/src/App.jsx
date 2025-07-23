
import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io(`${window.location.protocol}//${window.location.hostname}:3001`);

function App() {
  const [name, setName] = useState('');
  const [hand, setHand] = useState([]);
  const [joined, setJoined] = useState(false);
  const [message, setMessage] = useState('');
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [playerList, setPlayerList] = useState([]);
  const [roomId] = useState(Math.floor(Math.random() * 10000));

  useEffect(() => {
    socket.on('startGame', ({ hand, yourTurn }) => {
      setHand(hand);
      setIsMyTurn(yourTurn);
    });

    socket.on('gameMessage', setMessage);

    socket.on('playerList', (players) => {
      setPlayerList(players);
    });

    socket.on('gamePaused', (player) => {
      alert(`${player} disconnected. Game paused.`);
    });

    socket.on('roomFull', () => {
      alert('Room is full! Please try again later.');
      setJoined(false);
    });

    return () => {
      socket.off('startGame');
      socket.off('gameMessage');
      socket.off('playerList');
      socket.off('gamePaused');
      socket.off('roomFull');
    };
  }, []);

  const joinGame = () => {
    if (name.trim()) {
      socket.emit('joinGame', name.trim());
      setJoined(true);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      joinGame();
    }
  };

  return (
    <div className="app">
      <div className="background-pattern"></div>
      
      {!joined ? (
        <div className="login-container">
          <div className="login-card">
            <h1 className="game-title">斗地主</h1>
            <h2 className="game-subtitle">Dou Dizhu</h2>
            <p className="room-info">Room #{roomId}</p>
            
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
      ) : (
        <div className="game-container">
          <header className="game-header">
            <h1 className="game-title-small">斗地主 - Room #{roomId}</h1>
            <div className="game-status">
              {message && <p className="status-message">{message}</p>}
              {isMyTurn && <p className="turn-indicator">🎯 Your Turn!</p>}
            </div>
          </header>

          <div className="players-section">
            <h3>Players ({playerList.length}/3)</h3>
            <div className="players-list">
              {playerList.map((playerName, index) => (
                <div key={index} className={`player-card ${playerName === name ? 'current-player' : ''}`}>
                  <div className="player-avatar">
                    {playerName.charAt(0).toUpperCase()}
                  </div>
                  <span className="player-name">{playerName}</span>
                  {playerName === name && <span className="you-label">(You)</span>}
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

          <div className="hand-section">
            <h3>Your Hand</h3>
            <div className="cards-container">
              {hand.length > 0 ? (
                hand.map((card, index) => (
                  <div key={index} className="playing-card">
                    <div className="card-content">
                      {card}
                    </div>
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
