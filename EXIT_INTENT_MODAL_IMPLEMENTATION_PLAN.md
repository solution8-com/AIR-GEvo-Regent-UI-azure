# Exit Intent Modal - Implementation Plan

## 1. Feature Definition and Acceptance Criteria

### Core User Journey
1. User opens the chatbot website
2. User types a query
3. Once conversation has ≥1 user message AND ≥1 assistant response:
   - When user attempts to leave (via close/leave action)
   - App instantly flashes screen white once
   - Shows modal with pre-populated intent classification buttons

### Acceptance Criteria

#### Primary Flow
- **AC-1.1**: Modal MUST NOT appear if conversation has no assistant response yet
- **AC-1.2**: Modal MUST appear on first qualifying exit attempt after conversation is qualified
- **AC-1.3**: Screen flash MUST be synchronous (no waiting for API)
- **AC-1.4**: Modal MUST display exactly 5 intent buttons
- **AC-1.5**: Modal MUST show fallback intents if GitHub Models API fails/is slow
- **AC-1.6**: Modal MUST include free-text input option with character limit (e.g., 500 chars)

#### Button Population
- **AC-2.1**: Call GitHub Models API (gpt-5-mini) with entire conversation history
- **AC-2.2**: Parse response to extract 5 intent labels + confidence scores
- **AC-2.3**: Replace fallback buttons with model-generated labels when API returns
- **AC-2.4**: Confidence scores MUST be logged but NOT shown to user
- **AC-2.5**: If API call fails or times out (>3s), keep fallback intents visible

#### State Management
- **AC-3.1**: If user submits (button or free-text), persist "submitted" flag for conversationId
- **AC-3.2**: If user submitted, modal MUST NOT reappear for same conversation
- **AC-3.3**: If user cancels (ESC, X, backdrop click), modal MAY reappear on next exit attempt
- **AC-3.4**: "submitted" flag MUST persist in sessionStorage (incognito-safe)
- **AC-3.5**: "submitted" flag MUST be keyed by conversationId

#### Data Logging
- **AC-4.1**: Log selected intent label (or "none" if free-text only)
- **AC-4.2**: Log confidence score for selected intent (if model-provided)
- **AC-4.3**: Log free-text content (if provided)
- **AC-4.4**: Log timestamp (ISO-8601)
- **AC-4.5**: Log conversationId
- **AC-4.6**: Log "user_canceled_early" flag (true if assistant was responding when exit attempted)
- **AC-4.7**: All logged data MUST be sent to backend for persistence

#### Edge Cases
- **AC-5.1**: If user closes tab/window during assistant streaming, record "user_canceled_early: true"
- **AC-5.2**: If user clicks button, then closes before backend logs, use `navigator.sendBeacon` for fire-and-forget
- **AC-5.3**: If conversationId is null/undefined, generate one before showing modal
- **AC-5.4**: Private browsing: if sessionStorage unavailable, track in-memory only (modal may repeat if page refreshes)
- **AC-5.5**: Safari: ensure exit-intent detection works (see Event Strategy section)

### Non-Functional Requirements
- **NFR-1**: Modal render latency <100ms after trigger
- **NFR-2**: GitHub Models API timeout: 3 seconds
- **NFR-3**: Fallback intents MUST be defined as constants in frontend code
- **NFR-4**: WCAG 2.1 AA compliance: focus trap, ESC to close, ARIA roles
- **NFR-5**: Desktop only (no mobile detection required)

---

## 2. Current Architecture Findings

### Frontend Stack
- **Framework**: React 18.2 with TypeScript
- **State Management**: Context API (`AppStateContext` in `frontend/src/state/AppProvider.tsx`)
- **Routing**: React Router v6
- **Build Tool**: Vite
- **UI Library**: Fluent UI (@fluentui/react v8.109)
- **Testing**: Jest with ts-jest

### Key Files & Patterns

#### Conversation State
- **Location**: `frontend/src/state/AppProvider.tsx` and `AppReducer.tsx`
- **Current Chat**: `state.currentChat: Conversation | null`
  - Structure: `{ id: string, title: string, messages: ChatMessage[], date: string }`
  - `messages` array contains both user and assistant messages
- **Conversation ID Generation**: Uses `react-uuid` package (imported in `Chat.tsx`)
- **Storage**: In-memory state only; CosmosDB integration exists but optional

#### Existing Modal Pattern
- **Component**: `Dialog` from `@fluentui/react`
- **Example**: `frontend/src/components/Answer/Answer.tsx` lines 40-160
  - Uses `useState` hook for `isFeedbackDialogOpen`
  - Dialog props: `hidden`, `onDismiss`, `dialogContentProps`, `modalProps`
  - Has `closeButtonAriaLabel`, `isBlocking: true` for focus trap
- **Pattern**: Local component state for open/close, controlled Dialog component

#### API Layer
- **Location**: `frontend/src/api/api.ts`
- **Backend Calls**: `fetch()` to `/conversation`, `/history/list`, etc.
- **Models**: `frontend/src/api/models.ts` defines TypeScript types
- **Current n8n Integration**: 
  - Backend: `app.py` lines 175-224 handle n8n webhook calls
  - Settings: `backend/settings.py` lines 84-93 define `_N8nSettings`
  - Frontend posts to `/conversation`, backend routes to n8n if `CHAT_PROVIDER=n8n`

#### Backend Architecture
- **Framework**: Quart (async Flask)
- **Main Entry**: `app.py` (47,632 bytes)
- **Routes**: Defined in Blueprint `bp` starting at line 40
- **n8n Integration**:
  - `_send_n8n_request()` at line 175: sends chat to n8n webhook
  - `_complete_n8n_request()` at line 191: handles non-streaming
  - `_stream_n8n_request()` at line 213: handles streaming
  - Settings: `N8N_WEBHOOK_URL` and `N8N_BEARER_TOKEN` from `.env`

#### Testing Infrastructure
- **Frontend**: Jest (`frontend/jest.config.ts`)
  - Single existing test: `frontend/src/components/Answer/AnswerParser.test.ts`
  - Setup file: `frontend/polyfills.js`
- **Backend**: pytest (inferred from `tests/unit_tests/`)
  - Existing: `test_n8n_provider.py`, `test_settings.py`, `test_utils.py`
  - Integration tests in `tests/integration_tests/`

