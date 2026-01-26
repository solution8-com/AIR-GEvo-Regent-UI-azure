"""
Integration tests for n8n webhook chat backend.

These tests call the real n8n webhook endpoint and require:
- N8N_WEBHOOK_URL: Full webhook URL
- N8N_BEARER_TOKEN: Bearer token for authentication

If these environment variables are not set, the tests will be skipped.

See next-steps.md for instructions on setting up the test environment.
"""

import os
import pytest
import asyncio
from backend.chat_provider import N8nChatProvider


# Check if n8n integration is configured
N8N_WEBHOOK_URL = os.environ.get("N8N_WEBHOOK_URL")
N8N_BEARER_TOKEN = os.environ.get("N8N_BEARER_TOKEN")

n8n_configured = N8N_WEBHOOK_URL and N8N_BEARER_TOKEN

skip_if_not_configured = pytest.mark.skipif(
    not n8n_configured,
    reason="n8n integration test requires N8N_WEBHOOK_URL and N8N_BEARER_TOKEN environment variables. See next-steps.md for setup instructions."
)


@pytest.mark.integration
@skip_if_not_configured
class TestN8nWebhookIntegration:
    """Integration tests for n8n webhook endpoint."""
    
    @pytest.mark.asyncio
    async def test_send_message_to_real_webhook(self):
        """
        Test sending a message to the real n8n webhook.
        
        This test verifies:
        - The webhook accepts properly formatted requests
        - Authorization header is correctly set
        - A non-empty response is returned
        - The response can be mapped to the expected format
        """
        provider = N8nChatProvider(
            webhook_url=N8N_WEBHOOK_URL,
            bearer_token=N8N_BEARER_TOKEN,
            timeout_ms=30000  # 30 second timeout for real webhook
        )
        
        messages = [
            {"role": "user", "content": "Hello, this is a test message."}
        ]
        
        # Test non-streaming response
        result = await provider.send_message_non_streaming(
            messages=messages,
            request_headers={},
            history_metadata={},
            user_id="test-user-integration"
        )
        
        # Verify response structure
        assert "choices" in result
        assert len(result["choices"]) > 0
        assert "messages" in result["choices"][0]
        assert len(result["choices"][0]["messages"]) > 0
        
        # Verify we got a non-empty assistant message
        assistant_message = result["choices"][0]["messages"][0]
        assert assistant_message["role"] == "assistant"
        assert len(assistant_message["content"]) > 0
        
        print(f"\nReceived response from n8n: {assistant_message['content'][:100]}...")
    
    @pytest.mark.asyncio
    async def test_conversation_continuity_with_session_id(self):
        """
        Test that multiple messages with the same session_id maintain conversation context.
        
        This test verifies:
        - Same session_id can be reused across multiple requests
        - The webhook successfully processes sequential messages
        - No errors occur when maintaining a conversation
        
        Note: We don't assert on specific content since we can't predict
        what the AI will respond, but we verify the calls succeed.
        """
        import uuid
        
        provider = N8nChatProvider(
            webhook_url=N8N_WEBHOOK_URL,
            bearer_token=N8N_BEARER_TOKEN,
            timeout_ms=30000
        )
        
        # Use a fixed session ID for this conversation
        test_session_id = str(uuid.uuid4())
        
        # First message
        response1 = await provider._call_n8n_webhook(
            chat_input="My name is Alice.",
            session_id=test_session_id
        )
        
        # Verify first response is valid
        assert response1 is not None
        assert isinstance(response1, dict)
        
        print(f"\nFirst message response: {response1}")
        
        # Second message with same session - should maintain context
        response2 = await provider._call_n8n_webhook(
            chat_input="What is my name?",
            session_id=test_session_id
        )
        
        # Verify second response is valid
        assert response2 is not None
        assert isinstance(response2, dict)
        
        print(f"Second message response: {response2}")
        
        # Both calls succeeded, demonstrating conversation continuity
        # (The actual memory/context behavior is handled by n8n's workflow)
    
    @pytest.mark.asyncio
    async def test_streaming_message_format(self):
        """
        Test that streaming message format works correctly.
        
        This verifies:
        - The streaming async generator works
        - Response chunks are in the correct format
        - Frontend-compatible streaming response is produced
        """
        provider = N8nChatProvider(
            webhook_url=N8N_WEBHOOK_URL,
            bearer_token=N8N_BEARER_TOKEN,
            timeout_ms=30000
        )
        
        messages = [
            {"role": "user", "content": "Say hello."}
        ]
        
        # Collect all chunks
        chunks = []
        async for chunk in provider.send_message(
            messages=messages,
            request_headers={},
            history_metadata={"conversation_id": "test-conv-123"},
            user_id="test-user-streaming"
        ):
            chunks.append(chunk)
        
        # Verify we got at least one chunk
        assert len(chunks) > 0
        
        # Verify chunk format
        for chunk in chunks:
            assert "id" in chunk
            assert "model" in chunk
            assert "choices" in chunk
            assert len(chunk["choices"]) > 0
            assert "messages" in chunk["choices"][0]
        
        print(f"\nReceived {len(chunks)} chunk(s) from streaming response")


def print_test_status():
    """Print status message about test configuration."""
    if n8n_configured:
        print("\n" + "="*60)
        print("n8n Integration Tests: ENABLED")
        print(f"Webhook URL: {N8N_WEBHOOK_URL[:50]}...")
        print("="*60 + "\n")
    else:
        print("\n" + "="*60)
        print("n8n Integration Tests: SKIPPED")
        print("To enable: Set N8N_WEBHOOK_URL and N8N_BEARER_TOKEN")
        print("See next-steps.md for detailed setup instructions")
        print("="*60 + "\n")


# Print status when module is loaded
print_test_status()
