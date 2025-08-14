const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: '.env.local' });

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Import the Netlify functions
const chatFunction = require('./netlify/functions/chat.ts');
const ingestFunction = require('./netlify/functions/ingest.ts');

// Create mock Netlify context and event objects
const createEvent = (httpMethod, body, path) => ({
  httpMethod,
  body: body ? JSON.stringify(body) : null,
  path,
  headers: {
    'content-type': 'application/json'
  }
});

const context = {};

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const event = createEvent('POST', req.body, '/api/chat');
    const response = await chatFunction.handler(event, context);
    
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ingest endpoint
app.post('/api/ingest', async (req, res) => {
  try {
    const event = createEvent('POST', req.body, '/api/ingest');
    const response = await ingestFunction.handler(event, context);
    
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    console.error('Ingest error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Development API server running on http://localhost:${PORT}`);
});