### Conversation Lifecycle (Current)
1. User types in `QuestionInput` component
2. `Chat.tsx` calls `makeApiRequestWithCosmosDB()` or `makeApiRequestWithoutCosmosDB()`
3. If no conversationId, generates one with `uuid()` (line 201)
4. Calls `/conversation` endpoint with messages
5. Backend routes to n8n (if `CHAT_PROVIDER=n8n`)
6. Streams response back, updates `currentChat.messages`
7. Dispatches `UPDATE_CURRENT_CHAT` action to global state

### Browser Event Detection Constraints
- **beforeunload**: Cannot render custom UI (browser-controlled dialog only)
- **pagehide**: Fires reliably on navigation/close, including back/forward cache scenarios
- **visibilitychange**: Fires on tab switch (too noisy for exit intent alone)
- **mouseleave**: Can detect pointer leaving viewport, but needs edge filtering

---

## 3. Proposed Design

### 3.1 Frontend Architecture

#### Component Structure
```
frontend/src/components/ExitIntentModal/
├── ExitIntentModal.tsx          # Main modal component
├── ExitIntentModal.module.css   # Scoped styles
├── ExitIntentButton.tsx         # Individual intent button
├── ExitIntentFreeText.tsx       # Free-text input field
├── useExitIntent.ts             # Custom hook for event detection
├── useIntentClassification.ts   # Custom hook for GitHub Models API
└── constants.ts                 # Fallback intents, timeouts
```

#### State Machine
```typescript
// In ExitIntentModal.tsx
enum ModalState {
  HIDDEN = 'hidden',
  FLASHING = 'flashing',      // White flash in progress
  LOADING = 'loading',        // Showing fallback, API in flight
  READY = 'ready',            // Model intents loaded
  SUBMITTING = 'submitting',  // User clicked, persisting to backend
  DISMISSED = 'dismissed'     // User canceled, modal closed
}
```

#### Integration Points
1. **Mount Location**: `frontend/src/pages/chat/Chat.tsx`
   - Add `<ExitIntentModal />` component at top level (sibling to main chat UI)
   - Pass props: `conversationId`, `messages`, `isAssistantResponding`

2. **Global State Extension** (`frontend/src/state/AppProvider.tsx`):
   ```typescript
   export interface AppState {
     // ... existing fields
     exitIntentSubmitted: { [conversationId: string]: boolean }
   }
   
   export type Action =
     // ... existing actions
     | { type: 'SET_EXIT_INTENT_SUBMITTED'; payload: string } // conversationId
   ```

3. **Conversation Qualification Check**:
   - In `useExitIntent.ts` hook:
     ```typescript
     const isQualified = useMemo(() => {
       if (!messages || messages.length === 0) return false;
       const hasUser = messages.some(m => m.role === 'user');
       const hasAssistant = messages.some(m => m.role === 'assistant');
       return hasUser && hasAssistant;
     }, [messages]);
     ```

### 3.2 Backend Proxy for GitHub Models

#### New API Route
- **Path**: `/api/intent_classification`
- **Method**: POST
- **Location**: Add to `app.py` (new section after conversation routes)

#### Request Schema
```json
{
  "conversation_id": "uuid-string",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

#### Response Schema
```json
{
  "conversation_id": "uuid-string",
  "intents": [
    { "label": "Troubleshooting", "confidence": 0.89 },
    { "label": "Product Inquiry", "confidence": 0.76 },
    { "label": "Billing Question", "confidence": 0.54 },
    { "label": "Feature Request", "confidence": 0.32 },
    { "label": "General Support", "confidence": 0.21 }
  ],
  "model": "gpt-5-mini",
  "generated_at": "2026-01-28T20:30:00.000Z",
  "raw": { ... }  // Optional, gated by DEBUG flag
}
```

#### Error Response
```json
{
  "conversation_id": "uuid-string",
  "error": "GitHub Models API timeout",
  "fallback": true
}
```

#### GitHub Models Integration
- **API Endpoint**: `https://models.github.com/v1/chat/completions`
  - Source: [GitHub Models Documentation](https://docs.github.com/en/github-models)
- **Authentication**: Bearer token (GitHub Personal Access Token)
  - Required Scope: `models:read` (standard for GitHub Models API)
- **Request Headers**:
  ```
  Authorization: Bearer <GITHUB_PAT>
  Content-Type: application/json
  ```

- **Request Payload**:
  ```json
  {
    "model": "gpt-5-mini",
    "messages": [
      {
        "role": "system",
        "content": "You are an intent classification system. Given a conversation, identify the top 5 user intents. Return ONLY a JSON array with this exact structure: [{\"label\":\"Intent Name\",\"confidence\":0.0}]. Confidence must be 0.0-1.0."
      },
      {
        "role": "user",
        "content": "<conversation transcript>"
      }
    ],
    "temperature": 0.3,
    "max_tokens": 300
  }
  ```

- **Response Parsing**:
  ```python
  # Extract JSON array from model response
  # Handle potential markdown code blocks (```json ... ```)
  # Validate structure matches expected schema
  # Sort by confidence descending
  # Take top 5
  ```

#### Backend Implementation (Python)
```python
# In app.py, after /conversation route

@bp.route("/api/intent_classification", methods=["POST"])
async def classify_intent():
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id")
    messages = request_json.get("messages", [])
    
    if not conversation_id:
        return jsonify({"error": "conversation_id required"}), 400
    
    if not app_settings.github_models or not app_settings.github_models.api_key:
        return jsonify({
            "conversation_id": conversation_id,
            "error": "GitHub Models not configured",
            "fallback": True
        }), 200  # Return 200 so frontend uses fallback
    
    try:
        result = await _classify_intent_with_github_models(
            conversation_id, messages
        )
        return jsonify(result), 200
    except Exception as e:
        logging.exception("Intent classification failed")
        return jsonify({
            "conversation_id": conversation_id,
            "error": str(e),
            "fallback": True
        }), 200


async def _classify_intent_with_github_models(conversation_id, messages):
    # Build conversation transcript
    transcript = "\n".join([
        f"{msg['role'].upper()}: {msg['content']}"
        for msg in messages
        if msg.get('content')
    ])
    
    # Call GitHub Models API
    async with httpx.AsyncClient(timeout=3.0) as client:
        response = await client.post(
            "https://models.github.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {app_settings.github_models.api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-5-mini",
                "messages": [
                    {
                        "role": "system",
                        "content": INTENT_CLASSIFICATION_SYSTEM_PROMPT
                    },
                    {
                        "role": "user",
                        "content": transcript
                    }
                ],
                "temperature": 0.3,
                "max_tokens": 300
            }
        )
        response.raise_for_status()
        
        result = response.json()
        intents_json = _extract_intents_from_response(result)
        
        return {
            "conversation_id": conversation_id,
            "intents": intents_json[:5],  # Top 5
            "model": "gpt-5-mini",
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "raw": result if DEBUG else None
        }


def _extract_intents_from_response(api_result):
    """Parse GitHub Models response, handle markdown wrapping."""
    content = api_result["choices"][0]["message"]["content"]
    
    # Remove markdown code blocks if present
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0]
    elif "```" in content:
        content = content.split("```")[1].split("```")[0]
    
    intents = json.loads(content.strip())
    
    # Validate structure
    for intent in intents:
        if not isinstance(intent.get("label"), str):
            raise ValueError("Invalid intent structure")
        if not isinstance(intent.get("confidence"), (int, float)):
            raise ValueError("Invalid confidence value")
    
    # Sort by confidence
    return sorted(intents, key=lambda x: x["confidence"], reverse=True)
```

#### Settings Extension
```python
# In backend/settings.py

class _GitHubModelsSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="GITHUB_MODELS_",
        env_file=DOTENV_PATH,
        extra="ignore",
        env_ignore_empty=True
    )
    
    api_key: Optional[str] = None
    endpoint: str = "https://models.github.com/v1/chat/completions"
    timeout_seconds: float = 3.0


