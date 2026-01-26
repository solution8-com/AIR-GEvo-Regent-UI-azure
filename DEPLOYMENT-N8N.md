# n8n Minimal Deployment Guide

This guide explains how to deploy the application with minimal Azure services for n8n-only chat scenarios.

## Deployment Scenarios

### Scenario 1: Full Deployment (Default)
Deploys all services: App Service, OpenAI, Search, Form Recognizer, and Cosmos DB.

```bash
azd up
```

### Scenario 2: Minimal n8n Deployment with New Cosmos DB
Deploys only: App Service Plan, App Service, and Cosmos DB (3 services).

```bash
# Set environment variables
azd env set DEPLOY_OPENAI false
azd env set DEPLOY_SEARCH false
azd env set DEPLOY_FORM_RECOGNIZER false
azd env set CHAT_PROVIDER n8n
azd env set N8N_WEBHOOK_URL "https://your-n8n-instance.com/webhook/your-webhook-id"
azd env set N8N_BEARER_TOKEN "your-secret-bearer-token"

# Deploy
azd up
```

### Scenario 3: n8n Deployment with Existing Cosmos DB
Reuses existing Cosmos DB from another resource group. Deploys only: App Service Plan and App Service (2 services + existing Cosmos DB).

```bash
# Set service deployment flags
azd env set DEPLOY_OPENAI false
azd env set DEPLOY_SEARCH false
azd env set DEPLOY_FORM_RECOGNIZER false

# Set n8n configuration
azd env set CHAT_PROVIDER n8n
azd env set N8N_WEBHOOK_URL "https://your-n8n-instance.com/webhook/your-webhook-id"
azd env set N8N_BEARER_TOKEN "your-secret-bearer-token"

# Configure existing Cosmos DB
azd env set USE_EXISTING_COSMOSDB true
azd env set EXISTING_COSMOSDB_ACCOUNT_NAME "your-cosmos-account-name"
azd env set EXISTING_COSMOSDB_RESOURCE_GROUP "your-cosmos-resource-group"
azd env set EXISTING_COSMOSDB_DATABASE_NAME "db_conversation_history"  # Optional, defaults to db_conversation_history
azd env set EXISTING_COSMOSDB_CONTAINER_NAME "conversations"  # Optional, defaults to conversations

# Deploy
azd up
```

## Deployment Parameters Reference

### Service Deployment Flags

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `DEPLOY_OPENAI` | boolean | `true` | Deploy Azure OpenAI service |
| `DEPLOY_SEARCH` | boolean | `true` | Deploy Azure AI Search service |
| `DEPLOY_FORM_RECOGNIZER` | boolean | `true` | Deploy Form Recognizer service |

### n8n Configuration

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `CHAT_PROVIDER` | string | No | Set to `n8n` to enable n8n backend (default: `aoai`) |
| `N8N_WEBHOOK_URL` | string | Yes* | Full URL to your n8n webhook endpoint |
| `N8N_BEARER_TOKEN` | string | Yes* | Bearer token for n8n webhook authentication |
| `N8N_TIMEOUT_MS` | number | No | Request timeout in milliseconds (default: 300000) |

*Required when `CHAT_PROVIDER=n8n`

### Cosmos DB Configuration

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `USE_EXISTING_COSMOSDB` | boolean | No | Use existing Cosmos DB from another resource group |
| `EXISTING_COSMOSDB_ACCOUNT_NAME` | string | Yes** | Name of existing Cosmos DB account |
| `EXISTING_COSMOSDB_RESOURCE_GROUP` | string | Yes** | Resource group containing the Cosmos DB account |
| `EXISTING_COSMOSDB_DATABASE_NAME` | string | No | Database name (default: `db_conversation_history`) |
| `EXISTING_COSMOSDB_CONTAINER_NAME` | string | No | Container name (default: `conversations`) |

**Required when `USE_EXISTING_COSMOSDB=true`

## Required Azure Resources Permissions

### For Existing Cosmos DB

When using an existing Cosmos DB account from another resource group, the deployment will:

1. **Create a custom SQL role definition** in the existing Cosmos DB account with permissions:
   - `Microsoft.DocumentDB/databaseAccounts/readMetadata`
   - `Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/items/*`
   - `Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/*`

2. **Assign the role** to:
   - The App Service managed identity (for runtime access)
   - Your user principal ID (for management access)

**Required permissions**: You need `DocumentDB Account Contributor` or `Owner` role on the existing Cosmos DB account to create role definitions and assignments.

## Manual Steps for Existing Cosmos DB (Optional)

If you prefer to set up Cosmos DB permissions manually:

### 1. Create the Database and Container (if not exists)

