import { Handler } from '@netlify/functions';
import axios from 'axios';
import { storeArticle, getStorageStats, Article } from './shared/articleStore';

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
      auth: {
        username: helpscoutApiKey,
        password: 'X', // HelpScout uses API key as username, password can be anything
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const collections = response.data;
    console.log('Collections response:', JSON.stringify(collections, null, 2));
    
    let totalDocsProcessed = 0;
    const processedDocs: HelpScoutDoc[] = [];
    const errors: string[] = [];

    // Check if collections data exists and is properly structured
    if (!collections || typeof collections !== 'object') {
      throw new Error(`Invalid collections response: ${JSON.stringify(collections)}`);
    }

    // Handle HelpScout's nested response structure
    let collectionsArray;
    if (collections.collections && collections.collections.items) {
      collectionsArray = collections.collections.items;
    } else if (collections.collections && Array.isArray(collections.collections)) {
      collectionsArray = collections.collections;
    } else if (collections.items && Array.isArray(collections.items)) {
      collectionsArray = collections.items;
    } else if (Array.isArray(collections)) {
      collectionsArray = collections;
    } else {
      throw new Error(`Cannot find collections array in response: ${JSON.stringify(collections)}`);
    }

    if (!Array.isArray(collectionsArray)) {
      throw new Error(`Collections is not an array: ${JSON.stringify(collectionsArray)}`);
    }

    console.log(`Found ${collectionsArray.length} collections to process`);

    // Limit processing for demo (to avoid timeout)
    const MAX_ARTICLES_PER_COLLECTION = 2;
    const MAX_TOTAL_ARTICLES = 3;
    const SKIP_EMBEDDINGS = false; // Enable embeddings for full demo

    // Process each collection and its articles
    for (const collection of collectionsArray) {
      if (totalDocsProcessed >= MAX_TOTAL_ARTICLES) {
        console.log(`Reached maximum articles limit (${MAX_TOTAL_ARTICLES}), stopping processing`);
        break;
      }
      try {
        console.log(`Processing collection: ${collection.name} (${collection.id})`);
        
        // Fetch articles from this collection
        const articlesResponse = await axios.get(
          `https://docsapi.helpscout.net/v1/collections/${collection.id}/articles`,
          {
            auth: {
              username: helpscoutApiKey,
              password: 'X', // HelpScout uses API key as username, password can be anything
            },
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        // Handle articles response structure similar to collections
        let articles;
        if (articlesResponse.data.articles && articlesResponse.data.articles.items) {
          articles = articlesResponse.data.articles.items;
        } else if (articlesResponse.data.articles && Array.isArray(articlesResponse.data.articles)) {
          articles = articlesResponse.data.articles;
        } else if (articlesResponse.data.items && Array.isArray(articlesResponse.data.items)) {
          articles = articlesResponse.data.items;
        } else if (Array.isArray(articlesResponse.data)) {
          articles = articlesResponse.data;
        } else {
          console.log(`No articles found in collection ${collection.id}, response:`, JSON.stringify(articlesResponse.data, null, 2));
          articles = [];
        }
        
        console.log(`Found ${articles.length} articles in collection: ${collection.name}`);
        
        // Limit articles per collection to avoid timeout
        const articlesToProcess = articles.slice(0, MAX_ARTICLES_PER_COLLECTION);
        console.log(`Processing ${articlesToProcess.length} articles from collection: ${collection.name}`);
        
        for (const article of articlesToProcess) {
          if (totalDocsProcessed >= MAX_TOTAL_ARTICLES) {
            console.log(`Reached maximum articles limit, stopping`);
            break;
          }
          try {
            // Fetch full article content
            const articleResponse = await axios.get(
              `https://docsapi.helpscout.net/v1/articles/${article.id}`,
              {
                auth: {
                  username: helpscoutApiKey,
                  password: 'X', // HelpScout uses API key as username, password can be anything
                },
                headers: {
                  'Content-Type': 'application/json',
                },
              }
            );

            const fullArticle = articleResponse.data.article;
            
            // Skip articles without content
            if (!fullArticle.text || fullArticle.text.trim().length === 0) {
              console.log(`Skipping article ${fullArticle.name} - no content`);
              continue;
            }
            
            // Process the article
            const doc: HelpScoutDoc = {
              id: fullArticle.id,
              name: fullArticle.name,
              text: fullArticle.text,
              url: fullArticle.publicUrl || '',
              lastModified: fullArticle.updatedAt,
            };

            // Store article with embeddings
            const articleToStore: Article = {
              id: doc.id,
              name: doc.name,
              text: doc.text,
              url: doc.url,
              lastModified: doc.lastModified,
              chunks: [], // Will be populated by storeArticle
            };

            if (SKIP_EMBEDDINGS) {
              // Demo mode: Just store without embeddings for speed
              processedDocs.push(doc);
              totalDocsProcessed++;
              console.log(`✅ Demo: Processed article ${totalDocsProcessed}: ${doc.name} (${doc.id}) - embeddings skipped for speed`);
            } else {
              try {
                await storeArticle(articleToStore);
                
                processedDocs.push(doc);
                totalDocsProcessed++;
                
                console.log(`✅ Processed article ${totalDocsProcessed}: ${doc.name} (${doc.id})`);
              } catch (embeddingError) {
                const errorMsg = `Error generating embeddings for article ${article.id}: ${embeddingError instanceof Error ? embeddingError.message : 'Unknown error'}`;
                console.error(errorMsg);
                errors.push(errorMsg);
              }
            }
          } catch (error) {
            const errorMsg = `Error processing article ${article.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        }
      } catch (error) {
        const errorMsg = `Error processing collection ${collection.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    const stats = getStorageStats();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Ingestion completed successfully',
        docsProcessed: totalDocsProcessed,
        collections: collectionsArray.length,
        storageStats: stats,
        preview: processedDocs.slice(0, 3).map(doc => ({
          id: doc.id,
          name: doc.name,
          textLength: doc.text.length,
        })),
        demoNote: SKIP_EMBEDDINGS 
          ? `Demo mode: Processed ${totalDocsProcessed} articles (embeddings disabled for speed demo)`
          : `Demo mode: Processed ${totalDocsProcessed} articles (limited to ${MAX_TOTAL_ARTICLES} for speed)`,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined, // Show first 5 errors
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