class AppSettings(BaseSettings):
    # ... existing fields
    github_models: Optional[_GitHubModelsSettings] = None
    
    def __init__(self):
        super().__init__()
        try:
            self.github_models = _GitHubModelsSettings()
        except ValidationError:
            self.github_models = None
```

#### Environment Variables
```bash
# In .env.sample and .env
GITHUB_MODELS_API_KEY=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_MODELS_ENDPOINT=https://models.github.com/v1/chat/completions
GITHUB_MODELS_TIMEOUT_SECONDS=3.0
```

### 3.3 n8n Integration (Optional Enhancement)

**Note**: The requirement states "only n8n backend is in scope," but the GitHub Models classification is independent of the chat provider. We can:

1. **Option A (Recommended)**: Call GitHub Models directly from Python backend
   - Simpler, no n8n changes needed
   - GitHub PAT stays on server side (secure)

2. **Option B**: Proxy through n8n
   - Add n8n workflow node to call GitHub Models
   - Requires n8n configuration changes
   - Adds latency and complexity

**Decision**: Use Option A. The intent classification is orthogonal to chat backend; treating it as a separate service is cleaner.

### 3.4 Data Logging Backend

#### New API Route
- **Path**: `/api/log_exit_intent`
- **Method**: POST

#### Request Schema
```json
{
  "conversation_id": "uuid-string",
  "selected_intent": "Troubleshooting",
  "confidence": 0.89,
  "free_text": "Optional user comment",
  "timestamp": "2026-01-28T20:30:00.000Z",
  "user_canceled_early": false,
  "source": "model" | "fallback"
}
```

#### Storage Options
1. **CosmosDB** (if configured): Add to existing conversations collection as metadata
2. **File Log** (fallback): Append to `/data/exit_intent_logs.jsonl`
3. **Application Insights** (Azure): Structured telemetry event

**Recommended**: CosmosDB if available, else file log with rotation.

#### Implementation
```python
# In app.py

@bp.route("/api/log_exit_intent", methods=["POST"])
async def log_exit_intent():
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    
    log_data = await request.get_json()
    
    # Validate required fields
    required = ["conversation_id", "timestamp"]
    if not all(k in log_data for k in required):
        return jsonify({"error": "missing required fields"}), 400
    
    try:
        # Store in CosmosDB if available
        if current_app.cosmos_conversation_client:
            await _store_exit_intent_cosmos(log_data)
        else:
            await _store_exit_intent_file(log_data)
        
        return jsonify({"success": True}), 200
    except Exception as e:
        logging.exception("Failed to log exit intent")
        return jsonify({"error": str(e)}), 500


async def _store_exit_intent_cosmos(log_data):
    """Store in CosmosDB conversations collection."""
    conversation_id = log_data["conversation_id"]
    await current_app.cosmos_conversation_client.upsert_conversation_metadata(
        conversation_id,
        {"exit_intent": log_data}
    )


async def _store_exit_intent_file(log_data):
    """Append to JSONL file."""
    log_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, "exit_intent_logs.jsonl")
    
    async with aiofiles.open(log_path, "a") as f:
        await f.write(json.dumps(log_data) + "\n")
```

---

## 4. Event Strategy and Compatibility

### Exit Intent Detection Strategy

#### Signal Ranking
1. **Primary: Top-Edge Pointer Exit** (Desktop)
   - Event: `mouseleave` on `document` with `clientY <= 0`
   - Rationale: User moving to close/minimize buttons
   - False Positive Prevention: Ignore if `clientY > 50` (side exits)
   - Debounce: 500ms cooldown after first trigger

2. **Secondary: Page Hide** (Navigation/Close)
   - Event: `pagehide` on `window`
   - Rationale: Actual page unload (close tab, navigate away)
   - Limitation: Cannot render modal here (too late), use for "user_canceled_early" flag

3. **Tertiary: Visibility Change** (Tab Switch)
   - Event: `visibilitychange` when `document.hidden === true`
   - Rationale: User switching tabs (low-confidence exit)
   - Constraint: NEVER show modal on this alone; only log as supporting evidence

#### Event Ordering & Cooldown
```typescript
// In useExitIntent.ts

let lastTriggerTime = 0;
let isModalOpen = false;
const COOLDOWN_MS = 5000; // 5 seconds between triggers

function handleMouseLeave(event: MouseEvent) {
  if (isModalOpen) return;
  if (Date.now() - lastTriggerTime < COOLDOWN_MS) return;
  
  // Top-edge exit only
  if (event.clientY > 0) return;
  
  lastTriggerTime = Date.now();
  triggerModal();
}

function handlePageHide() {
  // Too late to show modal, but log "user_canceled_early"
  if (isAssistantResponding) {
    logExitIntent({ user_canceled_early: true });
  }
}

