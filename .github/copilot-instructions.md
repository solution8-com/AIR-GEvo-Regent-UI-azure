# GitHub Copilot Instructions for Broen Lab UI

This document provides comprehensive information about the codebase to help GitHub Copilot and other AI agents understand the project structure, patterns, and conventions.

## Project Overview

**Broen Lab UI** is a sample chat application that integrates with Azure OpenAI to provide an intelligent conversational interface. The application supports chatting with various data sources including Azure AI Search, Azure Cosmos DB, Elasticsearch, Pinecone, MongoDB, and Azure SQL Server.

### Technology Stack

#### Backend
- **Framework**: Quart (async Python web framework, async version of Flask)
- **Language**: Python 3.10/3.11
- **AI/ML**: Azure OpenAI (GPT models for chat, Ada models for embeddings)
- **Databases**: Azure Cosmos DB (for chat history and vector search)
- **Search**: Azure AI Search, Elasticsearch, Pinecone, MongoDB
- **Authentication**: Azure Identity, Microsoft Entra ID
- **Security**: Microsoft Defender for Cloud integration
- **Server**: Gunicorn with Uvicorn workers

#### Frontend
- **Framework**: React 18.2 with TypeScript
- **Build Tool**: Vite 4
- **UI Library**: Fluent UI (@fluentui/react)
- **Routing**: React Router DOM v6
- **Markdown**: react-markdown with remark-gfm and rehype-raw
- **Code Highlighting**: react-syntax-highlighter
- **Styling**: CSS Modules

#### Development Tools
- **Linting**: ESLint with TypeScript parser
- **Formatting**: Prettier
- **Testing**: Jest (frontend), Python unit tests (backend)
- **Type Checking**: TypeScript 4.9.5

## Project Structure

```
broen-lab-ui/
├── backend/                    # Python backend code
│   ├── auth/                  # Authentication utilities
│   ├── history/               # CosmosDB chat history service
│   ├── security/              # MS Defender integration
│   ├── settings.py           # Pydantic settings/configuration
│   └── utils.py              # Helper functions
├── frontend/                  # React frontend code
│   ├── src/
│   │   ├── api/              # API client functions
│   │   ├── components/       # Reusable React components
│   │   │   ├── Answer/       # Answer display component
│   │   │   ├── ChatHistory/  # Chat history sidebar
│   │   │   ├── QuestionInput/# User input component
│   │   │   └── common/       # Shared components
│   │   ├── pages/            # Route-based page components
│   │   │   ├── chat/         # Main chat interface
│   │   │   └── layout/       # Layout components
│   │   ├── state/            # Global state management
│   │   ├── utils/            # Utility functions
│   │   └── constants/        # Constants and config
│   ├── public/               # Static assets
│   └── vite.config.ts        # Vite configuration
├── static/                    # Built frontend assets (generated)
├── infra/                     # Azure infrastructure (Bicep)
├── infrastructure/            # ARM templates
├── tests/                     # Test suites
│   ├── integration_tests/    # Integration tests
│   └── unit_tests/           # Unit tests
├── scripts/                   # Helper scripts
├── notebooks/                 # Jupyter notebooks
├── data/                      # Data files
├── tools/                     # Development tools
├── app.py                    # Main application entry point
├── requirements.txt          # Python dependencies
└── azure.yaml               # Azure Developer CLI config
```

## Key Architectural Patterns

### Backend Architecture

1. **Async-First Design**: The backend uses Quart (async Flask) for handling concurrent requests efficiently
   - All database and API calls use async/await
   - Azure SDK clients use async versions (e.g., `AsyncAzureOpenAI`)

2. **Settings Management**: Configuration uses Pydantic BaseSettings
   - Environment variables loaded from `.env` file
   - Type-safe configuration with validation
   - Separate settings classes for different concerns (UI, ChatHistory, Promptflow, etc.)

3. **Blueprints**: Application routes organized using Quart Blueprints
   - Main routes defined in `app.py`
   - Blueprint registered with static folder for serving frontend

4. **Data Source Abstraction**: Multiple data source types supported with consistent interface
   - Azure Cognitive Search
   - Azure Cosmos DB (Mongo vCore)
   - Elasticsearch
   - Pinecone
   - MongoDB
   - Azure SQL Server

