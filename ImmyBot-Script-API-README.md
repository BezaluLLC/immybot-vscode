# ImmyBot Script API README

## API Endpoints

### Scripts

POST `/api/v1/scripts/debug/cancel/{cancellationId}`


POST
`/api/v1/scripts/language-service/start`


GET
`/api/v1/scripts/language-service/{terminalId}/language`


POST
`/api/v1/scripts/run`


GET
`/api/v1/scripts/dx`


GET
`/api/v1/scripts/global/names`


GET
`/api/v1/scripts/local/names`


GET
`/api/v1/scripts/search`


GET
`/api/v1/scripts/local`


POST
`/api/v1/scripts/local`


GET
`/api/v1/scripts/global`


POST
`/api/v1/scripts/global`


GET
`/api/v1/scripts/local/{scriptId}`


POST
`/api/v1/scripts/local/{scriptId}`


DELETE
`/api/v1/scripts/local/{scriptId}`


GET
`/api/v1/scripts/global/{scriptId}`


POST
`/api/v1/scripts/global/{scriptId}`


DELETE
`/api/v1/scripts/global/{scriptId}`


POST
`/api/v1/scripts/syntax-check`


GET
`/api/v1/scripts/references/count`


GET
`/api/v1/scripts/global/{scriptId}/references`


GET
`/api/v1/scripts/local/{scriptId}/references`


POST
`/api/v1/scripts/duplicate`


GET
`/api/v1/scripts/local/{scriptId}/migrate-local-to-global-what-if`


POST
`/api/v1/scripts/local/{scriptId}/migrate-local-to-global`


POST
`/api/v1/scripts/default-variables`


GET
`/api/v1/scripts/functions`


POST
`/api/v1/scripts/functions/syntax`


POST
`/api/v1/scripts/validate-param-block-parameters`


POST
`/api/v1/scripts/does-script-have-param-block`


GET
`/api/v1/scripts/disabled-preflight-scripts`


POST
`/api/v1/scripts/set-preflight-script-enablement`


GET
`/api/v1/scripts/local/{scriptId}/audit`


GET
`/api/v1/scripts/global/{scriptId}/audit`


## Script Type

- Local  = 1
- Global = 2

## Script Category

>Context: Metascript, Cloudscript, System, User, or Any

>Language: PowerShell or Command Line 

### SoftwareDetection
- Execution Context = any
- Language          = any
- Category          = 0
  
### SoftwareVersionAction
- Execution Context = any
- Language          = any
- Category          = 2
  
### MaintenanceTaskSetter
- Execution Context = any
- Language          = any
- Category          = 3

### MetascriptDeploymentTarget
- Execution Context = metascript
- Language          = any
- Category          = 4

### FilterScriptDeploymentTarget
- Execution Context = cloudscript
- Language          = any
- Category          = 5

### DeviceInventory
- Execution Context = any
- Language          = any
- Category          = 6

### Function
- Execution Context = metascript
- Language          = any
- Category          = 7

### ImmySystem
- Execution Context = any
- Language          = any
- Category          = 8

### DynamicVersions
- Execution Context = cloudscript
- Language          = any
- Category          = 9

### DownloadInstaller           
- Execution Context = any
- Language          = any
- Category          = 10

### Module
- Execution Context = any
- Language          = any
- Category          = 11

### Preflight
- Execution Context = any
- Language          = any
- Category          = 12

### Integration
- Execution Context = any        
- Language          = any
- Category          = 13

### SoftwareAutoUpdate(deprecated)
- Execution Context = any
- Language          = any
- Category          = 1

### Unknown
- Execution Context = any
- Language          = any
- Category          = 14

>[!NOTE]
>The following categories are all considered part of a parent and can be placed in their indicated child folders:
>
>Software:
>- SoftwareDetection     => Detection
>- DownloadInstaller     => Download
>- DynamicVersions       => Dynamic Version
>- SoftwareVersionAction => Action (Install|Uninstall|Upgrade)
>
>Deployment:
>- FilterDeploymentTarget     => Filter
>- MetascriptDeploymentTarget => Metascript

## Execution Context

- Metascript  = 2
- CloudScript = 4
- System      = 0
- User        = 1

## Language
- Command Line = 1
- Powershell   = 2

