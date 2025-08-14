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

// Simple file-based persistence for serverless demo
import * as fs from 'fs';
import * as path from 'path';

const STORAGE_FILE = '/tmp/article_chunks.json';

// Load chunks from file if available
function loadChunksFromFile(): void {
  try {
    console.log(`🔍 Attempting to load chunks from: ${STORAGE_FILE}`);
    
    if (fs.existsSync(STORAGE_FILE)) {
      const data = fs.readFileSync(STORAGE_FILE, 'utf8');
      const loadedChunks = JSON.parse(data);
      
      // Validate the loaded data
      if (Array.isArray(loadedChunks) && loadedChunks.length > 0) {
        articleChunks = loadedChunks;
        console.log(`✅ Loaded ${articleChunks.length} chunks from persistent storage`);
      } else {
        console.log(`❌ Invalid chunk data in storage file`);
      }
    } else {
      console.log(`❌ Storage file does not exist: ${STORAGE_FILE}`);
      
      // Check if we can write to tmp directory
      try {
        fs.writeFileSync('/tmp/test-write.txt', 'test');
        fs.unlinkSync('/tmp/test-write.txt');
        console.log(`✅ /tmp directory is writable`);
      } catch (writeError) {
        console.log(`❌ /tmp directory not writable:`, writeError);
      }
    }
  } catch (error) {
    console.error('❌ Error loading chunks from file:', error);
  }
}

// Save chunks to file
function saveChunksToFile(): void {
  try {
    const dataToSave = JSON.stringify(articleChunks, null, 2);
    fs.writeFileSync(STORAGE_FILE, dataToSave);
    console.log(`✅ Saved ${articleChunks.length} chunks to persistent storage (${dataToSave.length} bytes)`);
    
    // Verify the file was written correctly
    if (fs.existsSync(STORAGE_FILE)) {
      const fileSize = fs.statSync(STORAGE_FILE).size;
      console.log(`✅ Confirmed storage file exists: ${fileSize} bytes`);
    }
  } catch (error) {
    console.error('❌ Error saving chunks to file:', error);
  }
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
        text: 'To test your Android app effectively, start by using Android Studio\'s built-in testing tools. For unit testing, use JUnit to test individual components and business logic. For UI testing, implement Espresso tests to verify user interactions and interface behavior. Always test on both Android emulators and physical devices to ensure broad compatibility across different Android versions, screen sizes, and device configurations. Consider using Firebase Test Lab for comprehensive device testing. Set up continuous integration to run tests automatically on each code commit.',
        url: 'https://support.aloompa.com/article/591-testing-your-android-app',
        lastModified: new Date().toISOString(),
        chunkIndex: 0,
      },
      {
        id: 'demo_ios_chunk_0',
        articleId: 'demo_ios',
        articleName: 'Testing Your iOS App',
        text: 'For comprehensive iOS app testing, utilize Xcode\'s integrated testing framework. Use XCTest for unit testing to verify individual functions and classes work correctly. Implement UI tests using XCUITest to automate user interface interactions and validate app flows. Test on both iOS Simulator and physical devices to ensure compatibility across different iOS versions and device types (iPhone, iPad). Use TestFlight for beta testing with external users before App Store submission. Configure code coverage reports to ensure adequate test coverage of your codebase.',
        url: 'https://support.aloompa.com/article/590-testing-your-ios-app',
        lastModified: new Date().toISOString(),
        chunkIndex: 0,
      },
      {
        id: 'demo_push_chunk_0',
        articleId: 'demo_push',
        articleName: 'Push Notifications Setup Guide',
        text: 'Push notifications enable real-time communication with your app users. To implement push notifications: 1) Configure Firebase Cloud Messaging (FCM) for Android and Apple Push Notification service (APNs) for iOS. 2) Set up your server backend to send notifications using the appropriate APIs. 3) Implement notification handling in your app code to receive and display messages. 4) Test notifications thoroughly on both platforms and different device states (foreground, background, terminated). 5) Consider notification categories, rich media attachments, and deep linking for enhanced user experience.',
        url: 'https://support.aloompa.com/collection/24-festapp-cms',
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
  
  // Save to file for persistence
  saveChunksToFile();
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
  
  // Load chunks from file if not in memory
  if (articleChunks.length === 0) {
    loadChunksFromFile();
  }
  
  console.log(`Total chunks available: ${articleChunks.length}`);
  
  // If still no chunks after loading from file, create fallback demo chunks
  if (articleChunks.length === 0) {
    console.log('🚀 No chunks found, creating demo chunks for testing...');
    createDemoChunks();
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
