// Azure resources for the Ulti Game Tracker pipeline.
//
// Resources:
//   - Storage account with a public-read `raw` container (live event log)
//   - Linux Consumption Function App (the api/) with system-assigned identity
//   - Static Web App (the app SPA host) — served at app.<customDomain>
//   - Static Web App (the marketing landing page) — served at the apex + www
//   - Azure DNS zone + records + SWA custom-domain bindings (Phase 7)
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

@description('Custom apex domain (Phase 7). Empty = no DNS zone / custom-domain wiring. When set, an Azure DNS zone is provisioned (its name servers are output for delegation at the registrar, Namecheap) and three host names are bound: the apex + www serve the marketing landing SWA, and app.<domain> serves the app SPA. SWA managed TLS certs are auto-provisioned on validation.')
param customDomain string = 'ultigametracker.com'

@description('Apex TXT validation token for the landing SWA apex custom-domain (dns-txt-token method). Only needed on a *first* apex bring-up: deploy once to create the apex customDomain (it enters "Validating" and exposes a validationToken via the portal / `az staticwebapp hostname show`), pass that token here, then re-deploy to publish the TXT record and complete validation. Leave EMPTY once the apex is validated — the token disappears after validation, so the binding no longer needs the TXT, and referencing the (now-absent) token property would fail the whole deployment.')
param apexValidationToken string = ''

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
var landingStaticWebAppName = 'stapp-${namePrefix}-landing-${environment}-${regionCode}' // e.g. stapp-ugt-landing-prod-aue
var rawContainerName   = 'raw'

