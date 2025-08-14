import React, { useState } from 'react';
import './App.css';

interface Source {
  name: string;
  url: string;
}

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  sources?: Source[];
  relevantChunks?: number;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const testKnowledgeBase = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      const testMessage: Message = {
        id: Date.now().toString(),
        text: `✅ Knowledge Base Connected!\n\nFound ${data.collections} collections with ${data.docsProcessed} articles processed.\nStorage Stats: ${data.storageStats.totalChunks} chunks created, ${data.storageStats.chunksWithEmbeddings} with embeddings.\n\nPreview of articles:\n${data.preview.map((item: any) => `• ${item.name} (${item.textLength} chars)`).join('\n')}\n\nYour chat can now access HelpScout documentation!`,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, testMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        text: '❌ Knowledge Base connection failed. Please check your HelpScout API key.',
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: inputText }),
      });

      const data = await response.json();

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.answer || 'Sorry, I encountered an error.',
        isUser: false,
        timestamp: new Date(),
        sources: data.sources || [],
        relevantChunks: data.relevantChunks || 0,
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error while processing your request.',
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="App">
      <div className="chat-container">
        <header className="chat-header">
          <h1>AI Knowledge Base Chat</h1>
          <p>Ask questions about our documentation</p>
          <button 
            onClick={testKnowledgeBase}
            className="test-kb-button"
            disabled={isLoading}
          >
            Test Knowledge Base Connection
          </button>
        </header>
        
        <div className="messages-container">
          {messages.map(message => (
            <div
              key={message.id}
              className={`message ${message.isUser ? 'user-message' : 'bot-message'}`}
            >
              <div className="message-content">
                {message.text}
              </div>
              {message.sources && message.sources.length > 0 && (
                <div className="message-sources">
                  <strong>Sources:</strong>
                  <ul>
                    {message.sources.map((source, index) => (
                      <li key={index}>
                        <a href={source.url} target="_blank" rel="noopener noreferrer">
                          {source.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {message.relevantChunks && (
                    <div className="chunks-info">
                      Found {message.relevantChunks} relevant article sections
                    </div>
                  )}
                </div>
              )}
              <div className="message-timestamp">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message bot-message">
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="input-container">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about our documentation..."
            className="message-input"
            rows={3}
          />
          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || isLoading}
            className="send-button"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
