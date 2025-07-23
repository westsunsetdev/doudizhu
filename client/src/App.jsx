import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';

const socket = io(`${window.location.protocol}//${window.location.hostname}:3001`);

function App() {
  const [name, setName] = useState('');
  const [hand, setHand] = useState([]);
  const [joined, setJoined] = useState(false);
  const [message, setMessage] = useState('');
  const [isMyTurn, setIsMyTurn] = useState(false);

  useEffect(() => {
    socket.on('startGame', ({ hand, yourTurn }) => {
      setHand(hand);
      setIsMyTurn(yourTurn);
    });

    socket.on('gameMessage', setMessage);

    socket.on('gamePaused', (player) => {
      alert(`${player} disconnected. Game paused.`);
    });
  }, []);

  const joinGame = () => {
    socket.emit('joinGame', name);
    setJoined(true);
  };

  return (
    <div>
      {!joined ? (
        <div>
          <input placeholder="Your name" onChange={(e) => setName(e.target.value)} />
          <button onClick={joinGame}>Join Game</button>
        </div>
      ) : (
        <div>
          <h2>{message}</h2>
          <h3>Your Hand:</h3>
          <div>{hand.map((card, i) => <span key={i}>{card} </span>)}</div>
          {isMyTurn && <p>It's your turn!</p>}
        </div>
      )}
    </div>
  );
}

export default App;