// CORS origins the Function App accepts. Always the app SWA default hostname;
// when a custom domain is configured, also the apex + www (landing) and the
// app.<domain> subdomain (the app SPA that actually calls the API) — https-only.
var corsAllowedOrigins = concat(
  [ 'https://${staticWebApp.properties.defaultHostname}' ],
  empty(customDomain) ? [] : [
    'https://${customDomain}'
    'https://www.${customDomain}'
    'https://app.${customDomain}'
  ]
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

// ─── Landing-page Static Web App ──────────────────────────────────────────────
// Separate Free SWA serving the marketing landing page at the apex
// (customDomain) + www. The app SPA above is served from app.<customDomain>.
// Content is published by the deploy-landing.yml workflow (deploys landing/),
// not an azd service, so there's no repository binding here.

resource landingStaticWebApp 'Microsoft.Web/staticSites@2024-04-01' = {
  name:     landingStaticWebAppName
  location: staticWebAppLocation
  tags:     commonTags
  sku: { name: 'Free', tier: 'Free' }
  properties: {
    buildProperties: {
      appLocation:      'landing'
      apiLocation:      ''
      outputLocation:   'dist'
    }
  }
}

// ─── Custom domain DNS + bindings (Phase 7) ────────────────────────────────────
// Azure-hosted DNS zone for the apex domain. Delegate the registrar's name
// servers (Namecheap → Custom DNS) to the `dnsZoneNameServers` output. Records:
//   - apex `@`  A/ALIAS  → landing SWA   (serves https://<domain>)
//   - `www`     CNAME    → landing SWA   (serves https://www.<domain>)
//   - `app`     CNAME    → app SPA SWA   (serves https://app.<domain>)
//   - apex `@`  TXT      → SWA-issued validation token for the apex binding
// SWA provisions/renews managed TLS certs on validation. The apex uses
// dns-txt-token validation (A/ALIAS can't be CNAME-delegated); www + app use
// cname-delegation.
//
// TWO ordering gotchas, both expected on a *first* bring-up or after a SWA
// hostname change (e.g. recreating the app SWA):
//   1. Apex TXT: the apex customDomain (dns-txt-token) and its TXT record are
//      mutually dependent. Supply `apexValidationToken` to publish the TXT (see
//      param docs). Leave it empty once validated — the token disappears and a
//      reference to it would fail the deployment.
//   2. CNAME-delegated bindings (www, app): SWA validates by resolving the
//      CNAME over *public* DNS, which lags the zone write by the record TTL.
//      A clean deploy can fail validation with "CNAME Record is invalid" until
//      the new CNAME propagates. This is a timing limitation of ARM (it can't
//      wait on public DNS) — re-run the deploy, or run `az staticwebapp
//      hostname set ... --validation-method cname-delegation` once the CNAME
//      resolves. Idempotent against an already-validated binding.

resource dnsZone 'Microsoft.Network/dnszones@2023-07-01-preview' = if (!empty(customDomain)) {
  name:     customDomain
  location: 'global'
  tags:     commonTags
  properties: {
    zoneType: 'Public'
  }
}

resource apexAlias 'Microsoft.Network/dnszones/A@2023-07-01-preview' = if (!empty(customDomain)) {
  parent: dnsZone
  name:   '@'
  properties: {
    TTL: 3600
    targetResource: { id: landingStaticWebApp.id }
  }
}

resource wwwCname 'Microsoft.Network/dnszones/CNAME@2023-07-01-preview' = if (!empty(customDomain)) {
  parent: dnsZone
  name:   'www'
  properties: {
    TTL: 3600
    CNAMERecord: {
      cname: landingStaticWebApp.properties.defaultHostname
    }
  }
}

resource appCname 'Microsoft.Network/dnszones/CNAME@2023-07-01-preview' = if (!empty(customDomain)) {
  parent: dnsZone
  name:   'app'
  properties: {
    TTL: 3600
    CNAMERecord: {
      cname: staticWebApp.properties.defaultHostname
    }
  }
}

// SWA custom-domain bindings (managed TLS issued on validation).
resource appCustomDomain 'Microsoft.Web/staticSites/customDomains@2024-04-01' = if (!empty(customDomain)) {
  parent: staticWebApp
  name:   'app.${customDomain}'
  properties: {
    validationMethod: 'cname-delegation'
  }
  dependsOn: [ appCname ]
}

resource wwwCustomDomain 'Microsoft.Web/staticSites/customDomains@2024-04-01' = if (!empty(customDomain)) {
  parent: landingStaticWebApp
  name:   'www.${customDomain}'
  properties: {
    validationMethod: 'cname-delegation'
  }
  dependsOn: [ wwwCname ]
}

resource apexCustomDomain 'Microsoft.Web/staticSites/customDomains@2024-04-01' = if (!empty(customDomain)) {
  parent: landingStaticWebApp
  name:   customDomain
  properties: {
    validationMethod: 'dns-txt-token'
  }
  dependsOn: [ apexAlias ]
}

// Apex validation TXT — only managed during a first bring-up, when an explicit
// apexValidationToken is supplied (see param docs). Once the apex is validated
// the token is gone and the TXT is no longer required, so this resource is
// skipped and the existing record (if any) is left untouched.
resource apexTxt 'Microsoft.Network/dnszones/TXT@2023-07-01-preview' = if (!empty(customDomain) && !empty(apexValidationToken)) {
  parent: dnsZone
  name:   '@'
  properties: {
    TTL: 3600
    TXTRecords: [
      { value: [ apexValidationToken ] }
    ]
  }
}

// ─── Outputs ──────────────────────────────────────────────────────────────────

output storageAccountName string = storage.name
output rawEventsUrl       string = '${storage.properties.primaryEndpoints.blob}${rawContainerName}/events.csv'
output functionAppName    string = functionApp.name
output functionAppUrl     string = 'https://${functionApp.properties.defaultHostName}'
output staticWebAppName   string = staticWebApp.name
output staticWebAppUrl    string = 'https://${staticWebApp.properties.defaultHostname}'
output landingStaticWebAppName string = landingStaticWebApp.name
output landingStaticWebAppUrl  string = 'https://${landingStaticWebApp.properties.defaultHostname}'
// Public URLs once DNS + certs are live: apex/www = landing, app = the SPA.
output customDomainUrl    string = empty(customDomain) ? '' : 'https://${customDomain}'
output appCustomDomainUrl string = empty(customDomain) ? '' : 'https://app.${customDomain}'
// The 4 Azure name servers to enter at the registrar (Namecheap → Custom DNS).
output dnsZoneNameServers array = dnsZone.?properties.nameServers ?? []
