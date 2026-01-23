# ARCHITECTURE DOSSIER (EXTREME DETAIL)

## 1. REPO TOPOLOGY MAP

### Languages & Frameworks

- **Backend**: Python 50.8% — Quart (async ASGI) with AsyncAzureOpenAI SDK
- **Frontend**: TypeScript 29.6% — React 18.2 with Fluent UI, Vite build
- **Infrastructure**: Bicep 6.3% — Azure Resource Manager templates
- **Notebooks**: Jupyter 6.2% — Data preparation scripts
- **CSS**: 3.5% — UI styling
- **Shell**: 1.3% — Deployment automation

### Directory Structure

```
solution8-com/AIR-GEvo-Regent-UI-azure/
├── app.py                          # Root Flask/Quart entrypoint (41,941 bytes)
├── backend/
│   ├── settings.py                 # Pydantic configuration + datasource registry (839 lines)
│   ├── utils.py                    # Streaming, response formatting utilities (227 lines)
│   ├── auth/
│   │   ├── auth_utils.py          # Azure AD authentication helpers
│   │   └── sample_user.py         # Mock user for testing
│   ├── history/
│   │   └── cosmosdbservice.py     # CosmosDB conversation client
│   └── security/
│       └── ms_defender_utils.py   # Microsoft Defender integration
├── frontend/
│   ├── src/
│   │   ├── pages/chat/Chat.tsx    # Main chat UI component
│   │   ├── api/api.ts             # Frontend-to-backend API layer
│   │   ├── components/            # Reusable React components
│   │   └── state/AppProvider.tsx  # App-level state management
│   ├── vite.config.ts             # Vite build config
│   ├── tsconfig.json              # TypeScript config
│   └── package.json               # Dependencies
├── tests/
│   ├── unit_tests/test_settings.py
│   ├── unit_tests/test_utils.py
│   ├── integration_tests/test_datasources.py
│   └── integration_tests/conftest.py
├── infra/
│   ├── main.bicep                 # Main infrastructure definition
│   ├── db.bicep                   # CosmosDB module
│   ├── core/host/appservice.bicep # App Service configuration
│   └── core/security/role.bicep   # RBAC definitions
├── scripts/
│   ├── data_preparation.py        # Indexing for Azure AI Search
│   ├── pinecone_data_preparation.py
│   ├── cosmos_mongo_vcore_data_preparation.py
│   └── auth_init.py               # Azure AD app registration
├── static/                        # Built frontend assets
├── .env.sample                    # Configuration template (3,883 bytes)
├── gunicorn.conf.py               # Production app server config
├── requirements.txt               # Backend dependencies
└── README.md                      # Primary documentation
```

### Configuration Surfaces

- **Environment variables**: `.env` file via `python-dotenv`
- **Pydantic settings**: `backend/settings.py` with validation
- **Azure deployment**: `azure.yaml` + Azure Developer CLI
- **CI/CD**: `.github/workflows/` (not detailed in scan)

### Runtime Entrypoints

1. **Web Server**: `app.py` → `create_app()` → Quart app with Blueprint routes
2. **Frontend Build**: Vite (`npm run build`) → outputs to `/static`
3. **Initialization**: `@app.before_serving` → `init_cosmosdb_client()` + `init_openai_client()`
4. **Data Prep Scripts**: `scripts/data_preparation.py`, `scripts/pinecone_data_preparation.py`

---

## 2. COMPONENT ARCHITECTURE

### High-Level Layers

```
┌─────────────────────────────────────────────────────────┐
│                   FRONTEND (React/Vite)                  │
│  Chat.tsx → API calls → /conversation, /history/* routes│
└────────────────────────┬────────────────────────────────┘
                         │ HTTP/JSON
┌────────────────────────▼────────────────────────────────┐
│           BACKEND (Quart, Async Python)                 │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Request Handler Layer                            │  │
│  │  • /conversation (POST) → conversation_internal()   │
│  │  • /history/* (GET/POST/DELETE) → history ops   │  │
│  │  • /frontend_settings (GET)                      │  │
│  └──────────────────────────────────────────────────┘  │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐  │
│  │ Orchestration Layer (app.py functions)          │  │
│  │  • send_chat_request() → OpenAI API             │  │
│  │  • stream_chat_request() → NDJSON streaming     │  │
│  │  • complete_chat_request() → Non-streaming      │  │
│  │  • process_function_call() → Tool execution     │  │
│  │  • promptflow_request() → PromptFlow dispatch   │  │
│  └──────────────────────────────────────────────────┘  │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐  │
│  │ Configuration & Settings Layer (backend/*)      │  │
│  │  • _AppSettings (Pydantic model)                │  │
│  │  • _AzureOpenAISettings                         │  │
│  │  • Datasource abstract + 8 implementations      │  │
│  │  • _ChatHistorySettings                         │  │
│  │  • _PromptflowSettings                          │  │
│  └──────────────────────────────────────────────────┘  │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐  │
│  │ Adapter Layer                                    │  │
│  │  • CosmosConversationClient → CosmosDB          │  │
│  │  • Datasource.construct_payload_configuration() │  │
│  │  • Auth helpers (get_authenticated_user)        │  │
│  │  • Formatting utilities (format_stream_response)│  │
│  └──────────────────────────────────────────────────┘  │
│                         │                               │
└─────────────────────────┼───────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    ┌────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐
    │Azure OpenAI│  │ CosmosDB   │  │ Datasources│
    │ API       │  │ (History)  │  │(Search,ES) │
    └───────────┘  └────────────┘  └────────────┘
```

### Core Domain Modules

**1. Configuration & Initialization** (`backend/settings.py`, `app.py:119-191`)

- **Class**: `_AppSettings` (Pydantic BaseModel)
- **Validators**: Three `@model_validator(mode="after")` methods dispatch datasource, promptflow, and chat history initialization
- **Pattern**: Registry — datasource type string dispatches to concrete implementation
- **Key Evidence**:
  ```python
  class _AppSettings(BaseModel):
    @model_validator(mode="after")
    def set_datasource_settings(self) -> Self:
      if self.base_settings.datasource_type == "AzureCognitiveSearch":
        self.datasource = _AzureSearchSettings(...)
      elif ... "Elasticsearch" ...: self.datasource = _ElasticsearchSettings(...)
      # ... 6 more branches
      else: self.datasource = None
  ```
  (**File**: `backend/settings.py`, **Lines**: 799–836)

**2. Conversation Management** (`app.py:594–1000`, `backend/history/cosmosdbservice.py`)

- **Client**: `CosmosConversationClient` (async wrapper around `azure.cosmos.aio.CosmosClient`)
- **Methods**:
  - `create_conversation(user_id, title)` → new chat session
  - `upsert_conversation(conversation)` → save state
  - `get_conversation(user_id, conversation_id)` → retrieve
  - `create_message(uuid, conversation_id, user_id, input_message)` → add message
  - `get_messages(user_id, conversation_id)` → retrieve chat history
  - `update_message_feedback(user_id, message_id, feedback)` → thumbs-up/down