function handleVisibilityChange() {
  if (document.hidden) {
    // Log supporting evidence, don't trigger modal
    console.debug("User switched tabs");
  }
}
```

#### Browser Compatibility

**Target Baseline**: "Corporate environment" = Windows 10+ with Chromium-based browsers
- Chrome/Edge 90+ (pagehide support: ✅)
- Firefox 90+ (pagehide support: ✅)
- Safari 15+ (pagehide support: ✅, but back/forward cache quirks)

**Safari Considerations**:
- `pagehide` is supported but may not fire if page is cached
- `visibilitychange` + `beforeunload` combo as fallback
- Reference: [MDN: pagehide event](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event)

**Detection Code**:
```typescript
const supportsPageHide = 'onpagehide' in window;
const eventName = supportsPageHide ? 'pagehide' : 'beforeunload';
```

### Focus Trap & Accessibility

#### ARIA Implementation
```typescript
// In ExitIntentModal.tsx
<Dialog
  hidden={state !== ModalState.READY}
  onDismiss={handleCancel}
  dialogContentProps={{
    type: DialogType.normal,
    title: "Before you go...",
    closeButtonAriaLabel: "Close",
    subText: "Hey, it looks like you have tried to close the window..."
  }}
  modalProps={{
    isBlocking: true,  // Focus trap
    containerClassName: styles.modalContainer
  }}
  firstFocusableSelector="button[data-intent-button]:first-of-type"
>
  {/* Content */}
</Dialog>
```

#### Focus Management
- On open: Focus first intent button
- On ESC: Close modal, restore focus to last active element
- Trap focus within modal (Fluent UI handles this with `isBlocking: true`)

#### Keyboard Navigation
- Tab: Cycle through buttons and free-text field
- ESC: Close modal (cancel action)
- Enter on button: Submit selected intent
- Enter in free-text: Submit with free-text

### White Flash Implementation

```typescript
// In ExitIntentModal.tsx
function triggerFlash() {
  // Create full-screen white overlay
  const flash = document.createElement('div');
  flash.className = styles.flashOverlay;
  document.body.appendChild(flash);
  
  // Remove after 150ms
  setTimeout(() => {
    flash.remove();
    setModalState(ModalState.LOADING);
  }, 150);
}
```

```css
/* In ExitIntentModal.module.css */
.flashOverlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: white;
  z-index: 9999;
  animation: flashFade 150ms ease-out;
}

@keyframes flashFade {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
```

---

## 5. API Contracts

### 5.1 Frontend → Backend Proxy (Intent Classification)

#### Endpoint: `POST /api/intent_classification`

**Request**:
```typescript
interface IntentClassificationRequest {
  conversation_id: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}
```

**Response** (Success):
```typescript
interface IntentClassificationResponse {
  conversation_id: string;
  intents: Array<{
    label: string;
    confidence: number; // 0.0 - 1.0
  }>;
  model: string; // "gpt-5-mini"
  generated_at: string; // ISO-8601
  raw?: any; // Optional, only in DEBUG mode
}
```

**Response** (Fallback):
```typescript
interface IntentClassificationFallbackResponse {
  conversation_id: string;
  error: string;
  fallback: true;
}
```

**Status Codes**:
- 200: Success or fallback (check `fallback` field)
- 400: Invalid request
- 500: Server error (frontend should use fallback)

**Timeout**: 3 seconds on frontend, 3.5 seconds on backend

### 5.2 Frontend → Backend (Logging)

#### Endpoint: `POST /api/log_exit_intent`

**Request**:
```typescript
interface ExitIntentLogRequest {
  conversation_id: string;
  selected_intent?: string; // Omit if free-text only
  confidence?: number; // Omit if fallback intent
  free_text?: string; // User comment
  timestamp: string; // ISO-8601
  user_canceled_early: boolean;
  source: 'model' | 'fallback';
}
```

**Response**:
```typescript
interface ExitIntentLogResponse {
  success: boolean;
}
```

**Constraints**:
- Use `navigator.sendBeacon()` if modal is closing during page unload
- Fallback to `fetch()` with `keepalive: true` if `sendBeacon` unavailable

**Implementation**:
```typescript
function logExitIntent(data: ExitIntentLogRequest) {
  const url = '/api/log_exit_intent';
  const payload = JSON.stringify(data);
  
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, payload);
  } else {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    });
  }
}
```

### 5.3 Backend → GitHub Models

#### Endpoint: `POST https://models.github.com/v1/chat/completions`

**Request Headers**:
```
Authorization: Bearer <GITHUB_PAT>
Content-Type: application/json
```

**Request Body**:
```json
{
  "model": "gpt-5-mini",
  "messages": [
    {
      "role": "system",
      "content": "<classification prompt>"
    },
    {
      "role": "user",
      "content": "<conversation transcript>"
    }
  ],
  "temperature": 0.3,
  "max_tokens": 300
}
```

**System Prompt**:
```
You are an intent classification system for a compliance assistant chatbot. Analyze the conversation and identify the top 5 user intents. Common intents include:
- Troubleshooting (user has an issue)
- Product/Feature Inquiry (user wants to learn)
- Compliance Question (regulatory guidance)
- Billing/Account (account management)
- General Support (other)

Return ONLY a JSON array with exactly 5 objects in this format:
[
  {"label": "Intent Name", "confidence": 0.89},
  ...
]

Confidence must be a float 0.0-1.0. Sort by confidence descending.
```

