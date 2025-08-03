// Dou Dizhu Card Game Rules
// This file handles the validation of card combinations and game rules

const CARD_VALUES = {
  '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15, 'JOKER-LOW': 16, 'JOKER-HIGH': 17
};

const CARD_TYPES = {
  SINGLE: 'single',
  PAIR: 'pair',
  TRIPLE: 'triple',
  TRIPLE_WITH_ONE: 'triple_with_one',
  STRAIGHT: 'straight',
  PAIR_STRAIGHT: 'pair_straight',
  TRIPLE_STRAIGHT: 'triple_straight',
  FOUR_OF_A_KIND: 'four_of_a_kind',
  FOUR_OF_A_KIND_WITH_ONE: 'four_of_a_kind_with_one',
  BOMB: 'bomb',
  ROCKET: 'rocket'
};

function getCardValue(card) {
  const rank = card.replace(/[♠♣♦♥]/g, '');
  return CARD_VALUES[rank] || 1;
}

function getCardRank(card) {
  return card.replace(/[♠♣♦♥]/g, '');
}

function getCardSuit(card) {
  return card.match(/[♠♣♦♥]/)?.[0] || '';
}

function sortCards(cards) {
  return [...cards].sort((a, b) => getCardValue(a) - getCardValue(b));
}

function countCards(cards) {
  const counts = {};
  cards.forEach(card => {
    const rank = getCardRank(card);
    counts[rank] = (counts[rank] || 0) + 1;
  });
  return counts;
}

function identifyCardType(cards) {
  const sortedCards = sortCards(cards);
  const cardCounts = countCards(cards);
  const uniqueRanks = Object.keys(cardCounts);
  const maxCount = Math.max(...Object.values(cardCounts));
  
  // Rocket (JOKER-HIGH + JOKER-LOW)
  if (cards.length === 2 && 
      cards.includes('JOKER-HIGH') && 
      cards.includes('JOKER-LOW')) {
    return { type: CARD_TYPES.ROCKET, value: 18, cards: sortedCards };
  }
  
  // Bomb (4 of a kind)
  if (cards.length === 4 && maxCount === 4) {
    const bombRank = uniqueRanks[0];
    return { 
      type: CARD_TYPES.BOMB, 
      value: getCardValue(bombRank + '♠'), 
      cards: sortedCards 
    };
  }
  
  // Single card
  if (cards.length === 1) {
    return { 
      type: CARD_TYPES.SINGLE, 
      value: getCardValue(cards[0]), 
      cards: sortedCards 
    };
  }
  
  // Pair
  if (cards.length === 2 && maxCount === 2) {
    return { 
      type: CARD_TYPES.PAIR, 
      value: getCardValue(uniqueRanks[0] + '♠'), 
      cards: sortedCards 
    };
  }
  
  // Triple
  if (cards.length === 3 && maxCount === 3) {
    return { 
      type: CARD_TYPES.TRIPLE, 
      value: getCardValue(uniqueRanks[0] + '♠'), 
      cards: sortedCards 
    };
  }
  
  // Triple with one
  if (cards.length === 4 && maxCount === 3) {
    const tripleRank = Object.keys(cardCounts).find(rank => cardCounts[rank] === 3);
    return { 
      type: CARD_TYPES.TRIPLE_WITH_ONE, 
      value: getCardValue(tripleRank + '♠'), 
      cards: sortedCards 
    };
  }
  

  
  // Four of a kind
  if (cards.length === 4 && maxCount === 4) {
    const fourRank = uniqueRanks[0];
    return { 
      type: CARD_TYPES.FOUR_OF_A_KIND, 
      value: getCardValue(fourRank + '♠'), 
      cards: sortedCards 
    };
  }
  
  // Four of a kind with one single
  if (cards.length === 5 && maxCount === 4) {
    const fourRank = Object.keys(cardCounts).find(rank => cardCounts[rank] === 4);
    return { 
      type: CARD_TYPES.FOUR_OF_A_KIND_WITH_ONE, 
      value: getCardValue(fourRank + '♠'), 
      cards: sortedCards 
    };
  }
  
  // Straight (5+ consecutive cards)
  if (cards.length >= 5 && uniqueRanks.length === cards.length && maxCount === 1) {
    const values = uniqueRanks.map(rank => getCardValue(rank + '♠')).sort((a, b) => a - b);
    const isConsecutive = values.every((val, index) => 
      index === 0 || val === values[index - 1] + 1
    );
    
    // Check that it doesn't include 2 or jokers
    const hasInvalidCards = uniqueRanks.some(rank => 
      rank === '2' || rank === 'JOKER-HIGH' || rank === 'JOKER-LOW'
    );
    
    if (isConsecutive && !hasInvalidCards) {
      return { 
        type: CARD_TYPES.STRAIGHT, 
        value: values[values.length - 1], 
        cards: sortedCards 
      };
    }
  }
  
  // Pair straight (3+ consecutive pairs)
  if (cards.length >= 6 && cards.length % 2 === 0 && maxCount === 2) {
    const pairRanks = Object.keys(cardCounts).filter(rank => cardCounts[rank] === 2);
    if (pairRanks.length >= 3) {
      const pairValues = pairRanks.map(rank => getCardValue(rank + '♠')).sort((a, b) => a - b);
      const isConsecutive = pairValues.every((val, index) => 
        index === 0 || val === pairValues[index - 1] + 1
      );
      
      // Check that it doesn't include 2 or jokers
      const hasInvalidCards = pairRanks.some(rank => 
        rank === '2' || rank === 'JOKER-HIGH' || rank === 'JOKER-LOW'
      );
      
      if (isConsecutive && !hasInvalidCards) {
        return { 
          type: CARD_TYPES.PAIR_STRAIGHT, 
          value: pairValues[pairValues.length - 1], 
          cards: sortedCards 
        };
      }
    }
  }
  
  // Invalid combination
  return { type: 'invalid', value: 0, cards: sortedCards };
}

