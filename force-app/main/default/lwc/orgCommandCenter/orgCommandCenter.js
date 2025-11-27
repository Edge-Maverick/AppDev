import { LightningElement, wire, track } from 'lwc';
import getOrgLimits from '@salesforce/apex/OrgHealthController.getOrgLimits';
import getLicenseUsage from '@salesforce/apex/OrgHealthController.getLicenseUsage';
import getFailedJobs from '@salesforce/apex/OrgHealthController.getFailedJobs';
// UPDATED: Importing from the main controller now
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
    
    // Tracked Data
    // Updated to include nextReleaseDate
    @track limits = [];
    @track licenses = [];
    @track trustData = { 
        instance: '...', 
        status: 'Loading...', 
        incidents: [], 
        nextMaintenance: null,
        nextReleaseDate: null 
    };
    
    failedJobs;
    jobColumns = JOB_COLUMNS;
    
    // Wiring
    wiredLimitsResult;
    wiredLicensesResult;
    wiredJobsResult;

    @wire(getOrgLimits)
    wiredLimits(result) {
        this.wiredLimitsResult = result;
        if (result.data) {
            this.processLimits(result.data);
        }
    }

    @wire(getLicenseUsage)
    wiredLicenses(result) {
        this.wiredLicensesResult = result;
        if (result.data) {
            this.processLicenses(result.data);
        }
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

    // Explicit Call for Trust Data
    loadTrustData() {
        getTrustStatus()
            .then(data => {
                this.trustData = data;
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
                key, 
                ...val, 
                percent, 
                color,
                circumference, 
                offset,
                displayUsed, 
                displayTotal
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

    get trustIconName() {
        return this.trustData.status === 'OK' ? 'utility:check' : 'utility:warning';
    }
}