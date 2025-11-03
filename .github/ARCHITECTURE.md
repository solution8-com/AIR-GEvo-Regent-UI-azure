# Architecture Overview

## System Architecture

This application follows a **client-server architecture** with a React frontend and Python backend, deployed on Azure infrastructure.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │           React Frontend (TypeScript + Vite)              │  │
│  │  • Chat Interface (FluentUI Components)                   │  │
│  │  • State Management (React Context)                       │  │
│  │  • API Client (Fetch)                                     │  │
│  └───────────────┬───────────────────────────────────────────┘  │
└──────────────────┼──────────────────────────────────────────────┘
                   │ HTTP/HTTPS
                   │ (REST API + Server-Sent Events for streaming)
                   │
┌──────────────────▼──────────────────────────────────────────────┐
│              Azure App Service (Backend)                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │          Quart Application (Async Python)                 │  │
│  │  • Route Handlers (Blueprints)                            │  │
│  │  • Request Processing                                     │  │
│  │  • Response Formatting (Streaming/Non-streaming)          │  │
│  └───────────────┬───────────────────────────────────────────┘  │
│                  │                                               │
│  ┌───────────────▼───────────────────────────────────────────┐  │
│  │           Business Logic Layer                            │  │
│  │  • Settings Management (Pydantic)                         │  │
│  │  • Authentication (Azure Identity)                        │  │
│  │  • Chat History (CosmosDB Service)                        │  │
│  │  • Security (MS Defender Utils)                           │  │
│  └───────────────┬───────────────────────────────────────────┘  │
└──────────────────┼──────────────────────────────────────────────┘
                   │
                   │ Azure SDK / API Calls
                   │
     ┌─────────────┼─────────────┐
     │             │             │
     │             │             │
┌────▼─────┐  ┌───▼────────┐  ┌▼────────────────┐
│  Azure   │  │   Azure    │  │   Data Sources  │
│  OpenAI  │  │  Cosmos DB │  │  • AI Search    │
│  Service │  │  (History) │  │  • Pinecone     │
│          │  │            │  │  • Elasticsearch│
│ • GPT    │  └────────────┘  │  • MongoDB      │
│ • Ada    │                  │  • SQL Server   │
└──────────┘                  └─────────────────┘
```

## Request Flow

### Chat Request (Non-Streaming)

1. **User Input**: User types message in chat interface
2. **Frontend Processing**: 
   - React component captures input
   - State updated via context
   - API call made to `/api/conversation`
3. **Backend Processing**:
   - Quart receives POST request
   - Authenticates user (if enabled)
   - Retrieves chat history from CosmosDB
   - Constructs messages array for OpenAI
   - Calls Azure OpenAI API
   - If data source configured, includes RAG (Retrieval Augmented Generation)
4. **Azure OpenAI Processing**:
   - Processes messages with GPT model
   - If using data source, performs vector search
   - Returns completion with citations
5. **Backend Response**:
   - Formats response JSON
   - Saves to chat history (CosmosDB)
   - Returns to frontend
6. **Frontend Display**:
   - Parses response
   - Renders message with markdown
   - Displays citations (if any)

### Chat Request (Streaming)

Same flow but:
- Backend uses `stream=True` for OpenAI API
- Response sent as NDJSON (newline-delimited JSON)
- Frontend processes chunks in real-time
- UI updates token-by-token for better UX

## Component Architecture

### Backend Components

```
app.py (Main Application)
├── Blueprint Registration
├── Azure Client Initialization
│   ├── AsyncAzureOpenAI
│   ├── DefaultAzureCredential
│   └── CosmosConversationClient
├── Routes
│   ├── GET /  → Serve Frontend
│   ├── POST /api/conversation → Chat endpoint
│   ├── GET /api/conversation/history → List conversations
│   ├── GET /api/conversation/:id → Get conversation
│   ├── POST /api/conversation/:id → Update conversation
│   ├── DELETE /api/conversation/:id → Delete conversation
│   └── GET /api/config → Get UI configuration
└── Error Handlers