5. **Streaming Responses**: Supports both streaming and non-streaming chat responses
   - NDJSON format for streaming
   - Token-by-token delivery for real-time feel

### Frontend Architecture

1. **Component-Based**: React functional components with hooks
   - Components organized by feature/purpose
   - Common/shared components separated
   - CSS Modules for scoped styling

2. **State Management**: Context API and hooks
   - Global state in `state/` directory
   - Component-level state with useState/useReducer

3. **API Layer**: Centralized API client functions
   - Async fetch calls to backend
   - Error handling and response formatting

4. **Routing**: React Router v6 for navigation
   - Main chat page at root
   - Layout wrapper for consistent UI

5. **Markdown Rendering**: Rich markdown support
   - GitHub Flavored Markdown (GFM)
   - Raw HTML support via rehype-raw
   - Subscript/superscript via remark-supersub
   - Syntax highlighting for code blocks

## Coding Conventions

### Python (Backend)

1. **Type Hints**: Use type hints for function parameters and return values
   ```python
   async def function_name(param: str) -> dict:
       pass
   ```

2. **Pydantic Models**: Use for configuration and data validation
   ```python
   class Settings(BaseSettings):
       model_config = SettingsConfigDict(...)
       field_name: str
   ```

3. **Async/Await**: Always use async functions for I/O operations
   ```python
   async def fetch_data():
       async with client:
           result = await client.get()
   ```

4. **Error Handling**: Use try/except with specific exceptions
   - Log errors appropriately
   - Return meaningful error responses

5. **Environment Variables**: Use uppercase with underscores
   - Prefixes for related settings (e.g., `AZURE_OPENAI_*`, `AZURE_SEARCH_*`)

### TypeScript/React (Frontend)

1. **Functional Components**: Use function declarations with TypeScript
   ```typescript
   const ComponentName: React.FC<Props> = (props) => {
       return <div>...</div>;
   };
   ```

2. **Props Types**: Define explicit interfaces for component props
   ```typescript
   interface ComponentProps {
       title: string;
       onSubmit: (value: string) => void;
   }
   ```

3. **Hooks**: Follow React hooks rules
   - useState for component state
   - useEffect for side effects
   - Custom hooks for reusable logic

4. **Styling**: CSS Modules with descriptive class names
   ```typescript
   import styles from './Component.module.css';
   <div className={styles.container}>
   ```

5. **Imports**: Use absolute imports from `src/`
   - Simple-import-sort ESLint plugin enforces order

6. **Formatting**: Prettier + ESLint
   - Run `npm run format` before committing
   - 4-space indentation for TypeScript
   - Single quotes preferred

## Common Development Workflows

### Local Development Setup

1. **Create `.env` file** from `.env.sample`
   - Configure Azure OpenAI credentials
   - Set up data source configuration
   - Enable/disable features as needed

2. **Install dependencies**
   ```bash
   # Backend
   pip install -r requirements.txt
   
   # Frontend
   cd frontend && npm install
   ```

3. **Run locally**
   ```bash
   # Windows
   start.cmd
   
   # Linux/Mac
   ./start.sh
   ```
   - Builds frontend (Vite)
   - Starts Quart backend on port 50505

4. **Development mode**
   - Frontend dev server: `cd frontend && npm run dev`
   - Backend debug: Use VSCode launch configuration

### Building and Testing

1. **Frontend Build**
   ```bash
   cd frontend
   npm run build  # Builds to ../static/
   ```

2. **Linting and Formatting**
   ```bash
   cd frontend
   npm run lint        # Check for issues
   npm run lint:fix    # Auto-fix issues
   npm run prettier    # Check formatting
   npm run format      # Format and fix
   ```

3. **Testing**
   ```bash
   cd frontend
   npm test  # Run Jest tests
   ```

### Deployment

1. **Azure Developer CLI (Recommended)**
   - See `README_azd.md` for detailed instructions
   - Uses `azure.yaml` and `infra/` Bicep files

2. **Azure CLI**
   ```bash
   az webapp up --runtime PYTHON:3.11 --sku B1 --name <app-name> ...
   az webapp config set --startup-file "python3 -m gunicorn app:app" ...
   ```

