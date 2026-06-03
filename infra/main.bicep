// Azure resources for the Ulti Game Tracker pipeline.
//
// Resources:
//   - Storage account with a public-read `raw` container (live event log)
//   - Linux Consumption Function App (the api/) with system-assigned identity
//   - Static Web App (the SPA host)
//   - Role assignment: function identity -> Storage Blob Data Contributor
//
// Deploy with either `azd up` (preferred — see azure.yaml at repo root) or
// directly:
//   az group create --name rg-ultimate --location australiaeast
//   az deployment group create --resource-group rg-ultimate \
//     --template-file infra/main.bicep \
//     --parameters infra/main.parameters.json

targetScope = 'resourceGroup'

@description('Workload short name embedded in every resource name (CAF: <type>-<workload>-<env>-<region>). Lowercase alphanumeric, 3-8 chars. Default "ugt" = Ulti Game Tracker.')
@minLength(3)
@maxLength(8)
param namePrefix string = 'ugt'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Environment label baked into names (e.g. "dev", "prod"). Lowercase alphanumeric.')
@allowed([ 'dev', 'prod' ])
param environment string = 'prod'

@description('GitHub repository URL — used to bind Static Web Apps. e.g. https://github.com/<user>/<repo>')
param repositoryUrl string = ''

@description('Default branch the SWA deploys from.')
param branch string = 'main'

@description('Region for the Static Web App. SWA is only available in a limited set of regions (centralus, eastus2, westus2, westeurope, eastasia) — NOT australiaeast, and NOT southeastasia/Singapore. The region only hosts the management resource; content is served from a global CDN, so AU users are unaffected. westus2 chosen as the closest non-China supported region (eastasia = Hong Kong, deliberately avoided).')
@allowed([ 'centralus', 'eastus2', 'westus2', 'westeurope' ])
param staticWebAppLocation string = 'westus2'

@description('Custom apex domain to serve the SPA from (Phase 7). Empty = no DNS zone / custom-domain wiring. When set, an Azure DNS zone is provisioned and its name servers are output for delegation at the registrar (Namecheap). The apex TXT + ALIAS records and managed TLS cert are auto-created by SWA when the domain is added "on Azure DNS"; the staticSites/customDomains binding is codified later (once validated).')
param customDomain string = 'ultigametracker.com'

// ─── Naming ───────────────────────────────────────────────────────────────────
// Follows CAF convention: <type>-<workload>-<env>-<region>. Instance suffix
// (`-001`) deliberately omitted — single-instance hobby project. Global-unique
// resources rely on the workload+env+region combo; if a name collides on
// deploy, append a uniqueString suffix in the var below as a fallback.
// See: Atlas/Maps/Azure naming convention (personal Obsidian vault).

// Map full Azure region names to CAF short codes for use in resource names.
var regionShort = {
  australiaeast:      'aue'
  australiasoutheast: 'ause'
  eastus:             'eus'
  eastus2:            'eus2'
  westus2:            'wus2'
  westeurope:         'weu'
  northeurope:        'neu'
  southeastasia:      'sea'
}

var regionCode = contains(regionShort, location) ? regionShort[location] : substring(location, 0, 3)

var storageAccountName = toLower('st${namePrefix}${environment}${regionCode}')   // e.g. stugtprodaue (<=24, no hyphens allowed)
var planName           = 'asp-${namePrefix}-${environment}-${regionCode}'         // e.g. asp-ugt-prod-aue
var functionAppName    = 'func-${namePrefix}-${environment}-${regionCode}'        // e.g. func-ugt-prod-aue
var staticWebAppName   = 'stapp-${namePrefix}-${environment}-${regionCode}'       // e.g. stapp-ugt-prod-aue
var rawContainerName   = 'raw'

// CORS origins the Function App accepts. Always the SWA default hostname; when a
// custom domain is configured, also the apex + www (both https-only).
var corsAllowedOrigins = concat(
  [ 'https://${staticWebApp.properties.defaultHostname}' ],
  empty(customDomain) ? [] : [ 'https://${customDomain}', 'https://www.${customDomain}' ]
)

// Common tags applied to every resource. The Bicep file declares this once;
// child resources inherit via `tags: commonTags`.
var commonTags = {
  workload:    namePrefix
  environment: environment
  'managed-by': 'azd'
  repo:        repositoryUrl
}

// ─── Storage ──────────────────────────────────────────────────────────────────

