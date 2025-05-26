// No axios import needed - using built-in fetch

// Configuration
const API_KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;
const MASTER_LIST_ID = '682f02d46425bad11c50c904';
const BOARD_ID = '681e4e49575a69d0215447fd';

// Trello API helper with rate limiting
async function trelloAPI(method, endpoint, data = null) {
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `https://api.trello.com/1${endpoint}${separator}key=${API_KEY}&token=${TOKEN}`;
  
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    
    if (data) {
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      console.log('⏳ Rate limit hit - waiting 1 second...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return trelloAPI(method, endpoint, data); // Retry once
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    // Add small delay between API calls to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return await response.json();
  } catch (error) {
    console.error(`Trello API error:`, error.message);
    throw error;
  }
}

// Cache for lists to avoid repeated API calls
let listsCache = null;
let listsCacheTime = 0;
const CACHE_DURATION = 30000; // 30 seconds

// Get or create a list for a specific label (with caching)
async function getOrCreateLabelList(labelName, labelColor) {
  try {
    // Use cached lists if recent
    const now = Date.now();
    if (!listsCache || (now - listsCacheTime) > CACHE_DURATION) {
      listsCache = await trelloAPI('GET', `/boards/${BOARD_ID}/lists`);
      listsCacheTime = now;
    }
    
    const existingList = listsCache.find(list => list.name === labelName);
    if (existingList) {
      return existingList;
    }
    
    const newList = await trelloAPI('POST', '/lists', {
      name: labelName,
      idBoard: BOARD_ID,
      pos: 'bottom'
    });
    
    // Update cache with new list
    listsCache.push(newList);
    
    console.log(`✨ Created new list: "${labelName}"`);
    return newList;
  } catch (error) {
    console.error(`Error creating list for label "${labelName}":`, error.message);
    return null;
  }
}

// Find all copied cards for a master card (optimized)
async function findCopiedCards(masterCardId) {
  try {
    // Use cached lists
    const now = Date.now();
    if (!listsCache || (now - listsCacheTime) > CACHE_DURATION) {
      listsCache = await trelloAPI('GET', `/boards/${BOARD_ID}/lists`);
      listsCacheTime = now;
    }
    
    const copiedCards = [];
    
    for (const list of listsCache) {
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

// Create a copied card in a specific list
async function createCopiedCard(masterCard, label, targetList) {
  try {
    const copiedCard = await trelloAPI('POST', '/cards', {
      name: masterCard.name,
      desc: `${masterCard.desc || ''}\n\n[AUTO-SYNCED FROM MASTER - MASTER_ID:${masterCard.id}]`,
      idList: targetList.id,
      idLabels: [label.id],
      pos: 'bottom'
    });
    
    console.log(`✓ Created copy in "${label.name}" list: "${masterCard.name}"`);
    return copiedCard;
  } catch (error) {
    console.error(`Error creating copied card:`, error.message);
    return null;
  }
}

// Update a copied card to match the master
async function updateCopiedCard(copiedCard, masterCard) {
  try {
    await trelloAPI('PUT', `/cards/${copiedCard.id}`, {
      name: masterCard.name,
      desc: `${masterCard.desc || ''}\n\n[AUTO-SYNCED FROM MASTER - MASTER_ID:${masterCard.id}]`,
    });
    console.log(`✓ Updated copied card: "${masterCard.name}"`);
  } catch (error) {
    console.error(`Error updating copied card ${copiedCard.id}:`, error.message);
  }
}

// Delete a copied card
async function deleteCopiedCard(copiedCard) {
  try {
    await trelloAPI('DELETE', `/cards/${copiedCard.id}`);
    console.log(`✓ Deleted copied card: "${copiedCard.name}"`);
  } catch (error) {
    console.error(`Error deleting copied card ${copiedCard.id}:`, error.message);
  }
}

// Handle new card creation
async function handleCardCreation(card) {
  console.log(`🆕 New card created: "${card.name}" (ID: ${card.id})`);
  
  // Check if we already have copies of this card to avoid duplicates
  const existingCopies = await findCopiedCards(card.id);
  if (existingCopies.length > 0) {
    console.log(`⚠️  Card "${card.name}" already has ${existingCopies.length} copies - skipping creation`);
    return;
  }
  
  // Get full card details including labels
  const fullCard = await trelloAPI('GET', `/cards/${card.id}?fields=all&labels=true`);
  
  if (!fullCard.labels || fullCard.labels.length === 0) {
    console.log('   ⚠️  No labels found - no copies needed');
    return;
  }
  
  console.log(`   🏷️  Labels: ${fullCard.labels.map(l => l.name).join(', ')}`);
  
  // Create a copy for each label
  for (const label of fullCard.labels) {
    const targetList = await getOrCreateLabelList(label.name, label.color);
    if (targetList) {
      await createCopiedCard(fullCard, label, targetList);
    }
  }
}

// Handle card updates (including label changes)
async function handleCardUpdate(action) {
  const masterCard = action.data.card;
  console.log(`📝 Master card updated: "${masterCard.name}"`);
  
  // Get current state of the card with labels
  const fullCard = await trelloAPI('GET', `/cards/${masterCard.id}?fields=all&labels=true`);
  
  // Find all existing copied cards
  const existingCopies = await findCopiedCards(masterCard.id);
  console.log(`🔍 Found ${existingCopies.length} existing copied cards`);
  
  // Update all existing copies
  for (const copiedCard of existingCopies) {
    await updateCopiedCard(copiedCard, fullCard);
  }
  
  // Handle label changes: create new copies for new labels
  if (fullCard.labels && fullCard.labels.length > 0) {
    const existingListIds = existingCopies.map(card => card.idList);
    
    for (const label of fullCard.labels) {
      const targetList = await getOrCreateLabelList(label.name, label.color);
      if (targetList && !existingListIds.includes(targetList.id)) {
        console.log(`🆕 Creating new copy for added label: ${label.name}`);
        await createCopiedCard(fullCard, label, targetList);
      }
    }
  }
  
  // TODO: Handle removed labels (delete copies from lists that no longer match)
  // This is complex because we need to track which copy belongs to which label
}

// Handle card deletion
async function handleCardDeletion(cardId) {
  console.log(`🗑️  Master card deleted: ${cardId}`);
  
  // Find and delete all copied cards
  const copiedCards = await findCopiedCards(cardId);
  console.log(`🔍 Found ${copiedCards.length} copied cards to delete`);
  
  for (const copiedCard of copiedCards) {
    await deleteCopiedCard(copiedCard);
  }
}

// Main webhook handler
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    res.status(200).json({ message: 'Webhook endpoint is running! 🔗', status: 'ready' });
    return;
  }

  if (req.method === 'POST') {
    console.log('\n🔔 Webhook received:', JSON.stringify(req.body, null, 2));
    
    try {
      // Handle Trello's webhook validation or empty requests
      if (!req.body || !req.body.action) {
        console.log('📝 Simple webhook test or validation - returning OK');
        res.status(200).json({ message: 'OK' });
        return;
      }

      const action = req.body.action;
      
      // Only handle actions on the master list
      const isOnMasterList = 
        action.data.list?.id === MASTER_LIST_ID ||
        action.data.listAfter?.id === MASTER_LIST_ID ||
        action.data.listBefore?.id === MASTER_LIST_ID;
      
      if (!isOnMasterList) {
        console.log(`📋 Ignoring action: not on master list`);
        res.status(200).json({ message: 'OK' });
        return;
      }
      
      // Handle different action types
      console.log(`🎯 Processing action: ${action.type} for card: ${action.data.card?.name || 'unknown'}`);
      
      switch (action.type) {
        case 'createCard':
          await handleCardCreation(action.data.card);
          break;
          
        case 'updateCard':
          await handleCardUpdate(action);
          break;
          
        case 'deleteCard':
          await handleCardDeletion(action.data.card.id);
          break;
          
        default:
          console.log(`📋 Ignoring action type: ${action.type}`);
      }
      
      res.status(200).json({ message: 'OK' });
    } catch (error) {
      console.error('Webhook handler error:', error);
      res.status(200).json({ message: 'OK' }); // Always return 200 to Trello
    }
    return;
  }

  // Unsupported method
  res.status(405).json({ error: 'Method not allowed', method: req.method });
}
