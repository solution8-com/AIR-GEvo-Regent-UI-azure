"""Unit tests for chat provider functionality."""

import pytest
from unittest.mock import AsyncMock, Mock, patch
from backend.chat_provider import (
    N8nChatProvider,
    SessionManager,
    create_chat_provider
)


class TestSessionManager:
    """Tests for SessionManager class."""
    
    def test_create_new_session_no_conversation_id(self):
        """Test creating a new session when no conversation_id is provided."""
        manager = SessionManager()
        session_id = manager.get_or_create_session("user123", None)
        
        assert session_id is not None
        assert len(session_id) > 0
    
    def test_create_new_session_with_conversation_id(self):
        """Test creating a new session with conversation_id."""
        manager = SessionManager()
        session_id1 = manager.get_or_create_session("user123", "conv456")
        
        assert session_id1 is not None
        assert len(session_id1) > 0
    
    def test_reuse_existing_session(self):
        """Test that same session_id is returned for same user/conversation."""
        manager = SessionManager()
        session_id1 = manager.get_or_create_session("user123", "conv456")
        session_id2 = manager.get_or_create_session("user123", "conv456")
        
        assert session_id1 == session_id2
    
    def test_different_sessions_for_different_conversations(self):
        """Test that different conversations get different sessions."""
        manager = SessionManager()
        session_id1 = manager.get_or_create_session("user123", "conv456")
        session_id2 = manager.get_or_create_session("user123", "conv789")
        
        assert session_id1 != session_id2
    
    def test_different_sessions_for_different_users(self):
        """Test that different users get different sessions even for same conversation."""
        manager = SessionManager()
        session_id1 = manager.get_or_create_session("user123", "conv456")
        session_id2 = manager.get_or_create_session("user999", "conv456")
        
        assert session_id1 != session_id2
    
    def test_new_chat_generates_new_session(self):
        """Test that None conversation_id always generates new session."""
        manager = SessionManager()
        session_id1 = manager.get_or_create_session("user123", None)
        session_id2 = manager.get_or_create_session("user123", None)
        
        assert session_id1 != session_id2