resource storage 'Microsoft.Storage/storageAccounts@2024-01-01' = {
  name:     storageAccountName
  location: location
  tags:     commonTags
  kind:     'StorageV2'
  sku:      { name: 'Standard_LRS' }
  properties: {
    allowBlobPublicAccess: true   // required so the dbt pipeline can fetch raw/events.csv anonymously
    minimumTlsVersion:     'TLS1_2'
    supportsHttpsTrafficOnly: true
    defaultToOAuthAuthentication: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2024-01-01' = {
  parent: storage
  name:   'default'
}

resource rawContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2024-01-01' = {
  parent: blobService
  name:   rawContainerName
  properties: {
    publicAccess: 'Blob'   // public read on blobs only (not container listing)
  }
}

// ─── Function App + plan ──────────────────────────────────────────────────────

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name:     planName
  location: location
  tags:     commonTags
  kind:     'functionapp,linux'
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: true   // Linux
  }
}

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name:     functionAppName
  location: location
  tags:     commonTags
  kind:     'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly:    true
    siteConfig: {
      linuxFxVersion: 'Node|22'
      appSettings: [
        { name: 'AzureWebJobsStorage',          value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${az.environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}' }
        { name: 'FUNCTIONS_EXTENSION_VERSION',  value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME',     value: 'node' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~22' }
        { name: 'RAW_BLOB_ACCOUNT_URL',         value: storage.properties.primaryEndpoints.blob }
        { name: 'RAW_BLOB_CONTAINER',           value: rawContainerName }
        { name: 'RAW_BLOB_NAME',                value: 'events.csv' }
      ]
      cors: {
        allowedOrigins:     corsAllowedOrigins
        supportCredentials: false
      }
    }
  }
}

// ─── Role assignment: Function identity -> Storage Blob Data Contributor ──────
// Allows the api/'s DefaultAzureCredential to read/append the raw blob without
// using the storage account key. Connection-string + AccountKey above is still
// needed for AzureWebJobsStorage internals; this is the path the app code uses.

var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource blobRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name:  guid(storage.id, functionApp.id, storageBlobDataContributorRoleId)
  properties: {
    principalId:      functionApp.identity.principalId
    principalType:    'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}

// ─── Static Web App ───────────────────────────────────────────────────────────

resource staticWebApp 'Microsoft.Web/staticSites@2024-04-01' = {
  name:     staticWebAppName
  location: staticWebAppLocation
  tags:     commonTags
  sku: { name: 'Free', tier: 'Free' }
  properties: {
    // Repository binding is optional — set repositoryUrl to wire CI. If left
    // blank, the SWA is created bare and a deployment token can be fetched
    // and used with the github action manually.
    repositoryUrl:    empty(repositoryUrl) ? null : repositoryUrl
    branch:           empty(repositoryUrl) ? null : branch
    buildProperties: {
      appLocation:      'client'
      apiLocation:      ''
      outputLocation:   'dist'
    }
  }
}

// ─── Custom domain DNS (Phase 7) ───────────────────────────────────────────────
// Azure-hosted DNS zone for the apex domain. Delegate the registrar's name
// servers (Namecheap → Custom DNS) to the `dnsZoneNameServers` output, then add
// the domain to the SWA "on Azure DNS" — SWA auto-creates the apex TXT + ALIAS
// records and provisions a managed TLS cert. The `www` CNAME is codified here so
// it's reproducible; the apex/www staticSites/customDomains bindings are added
// once the apex validates (see plan step 6).

resource dnsZone 'Microsoft.Network/dnszones@2023-07-01-preview' = if (!empty(customDomain)) {
  name:     customDomain
  location: 'global'
  tags:     commonTags
  properties: {
    zoneType: 'Public'
  }
}

resource wwwCname 'Microsoft.Network/dnszones/CNAME@2023-07-01-preview' = if (!empty(customDomain)) {
  parent: dnsZone
  name:   'www'
  properties: {
    TTL: 3600
    CNAMERecord: {
      cname: staticWebApp.properties.defaultHostname
    }
  }
}

// ─── Outputs ──────────────────────────────────────────────────────────────────

output storageAccountName string = storage.name
output rawEventsUrl       string = '${storage.properties.primaryEndpoints.blob}${rawContainerName}/events.csv'
output functionAppName    string = functionApp.name
output functionAppUrl     string = 'https://${functionApp.properties.defaultHostName}'
output staticWebAppName   string = staticWebApp.name
output staticWebAppUrl    string = 'https://${staticWebApp.properties.defaultHostname}'
output customDomainUrl    string = empty(customDomain) ? '' : 'https://${customDomain}'
// The 4 Azure name servers to enter at the registrar (Namecheap → Custom DNS).
output dnsZoneNameServers array = dnsZone.?properties.nameServers ?? []