**Response** (Success):
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-5-mini",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "[{\"label\":\"...\",\"confidence\":0.0},...]"
      },
      "finish_reason": "stop"
    }
  ]
}
```

**Parsing Notes**:
- Response may be wrapped in markdown code blocks: ` ```json ... ``` `
- Backend MUST strip markdown before parsing JSON
- Validate array length >= 5, truncate if more
- Validate confidence is numeric

---

## 6. Step-by-Step Implementation Phases

### Phase 1: Backend Proxy Setup
**Goal**: Secure GitHub Models API access via backend

**Tasks**:
1. Add `_GitHubModelsSettings` to `backend/settings.py`
2. Add `GITHUB_MODELS_API_KEY` to `.env.sample` and `.env`
3. Implement `/api/intent_classification` route in `app.py`
4. Implement `_classify_intent_with_github_models()` function
5. Implement `_extract_intents_from_response()` parser
6. Add error handling for timeout, invalid API key, quota exceeded

**Tests**:
- Unit test: `test_intent_classification_parsing()` (mock GitHub response)
- Integration test: `test_intent_classification_api()` (with valid PAT)
- Integration test: `test_intent_classification_timeout()` (mock slow response)
- Integration test: `test_intent_classification_fallback()` (invalid PAT)

**Acceptance**: 
- `POST /api/intent_classification` returns 200 with 5 intents
- Fallback response returns 200 with `fallback: true`
- Timeout after 3 seconds returns fallback

---

### Phase 2: Backend Logging Endpoint
**Goal**: Persist exit intent data

**Tasks**:
1. Implement `/api/log_exit_intent` route in `app.py`
2. Implement CosmosDB storage: `_store_exit_intent_cosmos()`
3. Implement file fallback: `_store_exit_intent_file()`
4. Add schema validation for incoming log data

**Tests**:
- Unit test: `test_log_exit_intent_validation()` (missing fields)
- Integration test: `test_log_exit_intent_cosmos()` (if CosmosDB available)
- Integration test: `test_log_exit_intent_file()` (fallback)

**Acceptance**:
- Log data appears in CosmosDB or `/data/exit_intent_logs.jsonl`
- Invalid requests return 400

---

### Phase 3: Frontend - Exit Intent Detection Hook
**Goal**: Detect user exit attempts

**Tasks**:
1. Create `frontend/src/components/ExitIntentModal/useExitIntent.ts`
2. Implement `mouseleave` listener with top-edge filtering
3. Implement `pagehide` listener for "user_canceled_early"
4. Implement `visibilitychange` listener (logging only)
5. Add cooldown and debounce logic
6. Add conversation qualification check

**Tests**:
- Unit test: `useExitIntent.test.ts`
  - Mock `mouseleave` with `clientY = -10` → triggers
  - Mock `mouseleave` with `clientY = 50` → does not trigger
  - Trigger twice within cooldown → second ignored
  - Conversation not qualified → never triggers

**Acceptance**:
- Hook returns `{ shouldShowModal: boolean, userCanceledEarly: boolean }`
- Only triggers when conversation has user + assistant messages

---

### Phase 4: Frontend - Intent Classification Hook
**Goal**: Call backend API and manage intent state

**Tasks**:
1. Create `frontend/src/components/ExitIntentModal/useIntentClassification.ts`
2. Implement `fetch('/api/intent_classification')` with 3s timeout
3. Define fallback intents as constants
4. Implement state machine: loading → ready / fallback
5. Handle API errors gracefully

**Tests**:
- Unit test: `useIntentClassification.test.ts`
  - Mock successful API response → returns 5 model intents
  - Mock timeout → returns fallback intents
  - Mock error → returns fallback intents

**Acceptance**:
- Hook returns `{ intents: Intent[], isLoading: boolean, source: 'model' | 'fallback' }`
- Fallback intents are valid if API fails

---

### Phase 5: Frontend - Modal Component
**Goal**: Render modal with intents and free-text

**Tasks**:
1. Create `frontend/src/components/ExitIntentModal/ExitIntentModal.tsx`
2. Implement white flash animation
3. Implement Fluent UI `Dialog` with ARIA props
4. Render 5 intent buttons (map from hook)
5. Add free-text input with 500 char limit
6. Implement submit handler → calls `/api/log_exit_intent`
7. Implement cancel handler → closes modal
8. Persist "submitted" flag in sessionStorage

**Tests**:
- Component test: `ExitIntentModal.test.tsx`
  - Renders with fallback intents
  - Replaces with model intents when loaded
  - Submit button disabled until intent selected or text entered
  - ESC key closes modal
  - After submit, modal does not reappear

**Acceptance**:
- Modal matches design (white flash, 5 buttons, free-text)
- Accessible (focus trap, ESC, ARIA)
- Submits data to backend

---

### Phase 6: Frontend - Integration with Chat Page
**Goal**: Wire modal into existing chat UI

**Tasks**:
1. Add `<ExitIntentModal />` to `frontend/src/pages/chat/Chat.tsx`
2. Pass props: `conversationId`, `messages`, `isAssistantResponding`
3. Extend `AppState` to track `exitIntentSubmitted`
4. Add `SET_EXIT_INTENT_SUBMITTED` action to reducer

**Tests**:
- Integration test: `Chat.integration.test.tsx`
  - User types message → sends to backend → receives response
  - User moves mouse to top edge → modal appears
  - User clicks intent → modal closes
  - User moves mouse to top edge again → modal does not appear

**Acceptance**:
- Modal appears in chat page on exit attempt
- Conversation state is correctly passed
- Submitted flag persists across renders

---

### Phase 7: End-to-End Testing
**Goal**: Validate full user journey

**Tasks**:
1. Manual test: Desktop Chrome
   - Start new chat → type message → get response
   - Move mouse to top edge → see white flash + modal
   - Select intent → submit → modal closes
   - Try to leave again → modal does not reappear
2. Manual test: Desktop Firefox
3. Manual test: Desktop Safari
4. Manual test: Private browsing (all browsers)

**Tests**:
- E2E test (if Playwright/Cypress exists): `exitIntentFlow.e2e.ts`
  - Simulate full flow from chat to exit to submit

**Acceptance**:
- All manual tests pass
- Cross-browser compatibility confirmed

---

### Phase 8: Observability & Monitoring
**Goal**: Add logging for debugging

**Tasks**:
1. Add backend logging: API call latency, error rates
2. Add frontend logging: modal trigger events, API call results
3. Add metrics (if Application Insights configured)

**Tests**:
- Manual verification: logs appear in console/files

**Acceptance**:
- Can trace full flow from exit trigger to backend log

---

## 7. Test Plan

### 7.1 Unit Tests (Backend)

**Framework**: pytest

**Files to create**:
- `tests/unit_tests/test_intent_classification.py`
- `tests/unit_tests/test_exit_intent_logging.py`

**Test Cases**:

#### `test_intent_classification.py`
```python
def test_extract_intents_from_json_response():
    """Parse clean JSON array from GitHub Models."""
    mock_response = {
        "choices": [{
            "message": {
                "content": '[{"label":"Troubleshooting","confidence":0.9}]'
            }
        }]
    }
    result = _extract_intents_from_response(mock_response)
    assert len(result) == 1
    assert result[0]["label"] == "Troubleshooting"

