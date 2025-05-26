export default function handler(req, res) {
  res.status(200).json({ 
    message: 'Trello Mirror Webhook Server is running! 🚀',
    endpoints: {
      webhook: '/api/webhook'
    }
  });
}