## Example GET Response

```json
{
    "tenants": [],
    "owned": false,
    "updatedBy": "",
    "scriptType": 1,
    "name": "AutotaskAPI",
    "id": 1286,
    "action": "Function Connect-AutotaskAPI \r\n{\r\n    param(\r\n        [Parameter(Mandatory = $true)]\r\n        $IntegrationCode,\r\n        [Parameter(Mandatory = $true)]\r\n        $Username,\r\n        [Parameter(Mandatory = $true)]\r\n        [Password()]$Secret\r\n    )\r\n    $AutotaskAuthHeader = @{\r\n        'ApiIntegrationcode' = $Integrationcode\r\n        'UserName'           = $UserName\r\n        'Secret'             = $Secret\r\n        'Content-Type'       = 'application/json'\r\n    }\r\n    if($IntegrationContext)\r\n    {\r\n        $IntegrationContext.AutotaskAuthHeader = $AutotaskAuthHeader\r\n    }\r\n    $Script:AutodeskAuthHeader = $AutodeskAuthHeader\r\n    Write-Host \"Retrieving webservices URI based on username\" -ForegroundColor Green\r\n    try\r\n    {\r\n        $Version = (Invoke-RestMethod -Uri \"https://webservices2.autotask.net/atservicesrest/versioninformation\").apiversions | select-object -last 1\r\n        $AutotaskBaseURI = Invoke-RestMethod -Uri \"https://webservices2.autotask.net/atservicesrest/$($Version)/zoneInformation?user=$($AutotaskAuthHeader.UserName)\"\r\n        Write-Host \"Setting AutotaskBaseURI to $($AutotaskBaseURI.url) using version $Version\" -ForegroundColor green\r\n        Add-AutotaskBaseURI -BaseURI $AutotaskBaseURI.url.Trim('/')\r\n    } catch\r\n    {\r\n        throw \"Could not Retrieve baseuri. E-mail address might be incorrect. You can manually add the baseuri via the Add-AutotaskBaseURI cmdlet. $($_.Exception.Message)\"\r\n    }\r\n}\r\n    \r\n<#\r\n.SYNOPSIS\r\n    Sets the current API URL\r\n.DESCRIPTION\r\n Sets the API URL to the selected URL. URLs parameters can be tab-completed.\r\n.EXAMPLE\r\n    PS C:\\> Add-AutotaskBaseURI -BaseURI https://webservices2.autotask.net/atservicesrest\r\n    Sets the autotask BaseURI to https://webservices2.autotask.net/atservicesrest\r\n.INPUTS\r\n    -BaseURI: one of the following list:\r\n        \"https://webservices2.autotask.net/atservicesrest\",\r\n        \"https://webservices11.autotask.net/atservicesrest\",\r\n        \"https://webservices1.autotask.net/atservicesrest\",\r\n        \"https://webservices17.autotask.net/atservicesrest\",\r\n        \"https://webservices3.autotask.net/atservicesrest\",\r\n        \"https://webservices14.autotask.net/atservicesrest\",\r\n        \"https://webservices5.autotask.net/atservicesrest\",\r\n        \"https://webservices15.autotask.net/atservicesrest\",\r\n        \"https://webservices4.autotask.net/atservicesrest\",\r\n        \"https://webservices16.autotask.net/atservicesrest\",\r\n        \"https://webservices6.autotask.net/atservicesrest\",\r\n        \"https://prde.autotask.net/atservicesrest\",\r\n        \"https://pres.autotask.net/atservicesrest\",\r\n        \"https://webservices18.autotask.net/atservicesrest\",\r\n        \"https://webservices19.autotask.net/atservicesrest\",\r\n        \"https://webservices12.autotask.net/atservicesrest\"\r\n.OUTPUTS\r\n    none\r\n.NOTES\r\n    To-do: \r\n#>\r\n\r\nfunction Get-AutotaskAPIResource\r\n{\r\n    [CmdletBinding()]\r\n    Param(\r\n        [Parameter(Mandatory)]\r\n        [ValidateSet('ActionTypes',\r\n            'AdditionalInvoiceFieldValues',\r\n            'ApiVersion',\r\n            'Appointments',\r\n            'AttachmentInfo',\r\n            'BillingCodes',\r\n            'BillingItemApprovalLevels',\r\n            'BillingItems',\r\n            'ChangeOrderCharges',\r\n            'ChangeRequestLinks',\r\n            'ChecklistLibraries',\r\n            'ChecklistLibraryChecklistItems',\r\n            'ChecklistLibraryChecklistItemsChild',\r\n            'ClassificationIcons',\r\n            'ClientPortalUsers',\r\n            'ComanagedAssociations',\r\n            'Companies',\r\n            'CompanyAlerts',\r\n            'CompanyAlertsChild',\r\n            'CompanyAttachments',\r\n            'CompanyAttachmentsChild',\r\n            'CompanyContactsChild',\r\n            'CompanyLocations',\r\n            'CompanyLocationsChild',\r\n            'CompanyNotes',\r\n            'CompanyNotesChild',\r\n            'CompanySiteConfigurations',\r\n            'CompanySiteConfigurationsChild',\r\n            'CompanyTeams',\r\n            'CompanyTeamsChild',\r\n            'CompanyToDos',\r\n            'CompanyToDosChild',\r\n            'CompanyWebhookExcludedResources',\r\n            'CompanyWebhookExcludedResourcesChild',\r\n            'CompanyWebhookFields',\r\n            'CompanyWebhookFieldsChild',\r\n            'CompanyWebhooks',\r\n            'CompanyWebhookUdfFields',\r\n            'CompanyWebhookUdfFieldsChild',\r\n            'ConfigurationItemBillingProductAssociations',\r\n            'ConfigurationItemBillingProductAssociationsChild',\r\n            'ConfigurationItemCategories',\r\n            'ConfigurationItemCategoryUdfAssociations',\r\n            'ConfigurationItemCategoryUdfAssociationsChild',\r\n            'ConfigurationItemExts',\r\n            'ConfigurationItemNotes',\r\n            'ConfigurationItemNotesChild',\r\n            'ConfigurationItems',\r\n            'ConfigurationItemTypes',\r\n            'ContactBillingProductAssociations',\r\n            'ContactBillingProductAssociationsChild',\r\n            'ContactGroupContacts',\r\n            'ContactGroupContactsChild',\r\n            'ContactGroups',\r\n            'Contacts',\r\n            'ContactWebhookExcludedResources',\r\n            'ContactWebhookExcludedResourcesChild',\r\n            'ContactWebhookFields',\r\n            'ContactWebhookFieldsChild',\r\n            'ContactWebhooks',\r\n            'ContactWebhookUdfFields',\r\n            'ContactWebhookUdfFieldsChild',\r\n            'ContractBillingRules',\r\n            'ContractBillingRulesChild',\r\n            'ContractBlockHourFactors',\r\n            'ContractBlockHourFactorsChild',\r\n            'ContractBlocks',\r\n            'ContractBlocksChild',\r\n            'ContractCharges',\r\n            'ContractChargesChild',\r\n            'ContractExclusionBillingCodes',\r\n            'ContractExclusionBillingCodesChild',\r\n            'ContractExclusionRoles',\r\n            'ContractExclusionRolesChild',\r\n            'ContractExclusionSetExcludedRoles',\r\n            'ContractExclusionSetExcludedRolesChild',\r\n            'ContractExclusionSetExcludedWorkTypes',\r\n            'ContractExclusionSetExcludedWorkTypesChild',\r\n            'ContractExclusionSets',\r\n            'ContractMilestones',\r\n            'ContractMilestonesChild',\r\n            'ContractNotes',\r\n            'ContractNotesChild',\r\n            'ContractRates',\r\n            'ContractRatesChild',\r\n            'ContractRetainers',\r\n            'ContractRetainersChild',\r\n            'ContractRoleCosts',\r\n            'ContractRoleCostsChild',\r\n            'Contracts',\r\n            'ContractServiceAdjustments',\r\n            'ContractServiceAdjustmentsChild',\r\n            'ContractServiceBundleAdjustments',\r\n            'ContractServiceBundleAdjustmentsChild',\r\n            'ContractServiceBundles',\r\n            'ContractServiceBundlesChild',\r\n            'ContractServiceBundleUnits',\r\n            'ContractServiceBundleUnitsChild',\r\n            'ContractServices',\r\n            'ContractServicesChild',\r\n            'ContractServiceUnits',\r\n            'ContractServiceUnitsChild',\r\n            'ContractTicketPurchases',\r\n            'ContractTicketPurchasesChild',\r\n            'Countries',\r\n            'Currencies',\r\n            'Departments',\r\n            'ExpenseItems',\r\n            'ExpenseItemsChild',\r\n            'ExpenseReports',\r\n            'Holidays',\r\n            'HolidaysChild',\r\n            'HolidaySets',\r\n            'InternalLocations',\r\n            'InternalLocationWithBusinessHours',\r\n            'InventoryItems',\r\n            'InventoryItemSerialNumbers',\r\n            'InventoryItemSerialNumbersChild',\r\n            'InventoryLocations',\r\n            'InventoryTransfers',\r\n            'Invoices',\r\n            'InvoiceTemplates',\r\n            'MetadataApiIntegration',\r\n            'NotificationHistory',\r\n            'Opportunities',\r\n            'OpportunityAttachments',\r\n            'OpportunityAttachmentsChild',\r\n            'OrganizationalLevel1',\r\n            'OrganizationalLevel2',\r\n            'OrganizationalLevelAssociation',\r\n            'OrganizationalResources',\r\n            'OrganizationalResourcesChild',\r\n            'PaymentTerms',\r\n            'Phases',\r\n            'PhasesChild',\r\n            'PriceListMaterialCodes',\r\n            'PriceListProducts',\r\n            'PriceListProductTiers',\r\n            'PriceListRoles',\r\n            'PriceListServiceBundles',\r\n            'PriceListServices',\r\n            'PriceListWorkTypeModifiers',\r\n            'ProductNotes',\r\n            'ProductNotesChild',\r\n            'Products',\r\n            'ProductTiers',\r\n            'ProductTiersChild',\r\n            'ProductVendors',\r\n            'ProductVendorsChild',\r\n            'ProjectAttachments',\r\n            'ProjectAttachmentsChild',\r\n            'ProjectCharges',\r\n            'ProjectChargesChild',\r\n            'ProjectNotes',\r\n            'ProjectNotesChild',\r\n            'Projects',\r\n            'PurchaseApprovals',\r\n            'PurchaseOrderItemReceiving',\r\n            'PurchaseOrderItemReceivingChild',\r\n            'PurchaseOrderItems',\r\n            'PurchaseOrderItemsChild',\r\n            'PurchaseOrders',\r\n            'QuoteItems',\r\n            'QuoteItemsChild',\r\n            'QuoteLocations',\r\n            'Quotes',\r\n            'QuoteTemplates',\r\n            'ResourceRoleDepartments',\r\n            'ResourceRoleDepartmentsChild',\r\n            'ResourceRoleQueues',\r\n            'ResourceRoleQueuesChild',\r\n            'ResourceRoles',\r\n            'ResourceRolesChild',\r\n            'Resources',\r\n            'ResourceServiceDeskRoles',\r\n            'ResourceServiceDeskRolesChild',\r\n            'ResourceSkills',\r\n            'ResourceSkillsChild',\r\n            'Roles',\r\n            'SalesOrders',\r\n            'SalesOrdersChild',\r\n            'ServiceBundles',\r\n            'ServiceBundleServices',\r\n            'ServiceBundleServicesChild',\r\n            'ServiceCalls',\r\n            'ServiceCallTaskResources',\r\n            'ServiceCallTaskResourcesChild',\r\n            'ServiceCallTasks',\r\n            'ServiceCallTasksChild',\r\n            'ServiceCallTicketResources',\r\n            'ServiceCallTicketResourcesChild',\r\n            'ServiceCallTickets',\r\n            'ServiceCallTicketsChild',\r\n            'ServiceLevelAgreementResults',\r\n            'ServiceLevelAgreementResultsChild',\r\n            'Services',\r\n            'ShippingTypes',\r\n            'Skills',\r\n            'SubscriptionPeriods',\r\n            'SubscriptionPeriodsChild',\r\n            'Subscriptions',\r\n            'SurveyResults',\r\n            'Surveys',\r\n            'TaskAttachments',\r\n            'TaskAttachmentsChild',\r\n            'TaskNotes',\r\n            'TaskNotesChild',\r\n            'TaskPredecessors',\r\n            'TaskPredecessorsChild',\r\n            'Tasks',\r\n            'TasksChild',\r\n            'TaskSecondaryResources',\r\n            'TaskSecondaryResourcesChild',\r\n            'TaxCategories',\r\n            'Taxes',\r\n            'TaxRegions',\r\n            'ThresholdApiIntegration',\r\n            'TicketAdditionalConfigurationItems',\r\n            'TicketAdditionalConfigurationItemsChild',\r\n            'TicketAdditionalContacts',\r\n            'TicketAdditionalContactsChild',\r\n            'TicketAttachments',\r\n            'TicketAttachmentsChild',\r\n            'TicketCategories',\r\n            'TicketCategoryFieldDefaults',\r\n            'TicketCategoryFieldDefaultsChild',\r\n            'TicketChangeRequestApprovals',\r\n            'TicketChangeRequestApprovalsChild',\r\n            'TicketCharges',\r\n            'TicketChargesChild',\r\n            'TicketChecklistItems',\r\n            'TicketChecklistItemsChild',\r\n            'TicketChecklistLibraries',\r\n            'TicketChecklistLibrariesChild',\r\n            'TicketHistory',\r\n            'TicketNotes',\r\n            'TicketNotesChild',\r\n            'TicketRmaCredits',\r\n            'TicketRmaCreditsChild',\r\n            'Tickets',\r\n            'TicketSecondaryResources',\r\n            'TicketSecondaryResourcesChild',\r\n            'TimeEntries',\r\n            'UserDefinedFieldDefinitions',\r\n            'UserDefinedFieldListItems',\r\n            'UserDefinedFieldListItemsChild',\r\n            'WebhookEventErrorLogs',\r\n            'WorkTypeModifiers',\r\n            'ZoneInformationApiIntegration')]\r\n        [string]$Resource,\r\n        [Parameter(ParameterSetName = 'ID', Mandatory = $true)]\r\n        [Parameter(ValueFromPipelineByPropertyName = $true)]\r\n        [String]$ID,\r\n        [Parameter(ParameterSetName = 'ID', Mandatory = $false)]\r\n        [String]$ChildID,\r\n        [Parameter(ParameterSetName = 'SearchQuery', Mandatory = $true)]\r\n        [String]$SearchQuery,\r\n        [Parameter(ParameterSetName = 'SimpleSearch', Mandatory = $true)]\r\n        [String]$SimpleSearch\r\n    )\r\n    begin\r\n    {\r\n        if($IntegrationContext)\r\n        {\r\n            $Script:AutotaskAuthHeader =  $IntegrationContext.AutotaskAuthHeader\r\n            $Script:AutotaskBaseURI =  $IntegrationContext.AutotaskBaseURI\r\n        }\r\n\r\n        if (!$Script:AutotaskAuthHeader -or !$Script:AutotaskBaseURI)\r\n        {\r\n            Write-Warning \"You must first run Connect-AutotaskAPI before calling any other cmdlets\" \r\n            break \r\n        }\r\n        $Resource | Write-Variable\r\n        # $resource = $PSBoundParameters.resource\r\n        $headers = $Script:AutotaskAuthHeader\r\n        # $Script:Index = $Script:Queries | Group-Object Index -AsHashTable -AsString\r\n        # $ResourceURL = @(($Script:Index[$resource] | Where-Object { $_.Get -eq $resource }))[0]\r\n        $ResourceURL = @{}\r\n        $ResourceURL.name = \"/V1.0/$Resource/{PARENTID}\"\r\n        if ($SimpleSearch)\r\n        {\r\n            $SearchOps = $SimpleSearch -split ' '\r\n            $SearchQuery = ConvertTo-Json @{\r\n                filter = @(@{\r\n                        field = $SearchOps[0]\r\n                        op    = $SearchOps[1]\r\n                        value = $SearchOps | Select-Object -Skip 2\r\n                    })\r\n            } -Compress\r\n        }\r\n    }\r\n    process\r\n    {\r\n        if ($resource -like \"*child*\" -and $SearchQuery)\r\n        { \r\n            Write-Warning \"You cannot perform a JSON Search on child items. To find child items, use the parent ID.\"\r\n            break\r\n        }\r\n        if ($ID)\r\n        {\r\n            $ResourceURL = (\"$($ResourceURL.name)\" -replace '{parentid}', \"$($ID)\") \r\n        }\r\n        if ($ChildID)\r\n        { \r\n            $ResourceURL = (\"$($ResourceURL)/$ChildID\")\r\n        }\r\n        if ($SearchQuery)\r\n        { \r\n            $ResourceURL = (\"$($ResourceURL.name)/query?search=$SearchQuery\" -replace '{PARENTID}', '')\r\n        }\r\n        $SetURI = \"$($Script:AutotaskBaseURI)/$($ResourceURL)\"\r\n        try\r\n        {\r\n            do\r\n            {\r\n                $items = Invoke-RestMethod -Uri $SetURI -Headers $Headers -Method Get\r\n                $SetURI = $items.PageDetails.NextPageUrl\r\n                if ($items.items)\r\n                { \r\n                    foreach ($item in $items.items)\r\n                    {\r\n\r\n                        $item\r\n                    }\r\n                }\r\n                if ($items.item)\r\n                {\r\n                    foreach ($item in $items.item)\r\n                    {\r\n                        $item\r\n                    }\r\n                }  \r\n            } while ($null -ne $SetURI)\r\n        } catch\r\n        {\r\n            if ($ErrResp.errors)\r\n            { \r\n                Write-Error \"API Error: $($ErrResp.errors)\" \r\n            } else\r\n            {\r\n                Write-Error \"Connecting to the Autotask API failed. $($_.Exception.Message)\"\r\n            }\r\n        }\r\n    }\r\n}\r\n\r\n\r\nFunction Add-AutotaskBaseURI (\r\n    [ValidateSet(\r\n        \"https://webservices2.autotask.net/atservicesrest\",\r\n        \"https://webservices11.autotask.net/atservicesrest\",\r\n        \"https://webservices1.autotask.net/atservicesrest\",\r\n        \"https://webservices17.autotask.net/atservicesrest\",\r\n        \"https://webservices3.autotask.net/atservicesrest\",\r\n        \"https://webservices14.autotask.net/atservicesrest\",\r\n        \"https://webservices5.autotask.net/atservicesrest\",\r\n        \"https://webservices15.autotask.net/atservicesrest\",\r\n        \"https://webservices4.autotask.net/atservicesrest\",\r\n        \"https://webservices16.autotask.net/atservicesrest\",\r\n        \"https://webservices6.autotask.net/atservicesrest\",\r\n        \"https://prde.autotask.net/atservicesrest\",\r\n        \"https://pres.autotask.net/atservicesrest\",\r\n        \"https://webservices18.autotask.net/atservicesrest\",\r\n        \"https://webservices19.autotask.net/atservicesrest\",\r\n        \"https://webservices12.autotask.net/atservicesrest\")]\r\n    [Parameter(Mandatory = $true)]$BaseURI\r\n)\r\n{\r\n    if($IntegrationContext)\r\n    {\r\n        $IntegrationContext.AutotaskBaseURI = \"$($BaseURI)\"\r\n    }\r\n    $Script:AutotaskBaseURI = \"$($BaseURI)\"\r\n}\r\n# https://webservices2.autotask.net/ATServicesRest//V1.0/Companies//query?search={\"filter\":[{\"field\":\"isactive\",\"op\":\"eq\",\"value\":\"True\"}]}\r\n\r\nExport-ModuleMember -Function @(\r\n    'Connect-AutotaskAPI',\r\n    'Add-AutotaskBaseURI',    \r\n    'Get-AutotaskAPIResource'#,\r\n    # 'New-AutotaskAPIResource',\r\n    # 'Set-AutotaskAPIResource',\r\n    # 'New-AutotaskBody',\r\n    # 'Remove-AutotaskAPIResource'\r\n)\r\n\r\n",
    "scriptLanguage": 2,
    "timeout": null,
    "scriptExecutionContext": 4,
    "scriptCategory": 11,
    "outputType": 0,
    "updatedDateUTC": "2023-09-29T20:41:07.959181Z",
    "createdDateUTC": "2023-09-12T21:49:33.223644Z"
}
```