def test_extract_intents_from_markdown_wrapped():
    """Handle markdown code blocks."""
    mock_response = {
        "choices": [{
            "message": {
                "content": '```json\n[{"label":"Test","confidence":0.5}]\n```'
            }
        }]
    }
    result = _extract_intents_from_response(mock_response)
    assert len(result) == 1

def test_intent_classification_timeout():
    """Return fallback on timeout."""
    # Mock httpx.AsyncClient to raise timeout
    # Assert response has `fallback: true`

def test_intent_classification_invalid_api_key():
    """Return fallback on 401."""
    # Mock 401 response
    # Assert fallback response
```

#### `test_exit_intent_logging.py`
```python
def test_log_exit_intent_missing_conversation_id():
    """Reject request without conversation_id."""
    response = client.post("/api/log_exit_intent", json={})
    assert response.status_code == 400

def test_log_exit_intent_success():
    """Store log data."""
    data = {
        "conversation_id": "test-123",
        "selected_intent": "Test",
        "timestamp": "2026-01-28T20:30:00Z",
        "user_canceled_early": False,
        "source": "fallback"
    }
    response = client.post("/api/log_exit_intent", json=data)
    assert response.status_code == 200
    # Verify data in file or mock CosmosDB
```

### 7.2 Unit Tests (Frontend)

**Framework**: Jest + React Testing Library

**Files to create**:
- `frontend/src/components/ExitIntentModal/useExitIntent.test.ts`
- `frontend/src/components/ExitIntentModal/useIntentClassification.test.ts`
- `frontend/src/components/ExitIntentModal/ExitIntentModal.test.tsx`

**Test Cases**:

#### `useExitIntent.test.ts`
```typescript
describe('useExitIntent', () => {
  it('should not trigger if conversation not qualified', () => {
    const { result } = renderHook(() => useExitIntent({
      messages: [{ role: 'user', content: 'Hi' }], // No assistant
      conversationId: 'test-1',
      isAssistantResponding: false
    }));
    
    fireEvent(document, new MouseEvent('mouseleave', { clientY: -10 }));
    expect(result.current.shouldShowModal).toBe(false);
  });
  
  it('should trigger on top-edge mouse exit', () => {
    const { result } = renderHook(() => useExitIntent({
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' }
      ],
      conversationId: 'test-1',
      isAssistantResponding: false
    }));
    
    fireEvent(document, new MouseEvent('mouseleave', { clientY: -10 }));
    expect(result.current.shouldShowModal).toBe(true);
  });
  
  it('should not trigger on side exit', () => {
    // clientY > 0
  });
  
  it('should apply cooldown', () => {
    // Trigger twice within 5s, second should be ignored
  });
});
```

#### `useIntentClassification.test.ts`
```typescript
describe('useIntentClassification', () => {
  it('should return fallback intents on API error', async () => {
    global.fetch = jest.fn(() => Promise.reject('Network error'));
    
    const { result } = renderHook(() => useIntentClassification({
      conversationId: 'test-1',
      messages: []
    }));
    
    await waitFor(() => expect(result.current.source).toBe('fallback'));
    expect(result.current.intents).toHaveLength(5);
  });
  
  it('should return model intents on success', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      json: () => Promise.resolve({
        intents: [{ label: 'Test', confidence: 0.9 }],
        conversation_id: 'test-1'
      })
    }));
    
    const { result } = renderHook(() => useIntentClassification({
      conversationId: 'test-1',
      messages: []
    }));
    
    await waitFor(() => expect(result.current.source).toBe('model'));
  });
});
```

#### `ExitIntentModal.test.tsx`
```typescript
describe('ExitIntentModal', () => {
  it('should render with 5 intent buttons', () => {
    render(<ExitIntentModal
      isOpen={true}
      intents={[...]} // 5 fallback intents
      onSubmit={jest.fn()}
      onCancel={jest.fn()}
    />);
    
    expect(screen.getAllByRole('button')).toHaveLength(6); // 5 intents + cancel
  });
  
  it('should close on ESC key', () => {
    const onCancel = jest.fn();
    render(<ExitIntentModal isOpen={true} onCancel={onCancel} />);
    
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
  
  it('should submit with selected intent', () => {
    const onSubmit = jest.fn();
    render(<ExitIntentModal isOpen={true} onSubmit={onSubmit} />);
    
    fireEvent.click(screen.getByText('Troubleshooting'));
    fireEvent.click(screen.getByText('Submit'));
    
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      selected_intent: 'Troubleshooting'
    }));
  });
});
```

### 7.3 Integration Tests

**Backend**:
- `tests/integration_tests/test_intent_classification_api.py`
  - Real call to GitHub Models (conditional on PAT env var)
  - Verify response structure

**Frontend**:
- `frontend/src/pages/chat/Chat.integration.test.tsx`
  - Mock `/conversation` API
  - Mock `/api/intent_classification` API
  - Simulate full user flow

### 7.4 E2E Tests (Manual)

**Scenarios**:
1. **Happy Path**: User completes conversation → tries to leave → selects intent → submits
2. **Cancel**: User opens modal → clicks cancel → modal closes → tries to leave again → modal reappears
3. **Free-text**: User enters only free-text → submits
4. **API Timeout**: Slow network → fallback intents appear
5. **Private Browsing**: Modal works, but may repeat after page refresh
6. **Safari**: Verify exit detection works

**Tools**: Manual testing with DevTools to simulate slow network

---

## 8. Observability

### 8.1 Backend Logging

**What to Log**:
1. Intent classification API call start/end (duration, result)
2. GitHub Models API errors (status code, error message)
3. Exit intent log submissions (conversation_id, selected intent)
4. Fallback usage (when GitHub Models is unavailable)

**Log Levels**:
- INFO: Successful classification, log submissions
- WARNING: Timeouts, fallback responses
- ERROR: Invalid PAT, GitHub API errors

**Example**:
```python
logging.info(f"Intent classification for {conversation_id}: {len(intents)} intents, latency={duration}ms")
logging.warning(f"Intent classification timeout for {conversation_id}, using fallback")
logging.error(f"GitHub Models API error: {status_code} {error_message}")
```

### 8.2 Frontend Logging

**What to Log**:
1. Exit intent trigger (event type, timestamp)
2. API call results (success, fallback, error)
3. Modal state transitions (open, submit, cancel)
4. User actions (intent selected, free-text entered)

**Console Log Examples**:
```typescript
console.debug('[ExitIntent] Triggered by mouseleave at top edge');
console.debug('[ExitIntent] API returned 5 model intents in 1.2s');
console.debug('[ExitIntent] User selected: Troubleshooting (confidence: 0.89)');
console.warn('[ExitIntent] API timeout, using fallback intents');
```

**Production**: Gate debug logs behind `DEBUG` env var

### 8.3 Metrics (Application Insights)

**Custom Events**:
1. `ExitIntentTriggered` (count, conversation_id)
2. `ExitIntentSubmitted` (count, selected_intent, source)
3. `ExitIntentCanceled` (count)
4. `IntentClassificationLatency` (milliseconds)

**Implementation** (if Azure App Insights configured):
```typescript
// In frontend
appInsights.trackEvent({
  name: 'ExitIntentSubmitted',
  properties: {
    conversationId: data.conversation_id,
    selectedIntent: data.selected_intent,
    source: data.source
  }
});
```

---

## 9. Risks and Mitigations

### Risk 1: GitHub Models API Rate Limits
**Impact**: High usage could hit quota limits, causing fallback intents for all users

**Mitigation**:
1. Implement caching: If same conversation triggers multiple times within 5 minutes, reuse previous classification
2. Monitor API usage via observability logs
3. Implement exponential backoff on 429 responses
4. Fallback intents are designed to be reasonable defaults

**Detection**: Spike in fallback usage rate

---

### Risk 2: PAT Leakage
**Impact**: GitHub PAT exposed to frontend = security breach

**Mitigation**:
1. NEVER send PAT to frontend
2. Backend proxy MUST handle all GitHub Models calls
3. Code review: Ensure no accidental logging of PAT
4. Rotate PAT periodically (30-90 days)

**Detection**: Security audit, grep for `GITHUB_MODELS_API_KEY` in frontend code

---

### Risk 3: Modal Trigger False Positives
**Impact**: Modal appears when user is not leaving (annoys user)

**Mitigation**:
1. Top-edge exit only (ignore side/bottom)
2. Cooldown period (5 seconds between triggers)
3. Do not trigger on `visibilitychange` alone
4. User can cancel modal (doesn't block navigation)

**Detection**: User feedback, observability logs showing high cancel rate

---

### Risk 4: Browser Compatibility (Safari)
**Impact**: Exit detection may not work reliably on Safari

**Mitigation**:
1. Feature detection for `pagehide` event
2. Fallback to `beforeunload` (limited UX)
3. Test on Safari 15+ during Phase 7
4. Document Safari limitations if found

**Detection**: Manual testing, user reports

---

### Risk 5: Private Browsing SessionStorage Unavailable
**Impact**: "Submitted" flag lost on page refresh, modal reappears

**Mitigation**:
1. Try `sessionStorage.setItem()` in try/catch
2. Fallback to in-memory Map if unavailable
3. Accept that modal may repeat in strict private mode (acceptable UX degradation)

**Detection**: Manual private browsing tests

---

### Risk 6: Intent Classification Latency
**Impact**: If GitHub Models API is slow (>3s), user sees fallback intents

**Mitigation**:
1. 3-second timeout enforced
2. Fallback intents are pre-defined and reasonable
3. User does not see loading state (buttons are always visible)
4. Log latency for monitoring

**Detection**: Observability metrics showing >3s response time

---

### Risk 7: Race Condition: User Closes Tab During API Call
**Impact**: Log data may not reach backend if tab closes immediately after submit

**Mitigation**:
1. Use `navigator.sendBeacon()` for fire-and-forget logging
2. Fallback to `fetch()` with `keepalive: true`
3. Accept small data loss in edge cases (acceptable tradeoff)

**Detection**: Logs showing submit events without corresponding backend logs (rare)

---

### Risk 8: CosmosDB Unavailable
**Impact**: Exit intent logs cannot be stored in database

**Mitigation**:
1. Fallback to file-based logging (`/data/exit_intent_logs.jsonl`)
2. File logging should always succeed (unless disk full)
3. Add log rotation to prevent disk fill

**Detection**: Backend logs showing file storage fallback

---

## 10. Open Questions

### Q1: GitHub Models API Endpoint Validation
**Question**: Is `https://models.github.com/v1/chat/completions` the correct endpoint for GitHub Models API? 

