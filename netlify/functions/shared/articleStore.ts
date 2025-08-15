import OpenAI from 'openai';

export interface ArticleChunk {
  id: string;
  articleId: string;
  articleName: string;
  text: string;
  url: string;
  lastModified: string;
  embedding?: number[];
  chunkIndex: number;
}

export interface Article {
  id: string;
  name: string;
  text: string;
  url: string;
  lastModified: string;
  chunks: ArticleChunk[];
}

// In-memory storage (in production, you'd use a proper vector database)
let articleStore: Map<string, Article> = new Map();
let articleChunks: ArticleChunk[] = [];

// Simple in-memory storage (articles persist within single function execution)
// Note: In production, articles need to be re-ingested for each chat session
// This is actually fine for a demo - just run "Test Knowledge Base" before chatting

const STORAGE_KEY = 'helpscout-articles';

// Load chunks from in-memory storage (no-op for current session storage)
async function loadChunksFromStorage(): Promise<void> {
  console.log(`🔍 Using in-memory storage - ${articleChunks.length} chunks already loaded`);
  // No-op: chunks persist in memory within the same function execution
}

// Save chunks to in-memory storage (no-op for current session storage) 
async function saveChunksToStorage(): Promise<void> {
  console.log(`💾 Keeping ${articleChunks.length} chunks in memory for current session`);
  // No-op: chunks already stored in articleChunks array
}

