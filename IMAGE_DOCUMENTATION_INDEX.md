# Image Display Documentation - Table of Contents

This is the central hub for all documentation related to image display, data flow, and format expectations in the broen-lab-ui application.

## 📚 Documentation Files

### 1. [IMAGE_DISPLAY_DATA_FLOW.md](./IMAGE_DISPLAY_DATA_FLOW.md)
**Comprehensive technical documentation**

Complete guide covering:
- Frontend image format expectations and TypeScript types
- All backend integration options (Prompt Flow, Azure OpenAI, Azure SQL Server, etc.)
- Detailed data flow diagrams
- User-uploaded image handling
- Backend-generated charts/images
- Citations and context data formats
- Response formatting functions
- Configuration variables

**Use this for**: Deep technical understanding, implementation details, troubleshooting complex issues

---

### 2. [QUICK_REFERENCE_IMAGE_FORMATS.md](./QUICK_REFERENCE_IMAGE_FORMATS.md)
**Quick reference guide for developers**

Quick answers to common questions:
- What format does the frontend expect?
- Backend options comparison table
- Example templates for each backend option
- Common issues and solutions
- Configuration priority
- Code snippets and examples

**Use this for**: Quick lookups, integration work, resolving format issues, onboarding new developers

---

### 3. [IMAGE_QUALITY_OF_LIFE_FEATURES.md](./IMAGE_QUALITY_OF_LIFE_FEATURES.md)
**Quality of life improvements and features**

Details on user experience enhancements:
- Automatic image resizing (800x800px max)
- Real-time image preview
- Chat history image display
- Automatic chart extraction
- Citation integration
- Performance optimizations
- Error handling
- Accessibility features

**Use this for**: Understanding UX features, planning enhancements, testing, accessibility review

---

## 🎯 Quick Navigation

### I need to...

#### Integrate a new backend
→ [QUICK_REFERENCE_IMAGE_FORMATS.md](./QUICK_REFERENCE_IMAGE_FORMATS.md) - Backend Options Comparison
→ [IMAGE_DISPLAY_DATA_FLOW.md](./IMAGE_DISPLAY_DATA_FLOW.md) - Backend Integration Options

#### Fix image display issues
→ [QUICK_REFERENCE_IMAGE_FORMATS.md](./QUICK_REFERENCE_IMAGE_FORMATS.md) - Common Issues section
→ [IMAGE_DISPLAY_DATA_FLOW.md](./IMAGE_DISPLAY_DATA_FLOW.md) - Detailed Flow sections

#### Understand how charts work
→ [IMAGE_DISPLAY_DATA_FLOW.md](./IMAGE_DISPLAY_DATA_FLOW.md) - Generated Charts/Images section
→ [IMAGE_QUALITY_OF_LIFE_FEATURES.md](./IMAGE_QUALITY_OF_LIFE_FEATURES.md) - Chart Features

#### Know what formats to use
→ [QUICK_REFERENCE_IMAGE_FORMATS.md](./QUICK_REFERENCE_IMAGE_FORMATS.md) - Quick Answer section
→ [IMAGE_DISPLAY_DATA_FLOW.md](./IMAGE_DISPLAY_DATA_FLOW.md) - Summary Table

#### Understand image upload flow
→ [IMAGE_DISPLAY_DATA_FLOW.md](./IMAGE_DISPLAY_DATA_FLOW.md) - User-Uploaded Images section
→ [IMAGE_QUALITY_OF_LIFE_FEATURES.md](./IMAGE_QUALITY_OF_LIFE_FEATURES.md) - Upload Features

#### Learn about Prompt Flow
→ [QUICK_REFERENCE_IMAGE_FORMATS.md](./QUICK_REFERENCE_IMAGE_FORMATS.md) - Option 1: Prompt Flow
→ [IMAGE_DISPLAY_DATA_FLOW.md](./IMAGE_DISPLAY_DATA_FLOW.md) - Prompt Flow Integration