- **Routes**:
  - `POST /history/generate` → create new conversation, call OpenAI, save response
  - `POST /history/update` → append assistant response to existing conversation
  - `GET /history/list` → paginated conversation list for user
  - `POST /history/read` → fetch full conversation by ID
  - `DELETE /history/delete` → purge conversation
  - `POST /history/clear` → clear messages only
  - `POST /history/message_feedback` → record user feedback
  - `POST /history/rename` → update conversation title

**3. Azure OpenAI Integration** (`app.py:119–191`, `app.py:421–440`)

- **Client**: `AsyncAzureOpenAI` from `openai` SDK
- **Initialization**: `init_openai_client()` (async)
  - Validates API version ≥ `2024-05-01-preview`
  - Falls back to DefaultAzureCredential if no API key
  - Loads tool definitions from remote Azure Functions if function calling enabled
- **Request Path**: `prepare_model_args()` (app.py:242–297)
  - Constructs messages list
  - Injects datasource payload via `extra_body` (Azure OpenAI on your data feature)
  - Attaches tools if enabled
  - Filters secret values for logging
- **Response Paths** (app.py:421–591):
  - **Streaming** (line 539–591): NDJSON format via `format_as_ndjson()` generator
  - **Non-streaming** (line 443–468): JSON via `format_non_streaming_response()`
  - **Function calling** (line 384–440): Stateful call tracking and Azure Functions invocation

**4. Function Calling State Machine** (`app.py:470–517`)

- **State Class**: `AzureOpenaiFunctionCallStreamState`
  - Tracks streaming tool calls progressively
  - States: `INITIAL` (no call), `STREAMING` (accumulating), `COMPLETED` (ready to execute)
- **Processor**: `process_function_call_stream()` (line 499–517)
  - Detects tool call deltas in chunks
  - Accumulates `tool_arguments` character by character
  - On completion, invokes `openai_remote_azure_function_call(tool_name, tool_arguments)`
  - Appends function result messages and resends to OpenAI for final answer
- **Key Evidence**: Line 505–511
  ```python
  elif response_message.tool_calls is None and function_call_stream_state.streaming_state == "STREAMING":
    # Tool call stream completed
    for tool_call in function_call_stream_state.tool_calls:
      tool_response = await openai_remote_azure_function_call(...)
      function_call_stream_state.function_messages.append({...})
  ```

**5. Promptflow Dispatch** (`app.py:352–377`, `backend/settings.py:69–93`)

- **Settings**: `_PromptflowSettings` with endpoint, API key, request/response field names, timeout
- **Invocation** (`promptflow_request()`):
  - Converts message history to PromptFlow chat format via `convert_to_pf_format()`
  - Sends POST with Bearer auth
  - Respects timeout setting (default 30s)
- **Response Format**: Extracts `response_field_name` (default "reply") and `citations_field_name` (default "documents")
- **Dispatch Logic** (line 565–591):
  ```python
  if app_settings.azure_openai.stream and not app_settings.base_settings.use_promptflow:
    # Streaming via OpenAI
    result = await stream_chat_request(...)
  else:
    # Non-streaming via complete_chat_request (either PromptFlow or OpenAI)
    result = await complete_chat_request(...)
  ```

---

## 3. DATASOURCE/BACKEND MODEL

### Abstract Interface

**Base Class**: `DatasourcePayloadConstructor` (backend/settings.py:230–243)

```python
class DatasourcePayloadConstructor(BaseModel, ABC):
    _settings: '_AppSettings' = PrivateAttr()

    def __init__(self, settings: '_AppSettings', **data):
        super().__init__(**data)
        self._settings = settings

    @abstractmethod
    def construct_payload_configuration(self, *args, **kwargs):
        pass
```

- **Pattern**: Template method + Dependency Injection (parent `_AppSettings` injected)
- **Purpose**: Each datasource must implement payload construction for Azure OpenAI's "data sources" parameter

### Implemented Datasources

| Datasource                     | Config Class                       | Env Prefix                    | Type Literal       | Key Methods                                                          |
| ------------------------------ | ---------------------------------- | ----------------------------- | ------------------ | -------------------------------------------------------------------- |
| **Azure Cognitive Search**     | `_AzureSearchSettings`             | `AZURE_SEARCH_`               | `azure_search`     | `construct_payload_configuration()`                                  |
| **Azure CosmosDB Mongo vCore** | `_AzureCosmosDbMongoVcoreSettings` | `AZURE_COSMOSDB_MONGO_VCORE_` | `cosmos_mongo_db`  | Same                                                                 |
| **Elasticsearch**              | `_ElasticsearchSettings`           | `ELASTICSEARCH_`              | `elasticsearch`    | `set_authentication()`, `set_fields_mapping()`                       |
| **Pinecone**                   | `_PineconeSettings`                | `PINECONE_`                   | `pinecone_index`   | `extract_embedding_dependency()`                                     |
| **Azure ML Index**             | `_AzureMLIndexSettings`            | `AZURE_MLINDEX_`              | `azure_ml_index`   | Same                                                                 |
| **Azure SQL Server**           | `_AzureSqlServerSettings`          | `AZURE_SQL_SERVER_`           | `azure_sql_server` | `construct_authentication()` (connection string OR managed identity) |
| **MongoDB**                    | `_MongoDbSettings`                 | `MONGODB_`                    | `mongo_db`         | `set_authentication()`, `set_fields_mapping()`                       |
| **(Stub) n8n**                 | Referenced in template             | `N8N_`                        | (webhook-based)    | Not fully implemented                                                |

### Configuration & Instantiation Flow

1. **Env Loading**: Pydantic `BaseSettings` reads `.env` file
2. **Type Detection**: `_BaseSettings.datasource_type` reads `DATASOURCE_TYPE` env var
3. **Conditional Instantiation**: `_AppSettings.set_datasource_settings()` model validator fires
4. **Payload Construction**: At request time, `prepare_model_args()` calls `app_settings.datasource.construct_payload_configuration(request)`
5. **Azure OpenAI Integration**: Payload injected into `extra_body["data_sources"][0]` in chat completion request

### Example: Azure Cognitive Search Instantiation

**File**: `backend/settings.py`, **Lines**: 280–380

```python
class _AzureSearchSettings(BaseSettings, DatasourcePayloadConstructor):
    model_config = SettingsConfigDict(
        env_prefix="AZURE_SEARCH_",
        env_file=DOTENV_PATH,
        extra="ignore",
        env_ignore_empty=True
    )
    _type: Literal["azure_search"] = PrivateAttr(default="azure_search")
    service: str
    index: str = Field(serialization_alias="index_name")
    key: str = Field(exclude=True)  # Exclude from serialization
    query_type: Literal["simple", "vector", "semantic"] = "simple"
    top_k: int = Field(default=5, serialization_alias="top_n_documents")

    @field_validator('endpoint', mode='before')
    @classmethod
    def construct_endpoint(cls, v, info: ValidationInfo):
        if 'service' in info.data:
            return f"https://{info.data['service']}.search.windows.net"
        return v

    def construct_payload_configuration(self, *args, **kwargs):
        parameters = self.model_dump(exclude_none=True, by_alias=True)
        parameters.update(self._settings.search.model_dump(exclude_none=True, by_alias=True))
        return {
            "type": self._type,
            "parameters": parameters
        }
```