```bash
# Using Azure CLI
az cosmosdb sql database create \
  --account-name <cosmos-account-name> \
  --resource-group <cosmos-resource-group> \
  --name db_conversation_history

az cosmosdb sql container create \
  --account-name <cosmos-account-name> \
  --resource-group <cosmos-resource-group> \
  --database-name db_conversation_history \
  --name conversations \
  --partition-key-path /userId
```

### 2. Grant Access to App Service Managed Identity

After deployment, grant the App Service managed identity access to Cosmos DB:

```bash
# Get the App Service principal ID
PRINCIPAL_ID=$(az webapp identity show \
  --name <app-service-name> \
  --resource-group <app-resource-group> \
  --query principalId -o tsv)

# Assign Cosmos DB Built-in Data Contributor role
az cosmosdb sql role assignment create \
  --account-name <cosmos-account-name> \
  --resource-group <cosmos-resource-group> \
  --role-definition-name "Cosmos DB Built-in Data Contributor" \
  --principal-id $PRINCIPAL_ID \
  --scope "/subscriptions/<subscription-id>/resourceGroups/<cosmos-resource-group>/providers/Microsoft.DocumentDB/databaseAccounts/<cosmos-account-name>"
```

## Validation

### Verify Minimal Deployment

After deployment, verify the services in your resource group:

```bash
# List resources
az resource list \
  --resource-group <your-resource-group> \
  --output table
```

**Expected for n8n-only with new Cosmos DB (Scenario 2):**
- App Service Plan (1)
- App Service (1)
- Cosmos DB Account (1)
- Total: 3 resources

**Expected for n8n-only with existing Cosmos DB (Scenario 3):**
- App Service Plan (1)
- App Service (1)
- Total: 2 resources (plus reference to existing Cosmos DB)

### Test n8n Integration

1. Navigate to the deployed app URL
2. Sign in with Entra ID
3. Send a test message
4. Verify the response comes from your n8n workflow

Check App Service logs for connectivity:
```bash
az webapp log tail \
  --name <app-service-name> \
  --resource-group <your-resource-group>
```

## Troubleshooting

### "CosmosDB is not configured" Error

**Symptom**: Chat fails with "CosmosDB is not configured" error.

**Solution**: Cosmos DB is required even for n8n mode. Either:
- Deploy with new Cosmos DB (remove `USE_EXISTING_COSMOSDB` flag)
- Correctly configure existing Cosmos DB parameters

### n8n Webhook Connection Timeout

**Symptom**: Chat hangs or times out waiting for n8n response.

**Solutions**:
- Verify `N8N_WEBHOOK_URL` is accessible from Azure
- Check n8n workflow is active and responding
- Increase timeout: `azd env set N8N_TIMEOUT_MS 600000` (10 minutes)
- Review n8n workflow logs for errors

### Cosmos DB Access Denied

**Symptom**: "Forbidden" or "Unauthorized" errors when accessing chat history.

**Solutions**:
- Verify role assignments were created successfully
- Check App Service managed identity is enabled
- Manually assign "Cosmos DB Built-in Data Contributor" role (see Manual Steps above)
- Wait 5-10 minutes for role assignments to propagate

### Azure OpenAI Validation Error (when using n8n)

**Symptom**: Deployment fails with "AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_RESOURCE is required".

**Solution**: Ensure you've set `DEPLOY_OPENAI=false` and `CHAT_PROVIDER=n8n`. The Bug 5 fix in this PR handles this scenario.

## Cost Optimization

### Minimal n8n Deployment (Scenario 2)

**Azure costs (approximate monthly, US East):**
- App Service Plan (B1): ~$13/month
- App Service: Included in plan
- Cosmos DB (minimal usage): ~$25/month
- **Total**: ~$38/month

**vs. Full Deployment: ~$400/month** (includes OpenAI, Search, Form Recognizer)

**Savings**: ~90% cost reduction for pure chat scenarios

### Existing Cosmos DB (Scenario 3)

If you already have a Cosmos DB account for other apps:
- Reuse existing account (no additional Cosmos cost)
- Share costs across multiple applications
- **Total**: ~$13/month (App Service only)

## Security Considerations

### n8n Bearer Token

- Store `N8N_BEARER_TOKEN` securely in Azure Key Vault (optional)
- Rotate tokens periodically
- Never commit tokens to source control
- Use separate tokens for dev/staging/production

### Cosmos DB Access

- Deployment uses Azure RBAC (managed identities)
- No connection strings or keys stored in app settings
- Principle of least privilege (custom role with minimal permissions)

### Network Security

- Consider adding Private Endpoints for Cosmos DB
- Use Azure Front Door or Application Gateway for WAF
- Enable App Service authentication (Entra ID) - already configured

## Next Steps

- Review [next-steps.md](./next-steps.md) for n8n webhook testing
- Configure chat history UI settings in `backend/settings.py`
- Set up monitoring and alerts for n8n webhook failures
- Implement backup strategy for Cosmos DB conversations