**Context**: Problem statement references "GitHub Models using model gpt-5-mini" but does not specify exact endpoint. 

**Follow-up Needed**: Confirm endpoint and model name with authoritative GitHub Models documentation.

**Assumption for Planning**: Using OpenAI-compatible endpoint structure. Will validate during Phase 1.

---

### Q2: Model Name "gpt-5-mini" Availability
**Question**: Is "gpt-5-mini" an actual available model in GitHub Models, or is it a placeholder?

**Context**: As of Jan 2026, OpenAI's latest models are GPT-4o and GPT-4-turbo. "gpt-5-mini" may not exist.

**Follow-up Needed**: Confirm actual model name to use (e.g., `gpt-4o-mini`, `gpt-4-turbo`).

**Assumption for Planning**: Using "gpt-5-mini" as specified; will update to actual model in Phase 1.

---

### Q3: Intent Classification Prompt Engineering
**Question**: Should fallback intents be domain-specific (compliance assistant) or generic?

**Context**: The app is a "Compliance Assistant" per `backend/settings.py` UI title. Should fallback intents reflect this domain?

**Follow-up Needed**: Review with product owner for preferred fallback intent labels.

**Assumption for Planning**: Using domain-agnostic fallbacks (Troubleshooting, Product Inquiry, etc.) for maximum reusability.

**Example Fallbacks**:
1. "Troubleshooting an issue"
2. "Learning about a feature"
3. "Compliance question"
4. "Account or billing"
5. "General support"

---

### Q4: Data Retention Policy
**Question**: How long should exit intent logs be retained?

**Context**: Logs contain conversation metadata and user intent. May have privacy implications.

**Follow-up Needed**: Define retention policy (e.g., 90 days, 1 year, indefinite).

**Assumption for Planning**: Store logs indefinitely; implement rotation/archival later if needed.

---

### Q5: Screenshot Reference
**Question**: Problem statement mentions "{{SCREENSHOT}}" but none was provided. Should modal design match existing Fluent UI patterns, or is there a specific mockup?

**Context**: Exit intent modal will use Fluent UI Dialog, but layout (button arrangement, colors, etc.) is not specified.