---

## 🔑 Key Takeaways

### For Frontend Developers

1. **User-uploaded images** arrive in content as an array with `image_url` objects
2. **Backend charts** are extracted from tool messages via `parsePlotFromMessage()`
3. **Citations** are parsed from tool messages and linked to answer text
4. Image preview and resizing happens in `QuestionInput` component
5. Final rendering uses data URI format: `data:image/png;base64,<base64>`

**Key Files**:
- `frontend/src/pages/chat/Chat.tsx` - Main chat logic
- `frontend/src/components/Answer/Answer.tsx` - Answer display
- `frontend/src/components/QuestionInput/QuestionInput.tsx` - Image upload
- `frontend/src/utils/resizeImage.ts` - Image processing

### For Backend Developers

1. **Charts must be base64 PNG WITHOUT the data URI prefix** (`data:image/png;base64,`)
2. Place charts in tool message's `code_exec_result` field (for Azure SQL Server)
3. Tool message should come **before** the assistant message
4. Citations go in tool message's `citations` array
5. Prompt Flow requires specific input/output field names

**Key Files**:
- `app.py` - Main routes and request handling
- `backend/utils.py` - Response formatting functions
- `backend/settings.py` - Configuration classes

### For DevOps/Configuration

1. Use `DATASOURCE_TYPE` to set backend integration mode
2. Use `USE_PROMPTFLOW=True` for Prompt Flow integration
3. Vision models required for image understanding
4. Image uploads disabled when `oyd_enabled=True`

**Key Variables**:
- `DATASOURCE_TYPE` - Backend mode (AzureCognitiveSearch, AzureSqlServer, etc.)
- `USE_PROMPTFLOW` - Enable Prompt Flow
- `PROMPTFLOW_*` - Prompt Flow configuration
- `AZURE_OPENAI_MODEL` - Must support vision for image uploads

---

## 📊 Format Summary Table

| Scenario | Format | Location | Notes |
|----------|--------|----------|-------|
| User uploads image | `[{type: "text", ...}, {type: "image_url", image_url: {url: "data:image/jpeg;base64,..."}}]` | ChatMessage.content | Full data URI |
| Backend returns chart | `"iVBORw0KGgo..."` (plain base64) | tool.content.all_exec_results[-1].code_exec_result | NO data URI prefix |
| Frontend displays chart | `<img src="data:image/png;base64,<base64>">` | Answer component | Adds prefix automatically |
| Citations | JSON array in tool message | tool.content.citations | Before assistant message |

---

## 🧪 Testing Checklist

Use this checklist when testing image features:

### User Upload Testing
- [ ] Small image upload (< 1MB)
- [ ] Large image upload (> 5MB) - verify resize
- [ ] Image preview displays correctly
- [ ] Image appears in sent message
- [ ] Image preserved in chat history
- [ ] Image works with conversation persistence

### Backend Chart Testing
- [ ] Chart displays from Azure SQL Server
- [ ] Chart appears below answer text
- [ ] Multiple charts in conversation
- [ ] Chart quality is acceptable
- [ ] Chart data format is correct

### Backend Integration Testing
- [ ] Prompt Flow: responses formatted correctly
- [ ] Azure AI Search: citations appear
- [ ] Azure SQL Server: charts and citations work
- [ ] Standard OpenAI: basic chat works
- [ ] Streaming mode works
- [ ] Non-streaming mode works

### Error Case Testing
- [ ] Invalid file type rejection
- [ ] Corrupted image handling
- [ ] Missing chart data (graceful degradation)
- [ ] Malformed backend response
- [ ] Network errors

---

## 🔧 Common Configuration Patterns

### Prompt Flow with Citations
```env
USE_PROMPTFLOW=True
PROMPTFLOW_ENDPOINT=https://your-flow.azure.com
PROMPTFLOW_API_KEY=your-key
PROMPTFLOW_RESPONSE_FIELD_NAME=reply
PROMPTFLOW_CITATIONS_FIELD_NAME=documents
```

