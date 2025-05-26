const axios = require('axios');

// Configuration
const API_KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;
const MASTER_LIST_ID = '682f02d46425bad11c50c904';
const BOARD_ID = '681e4e49575a69d0215447fd';

// Trello API helper
async function trelloAPI(method, endpoint, data = null) {
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
    const lists = await trelloAPI('GET', `/boards/${BOARD_ID}/lists`);
    const copiedCards = [];
    
    for (const list of lists) {
      if (list.id === MASTER_LIST_ID) continue;
      
      const cards = await trelloAPI('GET', `/lists/${list.id}/cards`);
      
      for (const card of cards) {
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
    });
    console.log(`✓ Updated copied card: ${masterCard.name}`);
  } catch (error) {
    console.error(`Error updating copied card ${copiedCard.id}:`, error.message);
  }
}

// Main webhook handler
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({ message: 'Trello Mirror Webhook Server is running! 🚀' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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
    
    res.status(200).json({ message: 'OK' });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Error processing webhook' });
  }
}
