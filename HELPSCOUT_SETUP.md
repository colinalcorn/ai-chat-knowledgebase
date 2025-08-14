# HelpScout Knowledge Base Integration Setup

This guide will help you set up article retrieval from HelpScout for your AI chat knowledgebase.

## Prerequisites

1. **HelpScout Account**: You need access to a HelpScout account with Docs (knowledge base)
2. **OpenAI API Key**: Required for embeddings and chat completions
3. **Netlify Account**: For hosting the functions (or you can run locally)

## Step 1: Get Your HelpScout API Key

1. Log in to your HelpScout account
2. Navigate to **Manage > Apps** 
3. Click **Create My App**
4. Fill in the required details:
   - **App Name**: AI Chat Knowledgebase
   - **Description**: Integration for AI-powered chat with knowledge base
   - **Company**: Your company name
5. Once created, copy the **API Key** that's generated

## Step 2: Configure Environment Variables

1. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update the `.env` file with your credentials:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   HELPSCOUT_API_KEY=your_helpscout_api_key_here
   ```

## Step 3: Test the Integration

### Running Locally with Netlify Dev

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open your browser to `http://localhost:8888`

### Testing the Knowledge Base Connection

1. Click the **"Test Knowledge Base Connection"** button
2. This will:
   - Fetch all collections from your HelpScout Docs
   - Retrieve individual articles
   - Chunk the content into smaller pieces
   - Generate embeddings using OpenAI
   - Store everything in memory for fast retrieval

### Testing Chat with Articles

1. Once the knowledge base is connected, try asking questions related to your documentation
2. The system will:
   - Search for relevant article chunks using semantic similarity
   - Provide context to the AI along with your question
   - Return answers based on your actual documentation
   - Show source articles with clickable links

## Step 4: Deploy to Production

### Option A: Deploy to Netlify

1. Connect your repository to Netlify
2. Set environment variables in Netlify dashboard:
   - Go to **Site settings > Environment variables**
   - Add `OPENAI_API_KEY` and `HELPSCOUT_API_KEY`
3. Deploy the site

### Option B: Deploy elsewhere

The functions can be adapted to work with other serverless providers like Vercel, AWS Lambda, etc.

## How It Works

### 1. Article Ingestion Process

```
HelpScout API → Fetch Collections → Fetch Articles → 
Chunk Text → Generate Embeddings → Store in Memory
```

### 2. Chat Process

```
User Question → Generate Query Embedding → 
Find Similar Chunks → Build Context → 
Send to OpenAI → Return Answer + Sources
```

### 3. Key Features

- **Semantic Search**: Uses OpenAI embeddings to find relevant content
- **Context-Aware Responses**: AI answers based on your actual documentation
- **Source Attribution**: Shows which articles were used to answer questions
- **Real-time Processing**: Fast in-memory search and retrieval
- **Error Handling**: Graceful handling of API errors and missing content

## Customization Options

### Chunk Size and Overlap

You can adjust these in `netlify/functions/shared/articleStore.ts`:

```typescript
const textChunks = chunkText(article.text, 800, 100); // 800 tokens, 100 overlap
```

### Number of Retrieved Chunks

Adjust in `netlify/functions/chat.ts`:

```typescript
const relevantChunks = await searchArticles(query, 5); // Get top 5 chunks
```

### OpenAI Model and Settings

Modify in both `ingest.ts` and `chat.ts`:

```typescript
model: 'gpt-4', // or 'gpt-3.5-turbo'
max_tokens: 700,
temperature: 0.3,
```

## Troubleshooting

### Common Issues

1. **"HelpScout API key not configured"**
   - Make sure your `.env` file has the correct `HELPSCOUT_API_KEY`
   - Verify the API key is valid and has proper permissions

2. **"OpenAI API errors"**
   - Check your `OPENAI_API_KEY` is correct
   - Ensure you have sufficient credits/quota

3. **No articles found**
   - Verify your HelpScout Docs have published articles
   - Check that articles have content (not just titles)

4. **Slow performance**
   - This is normal for the first ingestion (generating embeddings takes time)
   - Subsequent searches are very fast

### Rate Limits

- **HelpScout**: Standard plan allows 200 calls/minute
- **OpenAI**: Varies by plan, but embeddings are generally fast
- The system processes articles sequentially to avoid hitting rate limits

## Production Considerations

For production use, consider:

1. **Persistent Storage**: Replace in-memory storage with a vector database (Pinecone, Chroma, etc.)
2. **Caching**: Cache embeddings to avoid regenerating on every deployment
3. **Incremental Updates**: Only process articles that have changed since last sync
4. **Error Monitoring**: Add logging and monitoring for production issues
5. **Scaling**: Consider batching and parallel processing for large knowledge bases

## API Endpoints

- **POST /api/ingest**: Ingests articles from HelpScout
- **POST /api/chat**: Handles chat queries with RAG

Both endpoints support CORS and are designed to work with the React frontend.