**Follow-up Needed**: Provide design mockup or confirm using default Fluent UI styling.

**Assumption for Planning**: Using Fluent UI defaults with 5 buttons in vertical stack, free-text below.

---

### Q6: Multi-Backend Scope Clarification
**Question**: Problem statement says "only n8n backend is in scope," but intent classification is orthogonal to chat provider. Should GitHub Models API be called regardless of `CHAT_PROVIDER`?

**Context**: Current design calls GitHub Models from Python backend, independent of whether chat goes to n8n, Azure OpenAI, or PromptFlow.

**Follow-up Needed**: Confirm that intent classification is universal (all backends) or n8n-only.

**Assumption for Planning**: Intent classification is universal; works with any `CHAT_PROVIDER`.

---

### Q7: Conversation ID Generation Timing
**Question**: If user starts typing but hasn't sent a message yet, there's no conversationId. Should we pre-generate one?

**Context**: Current code generates conversationId when first message is sent (Chat.tsx line 201).

**Follow-up Needed**: Confirm if exit intent should trigger even if user typed but didn't send (not qualified anyway).

**Assumption for Planning**: Exit intent requires ≥1 user message sent, so conversationId always exists by qualification time.

---

## Appendix A: Fallback Intent Constants

```typescript
// In frontend/src/components/ExitIntentModal/constants.ts

export const FALLBACK_INTENTS: Intent[] = [
  {
    label: "Troubleshooting an issue",
    confidence: 0.8
  },
  {
    label: "Learning about a feature or product",
    confidence: 0.7
  },
  {
    label: "Compliance or regulatory question",
    confidence: 0.6
  },
  {
    label: "Account or billing inquiry",
    confidence: 0.5
  },
  {
    label: "General support or other",
    confidence: 0.4
  }
];

export const API_TIMEOUT_MS = 3000;
export const COOLDOWN_MS = 5000;
export const FREE_TEXT_MAX_LENGTH = 500;
```

---

## Appendix B: File Manifest (New Files)

### Backend
- `app.py` (modifications):
  - Add `/api/intent_classification` route
  - Add `/api/log_exit_intent` route
  - Add helper functions
- `backend/settings.py` (modifications):
  - Add `_GitHubModelsSettings` class
  - Update `AppSettings` to include `github_models`
- `.env.sample` (modifications):
  - Add `GITHUB_MODELS_API_KEY`
  - Add `GITHUB_MODELS_ENDPOINT`
  - Add `GITHUB_MODELS_TIMEOUT_SECONDS`

### Frontend
- `frontend/src/components/ExitIntentModal/ExitIntentModal.tsx` (new)
- `frontend/src/components/ExitIntentModal/ExitIntentModal.module.css` (new)
- `frontend/src/components/ExitIntentModal/ExitIntentButton.tsx` (new)
- `frontend/src/components/ExitIntentModal/ExitIntentFreeText.tsx` (new)
- `frontend/src/components/ExitIntentModal/useExitIntent.ts` (new)
- `frontend/src/components/ExitIntentModal/useIntentClassification.ts` (new)
- `frontend/src/components/ExitIntentModal/constants.ts` (new)
- `frontend/src/components/ExitIntentModal/types.ts` (new)
- `frontend/src/components/ExitIntentModal/index.ts` (new, barrel export)
- `frontend/src/pages/chat/Chat.tsx` (modifications):
  - Import and render `<ExitIntentModal />`
  - Pass props: conversationId, messages, isAssistantResponding
- `frontend/src/state/AppProvider.tsx` (modifications):
  - Add `exitIntentSubmitted` to `AppState`
- `frontend/src/state/AppReducer.tsx` (modifications):
  - Add `SET_EXIT_INTENT_SUBMITTED` action

### Tests
- `tests/unit_tests/test_intent_classification.py` (new)
- `tests/unit_tests/test_exit_intent_logging.py` (new)
- `frontend/src/components/ExitIntentModal/useExitIntent.test.ts` (new)
- `frontend/src/components/ExitIntentModal/useIntentClassification.test.ts` (new)
- `frontend/src/components/ExitIntentModal/ExitIntentModal.test.tsx` (new)
- `frontend/src/pages/chat/Chat.integration.test.tsx` (new)

---

## Appendix C: Security Checklist

- [ ] GitHub PAT is NEVER sent to frontend
- [ ] Backend proxy validates all incoming requests
- [ ] Logs do not contain sensitive user data (PII)
- [ ] API responses are sanitized before storage
- [ ] Rate limiting considered for public endpoints
- [ ] CORS configured correctly for `/api/*` endpoints
- [ ] Input validation on all user-provided data (intent selection, free-text)
- [ ] Free-text input is escaped/sanitized before storage
- [ ] No eval() or innerHTML with user input

---

## Appendix D: Performance Benchmarks

**Target Metrics**:
- Modal render latency: <100ms from trigger to screen flash
- White flash duration: 150ms
- GitHub Models API call: <3s (timeout if longer)
- Fallback intent display: <50ms (synchronous)
- Log submission: <500ms (async, non-blocking)

**Measurement**:
- Use `performance.now()` in frontend for timings
- Backend logs include duration for API calls
- Monitor P95 latency in production

---

## Appendix E: Internationalization (Future)

**Not in Scope**: This plan assumes English-only UI.

**Future Enhancement**: If i18n is needed:
1. Extract all user-facing strings to translation files
2. Update fallback intents to use translation keys
3. GitHub Models API may need locale parameter for intent classification

---

## Appendix F: Mobile Considerations (Out of Scope)

**Explicit Non-Goal**: Mobile is out of scope per problem statement.

**Exit Intent on Mobile**: Different signals required:
- No "top-edge mouse exit" (touch-based)
- Could use back button intercept or swipe gestures
- Would require separate implementation

**If mobile is added later**: Create separate `useExitIntentMobile.ts` hook.

---

## Summary

This implementation plan provides a complete, phased approach to building an enterprise-ready exit intent modal with AI-powered intent classification. The design prioritizes:

1. **Security**: GitHub PAT never exposed to frontend
2. **Performance**: White flash + modal render in <100ms
3. **Reliability**: Fallback intents if API fails
4. **Accessibility**: WCAG 2.1 AA compliance
5. **Testability**: Full unit, integration, and E2E test coverage

**Next Steps**: Await answers to Open Questions (Section 10), then proceed with Phase 1 implementation.
