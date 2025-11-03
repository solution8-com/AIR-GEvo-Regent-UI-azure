# Image Display Data Flow and Format Documentation

## Overview

This document explains how image data flows through the application from backend to frontend display, and the expected formats for different backend integration options. This is critical for understanding how images are handled in the chat interface.

## Table of Contents

1. [Frontend Image Format Expectations](#frontend-image-format-expectations)
2. [Backend Integration Options](#backend-integration-options)
3. [Image Data Flow](#image-data-flow)
4. [User-Uploaded Images](#user-uploaded-images)
5. [Generated Charts/Images from Backend](#generated-chartsimages-from-backend)
6. [Citations and Context Data](#citations-and-context-data)

---

## Frontend Image Format Expectations

### TypeScript Type Definitions

The frontend defines the following key types for handling images and responses (from `frontend/src/api/models.ts`):

```typescript
export type AskResponse = {
  answer: string | []
  citations: Citation[]
  generated_chart: string | null  // Base64-encoded image without data URI prefix
  error?: string
  message_id?: string
  feedback?: Feedback
  exec_results?: ExecResults[]
}

export type ChatMessage = {
  id: string
  role: string
  content: string | [{ type: string; text: string }, { type: string; image_url: { url: string } }]
  end_turn?: boolean
  date: string
  feedback?: Feedback
  context?: string
}
```

### Image Content Formats

The frontend expects **two types** of image content:

#### 1. User-Uploaded Images (in ChatMessage.content)
Format: Array with text and image objects
```typescript
[
  { type: "text", text: "user question text" },
  { type: "image_url", image_url: { url: "data:image/jpeg;base64,<base64_string>" } }
]
```

#### 2. Backend-Generated Charts (in AskResponse.generated_chart)
Format: Base64 string **without** the data URI prefix
```typescript
generated_chart: "<base64_png_string>"
```

**Important**: The frontend adds the data URI prefix when rendering:
```tsx
<img src={`data:image/png;base64, ${parsedAnswer?.generated_chart}`} />
```

---

## Backend Integration Options

The application supports three main backend integration options for chat completions:

### 1. Azure OpenAI with Data Sources (Default)

**Configuration**: Set via `DATASOURCE_TYPE` environment variable

**Supported Data Sources**:
- `AzureCognitiveSearch` - Azure AI Search
- `AzureCosmosDB` - Azure CosmosDB Mongo vCore
- `Elasticsearch` - Elasticsearch index
- `Pinecone` - Pinecone vector database
- `AzureMLIndex` - Azure ML Index
- `AzureSqlServer` - SQL Server (supports code execution for charts)
- `MongoDB` - MongoDB database

**Response Format**:
```python
# Non-streaming response (backend/utils.py: format_non_streaming_response)
{
    "id": "<completion_id>",
    "model": "<model_name>",
    "created": <timestamp>,
    "object": "chat.completion",
    "choices": [{
        "messages": [
            {
                "role": "tool",
                "content": "<json_string_with_context>"
            },
            {
                "role": "assistant",
                "content": "<answer_text>"
            }
        ]
    }],
    "history_metadata": { ... },
    "apim-request-id": "<request_id>"
}
```

**For Charts/Images**: 
- Azure SQL Server backend can execute code and return chart images
- Charts are extracted from the `tool` message in the response
- The `code_exec_result` field contains the base64-encoded PNG

### 2. Prompt Flow Integration

**Configuration**:
```env
USE_PROMPTFLOW=True
PROMPTFLOW_ENDPOINT=<endpoint_url>
PROMPTFLOW_API_KEY=<api_key>
PROMPTFLOW_RESPONSE_TIMEOUT=120
PROMPTFLOW_REQUEST_FIELD_NAME=query
PROMPTFLOW_RESPONSE_FIELD_NAME=reply
PROMPTFLOW_CITATIONS_FIELD_NAME=documents
```

**Expected Input to Prompt Flow**:
```json
{
  "query": "user question",
  "chat_history": [
    {
      "inputs": { "query": "previous question" },
      "outputs": { "reply": "previous answer" }
    }
  ]
}
```

**Expected Output from Prompt Flow**:
```json
{
  "id": "<message_id>",
  "reply": "<answer_text>",
  "documents": [
    {
      "content": "...",
      "title": "...",
      "filepath": "...",
      "url": "..."
    }
  ]
}
```

**Formatted Response to Frontend** (backend/utils.py: format_pf_non_streaming_response):
```python
{
    "id": "<message_id>",
    "model": "",
    "created": "",
    "object": "",
    "history_metadata": { ... },
    "choices": [{
        "messages": [
            {
                "role": "assistant",
                "content": "<reply_from_promptflow>"
            },
            {
                "role": "tool",
                "content": "{\"citations\": [...]}"
            }
        ]
    }]
}
```

**For Images/Charts**: 
- Prompt Flow responses can include base64-encoded images in a custom field
- The field name should be configurable (currently not directly supported)
- Frontend would need to extract from the response content

### 3. Standard OpenAI API (No Data Source)

**Configuration**: Leave `DATASOURCE_TYPE` empty

**Response Format**:
```python
# Same as Azure OpenAI format but without the tool message containing citations
{
    "id": "<completion_id>",
    "model": "<model_name>",
    "created": <timestamp>,
    "object": "chat.completion",
    "choices": [{
        "messages": [
            {
                "role": "assistant",
                "content": "<answer_text>"
            }
        ]
    }],
    "history_metadata": { ... }
}
```

**For Images**: 
- Standard OpenAI API doesn't natively support chart generation
- Would require custom function calling or tool integration

---

## Image Data Flow

### Complete Flow Diagram

```
User Upload                Backend Processing              Frontend Display
-----------                ------------------              ----------------

1. User selects image
   ↓
2. resizeImage(file, 800, 800)
   - Creates base64 with data URI
   ↓
3. ChatMessage.content = [
     {type: "text", text: "..."},
     {type: "image_url", image_url: {url: "data:image/jpeg;base64,..."}}
   ]
   ↓
4. POST /conversation or /history/generate
   ↓
                              5. Backend receives message
                                 ↓
                              6. Processes with Azure OpenAI/Prompt Flow
                                 ↓
                              7. Returns response with:
                                 - assistant message
                                 - tool message (optional, for citations/charts)
                                 ↓
8. Frontend receives response
   ↓
9. parsePlotFromMessage() extracts chart from tool message
   ↓
10. parseAnswer() processes text and citations
   ↓
11. Answer component renders:
    - Markdown text
    - Chart image (if present)
    - Citations
```

### Detailed Flow for Chart Generation

```
Backend Code Execution      Data Format                    Frontend Rendering
----------------------      -----------                    ------------------

1. Azure SQL Server executes
   Python/R code
   ↓
2. Code generates matplotlib/plot
   ↓
3. Plot converted to base64 PNG
   ↓
4. Stored in tool message:
   {
     "role": "tool",
     "content": "{
       \"all_exec_results\": [{
         \"code_exec_result\": \"<base64_png>\"
       }]
     }"
   }
   ↓
                              5. Frontend receives messages array
                                 ↓
                              6. parsePlotFromMessage(toolMessage)
                                 - Extracts code_exec_result
                                 - Returns base64 string
                                 ↓
                              7. Answer component:
                                 <img src={`data:image/png;base64,${chart}`} />
```

---

## User-Uploaded Images

### Upload Process (frontend/src/components/QuestionInput/QuestionInput.tsx)

1. User selects image via file input
2. `handleImageUpload()` is triggered
3. `resizeImage(file, 800, 800)` processes the image:
   - Maintains aspect ratio
   - Resizes to max 800x800 pixels
   - Converts to JPEG with 80% quality
   - Returns base64 string with data URI prefix: `data:image/jpeg;base64,<base64>`
4. Image preview shown to user
5. On send, message content is formatted as:
   ```typescript
   [
     { type: "text", text: question },
     { type: "image_url", image_url: { url: base64Image } }
   ]
   ```

### Display in Chat History (frontend/src/pages/chat/Chat.tsx)

User messages with images are displayed using:
```tsx
{typeof answer.content === "string" && answer.content 
  ? answer.content 
  : Array.isArray(answer.content) 
    ? <>
        {answer.content[0].text} 
        <img className={styles.uploadedImageChat} 
             src={answer.content[1].image_url.url} 
             alt="Uploaded Preview" />
      </> 
    : null
}
```

### Backend Processing

The backend receives the image in the message content and includes it in the request to Azure OpenAI's vision-enabled models. The image is passed through as-is in the content array format.

**Note**: Image upload is disabled when "On Your Data" (OYD) mode is enabled, as indicated by the check:
```typescript
{!OYD_ENABLED && (<file input component>)}
```

---

## Generated Charts/Images from Backend

### Extraction Logic (frontend/src/pages/chat/Chat.tsx)

The `parsePlotFromMessage()` function extracts chart data from tool messages:

```typescript
const parsePlotFromMessage = (message: ChatMessage) => {
  if (message?.role && message?.role === "tool" && typeof message?.content === "string") {
    try {
      const execResults = JSON.parse(message.content) as AzureSqlServerExecResults;
      const codeExecResult = execResults.all_exec_results.at(-1)?.code_exec_result;

      if (codeExecResult === undefined) {
        return null;
      }
      return codeExecResult.toString();
    }
    catch {
      return null;
    }
  }
  return null;
}
```

### Usage in Answer Component

When displaying an assistant message, the previous tool message is checked for charts:

```typescript
<Answer
  answer={{
    answer: answer.content,
    citations: parseCitationFromMessage(messages[index - 1]),
    generated_chart: parsePlotFromMessage(messages[index - 1]),  // From tool message
    message_id: answer.id,
    feedback: answer.feedback,
    exec_results: execResults
  }}
/>
```

### Rendering (frontend/src/components/Answer/Answer.tsx)

```tsx
{parsedAnswer?.generated_chart !== null && (
  <Stack className={styles.answerContainer}>
    <Stack.Item grow>
      <img src={`data:image/png;base64, ${parsedAnswer?.generated_chart}`} />
    </Stack.Item>
  </Stack>
)}
```

**Critical**: Note the space after `base64,` in the data URI construction. The backend should return the base64 string **without** the `data:image/png;base64,` prefix.

---

## Citations and Context Data

### Citation Format (from tool messages)

Citations are extracted from the tool message content:

```typescript
export type Citation = {
  part_index?: number
  content: string
  id: string
  title: string | null
  filepath: string | null
  url: string | null
  metadata: string | null
  chunk_id: string | null
  reindex_id: string | null
}
```

### Tool Message Format

```json
{
  "role": "tool",
  "content": "{
    \"citations\": [
      {
        \"content\": \"...\",
        \"id\": \"...\",
        \"title\": \"...\",
        \"filepath\": \"...\",
        \"url\": \"...\",
        \"metadata\": \"...\",
        \"chunk_id\": \"...\"
      }
    ],
    \"intent\": \"...\"
  }"
}
```

### Citation Parsing

The `parseCitationFromMessage()` function (in Chat.tsx) extracts citations from the tool message that precedes each assistant message. Citations are then linked to the answer text using `[doc1]`, `[doc2]`, etc. markers which are converted to superscript numbers by the `parseAnswer()` function.

---

## Backend Response Formatting Functions

### For Azure OpenAI (backend/utils.py)

**Non-Streaming**:
```python
def format_non_streaming_response(chatCompletion, history_metadata, apim_request_id):
    # Formats Azure OpenAI completion into frontend-expected format
    # Extracts context from message if present
    # Returns messages array in choices[0]
```

**Streaming**:
```python
def format_stream_response(chatCompletionChunk, history_metadata, apim_request_id):
    # Formats streaming chunks
    # Handles context/citations in delta
    # Handles tool calls
```

### For Prompt Flow (backend/utils.py)

```python
def format_pf_non_streaming_response(
    chatCompletion, history_metadata, response_field_name, citations_field_name, message_uuid=None
):
    # Extracts response_field_name (default: "reply") as assistant message
    # Extracts citations_field_name (default: "documents") as tool message with citations
```

### Conversion to Prompt Flow Format

```python
def convert_to_pf_format(input_json, request_field_name, response_field_name):
    # Converts chat history to Prompt Flow expected format
    # Creates inputs/outputs structure
```

---

## Summary Table: Image Format by Backend Option

| Backend Option | Input Format | Output Format | Chart Support | Notes |
|---------------|--------------|---------------|---------------|-------|
| **Azure OpenAI (no data)** | Vision API content array | Standard completion | Via function calling | No built-in chart support |
| **Azure OpenAI + Azure Search** | Vision API content array | Tool + Assistant messages | No | Citations in tool message |
| **Azure OpenAI + Azure SQL** | Vision API content array | Tool + Assistant messages | **Yes** | Charts in tool.content.all_exec_results[].code_exec_result |
| **Prompt Flow** | Converted to {query, chat_history} | {reply, documents} | Custom field needed | Would need response_field mapping for charts |
| **Standard OpenAI API** | Vision API content array | Standard completion | Via function calling | No built-in chart support |

---

## Key Takeaways for Backend Developers

1. **Chart Images**: Return base64-encoded PNG **without** `data:image/png;base64,` prefix
2. **Location**: Put chart data in tool message's `code_exec_result` field for Azure SQL Server integration
3. **Citations**: Include in tool message as JSON string with `citations` array
4. **User Images**: Will arrive as content array with `image_url` objects containing full data URI
5. **Message Order**: Tool message should come **before** the assistant message it relates to
6. **Prompt Flow**: Custom mapping may be needed to support chart images in responses

---

## Configuration Variables Summary

### Core Settings
- `DATASOURCE_TYPE`: Determines backend integration mode
- `USE_PROMPTFLOW`: Enable Prompt Flow integration (True/False)
- `AZURE_OPENAI_STREAM`: Enable streaming responses (True/False)

### Prompt Flow Settings
- `PROMPTFLOW_ENDPOINT`: Prompt Flow endpoint URL
- `PROMPTFLOW_API_KEY`: Authentication key
- `PROMPTFLOW_RESPONSE_TIMEOUT`: Timeout in seconds (default: 120)
- `PROMPTFLOW_REQUEST_FIELD_NAME`: Input field name (default: "query")
- `PROMPTFLOW_RESPONSE_FIELD_NAME`: Output field name (default: "reply")
- `PROMPTFLOW_CITATIONS_FIELD_NAME`: Citations field name (default: "documents")

### Frontend Settings
- `UI_LOGO`: Logo image URL
- `UI_CHAT_LOGO`: Chat window logo URL
- `SANITIZE_ANSWER`: Enable HTML sanitization (True/False)

---

## Files Reference

### Backend
- `app.py`: Main application routes and request handling
- `backend/utils.py`: Response formatting functions
- `backend/settings.py`: Configuration and settings classes

### Frontend
- `frontend/src/api/models.ts`: TypeScript type definitions
- `frontend/src/pages/chat/Chat.tsx`: Main chat interface and message processing
- `frontend/src/components/Answer/Answer.tsx`: Answer display component
- `frontend/src/components/Answer/AnswerParser.tsx`: Answer parsing and citation handling
- `frontend/src/components/QuestionInput/QuestionInput.tsx`: User input with image upload
- `frontend/src/utils/resizeImage.ts`: Image resizing utility

---

## Version Information

This documentation is based on the current state of the repository. The image handling features include:

- Support for user-uploaded images (vision models)
- Support for backend-generated charts (Azure SQL Server)
- Support for multiple backend integration options
- Consistent citation handling across backends

For questions or updates, please refer to the repository maintainers.