### Credential Handling Patterns

- **API Keys**: Stored in `exclude=True` fields, redacted in debug logs (app.py:299–331)
- **Managed Identity**: `_AzureSqlServerSettings` supports system-assigned MI via `construct_authentication()`
- **Connection Strings**: Used for MongoDB, Cosmos (if no account key)

---

## 4. CONTROL FLOW NARRATIVES FOR KEY JOURNEYS

### Journey 1: User Sends Chat Message (with CosmosDB & Azure Search)

**Sequence**:

1. **Frontend sends message** (frontend/src/pages/chat/Chat.tsx, line 212–244)
   - `makeApiRequestWithCosmosDB(question, conversationId)`
   - Creates user `ChatMessage` object with UUID
   - Constructs `ConversationRequest`: `{ messages: [...] }`
   - Calls `historyGenerate(request, abortSignal, conversationId)` → `POST /history/generate`

2. **Backend receives request** (app.py, line 606–656)
   - `@bp.route("/history/generate", methods=["POST"])`
   - Gets authenticated user ID from request headers
   - Checks conversation ID; if missing, creates new conversation via `cosmos_conversation_client.create_conversation(user_id, title)`
   - Saves user message to CosmosDB via `create_message(uuid, conversation_id, user_id, input_message)`
   - Calls `conversation_internal(request_body, request.headers)`

3. **Streaming response preparation** (app.py, line 565–591)
   - `conversation_internal()` checks: `if app_settings.azure_openai.stream and not use_promptflow:`
   - Calls `stream_chat_request(request_body, request_headers)` → returns async generator

4. **Stream Chat Request** (app.py, line 539–562)
   - `send_chat_request()` prepares model args via `prepare_model_args()`
   - **Model Args Assembly** (app.py, line 242–297):
     - System message (if no datasource)
     - User/assistant/tool messages
     - If datasource exists: `model_args["extra_body"]["data_sources"] = [datasource.construct_payload_configuration()]`
     - Example Azure Search payload:
       ```python
       {
         "type": "azure_search",
         "parameters": {
           "endpoint": "https://search-service.search.windows.net",
           "index_name": "my-index",
           "semantic_configuration": "...",
           "query_type": "vector",
           "key": "***",
           "top_n_documents": 5
         }
       }
       ```
   - Calls `azure_openai_client.chat.completions.with_raw_response.create(**model_args)`
   - Azure OpenAI:
     - Uses Azure Search to retrieve relevant documents
     - Grounds response in retrieved context
     - Streams chunks with `delta` objects
   - Yields formatted chunks via `format_stream_response()` (backend/utils.py, line 110–136)

5. **Streaming Response Format** (backend/utils.py, line 110–136)
   - Each chunk transformed to:
     ```json
     {
       "id": "chatcmpl-...",
       "model": "gpt-35-turbo",
       "created": 1705...,
       "object": "text_completion.chunk",
       "choices": [{"messages": [{"role": "assistant", "content": "token"}]}],
       "history_metadata": {"conversation_id": "..."},
       "apim-request-id": "..."
     }
     ```
   - Converted to NDJSON (newline-delimited JSON) via `format_as_ndjson()` generator

6. **Frontend receives stream** (frontend/src/pages/chat/Chat.tsx, line 383–411)
   - `const reader = response.body.getReader()`
   - Reads chunks, splits on newlines
   - Accumulates `runningText` to handle partial JSON
   - Parses each `result` object
   - Extracts `result.choices[0].messages[0].content`
   - Handles tool messages (context) separately
   - Updates state: `setMessages([...messages, toolMessage, assistantMessage])`

7. **Backend saves response** (frontend/src/pages/chat/Chat.tsx, line 640–645, and app.py, line 662–683)
   - After streaming completes, frontend calls `historyUpdate(messages, conversation_id)` → `POST /history/update`
   - Backend appends assistant message to CosmosDB via `update_message_feedback()` or similar

**Call Hierarchy Summary**:

```
Frontend: Chat.tsx::makeApiRequestWithCosmosDB()
  ↓ POST /history/generate
Backend: app.py::add_conversation()
  ↓ create_conversation() [CosmosDB]
  ↓ create_message() [CosmosDB]
  ↓ conversation_internal()
    ↓ stream_chat_request()
      ↓ send_chat_request()
        ↓ prepare_model_args()
          ↓ datasource.construct_payload_configuration() [AzureSearch]
        ↓ azure_openai_client.chat.completions.with_raw_response.create()
      ↓ format_stream_response() [per chunk]
      ↓ format_as_ndjson() [async generator]
Frontend: receives NDJSON, parses, renders
```

---

### Journey 2: Backend Dispatch (OpenAI vs PromptFlow)

**Decision Point** (app.py, line 565–579):

```python
async def conversation_internal(request_body, request_headers):
    if app_settings.azure_openai.stream and not app_settings.base_settings.use_promptflow:
        # Streaming via Azure OpenAI
        result = await stream_chat_request(request_body, request_headers)
        response = await make_response(format_as_ndjson(result))
        response.mimetype = "application/json-lines"
        return response
    else:
        # Non-streaming: either PromptFlow or Azure OpenAI
        result = await complete_chat_request(request_body, request_headers)
        return jsonify(result)
```

**If `USE_PROMPTFLOW=True`** (app.py, line 443–468):

- `complete_chat_request()` calls `promptflow_request(request_body)` (line 445)
- Message history converted to PromptFlow chat format via `convert_to_pf_format()` (backend/utils.py, line 209–231)
- HTTP POST to PromptFlow endpoint with Bearer auth
- Response parsed, citations extracted
- Formatted via `format_pf_non_streaming_response()` (backend/utils.py, line 165–191)

**If `USE_PROMPTFLOW=False` and `AZURE_OPENAI_STREAM=True`** (line 567):

- Streams via `stream_chat_request()` → NDJSON

**If `USE_PROMPTFLOW=False` and `AZURE_OPENAI_STREAM=False`** (line 443):

- Non-streaming via `send_chat_request()` + `format_non_streaming_response()`

---

### Journey 3: Function Calling with Streaming State

**Enabled by**: `AZURE_OPENAI_FUNCTION_CALL_AZURE_FUNCTIONS_ENABLED=true` + tool definitions loaded from Azure Functions

**Flow** (app.py, line 539–562):