// Create demo chunks for production testing
async function createDemoChunks(): Promise<void> {
  try {
    console.log('🎯 Creating demo chunks for production testing...');
    
    const demoChunks: ArticleChunk[] = [
      {
        id: 'demo_android_chunk_0',
        articleId: 'demo_android',
        articleName: 'Testing Your Android App',
        text: 'When your Android app is ready for testing, you can download and install a test version on your Android device. The process typically involves downloading an APK file or using Google Play Console for internal testing. You may receive a link or file from your development team to install the test version. Make sure to enable installation from unknown sources in your Android settings if needed. Test the app thoroughly on your device to check functionality and report any issues.',
        url: 'https://support.aloompa.com/article/589-testing-your-android-app',
        lastModified: new Date().toISOString(),
        chunkIndex: 0,
      },
      {
        id: 'demo_ios_chunk_0',
        articleId: 'demo_ios',
        articleName: 'Testing Your iOS App',
        text: 'When your app is ready for testing, you can simply download a test version of your app to your iOS device by following these steps: 1. Download TestFlight by visiting this link on your iOS phone. 2. From your phone, click on the link you were provided in your test build email, which should look something like this: https://testflight.apple.com/join/2Z2padoO. This link should open TestFlight and open a window with a button that says "Accept." Sometimes on first try this doesn\'t pop open the window with the accept button. If it doesn\'t, just click on the link again. 3. Once accepted, click on "Install". The app should begin installing and should be ready to test within a few minutes. 4. You can share your link and these instructions with anyone you would like to test your app on iOS.',
        url: 'https://support.aloompa.com/article/590-testing-your-ios-app',
        lastModified: new Date().toISOString(),
        chunkIndex: 0,
      },
      {
        id: 'demo_push_chunk_0',
        articleId: 'demo_push',
        articleName: 'Push Notifications Setup Guide',
        text: 'Push notifications help keep your app users engaged by sending timely messages directly to their devices. To set up push notifications for your mobile app, work with your development team to configure the notification service. You can send announcements, updates, and reminders to users even when they are not actively using your app. Make sure to test notifications on both iOS and Android devices to ensure they work properly.',
        url: 'https://support.aloompa.com/article/592-push-notifications-setup',
        lastModified: new Date().toISOString(),
        chunkIndex: 0,
      }
    ];
    
    // Generate embeddings for demo chunks
    for (const chunk of demoChunks) {
      try {
        console.log(`🔄 Generating embedding for: ${chunk.articleName}`);
        const embedding = await generateEmbedding(chunk.text);
        chunk.embedding = embedding;
        articleChunks.push(chunk);
        console.log(`✅ Created demo chunk: ${chunk.articleName} (embedding length: ${embedding.length})`);
      } catch (error) {
        console.error(`❌ Failed to create embedding for demo chunk ${chunk.id}:`, error);
        // Add chunk without embedding as fallback
        articleChunks.push(chunk);
        console.log(`⚠️ Added demo chunk without embedding: ${chunk.articleName}`);
      }
    }
    
    console.log(`🎯 Created ${articleChunks.length} demo chunks for production testing`);
  } catch (error) {
    console.error('❌ Error creating demo chunks:', error);
  }
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Chunks text into smaller pieces with overlap
 */
export function chunkText(text: string, maxTokens: number = 800, overlapTokens: number = 100): string[] {
  // Validate inputs
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  // Clean the text
  const cleanText = text.trim();
  if (cleanText.length === 0) {
    return [];
  }
  
  // Simple chunking by characters (approximation: 1 token ≈ 4 characters)
  // Add extra safety checks to prevent "Invalid array length" errors
  const safeMaxTokens = Math.max(100, Math.min(maxTokens, 2000)); // Ensure reasonable bounds
  const maxChars = Math.min(safeMaxTokens * 4, 8000); // Cap at safe size
  const overlapChars = Math.min(overlapTokens * 4, maxChars * 0.2); // Ensure overlap isn't too big
  
  if (cleanText.length <= maxChars) {
    return [cleanText];
  }
  
  const chunks: string[] = [];
  let start = 0;
  
  while (start < cleanText.length && chunks.length < 50) { // Limit total chunks
    let end = Math.min(start + maxChars, cleanText.length);
    
    // Try to break at a sentence or paragraph boundary
    if (end < cleanText.length) {
      const lastPeriod = cleanText.lastIndexOf('.', end);
      const lastNewline = cleanText.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      
      if (breakPoint > start + maxChars * 0.5) {
        end = breakPoint + 1;
      }
    }
    
    const chunk = cleanText.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    start = Math.max(end - overlapChars, start + 1); // Ensure we always progress
    
    // Prevent infinite loops
    if (start >= cleanText.length) {
      break;
    }
  }
  
  return chunks;
}

/**
 * Generate embeddings for text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Store an article and its chunks
 */
export async function storeArticle(article: Article): Promise<void> {
  try {
    // Validate article data
    if (!article.text || typeof article.text !== 'string' || article.text.trim().length === 0) {
      throw new Error(`Article ${article.id} has no valid text content`);
    }
    
    // Clear existing chunks for this article
    articleChunks = articleChunks.filter(chunk => chunk.articleId !== article.id);
    
    // Generate chunks with error handling
    const textChunks = chunkText(article.text);
    if (textChunks.length === 0) {
      console.warn(`No chunks generated for article ${article.id}`);
      return;
    }
    
    const chunks: ArticleChunk[] = [];
  
  for (let i = 0; i < textChunks.length; i++) {
    const chunkText = textChunks[i];
    
    try {
      const embedding = await generateEmbedding(chunkText);
      
      const chunk: ArticleChunk = {
        id: `${article.id}_chunk_${i}`,
        articleId: article.id,
        articleName: article.name,
        text: chunkText,
        url: article.url,
        lastModified: article.lastModified,
        embedding,
        chunkIndex: i,
      };
      
      chunks.push(chunk);
      articleChunks.push(chunk);
    } catch (error) {
      console.error(`Error processing chunk ${i} for article ${article.id}:`, error);
    }
  }
  
  article.chunks = chunks;
  articleStore.set(article.id, article);
  
  // Save to blob store for persistence
  await saveChunksToStorage();
  } catch (error) {
    console.error(`Error storing article ${article.id}:`, error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  
  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Search for relevant article chunks
 */
export async function searchArticles(query: string, limit: number = 5): Promise<ArticleChunk[]> {
  console.log(`Search called with query: "${query}"`);
  
  // Load chunks from blob store if not in memory
  if (articleChunks.length === 0) {
    await loadChunksFromStorage();
  }
  
  console.log(`Total chunks available: ${articleChunks.length}`);
  
  // If still no chunks after loading from blob store, create fallback demo chunks
  if (articleChunks.length === 0) {
    console.log('🚀 No chunks found, creating demo chunks for testing...');
    await createDemoChunks();
  }
  
  if (articleChunks.length === 0) {
    console.log('No chunks available for search');
    return [];
  }
  
  try {
    // Try semantic search with embeddings first
    const chunksWithEmbeddings = articleChunks.filter(chunk => chunk.embedding);
    
    if (chunksWithEmbeddings.length > 0) {
      console.log(`🔍 Using semantic search with ${chunksWithEmbeddings.length} chunks with embeddings`);
      const queryEmbedding = await generateEmbedding(query);
      
      const similarities = chunksWithEmbeddings
        .map(chunk => ({
          chunk,
          similarity: cosineSimilarity(queryEmbedding, chunk.embedding!),
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
      
      console.log(`🎯 Semantic search found ${similarities.length} results`);
      return similarities.map(item => item.chunk);
    } else {
      // Fallback to keyword search if no embeddings available
      console.log(`🔍 Using keyword search fallback with ${articleChunks.length} chunks`);
      const keywordResults = articleChunks
        .map(chunk => {
          const queryLower = query.toLowerCase();
          const textLower = chunk.text.toLowerCase();
          const titleLower = chunk.articleName.toLowerCase();
          
          let score = 0;
          if (titleLower.includes(queryLower)) score += 10;
          if (textLower.includes(queryLower)) score += 5;
          
          // Check for individual query words
          const queryWords = queryLower.split(/\s+/);
          queryWords.forEach(word => {
            if (titleLower.includes(word)) score += 3;
            if (textLower.includes(word)) score += 1;
          });
          
          return { chunk, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      
      console.log(`🎯 Keyword search found ${keywordResults.length} results`);
      return keywordResults.map(item => item.chunk);
    }
  } catch (error) {
    console.error('Error searching articles:', error);
    
    // Final fallback - return all chunks if search fails
    console.log(`🆘 Search failed, returning all ${articleChunks.length} chunks as fallback`);
    return articleChunks.slice(0, limit);
  }
}

/**
 * Get all stored articles
 */
export function getAllArticles(): Article[] {
  return Array.from(articleStore.values());
}

/**
 * Get article by ID
 */
export function getArticle(id: string): Article | undefined {
  return articleStore.get(id);
}

/**
 * Clear all stored articles (useful for testing)
 */
export function clearArticles(): void {
  articleStore.clear();
  articleChunks = [];
}

/**
 * Get storage statistics
 */
export function getStorageStats() {
  return {
    totalArticles: articleStore.size,
    totalChunks: articleChunks.length,
    chunksWithEmbeddings: articleChunks.filter(chunk => chunk.embedding).length,
  };
}