### Azure SQL Server with Charts
```env
DATASOURCE_TYPE=AzureSqlServer
AZURE_SQL_SERVER_CONNECTION_STRING=your-connection
AZURE_OPENAI_MODEL=gpt-4
```

### Azure AI Search with Vision
```env
DATASOURCE_TYPE=AzureCognitiveSearch
AZURE_SEARCH_SERVICE=your-service
AZURE_SEARCH_INDEX=your-index
AZURE_OPENAI_MODEL=gpt-4-vision-preview
```

---

## 🎓 Learning Path

### New to the codebase?
1. Start with [QUICK_REFERENCE_IMAGE_FORMATS.md](./QUICK_REFERENCE_IMAGE_FORMATS.md)
2. Read the "Quick Answer" section
3. Review the backend options comparison
4. Look at example templates

### Need to implement a feature?
1. Review [IMAGE_QUALITY_OF_LIFE_FEATURES.md](./IMAGE_QUALITY_OF_LIFE_FEATURES.md)
2. Check existing features for patterns
3. Refer to [IMAGE_DISPLAY_DATA_FLOW.md](./IMAGE_DISPLAY_DATA_FLOW.md) for technical details
4. Test using checklist above

### Troubleshooting an issue?
1. Check [QUICK_REFERENCE_IMAGE_FORMATS.md](./QUICK_REFERENCE_IMAGE_FORMATS.md) - Common Issues
2. Verify format against [IMAGE_DISPLAY_DATA_FLOW.md](./IMAGE_DISPLAY_DATA_FLOW.md) - Format sections
3. Review related code files listed in documentation
4. Use browser dev tools to inspect actual data

---

## 📝 Contributing to Documentation

When updating these docs:

1. **IMAGE_DISPLAY_DATA_FLOW.md**: Add technical details, new backend options, format changes
2. **QUICK_REFERENCE_IMAGE_FORMATS.md**: Add common issues, quick answers, templates
3. **IMAGE_QUALITY_OF_LIFE_FEATURES.md**: Add new features, UX improvements, optimizations
4. **This file**: Update navigation, add new patterns, update checklists

Keep the three docs in sync - cross-reference between them where appropriate.

---

## 🔗 External Resources

- [Azure OpenAI Service Documentation](https://learn.microsoft.com/azure/ai-services/openai/)
- [OpenAI Vision API](https://platform.openai.com/docs/guides/vision)
- [Azure AI Search](https://learn.microsoft.com/azure/search/)
- [Prompt Flow Documentation](https://microsoft.github.io/promptflow/)

---

## 📞 Support

For questions about:
- **Image formats**: See [QUICK_REFERENCE_IMAGE_FORMATS.md](./QUICK_REFERENCE_IMAGE_FORMATS.md)
- **Integration**: See [IMAGE_DISPLAY_DATA_FLOW.md](./IMAGE_DISPLAY_DATA_FLOW.md)
- **Features**: See [IMAGE_QUALITY_OF_LIFE_FEATURES.md](./IMAGE_QUALITY_OF_LIFE_FEATURES.md)
- **Testing**: See Testing Checklist in this file
- **Configuration**: See Configuration Patterns in this file

---

## 📊 Documentation Statistics

- **Total Documentation Pages**: 3 comprehensive guides + this index
- **Total Lines**: ~1,900+ lines of documentation
- **Code Examples**: 40+ snippets and templates
- **Coverage Areas**: Frontend, Backend, DevOps, UX, Testing
- **Backend Options Documented**: 7 (Prompt Flow, Azure AI Search, Azure SQL Server, Elasticsearch, Pinecone, Azure ML Index, MongoDB)

---

**Last Updated**: November 3, 2024
**Repository**: le-dawg/broen-lab-ui
**Version**: Current as of latest commit
