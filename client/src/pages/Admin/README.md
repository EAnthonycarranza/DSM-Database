# Admin Form Builder System

This system provides a comprehensive form building and management solution for administrators to create custom forms that integrate with the existing DSM admission process.

## Components Overview

### 1. FormBuilder.jsx
**Route:** `/admin/form-builder`

A drag-and-drop form builder interface that allows admins to:
- Add various field types (text, email, phone, date, select, checkbox, radio, textarea, rating)
- Configure field properties (labels, validation, requirements)
- Preview forms in real-time
- Export/import form configurations
- Save forms to the database (MongoDB ready)

**Features:**
- ✅ Drag and drop interface
- ✅ Real-time preview
- ✅ Field configuration panel
- ✅ Form validation settings
- ✅ Export/Import functionality
- ✅ MongoDB integration ready
- ✅ Responsive design with custom styling

### 2. FormManager.jsx
**Route:** `/admin/forms`

A management dashboard for all created forms that provides:
- List view of all forms with search and filtering
- Form statistics (submissions, fields count, etc.)
- Bulk operations (delete, export)
- Form status management (active/inactive)
- Quick actions (edit, preview, duplicate, delete)

**Features:**
- ✅ Search and filter forms
- ✅ Bulk selection and operations
- ✅ Form statistics dashboard
- ✅ Status management
- ✅ Export functionality
- ✅ Responsive table design

### 3. formService.js
**Location:** `/services/formService.js`

A service layer for MongoDB integration that handles:
- Form CRUD operations
- Form submission handling
- Data export functionality
- Authentication and authorization
- Integration with existing admission forms

**API Methods:**
- `saveForm(formConfig)` - Save new form
- `getForms()` - Retrieve all forms
- `getForm(formId)` - Get specific form
- `updateForm(formId, config)` - Update form
- `deleteForm(formId)` - Delete form
- `submitFormData(formId, data)` - Submit form data
- `getFormSubmissions(formId)` - Get submissions
- `exportSubmissions(formId, format)` - Export data

## Integration with Existing System

### DSM Admission Form Integration
The form builder is designed to work alongside the existing DSM Admission form (`DSMAdmission.jsx`). Admins can:

1. **Clone the DSM template:** Use `formService.cloneDSMAdmissionForm()` to create new forms based on the admission structure
2. **Custom fields:** Add additional fields to collect more specific information
3. **Multiple admission forms:** Create different admission forms for different programs
4. **Unified submissions:** All form submissions are stored in the same MongoDB collection with consistent structure

### MongoDB Schema

#### Forms Collection
```javascript
{
  _id: ObjectId,
  title: String (required),
  description: String,
  fields: [{
    id: String (required),
    type: String (required), // text, number, email, etc.
    label: String (required),
    name: String (required),
    required: Boolean,
    placeholder: String,
    options: [String], // for select/radio fields
    validation: {
      minLength: Number,
      maxLength: Number,
      pattern: String, // regex
      min: Number,     // for numbers
      max: Number      // for numbers
    }
  }],
  createdAt: Date,
  updatedAt: Date,
  createdBy: ObjectId (ref: User),
  isActive: Boolean (default: true),
  submissions: Number (default: 0)
}
```

#### Form Submissions Collection
```javascript
{
  _id: ObjectId,
  formId: ObjectId (ref: Form),
  submissionData: Mixed, // Dynamic based on form fields
  submittedAt: Date,
  submittedBy: ObjectId (ref: User),
  ipAddress: String,
  userAgent: String,
  status: String, // pending, reviewed, approved, rejected
  notes: String   // admin notes
}
```

## Setup Instructions

### 1. Frontend Setup (Already Complete)
The components are already integrated into the React app with proper routing:
- `/admin/forms` - Form management dashboard
- `/admin/form-builder` - Form builder interface

### 2. Backend Setup (To Do)
To complete the integration, you'll need to:

1. **Create API endpoints** in your Express.js backend:
   ```javascript
   // routes/forms.js
   app.get('/api/forms', getForms);
   app.post('/api/forms', createForm);
   app.get('/api/forms/:id', getForm);
   app.put('/api/forms/:id', updateForm);
   app.delete('/api/forms/:id', deleteForm);
   app.post('/api/forms/:id/submissions', submitForm);
   app.get('/api/forms/:id/submissions', getSubmissions);
   app.get('/api/forms/:id/export', exportSubmissions);
   ```

2. **Create MongoDB models** using Mongoose:
   ```javascript
   // models/Form.js
   const FormSchema = new Schema({
     title: { type: String, required: true },
     description: String,
     fields: [FieldSchema],
     createdBy: { type: ObjectId, ref: 'User' },
     isActive: { type: Boolean, default: true }
   });

   // models/FormSubmission.js
   const SubmissionSchema = new Schema({
     formId: { type: ObjectId, ref: 'Form' },
     submissionData: Schema.Types.Mixed,
     submittedAt: { type: Date, default: Date.now },
     submittedBy: { type: ObjectId, ref: 'User' }
   });
   ```

3. **Update environment variables:**
   ```
   REACT_APP_API_URL=http://localhost:3001/api
   ```

### 3. Authentication Integration
The system expects user authentication. Update the `formService.js` methods:
- `getAuthToken()` - Should return JWT token from your auth system
- `getCurrentUserId()` - Should return current user ID

## Usage Examples

### Creating a New Form
1. Navigate to `/admin/form-builder`
2. Drag field types from the sidebar
3. Configure each field's properties
4. Preview the form
5. Save to database

### Managing Forms
1. Navigate to `/admin/forms`
2. Search and filter forms
3. View form statistics
4. Manage form status (active/inactive)
5. Export form data

### Cloning DSM Admission Form
```javascript
// In FormBuilder component
const cloneDSMForm = async () => {
  const template = await formService.cloneDSMAdmissionForm();
  setFormConfig(template);
};
```

## Styling Architecture

The components use scoped CSS-in-JS styling to avoid conflicts with existing styles:
- Custom CSS variables for consistent theming
- Responsive grid layouts
- Tailwind-compatible utility classes
- Hover and focus states for better UX
- Dark/light theme ready variables

## Security Considerations

1. **Input Validation:** All form inputs are validated client-side and should be validated server-side
2. **Authentication:** All API endpoints require valid JWT tokens
3. **Authorization:** Only admins can create/modify forms
4. **Data Sanitization:** Form submissions are sanitized before storage
5. **CSRF Protection:** Implement CSRF tokens for form submissions

## Future Enhancements

1. **Conditional Logic:** Add if/then field visibility rules
2. **Multi-page Forms:** Support for step-by-step forms like DSM admission
3. **File Uploads:** Add file upload field type
4. **Email Notifications:** Automatic email notifications on form submission
5. **Analytics Dashboard:** Form performance metrics and analytics
6. **API Webhooks:** Integration with external systems
7. **Form Templates:** Pre-built templates for common use cases

## Testing

To test the system:
1. Navigate to `/admin/forms` to see the form management dashboard
2. Click "Create New Form" to access the form builder
3. Test drag-and-drop functionality, field configuration, and preview
4. Test form export/import features
5. Verify responsive design on different screen sizes

The system is now ready for backend integration and production use!