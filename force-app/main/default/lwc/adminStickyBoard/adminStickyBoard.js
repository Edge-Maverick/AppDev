import { LightningElement, track } from 'lwc';
import getStickyNotes from '@salesforce/apex/OrgHealthController.getStickyNotes';
import saveStickyNote from '@salesforce/apex/OrgHealthController.saveStickyNote';
import deleteStickyNote from '@salesforce/apex/OrgHealthController.deleteStickyNote';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class AdminStickyBoard extends LightningElement {
    @track notes = [];
    noteInput = '';

    get hasNotes() {
        return this.notes && this.notes.length > 0;
    }

    connectedCallback() {
        this.fetchNotes();
    }

    fetchNotes() {
        getStickyNotes()
            .then(result => {
                this.notes = result;
            })
            .catch(error => {
                console.error('Error fetching notes', error);
                this.showToast('Error', 'Could not load notes', 'error');
            });
    }

    handleInputChange(event) {
        this.noteInput = event.target.value;
    }

    handleAddNote() {
        if (!this.noteInput) return;
        
        saveStickyNote({ content: this.noteInput })
            .then(() => {
                this.noteInput = ''; // Clear input
                this.fetchNotes();   // Refresh list
                this.showToast('Success', 'Note posted!', 'success');
            })
            .catch(error => {
                this.showToast('Error', error.body.message, 'error');
            });
    }

    handleDelete(event) {
        const noteId = event.target.dataset.id;
        deleteStickyNote({ noteId: noteId })
            .then(() => {
                this.fetchNotes();
                this.showToast('Deleted', 'Note removed', 'info');
            })
            .catch(error => {
                this.showToast('Error', error.body.message, 'error');
            });
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        }));
    }
}