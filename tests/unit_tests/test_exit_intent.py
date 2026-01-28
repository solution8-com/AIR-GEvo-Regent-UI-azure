import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app import create_app


@pytest.fixture
async def app():
    """Create test app"""
    test_app = create_app()
    test_app.config['TESTING'] = True
    return test_app


@pytest.fixture
async def client(app):
    """Create test client"""
    return app.test_client()


class TestIntentClassificationEndpoint:
    """Test suite for /api/intent_classification endpoint"""

    @pytest.mark.asyncio
    async def test_intent_classification_missing_json(self, client):
        """Test that non-JSON requests are rejected"""
        response = await client.post('/api/intent_classification')
        assert response.status_code == 200
        data = await response.get_json()
        assert data['fallback'] is True
        assert 'error' in data

    @pytest.mark.asyncio
    async def test_intent_classification_missing_conversation_id(self, client):
        """Test that requests without conversation_id are rejected"""
        response = await client.post(
            '/api/intent_classification',
            json={'messages': []}
        )
        assert response.status_code == 200
        data = await response.get_json()
        assert data['fallback'] is True
        assert 'conversation_id is required' in data['error']

    @pytest.mark.asyncio
    async def test_intent_classification_missing_messages(self, client):
        """Test that requests without messages are rejected"""
        response = await client.post(
            '/api/intent_classification',
            json={'conversation_id': 'test-123'}
        )
        assert response.status_code == 200
        data = await response.get_json()
        assert data['fallback'] is True
        assert 'messages array is required' in data['error']

    @pytest.mark.asyncio
    @patch('app.app_settings')
    async def test_intent_classification_not_configured(self, mock_settings, client):
        """Test fallback when GitHub Models is not configured"""
        mock_settings.github_models = None
        
        response = await client.post(
            '/api/intent_classification',
            json={
                'conversation_id': 'test-123',
                'messages': [
                    {'role': 'user', 'content': 'Hello'},
                    {'role': 'assistant', 'content': 'Hi there!'}
                ]
            }
        )
        assert response.status_code == 200
        data = await response.get_json()
        assert data['fallback'] is True
        assert 'conversation_id' in data

    @pytest.mark.asyncio
    @patch('app.app_settings')
    @patch('app.httpx.AsyncClient')
    async def test_intent_classification_success(self, mock_client_class, mock_settings, client):
        """Test successful intent classification"""
        # Mock GitHub Models settings
        mock_gh_settings = MagicMock()
        mock_gh_settings.is_configured = True
        mock_gh_settings.endpoint_base = 'https://test.com'
        mock_gh_settings.org = 'test-org'
        mock_gh_settings.token = 'test-token'
        mock_gh_settings.api_version = '2022-11-28'
        mock_settings.github_models = mock_gh_settings
        
        # Mock API response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'choices': [
                {
                    'message': {
                        'content': '[{"label": "Test intent", "confidence": 0.95}]'
                    }
                }
            ]
        }
        
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock()
        mock_client_class.return_value = mock_client
        
        response = await client.post(
            '/api/intent_classification',
            json={
                'conversation_id': 'test-123',
                'messages': [
                    {'role': 'user', 'content': 'Hello'},
                    {'role': 'assistant', 'content': 'Hi there!'}
                ]
            }
        )
        
        assert response.status_code == 200
        data = await response.get_json()
        assert data['fallback'] is False
        assert 'intents' in data
        assert len(data['intents']) == 1
        assert data['intents'][0]['label'] == 'Test intent'
        assert data['intents'][0]['confidence'] == 0.95

    @pytest.mark.asyncio
    @patch('app.app_settings')
    @patch('app.httpx.AsyncClient')
    async def test_intent_classification_timeout(self, mock_client_class, mock_settings, client):
        """Test timeout handling"""
        # Mock GitHub Models settings
        mock_gh_settings = MagicMock()
        mock_gh_settings.is_configured = True
        mock_gh_settings.endpoint_base = 'https://test.com'
        mock_gh_settings.org = 'test-org'
        mock_gh_settings.token = 'test-token'
        mock_gh_settings.api_version = '2022-11-28'
        mock_settings.github_models = mock_gh_settings
        
        # Mock timeout
        import asyncio
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=asyncio.TimeoutError())
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock()
        mock_client_class.return_value = mock_client
        
        response = await client.post(
            '/api/intent_classification',
            json={
                'conversation_id': 'test-123',
                'messages': [
                    {'role': 'user', 'content': 'Hello'},
                    {'role': 'assistant', 'content': 'Hi there!'}
                ]
            }
        )
        
        assert response.status_code == 200
        data = await response.get_json()
        assert data['fallback'] is True
        assert 'timeout' in data['error'].lower()
