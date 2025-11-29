public with sharing class OrgHealthController {

    // --- Trust API Wrappers ---
    public class TrustViewModel {
        @AuraEnabled public String instance;
        @AuraEnabled public String status; // 'OK', 'MAJOR', 'MINOR'
        @AuraEnabled public String location; // e.g., 'NA', 'EU'
        @AuraEnabled public String releaseVersion; // e.g., 'Summer '24 Patch 12.3'
        @AuraEnabled public String apiVersion; // Calculated: e.g., '61.0'
        @AuraEnabled public List<Object> incidents;
        @AuraEnabled public List<Object> services; // Sub-service statuses
        @AuraEnabled public MaintenanceInfo nextMaintenance;
        @AuraEnabled public String nextReleaseDate; 
        @AuraEnabled public String nextReleaseName;
    }

    public class MaintenanceInfo {
        @AuraEnabled public String title;
        @AuraEnabled public String dateStr;
        @AuraEnabled public Boolean isUrgent; // Added for UI Alert logic
    }

    // --- Trust API Method ---
    @AuraEnabled(cacheable=true)
    public static TrustViewModel getTrustStatus() {
        TrustViewModel model = new TrustViewModel();
        
        try {
            // 1. Get Instance
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
                
                // Parse Release and Calculate API Version
                String relVer = (String) statusBody.get('releaseVersion');
                model.releaseVersion = relVer;
                model.apiVersion = calculateApiVersion(relVer);

                model.incidents = (List<Object>) statusBody.get('Incidents');
                model.services = (List<Object>) statusBody.get('Services');
            }

            // 3. Fetch Maintenance
            HttpRequest maintReq = new HttpRequest();
            maintReq.setEndpoint('https://api.status.salesforce.com/v1/maintenances?instance=' + instance + '&limit=1000&offset=0');
            maintReq.setMethod('GET');
            HttpResponse maintRes = http.send(maintReq);

            if (maintRes.getStatusCode() == 200) {
                List<Object> maintenances = (List<Object>) JSON.deserializeUntyped(maintRes.getBody());
                
                if (maintenances != null && !maintenances.isEmpty()) {
                    Map<String, Object> firstMaint = (Map<String, Object>) maintenances[0];
                    MaintenanceInfo info = new MaintenanceInfo();
                    info.title = (String) firstMaint.get('name');
                    
                    String startTimeStr = (String) firstMaint.get('plannedStartTime');
                    if (String.isNotBlank(startTimeStr)) {
                         info.dateStr = startTimeStr.substring(0, 10);
                         
                         // Calculate Urgency (Next 7 Days)
                         try {
                             Datetime plannedDate = (Datetime) JSON.deserialize('"' + startTimeStr + '"', Datetime.class);
                             Datetime sevenDaysFromNow = System.now().addDays(7);
                             
                             if (plannedDate >= System.now() && plannedDate <= sevenDaysFromNow) {
                                 info.isUrgent = true;
                             } else {
                                 info.isUrgent = false;
                             }
                         } catch (Exception e) {
                             info.isUrgent = false;
                         }
                    }
                   
                    model.nextMaintenance = info;

                    // Scan for Major Release
                    for (Object obj : maintenances) {
                        Map<String, Object> m = (Map<String, Object>) obj;
                        if ('Major'.equalsIgnoreCase((String)m.get('releaseType'))) {
                            model.nextReleaseDate = ((String) m.get('plannedStartTime')).substring(0, 10);
                            model.nextReleaseName = (String) m.get('name');
                            break;
                        }
                    }
                }
            }
            
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

    /**
     * Calculates API Version based on Release Name using linear progression.
     * Reference: Winter '11 = 20.0. Increments by 3.0 per year.
     * Formula: Base + ((Year - 11) * 3)
     */
    private static String calculateApiVersion(String releaseString) {
        if (String.isBlank(releaseString)) return '';
        
        try {
            // Expected format: "Season 'YY ..." e.g., "Winter '26 Patch 11.5"
            List<String> parts = releaseString.split(' ');
            if (parts.size() < 2) return '';

            String season = parts[0];       // "Winter"
            String yearStr = parts[1];      // "'26"

            // Validate and parse year
            if (!yearStr.startsWith('\'')) return '';
            Integer year = Integer.valueOf(yearStr.substring(1)); // 26

            // Calculate difference from reference year 2011 ('11)
            Integer yearDiff = year - 11;
            
            Integer baseVersion;
            if (season.equalsIgnoreCase('Winter')) {
                baseVersion = 20;
            } else if (season.equalsIgnoreCase('Spring')) {
                baseVersion = 21;
            } else if (season.equalsIgnoreCase('Summer')) {
                baseVersion = 22;
            } else {
                return ''; // Unknown season
            }

            Integer calculatedVersion = baseVersion + (yearDiff * 3);
            return calculatedVersion + '.0';

        } catch (Exception e) {
            System.debug('Error calculating API Version: ' + e.getMessage());
            return '';
        }
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

            // --- NEW: Sticky Note Methods ---

    @AuraEnabled
    public static List<Admin_Note__c> getStickyNotes() {
        return [SELECT Id, Note_Content__c, CreatedDate, CreatedBy.Name 
                FROM Admin_Note__c 
                ORDER BY CreatedDate DESC];
    }

    @AuraEnabled
    public static Admin_Note__c saveStickyNote(String content) {
        Admin_Note__c note = new Admin_Note__c(Note_Content__c = content);
        insert note;
        return note;
    }

    @AuraEnabled
    public static void deleteStickyNote(String noteId) {
        delete [SELECT Id FROM Admin_Note__c WHERE Id = :noteId];
    }
}