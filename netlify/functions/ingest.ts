import { Handler } from '@netlify/functions';
import axios from 'axios';

interface HelpScoutDoc {
  id: string;
  name: string;
  text: string;
  url: string;
  lastModified: string;
}

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
    const helpscoutApiKey = process.env.HELPSCOUT_API_KEY;
    
    if (!helpscoutApiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'HelpScout API key not configured' }),
      };
    }

    // Fetch docs from HelpScout Docs API
    const response = await axios.get('https://docsapi.helpscout.net/v1/collections', {
      headers: {
        'Authorization': `Bearer ${helpscoutApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const collections = response.data;
    let totalDocsProcessed = 0;
    const processedDocs: HelpScoutDoc[] = [];

    // Process each collection and its articles
    for (const collection of collections.collections || []) {
      try {
        // Fetch articles from this collection
        const articlesResponse = await axios.get(
          `https://docsapi.helpscout.net/v1/collections/${collection.id}/articles`,
          {
            headers: {
              'Authorization': `Bearer ${helpscoutApiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const articles = articlesResponse.data.articles || [];
        
        for (const article of articles) {
          // Fetch full article content
          const articleResponse = await axios.get(
            `https://docsapi.helpscout.net/v1/articles/${article.id}`,
            {
              headers: {
                'Authorization': `Bearer ${helpscoutApiKey}`,
                'Content-Type': 'application/json',
              },
            }
          );

          const fullArticle = articleResponse.data.article;
          
          // Process the article
          const doc: HelpScoutDoc = {
            id: fullArticle.id,
            name: fullArticle.name,
            text: fullArticle.text || '',
            url: fullArticle.publicUrl || '',
            lastModified: fullArticle.updatedAt,
          };

          processedDocs.push(doc);
          totalDocsProcessed++;

          // TODO: Here you would:
          // 1. Chunk the document text (700-900 tokens with 10-15% overlap)
          // 2. Generate embeddings for each chunk using OpenAI
          // 3. Store in vector database (Pinecone, etc.)
          
          // For now, we're just collecting the docs
        }
      } catch (error) {
        console.error(`Error processing collection ${collection.id}:`, error);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Ingestion completed',
        docsProcessed: totalDocsProcessed,
        collections: collections.collections?.length || 0,
        preview: processedDocs.slice(0, 3).map(doc => ({
          id: doc.id,
          name: doc.name,
          textLength: doc.text.length,
        })),
      }),
    };

  } catch (error) {
    console.error('Error in ingest function:', error);
    
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