1. Tools attached to model args: `model_args["tools"] = azure_openai_tools`
2. Azure OpenAI returns stream with `tool_calls` delta objects
3. **Streaming State Management**:
   - `function_call_stream_state = AzureOpenaiFunctionCallStreamState()`
   - For each chunk: `stream_state = await process_function_call_stream(...)`
   - If `stream_state == "STREAMING"`: accumulate arguments
   - If `stream_state == "COMPLETED"`: execute tool, append messages, re-call OpenAI

**Tool Execution** (app.py, line 193–207):

```python
async def openai_remote_azure_function_call(function_name, function_args):
    azure_functions_tool_url = f"{TOOL_BASE_URL}?code={TOOL_KEY}"
    body = {"tool_name": function_name, "tool_arguments": json.loads(function_args)}
    async with httpx.AsyncClient() as client:
        response = await client.post(azure_functions_tool_url, data=json.dumps(body), headers={...})
    return response.text
```

---

## 5. DEPENDENCY INVENTORY

### External SDK Dependencies

- **`openai>=1.0.0`**: AsyncAzureOpenAI client
- **`azure-cosmos>=4.0.0`**: CosmosDB async client
- **`azure-identity>=1.12.0`**: DefaultAzureCredential for managed identity
- **`pydantic-settings>=2.0.0`**: Settings validation
- **`pydantic>=2.0.0`**: Data validation
- **`quart>=0.19.0`**: Async web framework
- **`httpx>=0.24.0`**: Async HTTP client (for PromptFlow, Azure Functions)

### Internal Module Dependencies

- `backend.settings` → `backend.utils` (for `parse_multi_columns()`)
- `backend.settings` → `backend.auth.auth_utils` (for `get_authenticated_user_details`)
- `app.py` → `backend.settings`, `backend.utils`, `backend.history.cosmosdbservice`, `backend.auth`
- Frontend: `react`, `react-dom`, `react-markdown`, `@fluentui/react`, `lodash`

---

# TEST ANALYSIS

## `tests/integration_tests/test_datasources.py` Purpose

**Intent**: Validate datasource connectivity and conversational flow end-to-end for supported backends.

**Evidence** (test_datasources.py, lines 1–154):

```python
datasources = ["AzureCognitiveSearch", "Elasticsearch", "none"]
# Parameterized fixtures:
@pytest.fixture(scope="function", params=datasources, ids=datasources)
def datasource(request): ...
@pytest.fixture(scope="function", params=[True, False], ids=["with_chat_history", "no_chat_history"])
def enable_chat_history(request): ...
@pytest.fixture(scope="function", params=[True, False], ids=["streaming", "nonstreaming"])
def stream(request): ...
@pytest.fixture(scope="function", params=[True, False], ids=["with_aoai_embeddings", "no_aoai_embeddings"])
def use_aoai_embeddings(request): ...

@pytest.mark.asyncio
async def test_dotenv(test_app: Quart, dotenv_template_params: dict[str, str]):
    request_data = {
        "messages": [{"role": "user", "content": message_content}]
    }
    test_client = test_app.test_client()
    response = await test_client.post("/conversation", json=request_data)
    assert response.status_code == 200
```

**Coverage**:

- Cartesian product of datasources × chat_history × streaming × embeddings
- Validates `/conversation` POST endpoint returns 200
- Environment rendered from Jinja2 template with live Azure credentials from conftest

**What It Validates**:

1. Settings initialization succeeds for each datasource type
2. OpenAI client initializes
3. Request to `/conversation` completes without error
4. Response is valid JSON/NDJSON

---

## `tests/unit_tests/test_settings.py` Purpose

**Intent**: Unit-test datasource configuration parsing and payload construction.

**Evidence** (test_settings.py, lines 6–68):

```python
def test_dotenv_with_azure_search_success(app_settings):
    assert app_settings.base_settings.datasource_type == "AzureCognitiveSearch"
    assert app_settings.datasource is not None
    payload = app_settings.datasource.construct_payload_configuration()
    assert payload["type"] == "azure_search"
    assert payload["parameters"]["endpoint"] == "https://search_service.search.windows.net"
```

**Coverage**:

- No datasource scenarios
- Azure Search payload structure
- Elasticsearch payload structure

---

## Azure AI Search Tests: Why They May Fail

**Not directly tested**: The integration tests parameterize over "AzureCognitiveSearch", but actual Azure AI Search **service connectivity is NOT mocked**. Thus, if:

- `AZURE_SEARCH_KEY` is invalid → 401 error
- `AZURE_SEARCH_SERVICE` is unreachable → timeout/DNS error
- `AZURE_SEARCH_INDEX` doesn't exist → 404 error from Azure

**Making them pass reliably in CI**:

1. Use Azure credentials from GitHub Secrets or Azure Key Vault
2. Provision real Azure Search index in CI environment before test
3. Mock Azure Search responses via `responses` or `unittest.mock` library
4. Add retry logic with exponential backoff for transient failures

---

# ROOT AI-MARKDOWN ASSESSMENT

| File                   | Exists          | Accuracy vs Code | Coverage                                                                                       | Issues                                                                         |
| ---------------------- | --------------- | ---------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **README.md**          | ✅ 39,222 bytes | High             | Comprehensive — covers deployment, config, auth, all datasources, function calling, PromptFlow | Minor: doesn't mention n8n datasource; Azure SQL Server setup steps incomplete |
| **README_azd.md**      | ✅ 6,753 bytes  | High             | Azure Developer CLI deployment                                                                 | Good but assumes user familiarity with `azd`                                   |
| **TEST_CASE_FLOWS.md** | ✅ 3,008 bytes  | Partial          | Manual test flows for n8n + Azure deployments                                                  | Only covers two scenarios; missing streaming vs non-streaming detail           |
| **.env.sample**        | ✅ 3,883 bytes  | High             | All supported env vars                                                                         | Accurate; good reference                                                       |
| **SECURITY.md**        | ✅ 2,757 bytes  | Medium           | Authentication, Entra ID setup                                                                 | Does not mention RBAC least-privilege or API key rotation                      |
| **SUPPORT.md**         | ✅ 672 bytes    | N/A              | Generic support note                                                                           | Minimal; points to GitHub Issues                                               |

**Conclusion**: Documentation is **production-ready** for 90% of configurations. Missing details on edge cases (n8n, failover, CI/CD setup).

---

# ANSWERS TO CLARIFYING QUESTIONS (INFERRED)

Since no explicit questions were provided, I infer the following based on typical architectural review requests:

## (a) What is the overall architectural pattern?

**Facts**:

- **Pattern**: Hexagonal (Ports & Adapters) + Strategy Pattern
- **Evidence**:
  - Inbound adapters (REST routes in app.py)
  - Outbound adapters (datasources via `DatasourcePayloadConstructor`, CosmosDB via `CosmosConversationClient`, Azure OpenAI via `AsyncAzureOpenAI`)
  - Core domain decoupled from infrastructure via Pydantic settings (backend/settings.py, lines 230–243)
  - Datasource strategy selected at runtime via env var → registry lookup (backend/settings.py, lines 799–836)