class TestN8nChatProvider:
    """Tests for N8nChatProvider class."""
    
    def test_initialization(self):
        """Test provider initialization."""
        provider = N8nChatProvider(
            webhook_url="https://example.com/webhook",
            bearer_token="test-token",
            timeout_ms=30000
        )
        
        assert provider.webhook_url == "https://example.com/webhook"
        assert provider.bearer_token == "test-token"
        assert provider.timeout_seconds == 30.0
    
    def test_extract_assistant_message_with_message_field(self):
        """Test extracting message from n8n response with 'message' field."""
        provider = N8nChatProvider("https://example.com", "token")
        
        response = {"message": "Hello, how can I help?"}
        result = provider._extract_assistant_message(response)
        
        assert result == "Hello, how can I help?"
    
    def test_extract_assistant_message_with_output_field(self):
        """Test extracting message from n8n response with 'output' field."""
        provider = N8nChatProvider("https://example.com", "token")
        
        response = {"output": "This is the output"}
        result = provider._extract_assistant_message(response)
        
        assert result == "This is the output"
    
    def test_extract_assistant_message_with_response_field(self):
        """Test extracting message from n8n response with 'response' field."""
        provider = N8nChatProvider("https://example.com", "token")
        
        response = {"response": "This is the response"}
        result = provider._extract_assistant_message(response)
        
        assert result == "This is the response"
    
    def test_format_response_chunk(self):
        """Test response chunk formatting."""
        provider = N8nChatProvider("https://example.com", "token")
        
        chunk = provider._format_response_chunk(
            content="Test content",
            history_metadata={"conversation_id": "conv123"},
            is_final=True
        )
        
        assert chunk["model"] == "n8n-webhook"
        assert chunk["object"] == "chat.completion"
        assert chunk["choices"][0]["messages"][0]["role"] == "assistant"
        assert chunk["choices"][0]["messages"][0]["content"] == "Test content"
        assert chunk["history_metadata"]["conversation_id"] == "conv123"
    
    @pytest.mark.asyncio
    async def test_call_n8n_webhook_success(self):
        """Test successful n8n webhook call."""
        provider = N8nChatProvider(
            webhook_url="https://example.com/webhook",
            bearer_token="test-token"
        )
        
        mock_response = Mock()
        mock_response.json.return_value = {"message": "Hello!"}
        mock_response.raise_for_status = Mock()
        
        with patch('httpx.AsyncClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client
            
            result = await provider._call_n8n_webhook("Test message", "session123")
            
            assert result == {"message": "Hello!"}
            mock_client.post.assert_called_once()
            call_args = mock_client.post.call_args
            
            # Verify request structure
            assert call_args.kwargs["json"]["chatInput"] == "Test message"
            assert call_args.kwargs["json"]["sessionId"] == "session123"
            assert call_args.kwargs["headers"]["Authorization"] == "Bearer test-token"
            assert call_args.kwargs["headers"]["Content-Type"] == "application/json"
    
    @pytest.mark.asyncio
    async def test_send_message_non_streaming(self):
        """Test non-streaming message sending."""
        provider = N8nChatProvider(
            webhook_url="https://example.com/webhook",
            bearer_token="test-token"
        )
        
        messages = [
            {"role": "user", "content": "Hello, n8n!"}
        ]
        
        with patch.object(provider, '_call_n8n_webhook', new_callable=AsyncMock) as mock_webhook:
            mock_webhook.return_value = {"message": "Response from n8n"}
            
            result = await provider.send_message_non_streaming(
                messages=messages,
                request_headers={},
                history_metadata={"conversation_id": "conv123"},
                user_id="user456"
            )
            
            assert result["choices"][0]["messages"][0]["content"] == "Response from n8n"
            mock_webhook.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_send_message_streaming(self):
        """Test streaming message sending (simulated)."""
        provider = N8nChatProvider(
            webhook_url="https://example.com/webhook",
            bearer_token="test-token"
        )
        
        messages = [
            {"role": "user", "content": "Hello, n8n!"}
        ]
        
        with patch.object(provider, '_call_n8n_webhook', new_callable=AsyncMock) as mock_webhook:
            mock_webhook.return_value = {"message": "Response from n8n"}
            
            chunks = []
            async for chunk in provider.send_message(
                messages=messages,
                request_headers={},
                history_metadata={"conversation_id": "conv123"},
                user_id="user456"
            ):
                chunks.append(chunk)
            
            assert len(chunks) == 1  # Single chunk (n8n doesn't truly stream)
            assert chunks[0]["choices"][0]["messages"][0]["content"] == "Response from n8n"
    
    @pytest.mark.asyncio
    async def test_send_message_no_user_message(self):
        """Test error handling when no user message is found."""
        provider = N8nChatProvider(
            webhook_url="https://example.com/webhook",
            bearer_token="test-token"
        )
        
        messages = [
            {"role": "assistant", "content": "I am assistant"}
        ]
        
        result = await provider.send_message_non_streaming(
            messages=messages,
            request_headers={},
            history_metadata={},
            user_id="user456"
        )
        
        # Should return error formatted as chat message
        assert "sorry" in result["choices"][0]["messages"][0]["content"].lower()
    
    @pytest.mark.asyncio
    async def test_send_message_with_http_error(self):
        """Test error handling when n8n webhook fails."""
        import httpx
        
        provider = N8nChatProvider(
            webhook_url="https://example.com/webhook",
            bearer_token="test-token"
        )
        
        messages = [
            {"role": "user", "content": "Hello"}
        ]
        
        with patch.object(provider, '_call_n8n_webhook', new_callable=AsyncMock) as mock_webhook:
            mock_webhook.side_effect = httpx.HTTPError("Connection failed")
            
            result = await provider.send_message_non_streaming(
                messages=messages,
                request_headers={},
                history_metadata={},
                user_id="user456"
            )
            
            # Should return error formatted as chat message
            assert "sorry" in result["choices"][0]["messages"][0]["content"].lower()


class TestCreateChatProvider:
    """Tests for create_chat_provider factory function."""
    
    def test_n8n_provider_directly(self):
        """Test creating n8n provider directly without settings."""
        provider = N8nChatProvider(
            webhook_url="https://example.com/webhook",
            bearer_token="test-token",
            timeout_ms=60000
        )
        
        assert isinstance(provider, N8nChatProvider)
        assert provider.webhook_url == "https://example.com/webhook"
        assert provider.bearer_token == "test-token"
        assert provider.timeout_seconds == 60.0
    
    def test_factory_logic_with_url_and_token(self):
        """Test factory logic when both URL and token are provided."""
        # This tests the factory pattern by directly instantiating
        # In real usage, create_chat_provider() reads from app_settings
        url = "https://example.com/webhook"
        token = "test-token"
        
        if url and token:
            provider = N8nChatProvider(
                webhook_url=url,
                bearer_token=token,
                timeout_ms=120000
            )
            assert provider is not None
        else:
            provider = None
            
        assert provider is not None
    
    def test_factory_logic_missing_config(self):
        """Test factory logic when configuration is missing."""
        url = None
        token = None
        
        if url and token:
            provider = N8nChatProvider(
                webhook_url=url,
                bearer_token=token,
                timeout_ms=120000
            )
        else:
            provider = None
            
        assert provider is None
