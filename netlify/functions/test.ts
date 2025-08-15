import { Handler } from '@netlify/functions';

export const handler: Handler = async (event, context) => {
  console.log('🧪 Test function called successfully!');
  console.log('Method:', event.httpMethod);
  console.log('Path:', event.path);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      message: 'Test function works!',
      timestamp: new Date().toISOString(),
      method: event.httpMethod,
    }),
  };
};
