"""
Chat provider abstraction and implementations.

This module provides an abstraction layer for different chat backends (Azure OpenAI, n8n, etc.)
while maintaining the existing frontend contract for responses.
"""

import json
import logging
import uuid
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, List, Optional, Any
import httpx


class ChatProvider(ABC):
    """Abstract base class for chat providers."""
    
    @abstractmethod
    async def send_message(
        self,
        messages: List[Dict[str, Any]],
        request_headers: Dict[str, str],
        history_metadata: Dict[str, Any],
        user_id: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Send a chat message and yield response chunks in the standard format.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            request_headers: HTTP headers from the original request
            history_metadata: Metadata about conversation history
            user_id: Authenticated user identifier
            
        Yields:
            Response chunks in the standard format expected by the frontend
        """
        pass

    @abstractmethod
    async def send_message_non_streaming(
        self,
        messages: List[Dict[str, Any]],
        request_headers: Dict[str, str],
        history_metadata: Dict[str, Any],
        user_id: str
    ) -> Dict[str, Any]:
        """
        Send a chat message and return complete response.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            request_headers: HTTP headers from the original request
            history_metadata: Metadata about conversation history
            user_id: Authenticated user identifier
            
        Returns:
            Complete response in the standard format expected by the frontend
        """
        pass


class SessionManager:
    """Manages chat session IDs for conversation continuity."""
    
    def __init__(self):
        # In-memory storage: user_id + conversation_id -> session_id
        # In production, this should be persisted (Redis, CosmosDB, etc.)
        self._sessions: Dict[str, str] = {}
    
    def get_or_create_session(self, user_id: str, conversation_id: Optional[str]) -> str:
        """
        Get existing session ID or create a new one.
        
        Args:
            user_id: User identifier
            conversation_id: Conversation identifier (if None, creates new session)
            
        Returns:
            Session ID for n8n
        """
        if not conversation_id:
            # New conversation - generate new session
            session_id = str(uuid.uuid4())
            logging.debug(f"Created new session: {session_id} for user: {user_id}")
            return session_id
        
        # Use conversation_id to lookup/create session
        key = f"{user_id}:{conversation_id}"
        if key not in self._sessions:
            self._sessions[key] = str(uuid.uuid4())
            logging.debug(f"Created session: {self._sessions[key]} for conversation: {conversation_id}")
        else:
            logging.debug(f"Reusing session: {self._sessions[key]} for conversation: {conversation_id}")
        
        return self._sessions[key]


# Global session manager instance
_session_manager = SessionManager()


class N8nChatProvider(ChatProvider):
    """n8n webhook-based chat provider."""
    
    def __init__(
        self,
        webhook_url: str,
        bearer_token: str,
        timeout_ms: int = 120000
    ):
        """
        Initialize n8n chat provider.
        
        Args:
            webhook_url: Full n8n webhook endpoint URL
            bearer_token: Bearer token for Authorization header
            timeout_ms: Request timeout in milliseconds (default: 120000 = 2 minutes)
        """
        self.webhook_url = webhook_url
        self.bearer_token = bearer_token
        self.timeout_seconds = timeout_ms / 1000.0
        logging.info(f"Initialized n8n chat provider with webhook: {webhook_url}")
    
    async def _call_n8n_webhook(
        self,
        chat_input: str,
        session_id: str
    ) -> Dict[str, Any]:
        """
        Call the n8n webhook endpoint.
        
        Args:
            chat_input: User message text
            session_id: Session identifier for conversation continuity
            
        Returns:
            Response JSON from n8n webhook
            
        Raises:
            httpx.HTTPError: If the request fails
        """
        headers = {
            "Authorization": f"Bearer {self.bearer_token}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        body = {
            "chatInput": chat_input,
            "sessionId": session_id
        }
        
        logging.debug(f"Calling n8n webhook with sessionId: {session_id}")
        
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            try:
                response = await client.post(
                    self.webhook_url,
                    json=body,
                    headers=headers
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                logging.error(f"n8n webhook call failed: {e}")
                raise
            except Exception as e:
                logging.error(f"Unexpected error calling n8n webhook: {e}")
                raise
    
    def _extract_assistant_message(self, n8n_response: Dict[str, Any]) -> str:
        """
        Extract the assistant message from n8n response.
        
        The n8n workflow returns the response in various possible formats.
        This method attempts to extract the message text.
        
        Args:
            n8n_response: Response JSON from n8n
            
        Returns:
            Assistant message text
        """
        # Try common response patterns
        if isinstance(n8n_response, dict):
            # Direct message field
            if "message" in n8n_response:
                return str(n8n_response["message"])
            # Output field
            if "output" in n8n_response:
                return str(n8n_response["output"])
            # Response field
            if "response" in n8n_response:
                return str(n8n_response["response"])
            # Text field
            if "text" in n8n_response:
                return str(n8n_response["text"])
            # If it's a simple dict with one key, use that value if not None
            if len(n8n_response) == 1:
                value = list(n8n_response.values())[0]
                if value is not None:
                    return str(value)
        
        # Fallback: return the entire response as JSON string
        return json.dumps(n8n_response)
    
    def _format_response_chunk(
        self,
        content: str,
        history_metadata: Dict[str, Any],
        message_id: str = None,
        is_final: bool = True
    ) -> Dict[str, Any]:
        """
        Format a response chunk in the standard format expected by the frontend.
        
        This matches the format from format_stream_response and format_non_streaming_response
        in backend/utils.py.
        
        Args:
            content: Message content
            history_metadata: Metadata about conversation history
            message_id: Message ID (generated if not provided)
            is_final: Whether this is the final chunk
            
        Returns:
            Response chunk dict
        """
        if message_id is None:
            message_id = str(uuid.uuid4())
        
        return {
            "id": message_id,
            "model": "n8n-webhook",
            "created": "",
            "object": "chat.completion.chunk" if not is_final else "chat.completion",
            "choices": [{
                "messages": [{
                    "role": "assistant",
                    "content": content
                }]
            }],
            "history_metadata": history_metadata,
            "apim-request-id": ""
        }
    
    def _format_error_response(
        self,
        error_message: str,
        history_metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Format an error as a regular chat message.
        
        Args:
            error_message: Error description
            history_metadata: Metadata about conversation history
            
        Returns:
            Response chunk with error as assistant message
        """
        friendly_message = (
            "I'm sorry, but I encountered an error processing your request. "
            "Please try again. If the problem persists, please start a new conversation."
        )
        
        logging.error(f"Formatting error response: {error_message}")
        
        return self._format_response_chunk(
            content=friendly_message,
            history_metadata=history_metadata
        )
    
    async def send_message(
        self,
        messages: List[Dict[str, Any]],
        request_headers: Dict[str, str],
        history_metadata: Dict[str, Any],
        user_id: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Send message to n8n and yield response as stream.
        
        Note: n8n webhook is not truly streaming, so we wrap the complete
        response in a streaming format (single final chunk).
        """
        try:
            # Extract user message (last message with role='user')
            user_message = None
            for msg in reversed(messages):
                if msg.get("role") == "user":
                    user_message = msg.get("content", "")
                    break
            
            if not user_message:
                yield self._format_error_response(
                    "No user message found",
                    history_metadata
                )
                return
            
            # Get or create session ID
            conversation_id = history_metadata.get("conversation_id")
            session_id = _session_manager.get_or_create_session(user_id, conversation_id)
            
            # Call n8n webhook
            n8n_response = await self._call_n8n_webhook(user_message, session_id)
            
            # Extract assistant message
            assistant_message = self._extract_assistant_message(n8n_response)
            
            # Yield as single final chunk (simulating streaming)
            yield self._format_response_chunk(
                content=assistant_message,
                history_metadata=history_metadata,
                is_final=True
            )
            
        except httpx.TimeoutException:
            yield self._format_error_response(
                "Request timeout - n8n webhook did not respond in time",
                history_metadata
            )
        except httpx.HTTPError as e:
            yield self._format_error_response(
                f"n8n webhook HTTP error: {str(e)}",
                history_metadata
            )
        except Exception as e:
            yield self._format_error_response(
                f"Unexpected error: {str(e)}",
                history_metadata
            )
    
    async def send_message_non_streaming(
        self,
        messages: List[Dict[str, Any]],
        request_headers: Dict[str, str],
        history_metadata: Dict[str, Any],
        user_id: str
    ) -> Dict[str, Any]:
        """
        Send message to n8n and return complete response.
        """
        try:
            # Extract user message (last message with role='user')
            user_message = None
            for msg in reversed(messages):
                if msg.get("role") == "user":
                    user_message = msg.get("content", "")
                    break
            
            if not user_message:
                return self._format_error_response(
                    "No user message found",
                    history_metadata
                )
            
            # Get or create session ID
            conversation_id = history_metadata.get("conversation_id")
            session_id = _session_manager.get_or_create_session(user_id, conversation_id)
            
            # Call n8n webhook
            n8n_response = await self._call_n8n_webhook(user_message, session_id)
            
            # Extract assistant message
            assistant_message = self._extract_assistant_message(n8n_response)
            
            # Return complete response
            return self._format_response_chunk(
                content=assistant_message,
                history_metadata=history_metadata,
                is_final=True
            )
            
        except httpx.TimeoutException:
            return self._format_error_response(
                "Request timeout - n8n webhook did not respond in time",
                history_metadata
            )
        except httpx.HTTPError as e:
            return self._format_error_response(
                f"n8n webhook HTTP error: {str(e)}",
                history_metadata
            )
        except Exception as e:
            return self._format_error_response(
                f"Unexpected error: {str(e)}",
                history_metadata
            )


def create_chat_provider() -> Optional[ChatProvider]:
    """
    Factory function to create the appropriate chat provider based on configuration.
    
    Returns:
        ChatProvider instance or None if n8n is not configured
    """
    # Import here to avoid circular dependency and module-level settings loading
    from backend.settings import app_settings
    
    # Check if n8n provider is configured
    n8n_webhook_url = app_settings.base_settings.n8n_webhook_url
    n8n_bearer_token = app_settings.base_settings.n8n_bearer_token
    
    if n8n_webhook_url and n8n_bearer_token:
        timeout_ms = app_settings.base_settings.n8n_timeout_ms
        logging.info("Creating n8n chat provider")
        return N8nChatProvider(
            webhook_url=n8n_webhook_url,
            bearer_token=n8n_bearer_token,
            timeout_ms=timeout_ms
        )
    
    logging.debug("n8n not configured, will use default AOAI provider")
    return None
