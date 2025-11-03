# Developer Quick Reference

This document provides quick code snippets and patterns commonly used in the Broen Lab UI codebase.

## Table of Contents
- [Backend Patterns](#backend-patterns)
- [Frontend Patterns](#frontend-patterns)
- [Configuration Patterns](#configuration-patterns)
- [Common Snippets](#common-snippets)

## Backend Patterns

### Async Route Handler

```python
from quart import request, jsonify

@bp.route("/api/example", methods=["POST"])
async def example_handler():
    try:
        # Get JSON body
        request_json = await request.get_json()
        
        # Authenticate user
        authenticated_user = get_authenticated_user_details(request_headers=request.headers)
        user_id = authenticated_user["user_principal_id"]
        
        # Async operation
        result = await some_async_function(request_json)
        
        # Return JSON response
        return jsonify({"success": True, "data": result}), 200
        
    except Exception as e:
        logging.exception("Error in example_handler")
        return jsonify({"error": str(e)}), 500
```

### Streaming Response

```python
from backend.utils import format_as_ndjson

@bp.route("/api/stream", methods=["POST"])
async def stream_handler():
    async def generate():
        try:
            # Stream chunks
            async for chunk in async_generator():
                # Format as NDJSON
                yield format_as_ndjson(chunk)
        except Exception as e:
            logging.exception("Streaming error")
            yield format_as_ndjson({"error": str(e)})
    
    return generate(), 200, {"Content-Type": "application/x-ndjson"}
```

### Azure OpenAI Call

```python
from openai import AsyncAzureOpenAI
from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider

# Initialize client (in app initialization)
if app_settings.azure_openai.key:
    openai_client = AsyncAzureOpenAI(
        api_version=app_settings.azure_openai.preview_api_version,
        api_key=app_settings.azure_openai.key,
        azure_endpoint=app_settings.azure_openai.endpoint
    )
else:
    # Use managed identity
    credential = DefaultAzureCredential()
    token_provider = get_bearer_token_provider(
        credential, 
        "https://cognitiveservices.azure.com/.default"
    )
    openai_client = AsyncAzureOpenAI(
        api_version=app_settings.azure_openai.preview_api_version,
        azure_ad_token_provider=token_provider,
        azure_endpoint=app_settings.azure_openai.endpoint
    )

# Make chat completion call
async def get_completion(messages):
    response = await openai_client.chat.completions.create(
        model=app_settings.azure_openai.model,
        messages=messages,
        temperature=app_settings.azure_openai.temperature,
        max_tokens=app_settings.azure_openai.max_tokens,
        top_p=app_settings.azure_openai.top_p,
        stream=app_settings.azure_openai.stream
    )
    return response
```

### CosmosDB Operations

```python
from backend.history.cosmosdbservice import CosmosConversationClient

# Initialize client
cosmos_client = CosmosConversationClient(
    cosmosdb_endpoint=f"https://{app_settings.chat_history.account}.documents.azure.com:443/",
    credential=credential,
    database_name=app_settings.chat_history.database,
    container_name=app_settings.chat_history.conversations_container
)

# Create conversation
await cosmos_client.create_conversation(
    user_id=user_id,
    conversation_id=conversation_id,
    title="New Conversation",
    messages=[]
)

# Get conversation
conversation = await cosmos_client.get_conversation(
    user_id=user_id,
    conversation_id=conversation_id
)

# Update conversation
await cosmos_client.upsert_conversation(
    conversation_item=conversation
)

# Delete conversation
await cosmos_client.delete_conversation(
    user_id=user_id,
    conversation_id=conversation_id
)

# List conversations
conversations = await cosmos_client.get_conversations(
    user_id=user_id,
    limit=25
)
```

### Adding a New Setting

```python
# In backend/settings.py

class _NewFeatureSettings(BaseSettings):
    """Settings for new feature"""
    
    model_config = SettingsConfigDict(
        env_prefix="NEW_FEATURE_",
        env_file=DOTENV_PATH,
        extra="ignore",
        env_ignore_empty=True
    )
    
    enabled: bool = False
    api_key: Optional[str] = None
    endpoint: str = "https://default.endpoint.com"
    timeout: int = 30
    
    @field_validator("endpoint")
    @classmethod
    def validate_endpoint(cls, v: str) -> str:
        if not v.startswith("https://"):
            raise ValueError("Endpoint must use HTTPS")
        return v

class AppSettings(BaseModel):
    # ... existing settings ...
    new_feature: _NewFeatureSettings
    
    def __init__(self):
        # ... existing initialization ...
        self.new_feature = _NewFeatureSettings()
```

## Frontend Patterns

### React Component with TypeScript

```typescript
import React, { useState, useEffect } from 'react';
import styles from './MyComponent.module.css';

interface MyComponentProps {
    title: string;
    onSubmit?: (value: string) => void;
    initialValue?: string;
}

export const MyComponent: React.FC<MyComponentProps> = ({ 
    title, 
    onSubmit,
    initialValue = "" 
}) => {
    const [value, setValue] = useState<string>(initialValue);
    const [loading, setLoading] = useState<boolean>(false);
    
    useEffect(() => {
        // Effect runs when component mounts or dependencies change
        console.log('Component mounted');
        
        // Cleanup function (runs on unmount)
        return () => {
            console.log('Component unmounting');
        };
    }, []); // Empty deps = runs once on mount
    
    const handleSubmit = async () => {
        if (!value.trim()) return;
        
        setLoading(true);
        try {
            await onSubmit?.(value);
            setValue("");
        } catch (error) {
            console.error("Submit failed:", error);
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className={styles.container}>
            <h2 className={styles.title}>{title}</h2>
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={loading}
                className={styles.input}
            />
            <button 
                onClick={handleSubmit}
                disabled={loading || !value.trim()}
                className={styles.button}
            >
                {loading ? "Submitting..." : "Submit"}
            </button>
        </div>
    );
};
```

### API Call Pattern

```typescript
// In frontend/src/api/api.ts

export interface ApiResponse {
    success: boolean;
    data?: any;
    error?: string;
}

export async function apiCall(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    body?: any
): Promise<ApiResponse> {
    try {
        const response = await fetch(endpoint, {
            method,
            headers: {
                "Content-Type": "application/json",
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Request failed");
        }
        
        const data = await response.json();
        return { success: true, data };
        
    } catch (error) {
        console.error("API call failed:", error);
        return { 
            success: false, 
            error: error instanceof Error ? error.message : "Unknown error"
        };
    }
}

// Usage in component
const handleSave = async () => {
    const result = await apiCall("/api/save", "POST", { 
        key: "value" 
    });
    
    if (result.success) {
        console.log("Saved:", result.data);
    } else {
        console.error("Save failed:", result.error);
    }
};
```

### Streaming API Call

```typescript
export async function streamingChatApi(
    messages: ChatMessage[],
    onChunk: (chunk: any) => void,
    onComplete: () => void,
    onError: (error: Error) => void
): Promise<void> {
    try {
        const response = await fetch("/api/conversation", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messages,
                stream: true
            }),
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");
        
        const decoder = new TextDecoder();
        let buffer = "";
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                onComplete();
                break;
            }
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const chunk = JSON.parse(line);
                        onChunk(chunk);
                    } catch (e) {
                        console.warn("Failed to parse chunk:", line);
                    }
                }
            }
        }
    } catch (error) {
        onError(error instanceof Error ? error : new Error("Stream failed"));
    }
}
```

### Context Provider

```typescript
import React, { createContext, useContext, useState, ReactNode } from 'react';

interface AppState {
    user: string | null;
    theme: "light" | "dark";
}

interface AppContextType {
    state: AppState;
    setUser: (user: string | null) => void;
    toggleTheme: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, setState] = useState<AppState>({
        user: null,
        theme: "light"
    });
    
    const setUser = (user: string | null) => {
        setState(prev => ({ ...prev, user }));
    };
    
    const toggleTheme = () => {
        setState(prev => ({
            ...prev,
            theme: prev.theme === "light" ? "dark" : "light"
        }));
    };
    
    return (
        <AppContext.Provider value={{ state, setUser, toggleTheme }}>
            {children}
        </AppContext.Provider>
    );
};

// Custom hook for using context
export const useAppContext = (): AppContextType => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error("useAppContext must be used within AppProvider");
    }
    return context;
};

// Usage in component
const MyComponent: React.FC = () => {
    const { state, setUser } = useAppContext();
    
    return <div>User: {state.user}</div>;
};
```

### FluentUI Component Usage

```typescript
import { 
    PrimaryButton, 
    TextField, 
    Spinner,
    Stack,
    Text 
} from '@fluentui/react';

export const FluentExample: React.FC = () => {
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(false);
    
    return (
        <Stack tokens={{ childrenGap: 16 }} styles={{ root: { padding: 20 } }}>
            <Text variant="xLarge">FluentUI Example</Text>
            
            <TextField
                label="Enter text"
                value={text}
                onChange={(_, newValue) => setText(newValue || "")}
                placeholder="Type here..."
            />
            
            <PrimaryButton
                text="Submit"
                onClick={() => console.log(text)}
                disabled={loading || !text}
            />
            
            {loading && <Spinner label="Loading..." />}
        </Stack>
    );
};
```

## Configuration Patterns

### Environment Variable Pattern

```bash
# .env file structure

# Required - Azure OpenAI
AZURE_OPENAI_RESOURCE=my-openai-resource
AZURE_OPENAI_MODEL=gpt-4
AZURE_OPENAI_KEY=sk-...

# Optional - Feature flags
AUTH_ENABLED=True
MS_DEFENDER_ENABLED=True
AZURE_OPENAI_STREAM=True

# Optional - UI customization
UI_TITLE=My Custom Chat
UI_LOGO=static/my-logo.png
UI_CHAT_TITLE=Ask me anything

# Optional - Data source
DATASOURCE_TYPE=AzureCognitiveSearch
AZURE_SEARCH_SERVICE=my-search-service
AZURE_SEARCH_INDEX=my-index
AZURE_SEARCH_KEY=...

# Optional - Chat history
AZURE_COSMOSDB_ACCOUNT=my-cosmos-account
AZURE_COSMOSDB_DATABASE=chathistory
AZURE_COSMOSDB_CONVERSATIONS_CONTAINER=conversations
AZURE_COSMOSDB_ACCOUNT_KEY=...
```

### Accessing Settings in Code

```python
# Backend
from backend.settings import app_settings

# Access nested settings
model_name = app_settings.azure_openai.model
search_index = app_settings.datasource.azure_search.index
ui_title = app_settings.ui.title

# Check if feature enabled
if app_settings.azure_openai.stream:
    # Use streaming
    pass

if app_settings.chat_history:
    # Chat history is configured
    pass
```

```typescript
// Frontend - Get config from backend
const [config, setConfig] = useState<any>(null);

useEffect(() => {
    fetch("/api/config")
        .then(res => res.json())
        .then(data => setConfig(data));
}, []);

// Use config
<h1>{config?.UI_TITLE || "Default Title"}</h1>
```

## Common Snippets

### Error Logging (Backend)

```python
import logging

try:
    # Some operation
    result = risky_operation()
except ValueError as e:
    logging.warning(f"Invalid value: {e}")
    # Handle gracefully
except Exception as e:
    logging.exception(f"Unexpected error in function_name")
    # Re-raise or return error response
    raise
```

### CSS Module Pattern

```css
/* Component.module.css */
.container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
}

.title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--primary-color);
}

.button {
    padding: 0.5rem 1rem;
    background-color: #0078d4;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.button:hover {
    background-color: #106ebe;
}

.button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
```

### TypeScript Interface for API Response

```typescript
export interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export interface Citation {
    id: string;
    title: string;
    content: string;
    filepath?: string;
    url?: string;
}

export interface ChatResponse {
    id: string;
    model: string;
    created: number;
    object: string;
    choices: Array<{
        message: ChatMessage;
        index: number;
        finish_reason: string | null;
    }>;
    citations?: Citation[];
}

export interface Conversation {
    id: string;
    userId: string;
    title: string;
    messages: ChatMessage[];
    createdAt: string;
    updatedAt: string;
}
```

### Pydantic Model Validation

```python
from pydantic import BaseModel, Field, field_validator, ValidationError
from typing import Optional, List

class ChatRequest(BaseModel):
    """Request model for chat endpoint"""
    
    messages: List[dict] = Field(
        ..., 
        min_length=1,
        description="List of message objects"
    )
    stream: bool = Field(
        default=True,
        description="Whether to stream the response"
    )
    temperature: Optional[float] = Field(
        default=0.7,
        ge=0.0,
        le=2.0,
        description="Sampling temperature"
    )
    
    @field_validator("messages")
    @classmethod
    def validate_messages(cls, v: List[dict]) -> List[dict]:
        for msg in v:
            if "role" not in msg or "content" not in msg:
                raise ValueError("Each message must have role and content")
            if msg["role"] not in ["user", "assistant", "system"]:
                raise ValueError("Invalid role")
        return v

# Usage
try:
    request_data = ChatRequest(**request_json)
    messages = request_data.messages
    temperature = request_data.temperature
except ValidationError as e:
    return jsonify({"error": str(e)}), 400
```

### React Custom Hook

```typescript
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    
    return debouncedValue;
}

// Usage
const MyComponent: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const debouncedSearch = useDebounce(searchTerm, 500);
    
    useEffect(() => {
        if (debouncedSearch) {
            // Perform search
            console.log("Searching for:", debouncedSearch);
        }
    }, [debouncedSearch]);
    
    return (
        <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
        />
    );
};
```

### Azure Identity Pattern (Backend)

```python
from azure.identity.aio import DefaultAzureCredential, ManagedIdentityCredential
import os

# Use managed identity in production, default credential locally
if os.environ.get("AZURE_CLIENT_ID"):
    # Explicit managed identity
    credential = ManagedIdentityCredential(
        client_id=os.environ["AZURE_CLIENT_ID"]
    )
else:
    # Default credential chain (tries multiple auth methods)
    credential = DefaultAzureCredential()

# Use credential with Azure services
from azure.cosmos.aio import CosmosClient

cosmos_client = CosmosClient(
    url=cosmos_url,
    credential=credential
)
```

### Loading States (Frontend)

```typescript
type LoadingState = "idle" | "loading" | "success" | "error";

export const DataComponent: React.FC = () => {
    const [loadingState, setLoadingState] = useState<LoadingState>("idle");
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    
    const loadData = async () => {
        setLoadingState("loading");
        setError(null);
        
        try {
            const response = await fetch("/api/data");
            const result = await response.json();
            setData(result);
            setLoadingState("success");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Load failed");
            setLoadingState("error");
        }
    };
    
    useEffect(() => {
        loadData();
    }, []);
    
    if (loadingState === "loading") {
        return <Spinner label="Loading..." />;
    }
    
    if (loadingState === "error") {
        return (
            <div>
                <p>Error: {error}</p>
                <button onClick={loadData}>Retry</button>
            </div>
        );
    }
    
    if (loadingState === "success" && data) {
        return <div>{JSON.stringify(data)}</div>;
    }
    
    return null;
};
```

## Testing Patterns

### Frontend Test (Jest)

```typescript
// Component.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
    it('renders with title', () => {
        render(<MyComponent title="Test Title" />);
        expect(screen.getByText('Test Title')).toBeInTheDocument();
    });
    
    it('calls onSubmit when button clicked', () => {
        const mockSubmit = jest.fn();
        render(<MyComponent title="Test" onSubmit={mockSubmit} />);
        
        const input = screen.getByRole('textbox');
        const button = screen.getByRole('button');
        
        fireEvent.change(input, { target: { value: 'test value' } });
        fireEvent.click(button);
        
        expect(mockSubmit).toHaveBeenCalledWith('test value');
    });
});
```

### Backend Test (pytest)

```python
import pytest
from app import create_app

@pytest.fixture
def client():
    app = create_app()
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_health_endpoint(client):
    response = client.get('/health')
    assert response.status_code == 200
    
def test_chat_endpoint_requires_auth(client):
    response = client.post('/api/conversation')
    assert response.status_code in [401, 403]

def test_chat_endpoint_with_valid_request(client):
    # Mock authentication here
    response = client.post(
        '/api/conversation',
        json={
            "messages": [
                {"role": "user", "content": "Hello"}
            ]
        }
    )
    assert response.status_code == 200
    data = response.get_json()
    assert "choices" in data
```

## Quick Commands Reference

```bash
# Frontend development
cd frontend
npm install                 # Install dependencies
npm run dev                # Dev server with hot reload
npm run build              # Production build
npm run lint               # Check for linting errors
npm run format             # Format and fix code
npm test                   # Run tests

# Backend development
pip install -r requirements.txt       # Install dependencies
python app.py                         # Run development server
python -m pytest tests/              # Run tests

# Full app
./start.sh                 # Linux/Mac - build + run
start.cmd                  # Windows - build + run

# Azure deployment
azd up                     # Deploy with Azure Developer CLI
az webapp up ...           # Deploy with Azure CLI

# Docker (if configured)
docker build -f WebApp.Dockerfile -t chatapp .
docker run -p 50505:50505 chatapp
```

This quick reference should help you quickly find the patterns and snippets you need for common development tasks!