function canPlayCards(cardsToPlay, lastPlayedCards, isFirstPlay = false) {
  // If it's the first play of the round, any valid combination is allowed
  if (isFirstPlay || !lastPlayedCards || lastPlayedCards.length === 0) {
    const cardType = identifyCardType(cardsToPlay);
    return cardType.type !== 'invalid';
  }
  
  const newCardType = identifyCardType(cardsToPlay);
  const lastCardType = identifyCardType(lastPlayedCards);
  
  // Invalid combination
  if (newCardType.type === 'invalid') {
    return false;
  }
  
  // Rocket can beat anything
  if (newCardType.type === CARD_TYPES.ROCKET) {
    return true;
  }
  
  // Bomb can beat anything except rocket
  if (newCardType.type === CARD_TYPES.BOMB && lastCardType.type !== CARD_TYPES.ROCKET) {
    // If last play was also a bomb, compare values
    if (lastCardType.type === CARD_TYPES.BOMB) {
      return newCardType.value > lastCardType.value;
    }
    return true;
  }
  
  // Same type comparison
  if (newCardType.type === lastCardType.type) {
    return newCardType.value > lastCardType.value;
  }
  
  // Different types - only bomb or rocket can beat different types
  return false;
}

function getValidPlays(playerHand, lastPlayedCards, isFirstPlay = false) {
  const validPlays = [];
  
  // Generate all possible combinations (simplified for now)
  // This is a basic implementation - could be expanded for better performance
  
  // Single cards
  playerHand.forEach(card => {
    if (canPlayCards([card], lastPlayedCards, isFirstPlay)) {
      validPlays.push([card]);
    }
  });
  
  // Pairs
  const cardCounts = countCards(playerHand);
  Object.keys(cardCounts).forEach(rank => {
    if (cardCounts[rank] >= 2) {
      const cardsOfRank = playerHand.filter(card => getCardRank(card) === rank);
      const pair = cardsOfRank.slice(0, 2);
      if (canPlayCards(pair, lastPlayedCards, isFirstPlay)) {
        validPlays.push(pair);
      }
    }
  });
  
  // Triples
  Object.keys(cardCounts).forEach(rank => {
    if (cardCounts[rank] >= 3) {
      const cardsOfRank = playerHand.filter(card => getCardRank(card) === rank);
      const triple = cardsOfRank.slice(0, 3);
      if (canPlayCards(triple, lastPlayedCards, isFirstPlay)) {
        validPlays.push(triple);
      }
    }
  });
  
  // Bombs
  Object.keys(cardCounts).forEach(rank => {
    if (cardCounts[rank] >= 4) {
      const cardsOfRank = playerHand.filter(card => getCardRank(card) === rank);
      const bomb = cardsOfRank.slice(0, 4);
      if (canPlayCards(bomb, lastPlayedCards, isFirstPlay)) {
        validPlays.push(bomb);
      }
    }
  });
  
  // Rocket
  if (playerHand.includes('JOKER-HIGH') && playerHand.includes('JOKER-LOW')) {
    const rocket = ['JOKER-LOW', 'JOKER-HIGH'];
    if (canPlayCards(rocket, lastPlayedCards, isFirstPlay)) {
      validPlays.push(rocket);
    }
  }
  
  return validPlays;
}

module.exports = {
  CARD_VALUES,
  CARD_TYPES,
  getCardValue,
  getCardRank,
  getCardSuit,
  sortCards,
  countCards,
  identifyCardType,
  canPlayCards,
  getValidPlays
}; 