require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;
const BOARD_ID = process.env.TRELLO_BOARD_ID;

// Your Vercel webhook URL
const WEBHOOK_URL = 'https://trello-mirror-webhook.vercel.app/api/webhook';

async function registerWebhook() {
  try {
    if (!BOARD_ID) {
      throw new Error('TRELLO_BOARD_ID environment variable is required');
    }
    
    console.log('🔗 Registering webhook with Trello...');
    console.log(`📋 Board ID: ${BOARD_ID}`);
    console.log(`🌐 Webhook URL: ${WEBHOOK_URL}`);
    
    const response = await axios.post(`https://api.trello.com/1/webhooks?key=${API_KEY}&token=${TOKEN}`, {
      description: 'Trello Mirror Webhook - Card Updates',
      callbackURL: WEBHOOK_URL,
      idModel: BOARD_ID
    });
    
    console.log('\n✅ Webhook registered successfully!');
    console.log(`🆔 Webhook ID: ${response.data.id}`);
    console.log(`📝 Description: ${response.data.description}`);
    console.log(`🔗 Callback URL: ${response.data.callbackURL}`);
    
    console.log('\n🎉 Your Trello mirror is now active!');
    console.log('Try editing a card in your master list to test it.');
    
  } catch (error) {
    const errorData = error.response?.data;
    const errorMessage = typeof errorData === 'string' ? errorData : JSON.stringify(errorData);
    
    if (error.response?.status === 400 && errorMessage?.includes('webhook already exists')) {
      console.log('⚠️  Webhook already exists for this board and URL');
      console.log('✅ Your webhook is already active!');
    } else {
      console.error('❌ Failed to register webhook:');
      console.error('Status:', error.response?.status);
      console.error('Data:', errorData);
      console.error('Message:', error.message);
    }
  }
}

registerWebhook();
