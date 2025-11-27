import { LightningElement, track } from 'lwc';

export default class OrgHorizon extends LightningElement {
    @track selectedItem = 'org_overview';
    @track currentContent = 'org_overview';
    @track updatedCount = 12;

    get isOverview() {
        return this.currentContent === 'org_overview';
    }

    get isLoginForensics() {
        return this.currentContent === 'login_forensics';
    }

    get isSetupAudit() {
        return this.currentContent === 'setup_audit';
    }

    get pageTitle() {
        switch (this.currentContent) {
            case 'org_overview': return 'Organization Overview';
            case 'licence_utilization': return 'Licence Utilization';
            case 'user_adoption': return 'User Adoption';
            case 'login_forensics': return 'Login Forensics';
            case 'setup_audit': return 'Setup Audit Trail';
            case 'trust_status': return 'Trust Status';
            case 'optimizer': return 'Salesforce Optimizer';
            default: return 'Dashboard';
        }
    }

    handleSelect(event) {
        const selected = event.detail.name;
        this.selectedItem = selected;
        this.currentContent = selected;

        if (selected === 'setup_audit') {
            this.updatedCount = 0;
        }
    }
}