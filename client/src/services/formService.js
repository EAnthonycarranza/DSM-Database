/**
 * Form Service - MongoDB Integration
 * 
 * This service handles all form-related API calls for the admin form builder
 * and integrates with the admission form system.
 */

class FormService {
  constructor() {
    // This will be configured to connect to your MongoDB backend
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
  }

  /**
   * Save a form configuration to the database
   */
  async saveForm(formConfig) {
    try {
      const response = await fetch(`${this.baseURL}/forms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          ...formConfig,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: this.getCurrentUserId()
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error saving form:', error);
      throw error;
    }
  }

  /**
   * Get all forms created by admins
   */
  async getForms() {
    try {
      const response = await fetch(`${this.baseURL}/forms`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching forms:', error);
      throw error;
    }
  }

  /**
   * Get a specific form by ID
   */
  async getForm(formId) {
    try {
      const response = await fetch(`${this.baseURL}/forms/${formId}`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching form:', error);
      throw error;
    }
  }

  /**
   * Update an existing form
   */
  async updateForm(formId, formConfig) {
    try {
      const response = await fetch(`${this.baseURL}/forms/${formId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          ...formConfig,
          updatedAt: new Date().toISOString(),
          updatedBy: this.getCurrentUserId()
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating form:', error);
      throw error;
    }
  }

  /**
   * Delete a form
   */
  async deleteForm(formId) {
    try {
      const response = await fetch(`${this.baseURL}/forms/${formId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting form:', error);
      throw error;
    }
  }

  /**
   * Submit form data (for users filling out forms)
   */
  async submitFormData(formId, submissionData) {
    try {
      const response = await fetch(`${this.baseURL}/forms/${formId}/submissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          formId,
          submissionData,
          submittedAt: new Date().toISOString(),
          submittedBy: this.getCurrentUserId(),
          ipAddress: this.getUserIpAddress(),
          userAgent: navigator.userAgent
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error submitting form data:', error);
      throw error;
    }
  }

  /**
   * Get all submissions for a specific form
   */
  async getFormSubmissions(formId, filters = {}) {
    try {
      const queryParams = new URLSearchParams(filters);
      const response = await fetch(`${this.baseURL}/forms/${formId}/submissions?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching form submissions:', error);
      throw error;
    }
  }

  /**
   * Export form submissions to CSV
   */
  async exportSubmissions(formId, format = 'csv') {
    try {
      const response = await fetch(`${this.baseURL}/forms/${formId}/export?format=${format}`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `form_${formId}_submissions.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      return { success: true };
    } catch (error) {
      console.error('Error exporting submissions:', error);
      throw error;
    }
  }

  /**
   * Clone the DSM Admission form structure for new forms
   */
  async cloneDSMAdmissionForm() {
    // This creates a new form based on the existing DSM Admission structure
    const dsmAdmissionTemplate = {
      title: 'New Admission Form (DSM Template)',
      description: 'Cloned from DSM Admission Form',
      fields: [
        {
          id: `field_${Date.now()}_1`,
          type: 'text',
          label: 'First Name',
          name: 'firstName',
          required: true,
          placeholder: 'Enter your first name',
          validation: { minLength: 2 }
        },
        {
          id: `field_${Date.now()}_2`,
          type: 'text',
          label: 'Last Name',
          name: 'lastName',
          required: true,
          placeholder: 'Enter your last name',
          validation: { minLength: 2 }
        },
        {
          id: `field_${Date.now()}_3`,
          type: 'email',
          label: 'Email Address',
          name: 'email',
          required: true,
          placeholder: 'Enter your email address'
        },
        {
          id: `field_${Date.now()}_4`,
          type: 'tel',
          label: 'Phone Number',
          name: 'phone',
          required: true,
          placeholder: 'Enter your phone number'
        },
        {
          id: `field_${Date.now()}_5`,
          type: 'date',
          label: 'Date of Birth',
          name: 'dateOfBirth',
          required: true
        },
        {
          id: `field_${Date.now()}_6`,
          type: 'select',
          label: 'Gender',
          name: 'gender',
          required: true,
          options: ['Male', 'Female', 'Other', 'Prefer not to say']
        },
        {
          id: `field_${Date.now()}_7`,
          type: 'textarea',
          label: 'Reason for Application',
          name: 'applicationReason',
          required: true,
          placeholder: 'Please describe why you are applying...'
        }
      ]
    };

    return dsmAdmissionTemplate;
  }

  // Helper methods
  getAuthToken() {
    // This would typically get the token from localStorage, context, or cookies
    return localStorage.getItem('authToken') || '';
  }

  getCurrentUserId() {
    // This would typically get the user ID from the auth context
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.id || 'anonymous';
  }

  getUserIpAddress() {
    // This would be better handled by the backend, but can be done client-side
    return 'client-side'; // Placeholder
  }
}

// MongoDB Schema Definitions (for backend reference)
export const FORM_SCHEMA = {
  _id: 'ObjectId',
  title: 'String (required)',
  description: 'String',
  fields: [{
    id: 'String (required)',
    type: 'String (required)', // text, number, email, tel, date, select, checkbox, radio, textarea, rating
    label: 'String (required)',
    name: 'String (required)',
    required: 'Boolean',
    placeholder: 'String',
    options: ['String'], // for select, radio
    validation: {
      minLength: 'Number',
      maxLength: 'Number',
      pattern: 'String', // regex pattern
      min: 'Number', // for number fields
      max: 'Number'  // for number fields
    },
    styling: {
      width: 'String', // full, half, third
      customCSS: 'String'
    }
  }],
  createdAt: 'Date',
  updatedAt: 'Date',
  createdBy: 'ObjectId (ref: User)',
  updatedBy: 'ObjectId (ref: User)',
  isActive: 'Boolean (default: true)',
  submissions: 'Number (default: 0)'
};

export const FORM_SUBMISSION_SCHEMA = {
  _id: 'ObjectId',
  formId: 'ObjectId (ref: Form)',
  submissionData: 'Mixed', // Dynamic object based on form fields
  submittedAt: 'Date',
  submittedBy: 'ObjectId (ref: User)',
  ipAddress: 'String',
  userAgent: 'String',
  status: 'String', // pending, reviewed, approved, rejected
  notes: 'String' // admin notes
};

// Create singleton instance
const formService = new FormService();
export default formService;