backend/settings.py (Configuration)
├── _UiSettings → UI customization
├── _ChatHistorySettings → CosmosDB config
├── _PromptflowSettings → Promptflow integration
├── _AzureOpenAISettings → OpenAI configuration
├── _DataSourceSettings (Abstract Base)
│   ├── _AzureCognitiveSearchSettings
│   ├── _AzureCosmosDBSettings
│   ├── _ElasticsearchSettings
│   ├── _PineconeSettings
│   ├── _MongoDBSettings
│   └── _AzureSqlServerSettings
└── AppSettings → Aggregates all settings

backend/utils.py (Utilities)
├── format_as_ndjson() → NDJSON streaming format
├── format_stream_response() → OpenAI stream parsing
├── format_non_streaming_response() → Regular response
├── convert_to_pf_format() → Promptflow format conversion
├── parse_multi_columns() → Parse pipe-delimited columns
└── generateFilterString() → ACL filter generation

backend/auth/
├── auth_utils.py → User authentication helpers
└── sample_user.py → Sample user for testing

backend/history/
└── cosmosdbservice.py → CosmosDB CRUD operations

backend/security/
└── ms_defender_utils.py → Microsoft Defender integration
```

### Frontend Components

```
frontend/src/
├── index.tsx → React root, app initialization
├── App.tsx → Main app component (if exists)
├── pages/
│   ├── layout/
│   │   └── Layout.tsx → App shell, navigation
│   ├── chat/
│   │   └── Chat.tsx → Main chat interface
│   └── NoPage.tsx → 404 page
├── components/
│   ├── Answer/
│   │   ├── Answer.tsx → Answer display
│   │   ├── AnswerParser.tsx → Parse citations, content
│   │   └── AnswerIcon.tsx → Assistant icon
│   ├── QuestionInput/
│   │   └── QuestionInput.tsx → User input textbox
│   ├── ChatHistory/
│   │   ├── ChatHistoryPanel.tsx → History sidebar
│   │   └── ChatHistoryListItem.tsx → Individual chat item
│   └── common/
│       ├── Button.tsx → Reusable button
│       └── (other shared components)
├── api/
│   ├── api.ts → API client functions
│   └── models.ts → TypeScript interfaces
├── state/
│   └── AppContext.tsx → Global state context
├── utils/
│   └── (utility functions)
└── constants/
    └── (constants, enums)
```

## Data Flow Patterns

### Chat with Data (RAG Pattern)

```
1. User Query
   ↓
2. Backend receives query
   ↓
3. Generate embedding (if vector search)
   - Uses Azure OpenAI Ada model
   - Converts text to vector
   ↓
4. Search data source
   - Azure AI Search / Pinecone / Elasticsearch / etc.
   - Retrieves top K relevant documents
   ↓
5. Construct context
   - Combine retrieved documents
   - Add to system message or user message
   ↓
6. Call Azure OpenAI
   - Send messages + context
   - Model generates response using context
   ↓
7. Extract citations
   - Parse tool calls or response metadata
   - Link citations to source documents
   ↓
8. Return to frontend
   - Response with citations
   - Citations include: title, content, URL, filepath
```

### Chat History Management

```
1. User starts conversation
   ↓
2. Frontend generates conversation ID (UUID)
   ↓
3. Each message sent to backend
   ↓
4. Backend saves to CosmosDB
   - Document structure:
     {
       id: conversationId,
       userId: userId,
       title: "Conversation title",
       messages: [
         {role: "user", content: "..."},
         {role: "assistant", content: "..."}
       ],
       createdAt: timestamp,
       updatedAt: timestamp
     }
   ↓
5. History loaded on page refresh
   - GET /api/conversation/history
   - Returns list of conversations
   ↓
6. User selects conversation
   - GET /api/conversation/:id
   - Loads full message history
```

### Authentication Flow

```
1. User accesses app
   ↓
2. App Service authentication (if enabled)
   - Azure Easy Auth / Entra ID
   - Redirects to login if not authenticated
   ↓
3. Token validation
   - backend/auth/auth_utils.py
   - Extracts user details from headers
   ↓
4. User context
   - User ID, claims, groups
   - Used for ACL filtering
   ↓
5. Document-level security
   - Permitted groups column in search index
   - Filters results based on user groups
