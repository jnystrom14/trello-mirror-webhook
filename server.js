require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Configuration
const API_KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;
const MASTER_LIST_ID = '682f02d46425bad11c50c904';
const BOARD_ID = '681e4e49575a69d0215447fd';

// Store mapping of master cards to their copies
const cardMappings = new Map(); // masterCardId -> [copyCardId1, copyCardId2, ...]

// Trello API helper
async function trelloAPI(method, endpoint, data = null) {
  // Handle endpoints that already have query parameters
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `https://api.trello.com/1${endpoint}${separator}key=${API_KEY}&token=${TOKEN}`;
  try {
    const response = await axios({ method, url, data });
    return response.data;
  } catch (error) {
    console.error(`Trello API error: ${error.response?.status} - ${error.response?.data}`);
    throw error;
  }
}

// Find all copied cards for a master card
async function findCopiedCards(masterCardId) {
  try {
    // Get all lists on the board
    const lists = await trelloAPI('GET', `/boards/${BOARD_ID}/lists`);
    
    // Search for cards that reference this master card
    const copiedCards = [];
    
    for (const list of lists) {
      if (list.id === MASTER_LIST_ID) continue; // Skip master list
      
      const cards = await trelloAPI('GET', `/lists/${list.id}/cards`);
      
      for (const card of cards) {
        // Check if this card's description contains the master card ID
        if (card.desc && card.desc.includes(`MASTER_ID:${masterCardId}`)) {
          copiedCards.push(card);
        }
      }
    }
    
    return copiedCards;
  } catch (error) {
    console.error('Error finding copied cards:', error);
    return [];
  }
}

// Update a copied card to match the master
async function updateCopiedCard(copiedCard, masterCard) {
  try {
    await trelloAPI('PUT', `/cards/${copiedCard.id}`, {
      name: masterCard.name,
      desc: masterCard.desc + `\n\n[AUTO-SYNCED FROM MASTER - MASTER_ID:${masterCard.id}]`,
      // Note: We don't sync labels because copied cards should only have their specific label
    });
    console.log(`✓ Updated copied card: ${masterCard.name}`);
  } catch (error) {
    console.error(`Error updating copied card ${copiedCard.id}:`, error.message);
  }
}

// Main webhook handler
app.post('/webhook', async (req, res) => {
  console.log('\n🔔 Webhook received:', JSON.stringify(req.body, null, 2));
  
  try {
    const action = req.body.action;
    
    // Only handle card updates in the master list
    if (action.type === 'updateCard' && 
        action.data.listAfter?.id === MASTER_LIST_ID) {
      
      const masterCard = action.data.card;
      console.log(`📝 Master card updated: "${masterCard.name}"`);
      
      // Find all copied cards
      const copiedCards = await findCopiedCards(masterCard.id);
      console.log(`🔍 Found ${copiedCards.length} copied cards to update`);
      
      // Update each copied card
      for (const copiedCard of copiedCards) {
        await updateCopiedCard(copiedCard, masterCard);
      }
      
      console.log('✅ Sync complete');
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).send('Error processing webhook');
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Trello Mirror Webhook Server is running! 🚀');
});

// Test endpoint to manually trigger sync
app.post('/test-sync/:cardId', async (req, res) => {
  try {
    const masterCardId = req.params.cardId;
    const masterCard = await trelloAPI('GET', `/cards/${masterCardId}`);
    const copiedCards = await findCopiedCards(masterCardId);
    
    console.log(`Testing sync for: ${masterCard.name}`);
    console.log(`Found ${copiedCards.length} copies`);
    
    for (const copiedCard of copiedCards) {
      await updateCopiedCard(copiedCard, masterCard);
    }
    
    res.json({ 
      message: 'Sync test complete', 
      masterCard: masterCard.name,
      copiedCount: copiedCards.length 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📋 Monitoring master list: ${MASTER_LIST_ID}`);
});
