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
    if (fs.existsSync(STORAGE_FILE)) {
      const data = fs.readFileSync(STORAGE_FILE, 'utf8');
      articleChunks = JSON.parse(data);
      console.log(`Loaded ${articleChunks.length} chunks from persistent storage`);
    }
  } catch (error) {
    console.error('Error loading chunks from file:', error);
  }
}

// Save chunks to file
function saveChunksToFile(): void {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(articleChunks, null, 2));
    console.log(`Saved ${articleChunks.length} chunks to persistent storage`);
  } catch (error) {
    console.error('Error saving chunks to file:', error);
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
  
  if (articleChunks.length === 0) {
    console.log('No chunks available for search');
    return [];
  }
  
  try {
    const queryEmbedding = await generateEmbedding(query);
    
    const similarities = articleChunks
      .filter(chunk => chunk.embedding)
      .map(chunk => ({
        chunk,
        similarity: cosineSimilarity(queryEmbedding, chunk.embedding!),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
    
    return similarities.map(item => item.chunk);
  } catch (error) {
    console.error('Error searching articles:', error);
    return [];
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