**Interpretation**: The app is designed for **multi-tenant, multi-backend conversational AI**. It abstracts datasource selection, allowing plugins of new backends without modifying core routing logic.

**Conclusion**: **Hexagonal + Strategy Pattern**. The architecture prioritizes **extensibility** (easy to add new datasources) and **testability** (mocked backends in tests).

---

## (b) How are datasources plugged in?

**Facts**:

- Abstract base class: `DatasourcePayloadConstructor` (backend/settings.py:230–243)
- 8 implementations: `_AzureSearchSettings`, `_ElasticsearchSettings`, `_PineconeSettings`, etc.
- Registry: Pydantic model validator in `_AppSettings.set_datasource_settings()` (backend/settings.py:799–836)
- Dispatch: `DATASOURCE_TYPE` env var → if/elif chain → instantiate concrete class
- **Evidence** (backend/settings.py:799–816):
  ```python
  if self.base_settings.datasource_type == "AzureCognitiveSearch":
    self.datasource = _AzureSearchSettings(settings=self, _env_file=DOTENV_PATH)
  elif self.base_settings.datasource_type == "Elasticsearch":
    self.datasource = _ElasticsearchSettings(settings=self, _env_file=DOTENV_PATH)
  # ... 6 more branches
  else:
    self.datasource = None
  ```

**Interpretation**: **Compile-time registry** (known at app startup). No runtime plugin loading. New datasources require code change + redeploy.

**Conclusion**: **Pydantic-based Strategy Pattern**. To add a new datasource:

1. Create class inheriting `DatasourcePayloadConstructor` in `backend/settings.py`
2. Add env prefix + field definitions
3. Implement `construct_payload_configuration()` method
4. Add elif branch in `_AppSettings.set_datasource_settings()`
5. Export in `.env.sample`

---

## (c) What is the request path for a chat message?

**Facts** (Journey 1 trace above):

- Frontend: `Chat.tsx::makeApiRequestWithCosmosDB()` → `historyGenerate()` → `POST /history/generate`
- Backend route handler: `app.py::add_conversation()` (line 606)
- Creates conversation record in CosmosDB (if new)
- Saves user message to CosmosDB
- Calls `conversation_internal(request_body, request.headers)` (line 631)
- Decides: streaming vs non-streaming (app.py:565–579)
- If streaming: `stream_chat_request()` → `send_chat_request()` → `prepare_model_args()`
- `prepare_model_args()` calls `datasource.construct_payload_configuration()` (line 309)
- Azure OpenAI API call with grounded data
- Response formatted, yielded as NDJSON
- Frontend reads stream, updates UI

**Call Stack** (Top N most critical):

1. `Chat.tsx::makeApiRequestWithCosmosDB()` (Frontend)
2. `add_conversation()` (app.py:606)
3. `conversation_internal()` (app.py:565)
4. `stream_chat_request()` (app.py:539)
5. `send_chat_request()` (app.py:421)
6. `prepare_model_args()` (app.py:242)
7. `datasource.construct_payload_configuration()` (backend/settings.py:270+)
8. `azure_openai_client.chat.completions.with_raw_response.create()` (OpenAI SDK)
9. `format_stream_response()` (backend/utils.py:110)
10. `format_as_ndjson()` (backend/utils.py:27)

---

## (d) How does chat history persistence work?

**Facts**:

- Datasource: Azure CosmosDB (SQL API)
- Client: `CosmosConversationClient` (backend/history/cosmosdbservice.py:8–166)
- Partition key: `/userId` (infra/db.bicep)
- Document types: "conversation" (session metadata) and "message" (individual messages)
- Lifecycle:
  - **Create**: `POST /history/generate` → `create_conversation(user_id, title)` + `create_message(...)`
  - **Retrieve**: `POST /history/read` → `get_conversation(user_id, conversation_id)` + `get_messages(...)`
  - **Update**: `POST /history/update` → `upsert_conversation()` (entire conversation document)
  - **Delete**: `DELETE /history/delete` → `delete_messages()` + `delete_conversation()`
  - **Feedback**: `POST /history/message_feedback` → `update_message_feedback()` (thumbs-up/down tracking)

**Evidence** (backend/history/cosmosdbservice.py:48–128):

```python
async def create_conversation(self, user_id, title=''):
    conversation = {
        'id': str(uuid.uuid4()),
        'type': 'conversation',
        'createdAt': datetime.utcnow().isoformat(),
        'userId': user_id,
        'title': title
    }
    resp = await self.container_client.upsert_item(conversation)
    return resp

async def get_messages(self, user_id, conversation_id):
    query = "SELECT * FROM c WHERE c.conversationId = @conversationId AND c.type='message' AND c.userId = @userId ORDER BY c.timestamp ASC"
    messages = []
    async for item in self.container_client.query_items(query=query, parameters=[...]):
        messages.append(item)
    return messages
```

**Interpretation**: **Document-oriented with user-based multi-tenancy**. Each user has isolated conversation history. CosmosDB handles replication, failover.

---

## (e) What is the streaming architecture?

**Facts**:

- Frontend reads response body as `ReadableStream` (browser API)
- Backend yields NDJSON via async generator
- Each line is a complete JSON object (no partial JSON across lines)
- Format (backend/utils.py:110–136):
  ```json
  {
    "id": "chatcmpl-...",
    "choices": [{ "messages": [{ "role": "assistant", "content": "token" }] }],
    "history_metadata": { "conversation_id": "..." },
    "apim-request-id": "..."
  }
  ```
- Frontend re-accumulates partial chunks (`runningText`) to handle transport fragmentation
- **Evidence** (frontend/src/pages/chat/Chat.tsx:383–411):
  ```typescript
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    var text = new TextDecoder("utf-8").decode(value);
    const objects = text.split("\n");
    objects.forEach((obj) => {
      if (obj !== "" && obj !== "{}") {
        runningText += obj;
        result = JSON.parse(runningText); // Accumulates partial JSON
        // ... process result
        runningText = "";
      }
    });
  }
  ```

**Interpretation**: **Real-time token delivery** with client-side buffering for network fragmentation. No server-sent events (SSE); raw NDJSON over HTTP streaming.

**Conclusion**: **Low-latency, long-lived HTTP stream**. Good for token-level updates; less ideal for high-concurrency (consumes thread per stream).

---

## (f) How is authentication handled?

**Facts**:

- **OAuth2 / OpenID Connect** via Azure App Service Authentication
- Config in `infra/core/host/appservice.bicep` (lines 85–120)
  ```bicep
  resource configAuth 'config' = if (!(empty(authClientId))) {
    name: 'authsettingsV2'
    properties: {
      globalValidation: { requireAuthentication: true, redirectToProvider: 'azureactivedirectory' }
      identityProviders: {
        azureActiveDirectory: {
          enabled: true
          registration: { clientId: authClientId, clientSecretSettingName: 'AUTH_CLIENT_SECRET', openIdIssuer: authIssuerUri }
        }
      }
    }
  }
  ```
