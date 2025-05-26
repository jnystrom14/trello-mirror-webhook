// Minimal webhook for testing
export default async function handler(req, res) {
  // Log everything for debugging
  console.log('=== WEBHOOK REQUEST DEBUG ===');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('URL:', req.url);
  console.log('Body:', req.body);
  console.log('================================');

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log('Responding to OPTIONS request');
    res.status(200).end();
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    console.log('Responding to GET/HEAD request');
    res.status(200).json({ message: 'Webhook endpoint is running! 🔗', status: 'ready' });
    return;
  }

  if (req.method === 'POST') {
    console.log('Responding to POST request');
    res.status(200).json({ message: 'OK', received: true });
    return;
  }

  // If we get here, it's an unsupported method
  console.log('Unsupported method:', req.method);
  res.status(405).json({ error: 'Method not allowed', method: req.method });
}