```

## State Management

### Backend State
- **Application State**: Global app instance, Azure clients (initialized once)
- **Request State**: Per-request data, user context
- **Session State**: Chat history stored in CosmosDB (persistent)

### Frontend State
- **Global State**: React Context (user settings, UI config)
- **Component State**: Local to each component (useState)
- **URL State**: Router params for navigation
- **Server State**: Fetched data (chat history, config)

## Security Architecture

### Layers of Security

1. **Network Layer**
   - HTTPS only
   - Azure App Service network rules
   - Private endpoints (optional)

2. **Authentication Layer**
   - Azure Easy Auth / Entra ID
   - Managed identities for Azure resources
   - No hardcoded credentials

3. **Authorization Layer**
   - User-based access control
   - Document-level permissions (via search index)
   - Role-based access (Azure RBAC)

4. **Application Layer**
   - Input validation (Pydantic)
   - Output sanitization (DOMPurify on frontend)
   - SANITIZE_ANSWER option for backend
   - MS Defender for Cloud integration

5. **Data Layer**
   - Encrypted at rest (Azure services)
   - Encrypted in transit (TLS)
   - Key rotation supported

## Scalability Considerations

### Horizontal Scaling
- **Frontend**: Static files served from CDN or App Service
- **Backend**: Multiple Gunicorn workers
  - Configured in `gunicorn.conf.py`
  - Async workers (Uvicorn) for concurrent requests
- **Database**: CosmosDB auto-scales
- **Search**: Azure AI Search scales independently

### Performance Optimizations
- **Streaming**: Reduces perceived latency
- **Async I/O**: Non-blocking operations
- **Caching**: Browser cache for static assets
- **Connection Pooling**: Azure SDK handles connection reuse

### Monitoring
- **Application Insights**: Telemetry, performance
- **App Service Logs**: Application logs
- **MS Defender**: Security monitoring
- **OpenAI Metrics**: Token usage, latency

## Deployment Architecture

### Azure Resources

```
Resource Group
├── App Service Plan (B1, S1, P1V2, etc.)
│   └── App Service (Web App)
│       ├── Application Code (Python + Static files)
│       ├── Application Settings (Environment variables)
│       └── Managed Identity
├── Azure OpenAI Service
│   ├── GPT Model Deployment
│   └── Ada Embedding Deployment (optional)
├── Cosmos DB Account
│   └── Database
│       └── Container (Chat History)
├── Azure AI Search (optional)
│   └── Search Index
└── Storage Account (optional, for data)
```

### CI/CD Options

1. **Azure Developer CLI**
   - `azd up` for infrastructure + deployment
   - Bicep templates in `infra/`

2. **GitHub Actions**
   - Build frontend
   - Deploy to Azure App Service
   - Run tests

3. **Azure DevOps**
   - Build pipeline
   - Release pipeline

4. **Manual**
   - `az webapp up` command
   - ZIP deployment

## Error Handling Strategy

### Backend
- Try/except blocks for all route handlers
- Specific exception types
- Logging with Python logging module
- Return appropriate HTTP status codes
- User-friendly error messages

### Frontend
- Error boundaries for React components
- Try/catch for async operations
- Display error messages to user
- Retry logic for failed API calls
- Fallback UI for errors

## API Versioning

Currently, the app uses:
- **Azure OpenAI API**: `2024-05-01-preview` (minimum supported)
- **Backend API**: No explicit versioning (v1 implied)

Future considerations:
- Version backend API endpoints (`/api/v2/...`)
- Support multiple OpenAI API versions
- Graceful migration path

## Extension Points

Places designed for customization:

1. **Data Sources**: Add new by implementing base class in `settings.py`
2. **Authentication**: Extend `auth_utils.py` for custom providers
3. **UI Components**: Add to `frontend/src/components/`
4. **Markdown Plugins**: Add remark/rehype plugins in `Answer.tsx`
5. **Promptflow**: Replace OpenAI with custom Promptflow endpoint
6. **Function Calling**: Azure Functions integration for tools

## Technology Choices Rationale

- **Quart over Flask**: Async support for better concurrency
- **Vite over CRA**: Faster builds, better DX
- **FluentUI**: Consistent Microsoft design language
- **TypeScript**: Type safety, better developer experience
- **Pydantic**: Runtime validation, type hints
- **CosmosDB**: Global distribution, low latency
- **Gunicorn**: Production-ready WSGI server
- **CSS Modules**: Scoped styles, no conflicts
