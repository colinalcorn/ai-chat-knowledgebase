const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a helpful AI assistant for a knowledge base chat system. 
          You help users find information from documentation and provide helpful, accurate responses.
          If you don't know something specific about the company's documentation, say so honestly.
          Keep your responses concise but informative.`,
        },
        {
          role: 'user',
          content: query,
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const answer = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

    res.json({
      answer,
      sources: [],
    });
  } catch (error) {
    console.error('Error in chat function:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// Ingest endpoint
app.post('/api/ingest', async (req, res) => {
  try {
    const helpscoutApiKey = process.env.HELPSCOUT_API_KEY;
    
    if (!helpscoutApiKey) {
      return res.status(500).json({ error: 'HelpScout API key not configured' });
    }

    console.log('Testing HelpScout API connection...');
    
    // Try different authentication methods
    const response = await axios.get('https://docsapi.helpscout.net/v1/collections', {
      headers: {
        'Authorization': `Basic ${Buffer.from(helpscoutApiKey + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('HelpScout API Response:', response.data);
    
    const responseData = response.data;
    let totalDocsProcessed = 0;
    const processedDocs = [];

    // Process collections (the correct structure based on API response)
    if (responseData && responseData.collections && responseData.collections.items) {
      for (const collection of responseData.collections.items) {
        processedDocs.push({
          id: collection.id,
          name: collection.name,
          type: 'collection',
          count: collection.count || 0
        });
        totalDocsProcessed++;
      }
    }

    res.json({
      message: 'Ingestion completed',
      docsProcessed: totalDocsProcessed,
      collections: responseData.collections?.count || 0,
      preview: processedDocs.slice(0, 3),
      rawResponse: responseData, // Include raw response for debugging
    });

  } catch (error) {
    console.error('Error in ingest function:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Development API server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log(`  POST http://localhost:${PORT}/api/chat`);
  console.log(`  POST http://localhost:${PORT}/api/ingest`);
});
