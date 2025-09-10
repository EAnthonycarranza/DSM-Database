import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  Copy,
  Download,
  Users,
  Calendar,
  Search,
  Filter,
  MoreVertical
} from 'lucide-react';
import formService from '../../services/formService';

const FormManager = () => {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedForms, setSelectedForms] = useState([]);

  useEffect(() => {
    loadForms();
  }, []);

  // Log greeting on component mount
  useEffect(() => {
    console.log('Hello World');
  }, []);

  const loadForms = async () => {
    try {
      setLoading(true);
      // For demo purposes, we'll use mock data
      // In production, this would be: const formsData = await formService.getForms();
      const mockForms = [
        {
          _id: '1',
          title: 'DSM Admission Form',
          description: 'Official admission form for DSM program',
          fields: [
            { name: 'firstName', label: 'First Name', type: 'text', required: true },
            { name: 'lastName', label: 'Last Name', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'email', required: true }
          ],
          submissions: 45,
          isActive: true,
          createdAt: '2024-01-15T10:30:00Z',
          updatedAt: '2024-01-20T14:15:00Z'
        },
        {
          _id: '2',
          title: 'Contact Information Form',
          description: 'Collect contact details from visitors',
          fields: [
            { name: 'name', label: 'Full Name', type: 'text', required: true },
            { name: 'phone', label: 'Phone Number', type: 'tel', required: true }
          ],
          submissions: 12,
          isActive: true,
          createdAt: '2024-01-10T09:00:00Z',
          updatedAt: '2024-01-10T09:00:00Z'
        },
        {
          _id: '3',
          title: 'Feedback Survey',
          description: 'Gather feedback from students',
          fields: [
            { name: 'rating', label: 'Overall Rating', type: 'rating', required: true },
            { name: 'comments', label: 'Comments', type: 'textarea', required: false }
          ],
          submissions: 28,
          isActive: false,
          createdAt: '2024-01-05T16:45:00Z',
          updatedAt: '2024-01-18T11:30:00Z'
        }
      ];
      setForms(mockForms);
    } catch (error) {
      console.error('Error loading forms:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredForms = forms.filter(form => {
    const matchesSearch = form.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         form.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'active' && form.isActive) ||
                         (filterStatus === 'inactive' && !form.isActive);
    
    return matchesSearch && matchesFilter;
  });

  const handleSelectForm = (formId) => {
    setSelectedForms(prev => 
      prev.includes(formId) 
        ? prev.filter(id => id !== formId)
        : [...prev, formId]
    );
  };

  const handleSelectAll = () => {
    if (selectedForms.length === filteredForms.length) {
      setSelectedForms([]);
    } else {
      setSelectedForms(filteredForms.map(form => form._id));
    }
  };

  const handleDeleteForm = async (formId) => {
    if (window.confirm('Are you sure you want to delete this form? This action cannot be undone.')) {
      try {
        // await formService.deleteForm(formId);
        setForms(prev => prev.filter(form => form._id !== formId));
        console.log('Form deleted:', formId);
      } catch (error) {
        console.error('Error deleting form:', error);
        alert('Error deleting form');
      }
    }
  };

  const handleDuplicateForm = async (form) => {
    try {
      const duplicatedForm = {
        ...form,
        _id: Date.now().toString(),
        title: `${form.title} (Copy)`,
        submissions: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      setForms(prev => [duplicatedForm, ...prev]);
      console.log('Form duplicated:', duplicatedForm);
    } catch (error) {
      console.error('Error duplicating form:', error);
      alert('Error duplicating form');
    }
  };

  const handleToggleStatus = async (formId) => {
    try {
      setForms(prev => prev.map(form => 
        form._id === formId 
          ? { ...form, isActive: !form.isActive, updatedAt: new Date().toISOString() }
          : form
      ));
      console.log('Form status toggled:', formId);
    } catch (error) {
      console.error('Error toggling form status:', error);
      alert('Error updating form status');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <>
      <style>{`
        .form-manager {
          --fm-primary: #3b82f6;
          --fm-primary-hover: #2563eb;
          --fm-gray-50: #f9fafb;
          --fm-gray-100: #f3f4f6;
          --fm-gray-200: #e5e7eb;
          --fm-gray-300: #d1d5db;
          --fm-gray-500: #6b7280;
          --fm-gray-600: #4b5563;
          --fm-gray-700: #374151;
          --fm-gray-800: #1f2937;
          --fm-green-500: #22c55e;
          --fm-red-500: #ef4444;
          --fm-yellow-500: #eab308;
          --fm-border-radius: 0.5rem;
          --fm-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
          --fm-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }

        .form-manager *, .form-manager *::before, .form-manager *::after {
          box-sizing: border-box;
        }

        .fm-card {
          background: white;
          border: 1px solid var(--fm-gray-200);
          border-radius: var(--fm-border-radius);
          box-shadow: var(--fm-shadow);
        }

        .fm-btn {
          border: none;
          border-radius: var(--fm-border-radius);
          font-weight: 500;
          transition: all 0.15s ease;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
        }

        .fm-btn-primary {
          background: var(--fm-primary);
          color: white;
        }

        .fm-btn-primary:hover {
          background: var(--fm-primary-hover);
        }

        .fm-btn-secondary {
          background: var(--fm-gray-100);
          color: var(--fm-gray-700);
        }

        .fm-btn-secondary:hover {
          background: var(--fm-gray-200);
        }

        .fm-btn-sm {
          padding: 0.25rem 0.5rem;
          font-size: 0.875rem;
        }

        .fm-status-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.5rem;
          border-radius: 0.375rem;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .fm-status-active {
          background: #dcfce7;
          color: #166534;
        }

        .fm-status-inactive {
          background: #fee2e2;
          color: #991b1b;
        }

        .fm-table {
          width: 100%;
          border-collapse: collapse;
        }

        .fm-table th,
        .fm-table td {
          text-align: left;
          padding: 0.75rem;
          border-bottom: 1px solid var(--fm-gray-200);
        }

        .fm-table th {
          background: var(--fm-gray-50);
          font-weight: 600;
          color: var(--fm-gray-700);
        }

        .fm-table tbody tr:hover {
          background: var(--fm-gray-50);
        }

        .fm-dropdown {
          position: relative;
          display: inline-block;
        }

        .fm-dropdown-content {
          position: absolute;
          right: 0;
          top: 100%;
          background: white;
          border: 1px solid var(--fm-gray-200);
          border-radius: var(--fm-border-radius);
          box-shadow: var(--fm-shadow-lg);
          z-index: 1000;
          min-width: 160px;
          margin-top: 0.25rem;
        }

        .fm-dropdown-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          color: var(--fm-gray-700);
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .fm-dropdown-item:hover {
          background: var(--fm-gray-50);
        }

        .fm-dropdown-item:first-child {
          border-radius: var(--fm-border-radius) var(--fm-border-radius) 0 0;
        }

        .fm-dropdown-item:last-child {
          border-radius: 0 0 var(--fm-border-radius) var(--fm-border-radius);
        }

        .fm-stat-card {
          background: white;
          border: 1px solid var(--fm-gray-200);
          border-radius: var(--fm-border-radius);
          padding: 1.5rem;
          box-shadow: var(--fm-shadow);
        }

        .fm-stat-number {
          font-size: 2rem;
          font-weight: 700;
          color: var(--fm-gray-800);
          margin-bottom: 0.5rem;
        }

        .fm-stat-label {
          color: var(--fm-gray-600);
          font-size: 0.875rem;
        }
      `}</style>

      <div className="form-manager p-6 bg-gray-50 min-h-screen">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Form Management</h1>
              <p className="text-gray-600 mt-1">Create and manage forms for your organization</p>
            </div>
            <button 
              className="fm-btn fm-btn-primary"
              onClick={() => window.location.href = '/admin/form-builder'}
            >
              <Plus size={20} />
              Create New Form
            </button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="fm-stat-card">
              <div className="fm-stat-number">{forms.length}</div>
              <div className="fm-stat-label">Total Forms</div>
            </div>
            <div className="fm-stat-card">
              <div className="fm-stat-number">{forms.filter(f => f.isActive).length}</div>
              <div className="fm-stat-label">Active Forms</div>
            </div>
            <div className="fm-stat-card">
              <div className="fm-stat-number">{forms.reduce((sum, f) => sum + f.submissions, 0)}</div>
              <div className="fm-stat-label">Total Submissions</div>
            </div>
            <div className="fm-stat-card">
              <div className="fm-stat-number">{forms.reduce((sum, f) => sum + f.fields.length, 0)}</div>
              <div className="fm-stat-label">Total Fields</div>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="fm-card p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex flex-col md:flex-row gap-4 items-center flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Search forms..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Filter size={20} className="text-gray-500" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Forms</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>
            </div>

            {selectedForms.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {selectedForms.length} selected
                </span>
                <button className="fm-btn fm-btn-secondary fm-btn-sm">
                  <Download size={16} />
                  Export
                </button>
                <button 
                  className="fm-btn fm-btn-secondary fm-btn-sm text-red-600"
                  onClick={() => {
                    if (window.confirm(`Delete ${selectedForms.length} forms?`)) {
                      setForms(prev => prev.filter(form => !selectedForms.includes(form._id)));
                      setSelectedForms([]);
                    }
                  }}
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Forms Table */}
        <div className="fm-card">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading forms...</p>
            </div>
          ) : filteredForms.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-600 mb-4">No forms found</p>
              <button 
                className="fm-btn fm-btn-primary"
                onClick={() => window.location.href = '/admin/form-builder'}
              >
                <Plus size={20} />
                Create Your First Form
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="fm-table">
                <thead>
                  <tr>
                    <th className="w-12">
                      <input
                        type="checkbox"
                        checked={selectedForms.length === filteredForms.length && filteredForms.length > 0}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th>Form Name</th>
                    <th>Description</th>
                    <th>Fields</th>
                    <th>Submissions</th>
                    <th>Status</th>
                    <th>Last Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredForms.map((form) => (
                    <tr key={form._id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedForms.includes(form._id)}
                          onChange={() => handleSelectForm(form._id)}
                        />
                      </td>
                      <td>
                        <div className="font-medium text-gray-900">{form.title}</div>
                      </td>
                      <td>
                        <div className="text-gray-600 max-w-xs truncate">{form.description}</div>
                      </td>
                      <td>
                        <div className="text-gray-900">{form.fields.length}</div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1 text-gray-900">
                          <Users size={16} />
                          {form.submissions}
                        </div>
                      </td>
                      <td>
                        <span className={`fm-status-badge ${form.isActive ? 'fm-status-active' : 'fm-status-inactive'}`}>
                          {form.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1 text-gray-600">
                          <Calendar size={16} />
                          {formatDate(form.updatedAt)}
                        </div>
                      </td>
                      <td>
                        <div className="fm-dropdown">
                          <button className="fm-btn fm-btn-secondary fm-btn-sm">
                            <MoreVertical size={16} />
                          </button>
                          <div className="fm-dropdown-content" style={{ display: 'none' }}>
                            <div className="fm-dropdown-item">
                              <Edit size={16} />
                              Edit Form
                            </div>
                            <div className="fm-dropdown-item">
                              <Eye size={16} />
                              Preview
                            </div>
                            <div className="fm-dropdown-item" onClick={() => handleDuplicateForm(form)}>
                              <Copy size={16} />
                              Duplicate
                            </div>
                            <div className="fm-dropdown-item" onClick={() => handleToggleStatus(form._id)}>
                              {form.isActive ? 'Deactivate' : 'Activate'}
                            </div>
                            <div className="fm-dropdown-item text-red-600" onClick={() => handleDeleteForm(form._id)}>
                              <Trash2 size={16} />
                              Delete
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default FormManager;
