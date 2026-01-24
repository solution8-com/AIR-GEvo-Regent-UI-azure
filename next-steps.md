# n8n Webhook Chat Backend - Setup Guide

This guide provides instructions for setting up and testing the n8n webhook-based chat backend.

## Overview

The AIR-GEvo-Regent-UI application now supports using an n8n workflow as an alternate chat backend, while maintaining Microsoft Entra ID authentication and the existing user interface.

## Prerequisites

1. An n8n instance (self-hosted or cloud)
2. A configured n8n workflow for chat (see Workflow Requirements below)
3. Access to the n8n webhook URL and authentication credentials

## Configuration

### Environment Variables

To enable n8n chat backend, set the following environment variables:

```bash
# Set chat provider to n8n (default is "aoai")
CHAT_PROVIDER=n8n

# n8n webhook endpoint URL (production or test)
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/your-webhook-id

# Bearer token for n8n webhook authentication
# SECURITY: This token must be kept secret and only stored server-side
N8N_BEARER_TOKEN=your-bearer-token-here

# Optional: Request timeout in milliseconds (default: 120000 = 2 minutes)
N8N_TIMEOUT_MS=120000
```

### Workflow Requirements

Your n8n workflow must:

1. **Accept POST requests** with the following JSON body:
   ```json
   {
     "chatInput": "User message text",
     "sessionId": "Unique session identifier for conversation continuity"
   }
   ```

2. **Require Bearer token authentication** in the `Authorization` header:
   ```
   Authorization: Bearer <your-token>
   ```

3. **Return a JSON response** containing the assistant's message. The response can use any of these field names:
   - `message`
   - `output`
   - `response`
   - `text`

4. **Maintain conversation context** using the `sessionId` parameter (typically via Postgres Chat Memory or similar)

### Example n8n Workflow Structure

```
Webhook Node (POST)
  ↓
Edit Fields Node (extract chatInput and sessionId)
  ↓
RAG AI Agent / Chat Model Node
  ↓
Respond to Webhook Node (return response)
```

## Running Integration Tests

### Setup Test Credentials

**IMPORTANT:** The integration tests require real n8n webhook credentials.

1. Create or use an existing n8n test webhook
2. Set environment variables:

```bash
export N8N_WEBHOOK_URL="https://your-n8n-instance.com/webhook/test-webhook-id"
export N8N_BEARER_TOKEN="N8N_BEARER_TOKEN__REPLACE_ME"
```

**Note:** Replace `N8N_BEARER_TOKEN__REPLACE_ME` with your actual n8n bearer token.

### Running Tests

```bash
# Run unit tests only (no credentials needed)
pytest tests/unit_tests/test_chat_provider.py -v

# Run integration tests (requires N8N_WEBHOOK_URL and N8N_BEARER_TOKEN)
pytest tests/integration_tests/test_n8n_webhook.py -v -m integration

# Run all tests
pytest tests/ -v
```

If the environment variables are not set, integration tests will be automatically skipped with a clear message.

### Test Coverage

**Unit Tests** (`test_chat_provider.py`):
- Provider switching logic (CHAT_PROVIDER routing)
- n8n adapter request construction
- Session ID persistence and reuse
- Error handling and formatting
- Response mapping to frontend contract

**Integration Tests** (`test_n8n_webhook.py`):
- Real webhook calls with authentication
- End-to-end message flow
- Conversation continuity across turns
- Streaming and non-streaming responses

## Request/Response Contract

### Request to n8n Webhook

```json
{
  "chatInput": "User's message text",
  "sessionId": "uuid-for-this-conversation"
}
```

**Headers:**
```
Authorization: Bearer <N8N_BEARER_TOKEN>
Content-Type: application/json
Accept: application/json
```

### Response from n8n Webhook

Expected JSON response (example):
```json
{
  "message": "Assistant's response text"
}
```

Alternative response formats are also supported:
```json
{"output": "Response text"}
{"response": "Response text"}
{"text": "Response text"}
```

## Session Management

- **sessionId** is generated automatically per conversation
- Same conversation (conversation_id) always uses the same sessionId
- New chat = new sessionId
- Sessions are currently stored in-memory (for production, consider Redis/CosmosDB)

## Security Notes

1. **Bearer token is server-side only** - never exposed to browser
2. **Entra ID authentication remains mandatory** - n8n is called server-to-server
3. **User context is preserved** - authenticated user_id is tracked in backend
4. **No URL allowlists needed** - webhook URL is configured server-side only

## Troubleshooting

### Integration Tests Are Skipped

**Cause:** Environment variables not set

**Solution:**
```bash
export N8N_WEBHOOK_URL="your-webhook-url"
export N8N_BEARER_TOKEN="your-token"
pytest tests/integration_tests/test_n8n_webhook.py -v -m integration
```

### "n8n chat provider is not configured" Error

**Cause:** Missing or incomplete n8n configuration

**Solution:** Verify all required environment variables are set:
- `CHAT_PROVIDER=n8n`
- `N8N_WEBHOOK_URL`
- `N8N_BEARER_TOKEN`

### Timeout Errors

**Cause:** n8n workflow taking too long to respond

**Solution:** Increase timeout:
```bash
export N8N_TIMEOUT_MS=180000  # 3 minutes
```

### "No user message found" Error

**Cause:** Request messages array doesn't contain a user message

**Solution:** Ensure frontend sends messages with `role: "user"` and `content` field

## Switching Between AOAI and n8n

To switch back to Azure OpenAI:
```bash
export CHAT_PROVIDER=aoai
# or simply remove the CHAT_PROVIDER variable (defaults to aoai)
```

Both backends can be used in the same deployment by changing the environment variable.

## Production Considerations

1. **Session Persistence**: Implement persistent session storage (Redis, CosmosDB)
2. **Monitoring**: Add logging and metrics for n8n webhook calls
3. **Fallback**: Consider fallback to AOAI if n8n is unavailable
4. **Rate Limiting**: Implement rate limiting on n8n calls if needed
5. **Secrets Management**: Use Azure Key Vault or similar for N8N_BEARER_TOKEN

## Support

For issues or questions:
1. Check this documentation
2. Review test files for working examples
3. Verify n8n workflow matches expected contract
4. Check backend logs for detailed error messages
