import { Handler } from '@netlify/functions';
import OpenAI from 'openai';
import { searchArticles, ArticleChunk } from './shared/articleStore';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handler: Handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse the request body
    const { query } = JSON.parse(event.body || '{}');

    if (!query) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query is required' }),
      };
    }

    // Search for relevant articles using RAG
    console.log(`Searching for query: "${query}"`);
    const relevantChunks = await searchArticles(query, 5);
    console.log(`Found ${relevantChunks.length} relevant chunks`);
    
    // Build context from relevant articles
    let context = '';
    const sources: Array<{name: string, url: string}> = [];
    
    if (relevantChunks.length > 0) {
      context = 'Based on the following documentation:\n\n';
      
      relevantChunks.forEach((chunk, index) => {
        context += `${index + 1}. From "${chunk.articleName}":\n${chunk.text}\n\n`;
        
        // Add unique sources
        if (!sources.find(s => s.url === chunk.url)) {
          sources.push({
            name: chunk.articleName,
            url: chunk.url,
          });
        }
      });
      
      context += `Please answer the user's question based on this documentation. If the documentation doesn't contain the answer, say so honestly.\n\nUser question: ${query}`;
    } else {
      context = `I don't have any relevant documentation for this question: ${query}. 

Note: This is a demo with limited article processing. In a full implementation, I would have access to your complete HelpScout knowledge base with semantic search capabilities.

I can still try to help with general questions about your platform or documentation structure. Please let me know if you'd like me to help with something else or if you can rephrase your question.`;
    }

    // Debug logging for production
    console.log(`📊 PRODUCTION DEBUG:`);
    console.log(`- Context length: ${context.length} chars`);
    console.log(`- Sources found: ${sources.length}`);
    console.log(`- OpenAI API Key configured: ${!!process.env.OPENAI_API_KEY}`);
    
    if (relevantChunks.length > 0) {
      console.log(`- Sample chunk: "${relevantChunks[0].text.substring(0, 150)}..."`);
    }
    
    console.log(`- Context preview: "${context.substring(0, 200)}..."`);

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a helpful AI assistant for a knowledge base chat system. 
          You help users find information from HelpScout documentation and provide helpful, accurate responses.
          When you have relevant documentation, use it to answer questions accurately.
          If the documentation doesn't contain the answer, say so honestly.
          Keep your responses concise but informative.
          Always cite which articles you're referencing when possible.`,
        },
        {
          role: 'user',
          content: context,
        },
      ],
      max_tokens: 700,
      temperature: 0.3,
    });

    const answer = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        answer,
        sources,
        relevantChunks: relevantChunks.length,
      }),
    };
  } catch (error) {
    console.error('Error in chat function:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
