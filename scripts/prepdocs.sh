 #!/bin/sh

. ./scripts/loadenv.sh

echo 'Running "prepdocs.py"'
if [ "${DATASOURCE_TYPE:-}" = "N8N" ] || [ "${DATASOURCE_TYPE:-}" = "n8n" ]; then
    echo "Skipping prepdocs.py for N8N datasource"
    exit 0
fi

./.venv/bin/python ./scripts/prepdocs.py --searchservice "$AZURE_SEARCH_SERVICE" --index "$AZURE_SEARCH_INDEX" --formrecognizerservice "$AZURE_FORMRECOGNIZER_SERVICE" --tenantid "$AZURE_TENANT_ID" --embeddingendpoint "$AZURE_OPENAI_EMBEDDING_ENDPOINT"