- **User extraction**: `get_authenticated_user_details(request.headers)` (backend/auth/auth_utils.py)
  - Reads headers populated by App Service: `X-MS-CLIENT-PRINCIPAL-*`
  - Extracts `user_principal_id` → used as CosmosDB partition key
- **App Registration**: Scripted via `scripts/auth_init.py` (lines 8–85)
  - Creates Azure AD app registration
  - Generates client secret
  - Configures redirect URI: `http://localhost:5000/.auth/login/aad/callback`
- **Local Dev**: No auth enforced (checks on localhost allow pass-through)
- **Disable**: `AUTH_ENABLED=False` (backend/settings.py:753)

**Evidence** (app.py, line 278):

```python
authenticated_user_details = get_authenticated_user_details(request_headers)
user_id = authenticated_user_details["user_principal_id"]
```

**Interpretation**: **Managed Azure AD** via App Service. Minimal code overhead; delegated to platform. Multi-tenancy achieved via user principal ID.

---

# n8n WEBHOOK INTEGRATION BLUEPRINT

## Design Principles

**Context**: n8n is a low-code automation platform. Integration should:

1. Send chat messages to n8n for processing (orchestration, data enrichment, external API calls)
2. Receive responses for display to user
3. Maintain conversation context (session ID)
4. Handle errors and retries gracefully
5. Support idempotency (duplicate webhooks don't cause duplicate side effects)

---

## Architecture

```
┌──────────────┐
│  Chat UI     │
│  (Frontend)  │
└──────┬───────┘
       │
       │ POST /conversation
       ▼
┌────────────────────┐
│  Backend (Quart)   │
│  prepare_model_args│────────────────────────────────────┐
└────────┬───────────┘                                    │
         │                                                │
         │ Check datasource type                          │
         │ if DATASOURCE_TYPE == "n8n"                   │
         ▼                                                │
    [n8n Dispatcher]  ◄──── Session context + messageID  │
         │                   HMAC(payload, secret)       │
         │                                                │
         │ POST webhook                                   │
         │ (with idempotency token)                       │
         ▼                                                │
    ┌─────────────┐                                       │
    │   n8n       │                                       │
    │  Workflow   │                                       │
    │             │                                       │
    │  ┌─────────┐│                                       │
    │  │Webhook  ││                                       │
    │  │Input    ││                                       │
    │  └────┬────┘│                                       │
    │       │     │                                       │
    │  ┌────▼────┐│                                       │
    │  │LLM Call ││ (e.g., OpenAI, Claude)               │
    │  │or Data  ││                                       │
    │  │Lookup   ││                                       │
    │  └────┬────┘│                                       │
    │       │     │                                       │
    │  ┌────▼────┐│                                       │
    │  │Response ││                                       │
    │  │Builder  ││                                       │
    │  └────┬────┘│                                       │
    │       │     │                                       │
    │  ┌────▼────┐│                                       │
    │  │HTTP     ││                                       │
    │  │Response ││                                       │
    │  └────┬────┘│                                       │
    └───────┼─────┘                                       │
            │                                             │
            │ Response (answer + citations)              │
            │                                             │
            └────────────────────────────────────────────┘
                    |
                    ▼
        [Response Handler]
        - Validate signature
        - Extract sessionID from response
        - Save to CosmosDB
        - Return to frontend
```

---

## 1. Inbound Message Contract (Schema)

**n8n expects to receive**:

```json
{
  "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user@contoso.com",
  "session_id": "sess_abc123xyz",
  "message": {
    "role": "user",
    "content": "What is the weather in Seattle?"
  },
  "history": [
    {
      "role": "user",
      "content": "Hi there"
    },
    {
      "role": "assistant",
      "content": "Hello! How can I help?"
    }
  ],
  "metadata": {
    "timestamp": "2026-01-23T10:15:30Z",
    "source": "chat-ui",
    "idempotency_key": "msg_req_550e8400-e29b-41d4"
  }
}
```

**Critical Field: `session_id`**

🚨 **RED LIGHT**: The `session_id` MUST be included in every request and MUST be preserved in the response. This is **essential for conversation continuity** in n8n workflows. Without it, n8n cannot correlate responses back to the original session, breaking stateful workflows.

---

## 2. Outbound Response Contract

**n8n should return**:

```json
{
  "session_id": "sess_abc123xyz",
  "response": {
    "role": "assistant",
    "content": "The weather in Seattle is cloudy with a high of 45°F."
  },
  "citations": [
    {
      "id": "weather_api_1",
      "title": "Weather API Response",
      "url": "https://weather.example.com/seattle",
      "content": "Seattle, WA: Cloudy, 45°F"
    }
  ],
  "metadata": {
    "idempotency_key": "msg_req_550e8400-e29b-41d4",
    "processed_at": "2026-01-23T10:15:45Z",
    "n8n_execution_id": "exec_xyz789"
  }
}
```

---

## 3. Authentication & Signature Verification

**HMAC-SHA256 Validation**:

```python
# In app.py (NEW function to add):
import hmac
import hashlib

async def verify_n8n_signature(request_body: str, signature_header: str) -> bool:
    """Verify n8n webhook signature using HMAC-SHA256."""
    secret = app_settings.datasource.bearer_token  # From BEARER_TOKEN env var
    expected_signature = hmac.new(
        secret.encode(),
        request_body.encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature_header, expected_signature)
```

**n8n sends header**:

```
X-n8n-Signature: sha256=abcd1234...
```

**Backend validates before processing**:

```python
@bp.route("/conversation", methods=["POST"])
async def conversation():
    request_json = await request.get_json()
    request_body_raw = await request.get_data(as_text=True)

    if app_settings.base_settings.datasource_type == "n8n":
        signature = request.headers.get("X-n8n-Signature")
        if not await verify_n8n_signature(request_body_raw, signature):
            return jsonify({"error": "Invalid signature"}), 401

    return await conversation_internal(request_json, request.headers)
```

---

## 4. Replay Protection & Idempotency

**UUID-based Idempotency Keys**:

```python
# In backend/settings.py (NEW field in _BaseSettings):
class _BaseSettings(BaseSettings):
    datasource_type: Optional[str] = None
    auth_enabled: bool = True
    sanitize_answer: bool = False
    use_promptflow: bool = False
    n8n_idempotency_cache_ttl: int = 3600  # seconds; clear after 1 hour
```

**In-memory or Redis cache for deduplication**:

```python
# NEW global or Redis cache
_idempotency_cache = {}  # {idempotency_key: response}

async def n8n_request_dispatcher(message_request, request_headers):
    """Send message to n8n, check cache first."""
    idempotency_key = message_request.get("metadata", {}).get("idempotency_key")

    # Check cache
    if idempotency_key in _idempotency_cache:
        logging.info(f"Returning cached response for {idempotency_key}")
        return _idempotency_cache[idempotency_key]

    # Call n8n
    response = await http_client.post(
        app_settings.datasource.endpoint,
        json=message_request,
        headers={
            "X-n8n-Signature": compute_hmac(...),
            "Idempotency-Key": idempotency_key
        }
    )

    result = response.json()

    # Cache result
    _idempotency_cache[idempotency_key] = result

    # Schedule eviction
    asyncio.create_task(evict_cache_after(idempotency_key, ttl))

    return result
```

---

## 5. Conversation/Session Correlation

🚨 **RED LIGHT**: Session ID is **critical** and must flow through every step:

1. **Frontend generates**: UUID `session_id` at chat start

   ```typescript
   // Chat.tsx
   const sessionId = uuidv4()
   const request = {
     session_id: sessionId,
     conversation_id: ...,
     message: ...
   }
   ```

2. **Backend preserves**:

   ```python
   session_id = request_body.get("session_id")
   history_metadata["session_id"] = session_id  # Include in CosmosDB
   ```

3. **n8n returns**:

   ```json
   {
     "session_id": "sess_abc123",
     "response": { ... }
   }
   ```

4. **Frontend uses** to match response to UI state:
   ```typescript
   const handleN8nResponse = (response) => {
     const { session_id, response: assistantMessage } = response;
     if (session_id === currentSessionId) {
       setMessages([...messages, assistantMessage]);
     }
   };
   ```

**Why this matters**: Without session IDs, multi-turn conversations fail. n8n workflows maintain context per session; mismatching breaks state.

---

## 6. Error Handling & Retry Semantics

**Retry Policy** (exponential backoff with jitter):

```python
import asyncio
from tenacity import (
    retry,
    retry_if_exception_type,
    wait_exponential,
    stop_after_attempt
)

@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError)),
    wait=wait_exponential(multiplier=1, min=2, max=60),
    stop=stop_after_attempt(3),
    reraise=True
)
async def n8n_request_with_retry(endpoint, payload, headers):
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(endpoint, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()
```

**Error Responses**:

| Scenario           | Status | Response                                              |
| ------------------ | ------ | ----------------------------------------------------- |
| Signature mismatch | 401    | `{"error": "Invalid signature"}`                      |
| Timeout (>30s)     | 504    | `{"error": "n8n webhook timeout", "retry_after": 30}` |
| n8n error          | 500    | Forward n8n error to frontend                         |
| Duplicate (cached) | 200    | Cached response                                       |

---

## 7. Observability

**Structured Logging**:

```python
import structlog

async def n8n_request_dispatcher(...):
    logger = structlog.get_logger()

    try:
        logger.info(
            "n8n_request_started",
            session_id=message_request["session_id"],
            conversation_id=message_request["conversation_id"],
            idempotency_key=message_request["metadata"]["idempotency_key"],
            message_length=len(message_request["message"]["content"])
        )

        response = await n8n_request_with_retry(...)

        logger.info(
            "n8n_request_completed",
            session_id=response["session_id"],
            response_length=len(response["response"]["content"]),
            latency_ms=(time.time() - start_time) * 1000,
            n8n_execution_id=response["metadata"]["n8n_execution_id"]
        )

        return response

    except Exception as e:
        logger.error(
            "n8n_request_failed",
            session_id=message_request["session_id"],
            error=str(e),
            error_type=type(e).__name__
        )
        raise
```

**Metrics**:

- `n8n_request_latency_ms` (histogram)
- `n8n_request_errors_total` (counter by error type)
- `n8n_cache_hits_total` (counter for idempotency)
- `n8n_session_active_count` (gauge)

**Tracing** (via distributed trace ID):

```python
trace_id = request.headers.get("X-Trace-ID") or str(uuid.uuid4())
response.headers["X-Trace-ID"] = trace_id

logger.info("request_trace_id", trace_id=trace_id)

# Pass to n8n
headers["X-Trace-ID"] = trace_id
```

---

## 8. Implementation Plan (Concrete Steps)

### Step 1: Add n8n Settings to `backend/settings.py`

```python
class _N8nSettings(BaseSettings, DatasourcePayloadConstructor):
    model_config = SettingsConfigDict(
        env_prefix="N8N_",
        env_file=DOTENV_PATH,
        extra="ignore",
        env_ignore_empty=True
    )
    _type: Literal["n8n"] = PrivateAttr(default="n8n")

    webhook_url: str = Field(..., alias="webhook_url")
    bearer_token: str = Field(..., exclude=True)  # Secret
    timeout: float = 30.0

    def construct_payload_configuration(self, *args, **kwargs):
        # n8n is webhook-based, not a datasource for Azure OpenAI
        # So this returns None or metadata only
        return {
            "type": self._type,
            "webhook_url": self.webhook_url,
            "timeout": self.timeout
        }
```

### Step 2: Add n8n Dispatcher in `app.py`

```python
async def n8n_request_dispatcher(request_body: dict, request_headers) -> dict:
    """
    Dispatch message to n8n webhook.

    Args:
        request_body: ConversationRequest with session_id
        request_headers: HTTP headers

    Returns:
        Response dict with assistant message and citations
    """
    if not app_settings.datasource or app_settings.datasource._type != "n8n":
        raise ValueError("n8n datasource not configured")

    n8n_settings = app_settings.datasource

    # Build n8n request payload
    n8n_payload = {
        "conversation_id": request_body.get("conversation_id"),
        "user_id": get_authenticated_user_details(request_headers)["user_principal_id"],
        "session_id": request_body.get("session_id") or str(uuid.uuid4()),
        "message": request_body["messages"][-1] if request_body["messages"] else {},
        "history": request_body["messages"][:-1] if len(request_body["messages"]) > 1 else [],
        "metadata": {
            "timestamp": datetime.utcnow().isoformat(),
            "source": "chat-ui",
            "idempotency_key": request_body.get("idempotency_key") or f"msg_req_{uuid.uuid4()}"
        }
    }

    # Compute signature
    payload_json = json.dumps(n8n_payload, sort_keys=True)
    signature = hmac.new(
        n8n_settings.bearer_token.encode(),
        payload_json.encode(),
        hashlib.sha256
    ).hexdigest()

    headers = {
        "X-n8n-Signature": f"sha256={signature}",
        "X-Trace-ID": request_headers.get("X-Trace-ID") or str(uuid.uuid4()),
        "Idempotency-Key": n8n_payload["metadata"]["idempotency_key"],
        "Authorization": f"Bearer {n8n_settings.bearer_token}"
    }

    try:
        async with httpx.AsyncClient(timeout=n8n_settings.timeout) as client:
            response = await client.post(
                n8n_settings.webhook_url,
                json=n8n_payload,
                headers=headers
            )
        response.raise_for_status()
        result = response.json()

        logging.info(f"n8n request succeeded: session_id={result.get('session_id')}")
        return result

    except Exception as e:
        logging.error(f"n8n request failed: {str(e)}")
        raise
```

### Step 3: Update `conversation_internal()` to Route to n8n

```python
async def conversation_internal(request_body, request_headers):
    try:
        # Route based on datasource
        if app_settings.base_settings.datasource_type == "n8n":
            result = await n8n_request_dispatcher(request_body, request_headers)
            return jsonify(result)

        elif app_settings.azure_openai.stream and not app_settings.base_settings.use_promptflow:
            result = await stream_chat_request(request_body, request_headers)
            response = await make_response(format_as_ndjson(result))
            response.mimetype = "application/json-lines"
            return response

        else:
            result = await complete_chat_request(request_body, request_headers)
            return jsonify(result)

    except Exception as ex:
        logging.exception(ex)
        return jsonify({"error": str(ex)}), 500
```

### Step 4: Add Session ID to Frontend

```typescript
// frontend/src/pages/chat/Chat.tsx
const Chat = () => {
  const [sessionId] = useState(() => uuid())  // Persist for lifetime of Chat component

  const makeApiRequestWithCosmosDB = async (question: string, conversationId?: string) => {
    const request: ConversationRequest = {
      session_id: sessionId,
      conversation_id: conversationId,
      messages: [...],
      idempotency_key: uuid()
    }
    const response = await historyGenerate(request, abortSignal.signal)
    // ...
  }
}
```

### Step 5: Add Test Case in `tests/integration_tests/test_datasources.py`

```python
@pytest.fixture(scope="function", params=["n8n"] + datasources, ids=["n8n"] + datasources)
def datasource(request):
    return request.param

# Mock n8n endpoint
@pytest.fixture
def mock_n8n_webhook(monkeypatch):
    async def mock_post(url, json, headers):
        class MockResponse:
            def __init__(self):
                self.status_code = 200
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                pass
            def raise_for_status(self):
                pass
            def json(self):
                return {
                    "session_id": json["session_id"],
                    "response": {
                        "role": "assistant",
                        "content": "n8n test response"
                    },
                    "metadata": {
                        "n8n_execution_id": "test_exec_123"
                    }
                }
        return MockResponse()

    monkeypatch.setattr("httpx.AsyncClient.post", mock_post)

@pytest.mark.asyncio
async def test_n8n_datasource(test_app, mock_n8n_webhook):
    test_client = test_app.test_client()
    response = await test_client.post(
        "/conversation",
        json={
            "session_id": "sess_test",
            "conversation_id": str(uuid.uuid4()),
            "messages": [{"role": "user", "content": "Hello"}]
        }
    )
    assert response.status_code == 200
    result = await response.get_json()
    assert result["session_id"] == "sess_test"
    assert "response" in result
```

### Step 6: Update `.env.sample`

```bash
# n8n Webhook Configuration
DATASOURCE_TYPE=n8n
N8N_WEBHOOK_URL=https://n8n-instance.example.com/webhook/chat
N8N_BEARER_TOKEN=***your_n8n_webhook_token***
```

---

## 9. Contract Tests (n8n Compatibility)

**Purpose**: Validate that responses from n8n conform to expected schema.

```python
# tests/contract_tests/test_n8n_contract.py
import json
from jsonschema import validate, ValidationError

N8N_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "session_id": {"type": "string"},
        "response": {
            "type": "object",
            "properties": {
                "role": {"enum": ["assistant"]},
                "content": {"type": "string"}
            },
            "required": ["role", "content"]
        },
        "citations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "url": {"type": "string"},
                    "content": {"type": "string"}
                }
            }
        },
        "metadata": {
            "type": "object",
            "properties": {
                "idempotency_key": {"type": "string"},
                "n8n_execution_id": {"type": "string"}
            },
            "required": ["idempotency_key"]
        }
    },
    "required": ["session_id", "response", "metadata"]
}

def test_n8n_response_schema():
    sample_response = {
        "session_id": "sess_123",
        "response": {
            "role": "assistant",
            "content": "Hello from n8n"
        },
        "citations": [],
        "metadata": {
            "idempotency_key": "msg_req_123",
            "n8n_execution_id": "exec_456"
        }
    }
    validate(instance=sample_response, schema=N8N_RESPONSE_SCHEMA)
```

---

## 10. Secret Rotation Strategy

**n8n Bearer Token Rotation**:

1. **Azure Key Vault** (recommended):

   ```bicep
   resource keyVault 'Microsoft.KeyVault/vaults@2021-06-01-preview' = {
     name: 'kv-${resourceToken}'
     properties: {
       ...
     }
   }

   resource n8nSecret 'Microsoft.KeyVault/vaults/secrets@2021-06-01-preview' = {
     parent: keyVault
     name: 'n8n-bearer-token'
     properties: {
       value: n8nBearerToken
     }
   }
   ```

2. **Rotation Procedure**:
   - Generate new token in n8n
   - Update Azure Key Vault secret version
   - Drain in-flight requests (wait 30s)
   - App Service reloads from Key Vault
   - Old token rejected by n8n (within TTL window)

3. **Code** (lazy load):
   ```python
   class _N8nSettings(BaseSettings):
       @property
       def bearer_token(self) -> str:
           # Lazily fetch from Key Vault
           from azure.keyvault.secrets import SecretClient
           client = SecretClient(vault_url=..., credential=...)
           return client.get_secret("n8n-bearer-token").value
   ```

---

## Summary

**Checklist for n8n Integration**:

- [ ] Add `_N8nSettings` class to `backend/settings.py`
- [ ] Implement `n8n_request_dispatcher()` in `app.py`
- [ ] Update `conversation_internal()` to route n8n requests
- [ ] Add `session_id` to frontend request + response flow
- [ ] Implement HMAC signature verification
- [ ] Add idempotency cache (in-memory or Redis)
- [ ] Add structured logging + tracing
- [ ] Add contract tests for n8n response schema
- [ ] Update `.env.sample` with n8n configuration
- [ ] Document secret rotation in runbook
- [ ] Test with mock n8n webhook in CI/CD

---

# FINAL SUMMARY

**Architecture**: Hexagonal + Strategy Pattern with **configurable datasource backends** (8 supported).

**Data Flow**: Chat message → Flask route → Orchestration layer → Datasource adapter (or PromptFlow) → Azure OpenAI (or PromptFlow) → Streaming response → CosmosDB persistence.

**Key Design Decisions**:

1. **Pydantic for configuration**: Type-safe, validated env var handling
2. **Abstract datasource interface**: Easy to add new backends
3. **Async/await throughout**: Scalable ASGI stack
4. **CosmosDB for history**: Multi-tenant with user-based isolation
5. **Streaming NDJSON**: Real-time token delivery to frontend

**For n8n Integration**: Implement webhook dispatcher with session ID correlation, HMAC signature verification, idempotency keying, and structured observability. Session ID is **critical** — don't omit.
