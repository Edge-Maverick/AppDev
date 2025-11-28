import { LightningElement, wire, track } from 'lwc';
import getOrgLimits from '@salesforce/apex/OrgHealthController.getOrgLimits';
import getLicenseUsage from '@salesforce/apex/OrgHealthController.getLicenseUsage';
import getFailedJobs from '@salesforce/apex/OrgHealthController.getFailedJobs';
import getTrustStatus from '@salesforce/apex/OrgHealthController.getTrustStatus';
import { refreshApex } from '@salesforce/apex';

const JOB_COLUMNS = [
    { label: 'Job Type', fieldName: 'JobType', type: 'text', initialWidth: 120 },
    { label: 'Class', fieldName: 'ApexClassName', type: 'text' }, 
    { label: 'Error', fieldName: 'ExtendedStatus', type: 'text', wrapText: true },
    { label: 'Date', fieldName: 'CreatedDate', type: 'date', 
      typeAttributes: { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' } }
];

export default class OrgCommandCenter extends LightningElement {
    
    @track limits = [];
    @track licenses = [];
    @track trustData = { 
        instance: '...', 
        status: 'Loading...',
        location: '',
        releaseVersion: '', 
        incidents: [],
        resolvedIncidents: [], 
        services: [], 
        nextMaintenance: null,
        nextReleaseDate: null 
    };
    
    // Drawer State
    @track isDrawerOpen = false;
    @track isServiceHealthExpanded = false; 
    @track isResolvedIncidentsExpanded = false; 
    @track formattedServices = [];
    @track hasIncidents = false;
    @track hasResolvedIncidents = false; 

    failedJobs;
    jobColumns = JOB_COLUMNS;
    
    wiredLimitsResult;
    wiredLicensesResult;
    wiredJobsResult;

    @wire(getOrgLimits)
    wiredLimits(result) {
        this.wiredLimitsResult = result;
        if (result.data) this.processLimits(result.data);
    }

    @wire(getLicenseUsage)
    wiredLicenses(result) {
        this.wiredLicensesResult = result;
        if (result.data) this.processLicenses(result.data);
    }

    @wire(getFailedJobs)
    wiredJobs(result) {
        this.wiredJobsResult = result;
        if (result.data) {
            this.failedJobs = result.data.map(job => ({
                ...job,
                ApexClassName: job.ApexClass ? job.ApexClass.Name : 'Anonymous'
            }));
        }
    }

    connectedCallback() {
        this.loadTrustData();
    }

    loadTrustData() {
        getTrustStatus()
            .then(data => {
                const safeData = JSON.parse(JSON.stringify(data));
                this.trustData = safeData;
                this.processTrustDetails(safeData);
            })
            .catch(error => {
                console.error('Trust Load Error', error);
                this.trustData = { instance: 'Error', status: 'Unknown' };
            });
    }

    handleRefresh() {
        refreshApex(this.wiredLimitsResult);
        refreshApex(this.wiredLicensesResult);
        refreshApex(this.wiredJobsResult);
        this.loadTrustData();
    }

    // --- Drawer Logic ---

    openDrawer() {
        this.isDrawerOpen = true;
    }

    closeDrawer() {
        this.isDrawerOpen = false;
        this.isServiceHealthExpanded = false;
        this.isResolvedIncidentsExpanded = false; 
    }

    toggleServiceHealth() {
        this.isServiceHealthExpanded = !this.isServiceHealthExpanded;
    }
    
    toggleResolvedIncidents() {
        this.isResolvedIncidentsExpanded = !this.isResolvedIncidentsExpanded;
    }

    get serviceHealthIcon() {
        return this.isServiceHealthExpanded ? 'utility:chevronup' : 'utility:chevrondown';
    }

    get resolvedIncidentsIcon() {
        return this.isResolvedIncidentsExpanded ? 'utility:chevronup' : 'utility:chevrondown';
    }

    processTrustDetails(data) {
        // Process Services for Display
        if (data.services) {
            this.formattedServices = data.services.map(svc => {
                const currentStatus = svc.status || 'OK'; 
                const isHealthy = currentStatus === 'OK' || currentStatus === 'Available';
                
                return {
                    key: svc.key || svc.name, 
                    name: svc.key || svc.name,
                    status: currentStatus,
                    iconName: isHealthy ? 'utility:check' : 'utility:warning',
                    iconVariant: isHealthy ? 'success' : 'error',
                    rowClass: isHealthy ? 'service-row' : 'service-row row-issue'
                };
            });
        }

        const rawIncidents = data.incidents || [];
        
        // Filter Active Incidents
        const activeIncidents = rawIncidents.filter(inc => {
            const status = (inc.status || '').toUpperCase();
            return status !== 'RESOLVED' && status !== 'COMPLETED';
        });

        // Filter Resolved Incidents
        const resolvedIncidents = rawIncidents.filter(inc => {
            const status = (inc.status || '').toUpperCase();
            return status === 'RESOLVED' || status === 'COMPLETED';
        });

        // Process Data using the helper
        this.trustData.incidents = this._formatIncidents(activeIncidents);
        this.hasIncidents = this.trustData.incidents.length > 0;

        this.trustData.resolvedIncidents = this._formatIncidents(resolvedIncidents);
        this.hasResolvedIncidents = this.trustData.resolvedIncidents.length > 0;
    }

    // --- Private Helper for formatting incident lists ---
    _formatIncidents(incidentsList) {
        return incidentsList.map(inc => {
            let formattedEvents = [];
            if (inc.IncidentEvents && Array.isArray(inc.IncidentEvents)) {
                formattedEvents = inc.IncidentEvents.map(evt => {
                    let dateStr = evt.createdDate || evt.createdAt || '';
                    let rawDate = dateStr ? new Date(dateStr) : new Date();
                    try {
                        if(dateStr) dateStr = rawDate.toLocaleString();
                    } catch(e){ /* ignore */ }
                    return {
                        ...evt,
                        displayDate: dateStr,
                        rawDate: rawDate
                    };
                });
                formattedEvents.sort((a, b) => b.rawDate - a.rawDate);
            }

            // FIX: Check if message is an object (e.g., localized) and hide it if so
            let cleanMessage = inc.message;
            if (cleanMessage && typeof cleanMessage === 'object') {
                cleanMessage = null;
            }

            return { ...inc, message: cleanMessage, formattedEvents };
        });
    }

    // --- Helpers ---

    processLimits(data) {
        const entries = Object.entries(data);
        this.limits = entries.map(([key, val]) => {
            const percent = Math.round(val.percent);
            const radius = 32;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (percent / 100) * circumference;
            
            let color = '#3b82f6'; // Blue
            if (percent > 90) color = '#ef4444'; // Red
            else if (percent > 75) color = '#f59e0b'; // Orange

            const displayUsed = val.used > 1000 ? (val.used/1000).toFixed(1) + 'k' : val.used;
            const displayTotal = val.total > 1000 ? (val.total/1000).toFixed(1) + 'k' : val.total;

            return {
                key, ...val, percent, color, circumference, offset, displayUsed, displayTotal
            };
        });
    }

    processLicenses(data) {
        this.licenses = data.map(lic => {
            const percent = (lic.UsedLicenses / lic.TotalLicenses) * 100;
            let barClass = 'progress-bar-fill';
            if (percent > 95) barClass += ' bg-critical';
            else if (percent > 80) barClass += ' bg-warning';
            else barClass += ' bg-healthy';

            return {
                ...lic,
                styleWidth: `width: ${percent}%`,
                barClass
            };
        });
    }

    get trustStatusClass() {
        if (this.trustData.status === 'OK') return 'status-badge status-ok';
        return 'status-badge status-issue';
    }
}