3. **One-Click Deploy**
   - Use "Deploy to Azure" button in README
   - ARM template in `infrastructure/deployment.json`

## Important Files and Their Purposes

### Configuration Files

- **`.env`**: Local environment variables (not committed)
- **`.env.sample`**: Template for environment variables
- **`requirements.txt`**: Python dependencies
- **`requirements-dev.txt`**: Python dev dependencies
- **`frontend/package.json`**: Node.js dependencies and scripts
- **`azure.yaml`**: Azure Developer CLI configuration
- **`gunicorn.conf.py`**: Gunicorn server configuration

### Entry Points

- **`app.py`**: Main Flask/Quart application
  - Registers blueprints
  - Initializes Azure clients
  - Defines routes for chat API

### Key Backend Files

- **`backend/settings.py`**: All configuration classes using Pydantic
- **`backend/utils.py`**: Response formatting, data parsing
- **`backend/auth/auth_utils.py`**: Authentication helpers
- **`backend/history/cosmosdbservice.py`**: CosmosDB integration for chat history
- **`backend/security/ms_defender_utils.py`**: Microsoft Defender integration

### Key Frontend Files

- **`frontend/src/index.tsx`**: React app entry point
- **`frontend/src/pages/chat/Chat.tsx`**: Main chat interface
- **`frontend/src/api/`**: Backend API client functions
- **`frontend/vite.config.ts`**: Build configuration

## Feature Flags and Environment Variables

### Essential Variables
- `AZURE_OPENAI_RESOURCE` or `AZURE_OPENAI_ENDPOINT`: OpenAI endpoint
- `AZURE_OPENAI_MODEL`: Deployment name for chat model
- `AZURE_OPENAI_KEY`: API key (optional with Entra ID)

### Feature Toggles
- `AUTH_ENABLED`: Enable/disable authentication (default: True)
- `MS_DEFENDER_ENABLED`: Enable Microsoft Defender (default: True)
- `AZURE_OPENAI_STREAM`: Enable streaming responses (default: True)
- `USE_PROMPTFLOW`: Use Promptflow endpoint (default: False)
- `SANITIZE_ANSWER`: Remove HTML from responses (default: False)

### UI Customization
- `UI_TITLE`: Application title
- `UI_LOGO`: Logo URL
- `UI_CHAT_TITLE`: Chat window title
- `UI_SHOW_SHARE_BUTTON`: Show share button
- `UI_SHOW_CHAT_HISTORY_BUTTON`: Show history button

### Data Sources
Set `DATASOURCE_TYPE` to one of:
- `AzureCognitiveSearch`
- `AzureCosmosDB`
- `Elasticsearch`
- `Pinecone`
- `MongoDB`
- `AzureSqlServer`

Each data source has its own set of configuration variables (see README.md).

## Testing Considerations

### Frontend Testing
- Jest configured with TypeScript support
- Test files: `*.test.ts` or `*.spec.ts`
- Example: `AnswerParser.test.ts` tests answer parsing logic

### Backend Testing
- Unit tests in `tests/unit_tests/`
- Integration tests in `tests/integration_tests/`
- Use pytest for running tests

## Security Best Practices

1. **Never commit sensitive data**
   - Use `.env` for secrets (excluded by `.gitignore`)
   - Use Azure Key Vault in production

2. **Authentication**
   - Enable `AUTH_ENABLED` in production
   - Configure identity provider (Microsoft Entra ID)
   - Use managed identities when possible

3. **API Keys**
   - Rotate keys regularly
   - Use RBAC instead of keys when possible
   - Store keys in Azure App Service settings

4. **Input Validation**
   - Sanitize user inputs
   - Use `SANITIZE_ANSWER` to remove HTML from AI responses
   - Validate all configuration with Pydantic

5. **Microsoft Defender**
   - Enable `MS_DEFENDER_ENABLED` for threat protection
   - Monitor alerts in Azure portal

## Common Tasks and Examples

### Adding a New Environment Variable

1. Add to appropriate settings class in `backend/settings.py`:
   ```python
   class _NewFeatureSettings(BaseSettings):
       model_config = SettingsConfigDict(
           env_prefix="FEATURE_",
           env_file=DOTENV_PATH,
           extra="ignore",
           env_ignore_empty=True
       )
       
       new_setting: str = "default_value"
   ```

