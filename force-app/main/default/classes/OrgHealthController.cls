public with sharing class OrgHealthController {

    // --- Trust API Wrappers ---
    public class TrustViewModel {
        @AuraEnabled public String instance;
        @AuraEnabled public String status; // 'OK', 'MAJOR', 'MINOR'
        @AuraEnabled public String location; // e.g., 'NA', 'EU'
        @AuraEnabled public String releaseVersion; // e.g., 'Summer '24 Patch 12.3'
        @AuraEnabled public List<Object> incidents;
        @AuraEnabled public List<Object> services; // Sub-service statuses
        @AuraEnabled public MaintenanceInfo nextMaintenance;
        @AuraEnabled public String nextReleaseDate; 
        @AuraEnabled public String nextReleaseName;
    }

    public class MaintenanceInfo {
        @AuraEnabled public String title;
        @AuraEnabled public String dateStr;
    }

    // --- Trust API Method ---
    @AuraEnabled(cacheable=true)
    public static TrustViewModel getTrustStatus() {
        TrustViewModel model = new TrustViewModel();
        
        try {
            // 1. Get Instance (Fallback to NA1 if undefined)
            // SECURITY: Used WITH SECURITY_ENFORCED (Compatible replacement for USER_MODE)
            String instance = 'NA1';
            List<Organization> orgs = [SELECT InstanceName FROM Organization WITH SECURITY_ENFORCED LIMIT 1];
            if (!orgs.isEmpty() && String.isNotBlank(orgs[0].InstanceName)) {
                instance = orgs[0].InstanceName;
            }
            model.instance = instance;

            Http http = new Http();
            
            // 2. Fetch Status
            HttpRequest statusReq = new HttpRequest();
            statusReq.setEndpoint('https://api.status.salesforce.com/v1/instances/' + instance + '/status');
            statusReq.setMethod('GET');
            HttpResponse statusRes = http.send(statusReq);

            if (statusRes.getStatusCode() == 200) {
                Map<String, Object> statusBody = (Map<String, Object>) JSON.deserializeUntyped(statusRes.getBody());
                model.status = (String) statusBody.get('status');
                model.location = (String) statusBody.get('location');
                model.releaseVersion = (String) statusBody.get('releaseVersion');
                model.incidents = (List<Object>) statusBody.get('Incidents');
                model.services = (List<Object>) statusBody.get('Services');
            }

            // 3. Fetch Maintenance (Using the search endpoint to get deeper list for Major releases)
            HttpRequest maintReq = new HttpRequest();
            // Updated endpoint to use /v1/maintenances?instance=... with higher limit
            maintReq.setEndpoint('https://api.status.salesforce.com/v1/maintenances?instance=' + instance + '&limit=1000&offset=0');
            maintReq.setMethod('GET');
            HttpResponse maintRes = http.send(maintReq);

            if (maintRes.getStatusCode() == 200) {
                // This endpoint returns a List<Object> directly
                List<Object> maintenances = (List<Object>) JSON.deserializeUntyped(maintRes.getBody());
                
                if (maintenances != null && !maintenances.isEmpty()) {
                    // Set the immediate next maintenance (first in the list)
                    Map<String, Object> firstMaint = (Map<String, Object>) maintenances[0];
                    MaintenanceInfo info = new MaintenanceInfo();
                    info.title = (String) firstMaint.get('name');
                    info.dateStr = ((String) firstMaint.get('plannedStartTime')).substring(0, 10);
                    model.nextMaintenance = info;

                    // Scan specifically for the next Major Release
                    for (Object obj : maintenances) {
                        Map<String, Object> m = (Map<String, Object>) obj;
                        // Check for releaseType == 'Major'
                        if ('Major'.equalsIgnoreCase((String)m.get('releaseType'))) {
                            model.nextReleaseDate = ((String) m.get('plannedStartTime')).substring(0, 10);
                            model.nextReleaseName = (String) m.get('name');
                            break;
                        }
                    }
                }
            }
            
            // Ensure UI shows something even if no major release is found in the fetch window
            if (model.nextReleaseDate == null) {
                model.nextReleaseDate = 'None Scheduled';
                model.nextReleaseName = '';
            }

        } catch (Exception e) {
            System.debug('Trust API Error: ' + e.getMessage());
            model.status = 'Unknown'; 
        }
        return model;
    }

    // --- Existing Org Health Methods ---

    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getOrgLimits() {
        Map<String, System.OrgLimit> limits = OrgLimits.getMap();
        Map<String, Object> result = new Map<String, Object>();
        
        addLimitToMap(result, limits, 'DailyApiRequests', 'API Requests');
        addLimitToMap(result, limits, 'DataStorageMB', 'Data Storage');
        addLimitToMap(result, limits, 'FileStorageMB', 'File Storage');
        addLimitToMap(result, limits, 'HourlyTimeBasedWorkflow', 'Hourly Workflow');

        return result;
    }

    private static void addLimitToMap(Map<String, Object> result, Map<String, System.OrgLimit> source, String key, String label) {
        if (source.containsKey(key)) {
            System.OrgLimit l = source.get(key);
            result.put(key, new Map<String, Object>{
                'label' => label,
                'used' => l.getValue(),
                'total' => l.getLimit(),
                'percent' => (Double.valueOf(l.getValue()) / Double.valueOf(l.getLimit())) * 100
            });
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<UserLicense> getLicenseUsage() {
        // SECURITY: Added WITH SECURITY_ENFORCED (Placed before ORDER BY)
        return [SELECT Name, TotalLicenses, UsedLicenses, Status 
                FROM UserLicense 
                WHERE TotalLicenses > 0 AND Status = 'Active'
                WITH SECURITY_ENFORCED
                ORDER BY UsedLicenses DESC];
    }
    
    @AuraEnabled(cacheable=true)
    public static List<AsyncApexJob> getFailedJobs() {
        // SECURITY: Added WITH SECURITY_ENFORCED (Placed before ORDER BY/LIMIT)
        return [SELECT Id, ApexClass.Name, ExtendedStatus, CreatedDate, CreatedBy.Name, JobType 
                FROM AsyncApexJob 
                WHERE Status = 'Failed' 
                WITH SECURITY_ENFORCED
                ORDER BY CreatedDate DESC LIMIT 10];
    }
}