import { LightningElement, wire, track } from 'lwc';
import getOrgLimits from '@salesforce/apex/OrgHealthController.getOrgLimits';
import getTrustStatus from '@salesforce/apex/OrgHealthController.getTrustStatus';
import { refreshApex } from '@salesforce/apex';

export default class OrgCommandCenter extends LightningElement {
    
    @track limits = [];
    // licenses removed
    @track trustData = { 
        instance: '...', 
        status: 'Loading...',
        location: '',
        releaseVersion: '', 
        apiVersion: '', 
        incidents: [],
        resolvedIncidents: [], 
        services: [], 
        nextMaintenance: null,
        nextReleaseDate: null 
    };
    
    // UI State
    @track isDrawerOpen = false;
    @track isServiceHealthExpanded = false; 
    @track isResolvedIncidentsExpanded = false; 
    @track formattedServices = [];
    @track hasIncidents = false;
    @track hasResolvedIncidents = false; 
    @track showMaintenanceAlert = false; 

    // failedJobs & jobColumns removed
    
    wiredLimitsResult;
    // wiredLicensesResult & wiredJobsResult removed

    @wire(getOrgLimits)
    wiredLimits(result) {
        this.wiredLimitsResult = result;
        if (result.data) this.processLimits(result.data);
    }

    // wiredLicenses & wiredJobs removed

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
        // refreshApex for licenses & jobs removed
        this.loadTrustData();
    }

    // --- Alert Logic ---
    closeAlert() {
        this.showMaintenanceAlert = false;
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
        // 1. Process Services
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

        // 2. Maintenance Alert Check
        if (data.nextMaintenance && data.nextMaintenance.isUrgent === true) {
            this.showMaintenanceAlert = true;
        } else {
            this.showMaintenanceAlert = false;
        }

        // 3. Process Incidents
        const rawIncidents = data.incidents || [];
        
        const activeIncidents = rawIncidents.filter(inc => {
            const status = (inc.status || '').toUpperCase();
            return status !== 'RESOLVED' && status !== 'COMPLETED';
        });

        const resolvedIncidents = rawIncidents.filter(inc => {
            const status = (inc.status || '').toUpperCase();
            return status === 'RESOLVED' || status === 'COMPLETED';
        });

        this.trustData.incidents = this._formatIncidents(activeIncidents);
        this.hasIncidents = this.trustData.incidents.length > 0;

        this.trustData.resolvedIncidents = this._formatIncidents(resolvedIncidents);
        this.hasResolvedIncidents = this.trustData.resolvedIncidents.length > 0;
    }

    _formatIncidents(incidentsList) {
        const processed = incidentsList.map(inc => {
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
                // Sort events new to old
                formattedEvents.sort((a, b) => b.rawDate - a.rawDate);
            }

            let cleanMessage = inc.message;
            if (cleanMessage && typeof cleanMessage === 'object') {
                cleanMessage = null;
            }

            return { ...inc, message: cleanMessage, formattedEvents };
        });

        // Sort incidents by their latest event date (Descending)
        processed.sort((a, b) => {
            const dateA = (a.formattedEvents && a.formattedEvents.length > 0) ? a.formattedEvents[0].rawDate : new Date(0);
            const dateB = (b.formattedEvents && b.formattedEvents.length > 0) ? b.formattedEvents[0].rawDate : new Date(0);
            return dateB - dateA;
        });

        return processed;
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

    // processLicenses helper removed

    get trustStatusClass() {
        if (this.trustData.status === 'OK') return 'status-badge status-ok';
        return 'status-badge status-issue';
    }
}