2. Add to `.env.sample` as documentation
3. Use in code via `app_settings.new_feature.new_setting`

### Adding a New API Endpoint

1. Add route in `app.py`:
   ```python
   @bp.route("/api/new-endpoint", methods=["POST"])
   async def new_endpoint():
       try:
           data = await request.get_json()
           # Process data
           return jsonify({"result": "success"})
       except Exception as e:
           logging.exception("Error in new_endpoint")
           return jsonify({"error": str(e)}), 500
   ```

2. Add frontend API function in `frontend/src/api/`:
   ```typescript
   export async function callNewEndpoint(data: any): Promise<Response> {
       return await fetch("/api/new-endpoint", {
           method: "POST",
           headers: {"Content-Type": "application/json"},
           body: JSON.stringify(data)
       });
   }
   ```

### Adding a New React Component

1. Create component directory in `frontend/src/components/`
2. Create component file with TypeScript interface:
   ```typescript
   import React from 'react';
   import styles from './NewComponent.module.css';
   
   interface NewComponentProps {
       title: string;
   }
   
   export const NewComponent: React.FC<NewComponentProps> = ({ title }) => {
       return <div className={styles.container}>{title}</div>;
   };
   ```
3. Create CSS module: `NewComponent.module.css`
4. Export from index file if needed

## Debugging Tips

### Backend Debugging
- Set `DEBUG=true` environment variable
- Enable App Service logs in Azure Portal
- View logs via "Log stream" in Azure
- Use VSCode debugger with `.vscode/launch.json`

### Frontend Debugging
- Use React DevTools browser extension
- Check browser console for errors
- Use `console.log()` strategically
- Network tab for API call inspection

### Common Issues
1. **Build fails**: Ensure Node.js and Python versions match requirements
2. **401 Unauthorized**: Check authentication configuration
3. **Streaming not working**: Verify `AZURE_OPENAI_STREAM=True`
4. **Citations not showing**: Check data source configuration
5. **CORS errors**: Ensure frontend and backend on same origin

## API Response Formats

### Streaming Response (NDJSON)
```json
{"id": "msg-1", "model": "gpt-4", "created": 1234567890, "object": "chat.completion.chunk", "choices": [{"delta": {"content": "Hello"}, "index": 0, "finish_reason": null}]}
{"id": "msg-1", "model": "gpt-4", "created": 1234567890, "object": "chat.completion.chunk", "choices": [{"delta": {"content": " world"}, "index": 0, "finish_reason": null}]}
{"id": "msg-1", "model": "gpt-4", "created": 1234567890, "object": "chat.completion.chunk", "choices": [{"delta": {"content": ""}, "index": 0, "finish_reason": "stop"}]}
```

### Non-Streaming Response
```json
{
    "id": "msg-1",
    "model": "gpt-4",
    "created": 1234567890,
    "object": "chat.completion",
    "choices": [{
        "message": {
            "role": "assistant",
            "content": "Hello world"
        },
        "index": 0,
        "finish_reason": "stop"
    }]
}
```

## Contributing Guidelines

1. **Code Style**: Run `npm run format` (frontend) before committing
2. **Type Safety**: Ensure TypeScript compiles without errors
3. **Testing**: Add tests for new features
4. **Documentation**: Update README.md and this file for major changes
5. **Pull Requests**: Use the PR template in `.github/pull_request_template.md`
6. **Commits**: Write clear, descriptive commit messages

## External Resources

- [Azure OpenAI Documentation](https://learn.microsoft.com/azure/cognitive-services/openai/)
- [Quart Documentation](https://quart.palletsprojects.com/)
- [React Documentation](https://react.dev/)
- [Fluent UI Documentation](https://developer.microsoft.com/fluentui)
- [Vite Documentation](https://vitejs.dev/)
- [Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/)

## Maintainer Notes

- **API Versions**: Keep Azure OpenAI API version up-to-date (currently `2024-05-01-preview` minimum)
- **Dependencies**: Regularly update dependencies for security patches
- **Breaking Changes**: Document in README when changing environment variables
- **Migration**: Provide migration guides for major version updates
