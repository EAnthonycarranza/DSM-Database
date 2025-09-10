import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import SignatureAdopter from '../../components/SignatureAdopter';
import { 
  ArrowLeft, 
  Send, 
  Calendar, 
  User, 
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  Star,
  Edit3,
  Shield,
  FileCheck
} from 'lucide-react';

const FormViewer = () => {
  const { formId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { api, user, setModal } = useApp();
  
  const [form, setForm] = useState(null);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
  const [validationErrors, setValidationErrors] = useState([]);
  const [existingSubmission, setExistingSubmission] = useState(null);
  const submissionStatus = String(existingSubmission?.status || '').toLowerCase();
  const isPendingReview = !!existingSubmission && submissionStatus === 'pending';
  const isCompleted = !!existingSubmission && submissionStatus === 'completed';
  const readOnly = !!existingSubmission && (isPendingReview || isCompleted);

  const [adoptedSignature, setAdoptedSignature] = useState(null);
  const locationRefs = useRef({});
  const ensureRef = (id) => {
    if (!locationRefs.current[id]) locationRefs.current[id] = React.createRef();
    return locationRefs.current[id];
  };

  // Load Google Maps JS + Places library at runtime (same approach as Admin builder)
  const ensureGooglePlaces = async () => {
    try {
      if (typeof window === 'undefined') return false;
      if (window.google?.maps?.places) return true;
      // Get API key from server
      let key = '';
      try {
        const res = await fetch('/api/config/maps-key', { credentials: 'include' });
        if (res.ok) {
          const j = await res.json();
          key = String(j?.key || '').trim();
        }
      } catch {}
      if (!key) return false;
      const existing = document.querySelector('script[data-google-places]');
      if (existing) {
        return new Promise((resolve) => {
          const t = setInterval(() => {
            if (window.google?.maps?.places) { clearInterval(t); resolve(true); }
          }, 200);
          setTimeout(() => { clearInterval(t); resolve(!!(window.google?.maps?.places)); }, 5000);
        });
      }
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&v=weekly`;
      s.async = true;
      s.defer = true;
      s.dataset.googlePlaces = 'true';
      document.head.appendChild(s);
      return new Promise((resolve) => {
        s.onload = () => resolve(!!(window.google?.maps?.places));
        s.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (adoptedSignature) return;
    try {
      const sigField = (form?.fields || []).find((f) => String(f.type||'').toLowerCase() === 'signature');
      if (!sigField) return;
      const val = formData?.[sigField.name];
      if (val && typeof val === 'string' && val.startsWith('data:image')) {
        setAdoptedSignature(val);
      }
    } catch {}
  }, [form?.fields, formData, adoptedSignature]);

  const fromEnrollment = searchParams.get('from') === 'enrollment';
  const assignmentId = searchParams.get('assignmentId');

  useEffect(() => {
    if (formId) {
      loadForm();
    }
  }, [formId]);

  const loadForm = async () => {
    try {
      setLoading(true);
      const formData = await api.get('forms', formId);
      setForm(formData);
      
      const initialData = {};
      if (formData?.fields) {
        formData.fields.forEach(field => {
          if ((field.type === 'checkbox' && Array.isArray(field.options)) || field.type === 'multiselect') {
            initialData[field.name] = Array.isArray(field.defaultValue) ? field.defaultValue : [];
          } else if (field.type === 'checkbox') {
            initialData[field.name] = field.defaultValue === true || field.defaultValue === 'true' ? true : false;
          } else {
            initialData[field.name] = field.defaultValue ?? '';
          }
        });
      }
      try {
        const subs = await api.getFormSubmissions(formId, {});
        const mine = Array.isArray(subs) ? subs.find(s => String(s.submittedBy||'') === String(user?.id||'')) : null;
        if (mine) {
          setExistingSubmission(mine);
          setFormData(mine.submissionData || initialData);
        } else setFormData(initialData);
      } catch { setFormData(initialData); }
    } catch (error) {
      console.error('Error loading form:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize Places Autocomplete for any Location fields (when editable)
  useEffect(() => {
    if (readOnly) return;
    const hasLocation = (form?.fields || []).some(f => String(f.type||'').toLowerCase() === 'location');
    if (!hasLocation) return;
    let canceled = false;
    (async () => {
      const ok = await ensureGooglePlaces();
      if (!ok || canceled) return;
      let placesNs = null;
      try { placesNs = await window.google.maps.importLibrary('places'); } catch {}
      (form?.fields || []).filter(f => String(f.type||'').toLowerCase() === 'location').forEach((f) => {
        const input = locationRefs.current[f.id]?.current;
        if (!input) return;
        if (input._placesBound) return;
        input._placesBound = true;

        const PAE = window.google?.maps?.places?.PlaceAutocompleteElement;
        if (placesNs && PAE) {
          try {
            const el = new PAE({ includedPrimaryTypes: ['street_address', 'premise', 'subpremise'] });
            el.style.display = 'block';
            el.style.width = '100%';
            if (input.placeholder) el.setAttribute('placeholder', input.placeholder);
            if (input.name) el.name = input.name;
            input.parentNode?.insertBefore(el, input);
            input.style.display = 'none';

            const onSelect = async (ev) => {
              try {
                const pred = ev?.placePrediction;
                if (pred && pred.toPlace) {
                  const place = await pred.toPlace();
                  const fetched = await place.fetchFields({ fields: ['formattedAddress'] });
                  const addr = fetched?.formattedAddress || pred.text || '';
                  handleInputChange(f.name, addr);
                }
              } catch {
                try { handleInputChange(f.name, el.value || ''); } catch {}
              }
            };
            el.addEventListener('gmp-select', onSelect);
            el.addEventListener('gmp-placeselect', (e) => {
              try {
                const place = e?.place;
                const addr = place?.formattedAddress || '';
                if (addr) handleInputChange(f.name, addr);
              } catch {}
            });

            const fallbackToLegacy = () => {
              try { el.replaceWith(input); } catch {}
              input.style.display = '';
              try {
                const ac = new window.google.maps.places.Autocomplete(input, {
                  types: ['address'],
                  fields: ['formatted_address', 'address_components', 'geometry']
                });
                input._autocomplete = ac;
                ac.addListener('place_changed', () => {
                  try {
                    const place = ac.getPlace();
                    const addr = place?.formatted_address || input.value || '';
                    handleInputChange(f.name, addr);
                  } catch {}
                });
              } catch {}
            };
            el.addEventListener('gmp-error', fallbackToLegacy, { once: true });
            el.addEventListener('gmp-requesterror', fallbackToLegacy, { once: true });
            input._autocomplete = el;
            return;
          } catch {}
        }

        // Legacy fallback
        try {
          const ac = new window.google.maps.places.Autocomplete(input, {
            types: ['address'],
            fields: ['formatted_address', 'address_components', 'geometry']
          });
          input._autocomplete = ac;
          ac.addListener('place_changed', () => {
            try {
              const place = ac.getPlace();
              const addr = place?.formatted_address || input.value || '';
              handleInputChange(f.name, addr);
            } catch {}
          });
        } catch {}
      });
    })();
    return () => { canceled = true; };
  }, [form?.fields, readOnly]);

  const formatValue = (field, value) => {
    if (value == null) return '—';
    const t = String(field.type || '').toLowerCase();
    if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
    if (t === 'checkbox') return value ? 'Yes' : 'No';
    if (t === 'file' && value && typeof value === 'object') return value.name || '(file)';
    if ((t === 'text' || t === 'number') && field?.mask) {
      const s = String(value || '');
      if (!s) return '—';
      return '•'.repeat(Math.max(4, s.length));
    }
    if (t === 'rating') return value ? `${value} star${Number(value) === 1 ? '' : 's'}` : '—';
    return String(value || '').trim() || '—';
  };

  const isConditionTrue = (cond, data, fields) => {
    if (!cond || !cond.enabled) return true;
    const check = (fId, op, val) => {
      if (!fId) return false;
      const trigger = (fields || []).find(x => x.id === fId);
      if (!trigger) return false;
      const trigVal = data[trigger.name];
      switch (op) {
        case 'checked': return !!trigVal === true;
        case 'unchecked': return !!trigVal === false;
        case 'equals': return (trigVal ?? '') == (val ?? '');
        case 'not_equals': return (trigVal ?? '') != (val ?? '');
        case 'contains': return Array.isArray(trigVal) && trigVal.includes(val);
        case 'not_contains': return Array.isArray(trigVal) && !trigVal.includes(val);
        default: return false;
      }
    };
    const single = cond.fieldId ? check(cond.fieldId, cond.operator, cond.value) : false;
    const any = Array.isArray(cond.anyOf) ? cond.anyOf.some(tr => check(tr.fieldId, tr.operator, tr.value)) : false;
    if (!cond.fieldId && (!cond.anyOf || cond.anyOf.length === 0)) return true;
    return single || any;
  };

  const isFieldVisible = (f, data, fields) => {
    const c = f.conditional;
    if (!c || !c.enabled || !c.fieldId) return true;
    return isConditionTrue(c, data, fields);
  };

  const isFieldRequired = (f, data, fields) => {
    const base = !!f.required;
    const c = f.conditional;
    if (!c || !c.enabled || !c.fieldId) return base;
    if (!isConditionTrue(c, data, fields)) return base;
    if (c.thenRequired === 'required') return true;
    if (c.thenRequired === 'optional') return false;
    return base;
  };

  const validateForm = () => {
    const newErrors = {};
    const validationMessages = [];

    if (!form?.fields) return true;

    form.fields.forEach(field => {
      if (!isFieldVisible(field, formData, form.fields)) return;
      const req = isFieldRequired(field, formData, form.fields);
      if (req) {
        const t = String(field.type || '').toLowerCase();
        if (t === 'inlinetext' && Array.isArray(field.parts)) {
          const missing = field.parts.filter(p => p && p.t === 'input' && !String(formData[p.name] || '').trim());
          if (missing.length) {
            newErrors[field.name] = 'This field is required';
            missing.forEach(m => { newErrors[m.name] = 'This field is required'; });
            validationMessages.push(`${field.label || field.name} is required`);
          }
        } else {
          const value = formData[field.name];
          const isEmpty = !value || 
            (Array.isArray(value) && value.length === 0) ||
            String(value).trim() === '';
          if (isEmpty) {
            newErrors[field.name] = 'This field is required';
            validationMessages.push(`${field.label || field.name} is required`);
          }
        }
      }

      if (field.type === 'email' && formData[field.name]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData[field.name])) {
          newErrors[field.name] = 'Please enter a valid email address';
          validationMessages.push(`${field.label || field.name} must be a valid email`);
        }
      }

      if ((field.type === 'tel' || field.type === 'phone') && formData[field.name]) {
        const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
        if (!phoneRegex.test(formData[field.name])) {
          newErrors[field.name] = 'Please enter a valid phone number';
          validationMessages.push(`${field.label || field.name} must be a valid phone number`);
        }
      }
    });

    setErrors(newErrors);
    setValidationErrors(validationMessages);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (fieldName, value) => {
    if (readOnly) return;
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));

    if (errors[fieldName]) {
      setErrors(prev => ({
        ...prev,
        [fieldName]: null
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (readOnly) return;
    
    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);
      
      await api.submitForm(formId, formData, {
        submitterName: user?.name,
        assignmentId: assignmentId || null,
        source: fromEnrollment ? 'enrollment' : 'direct'
      });

      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Error submitting form. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const todayStr = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const signField = (field) => {
    if (readOnly) return;
    if (adoptedSignature) {
      handleInputChange(field.name, adoptedSignature);
      return;
    }
    const defaultName = String(user?.name || '').trim();
    const close = () => setModal((m) => ({ ...m, open: false }));
    setModal({
      open: true,
      type: 'node',
      title: `Adopt Signature`,
      node: (
        <SignatureAdopter
          defaultName={defaultName}
          onAdopt={(dataUrl) => {
            setAdoptedSignature(dataUrl);
            handleInputChange(field.name, dataUrl);
          }}
          onClose={close}
        />
      )
    });
  };

  const renderField = (field) => {
    if (!isFieldVisible(field, formData, form.fields)) return null;
    const widthClass = `width-${field.width || 'full'}`;
    const requiredNow = isFieldRequired(field, formData, form.fields);
    const requiredMark = requiredNow ? (<span className="required">*</span>) : null;
    const commonProps = {
      id: field.name,
      name: field.name,
      required: requiredNow,
      className: 'field-input',
      placeholder: field.placeholder || `Enter ${(field.label || field.name).toLowerCase()}`,
      value: formData[field.name] || '',
      onChange: (e) => handleInputChange(field.name, e.target.value),
      disabled: readOnly,
    };

    if (field.type === 'heading') {
      const H = `h${field.level || 3}`;
      return (
        <div key={field.id} className={`preview-field ${widthClass}`}>
          {React.createElement(H, { className: 'field-heading' }, field.label || '')}
        </div>
      );
    }
    if (field.type === 'divider') {
      return (
        <div key={field.id} className={`preview-field ${widthClass}`}>
          <hr className="field-divider" />
        </div>
      );
    }
    if (field.type === 'adminText') {
      return (
        <div key={field.id} className={`preview-field ${widthClass}`}>
          <div className="admin-text-block">
            {(field.content || '').split('\n').map((ln, idx) => (
              <p key={idx} className="admin-text-line">{ln}</p>
            ))}
          </div>
        </div>
      );
    }

    if (field.type === 'inlineText') {
      const parts = Array.isArray(field.parts) ? field.parts : [];
      return (
        <div key={field.id} className={`preview-field ${widthClass}`}>
          {!!field.label && (
            <label className="field-label">{field.label}{requiredMark}</label>
          )}
          <div className="inline-text-block">
            {parts.map((p, idx) => (
              p.t === 'text' ? (
                <span key={idx}>{p.v}</span>
              ) : (
                <input
                  key={idx}
                  type={p.mask ? 'password' : (p.inputType === 'date' ? 'date' : (p.inputType === 'phone' ? 'tel' : (p.inputType || 'text')))}
                  className="inline-input"
                  value={formData[p.name] || ''}
                  onFocus={(e) => { if (p.mask) try { e.currentTarget.type = 'text'; } catch {} }}
                  onBlur={(e) => { if (p.mask) try { e.currentTarget.type = 'password'; } catch {} }}
                  onChange={(e) => handleInputChange(p.name, e.target.value)}
                  placeholder={p.inputType === 'date' ? '' : (p.mask ? '••••' : 'Enter text')}
                  disabled={readOnly}
                />
              )
            ))}
          </div>
          {errors[field.name] && (
            <p className="field-error">
              <AlertCircle size={14} />
              {errors[field.name]}
            </p>
          )}
        </div>
      );
    }

    if (field.type === 'signature') {
      const dataUrl = formData[field.name];
      if (readOnly) {
        return (
          <div key={field.id} className={`preview-field ${widthClass}`}>
            <label className="field-label">{field.label}{requiredMark}</label>
            <div className="signature-display">
              {dataUrl ? (<img alt="signature" src={dataUrl} className="signature-img" />) : <span className="empty-value">—</span>}
            </div>
          </div>
        );
      }
      return (
        <div key={field.id} className={`preview-field ${widthClass}`}>
          <label className="field-label">{field.label}{requiredMark}</label>
          <div className="signature-field">
            {dataUrl ? (
              <>
                <img alt="signature" src={dataUrl} className="signature-img" />
                <button type="button" className="btn-text" onClick={() => signField(field)}>
                  <Edit3 size={16} /> Re-sign
                </button>
              </>
            ) : (
              <button type="button" className="btn-sign" onClick={() => signField(field)}>
                <Edit3 size={18} /> Click to Sign
              </button>
            )}
          </div>
          {errors[field.name] && (
            <p className="field-error">
              <AlertCircle size={14} />
              {errors[field.name]}
            </p>
          )}
        </div>
      );
    }

    if (field.type === 'textarea') {
      return (
        <div key={field.id} className={`preview-field ${widthClass}`}>
          <label htmlFor={field.name} className="field-label">
            {field.label}{requiredMark}
          </label>
          <textarea {...commonProps} rows={4} />
          {errors[field.name] && (
            <p className="field-error">
              <AlertCircle size={14} />
              {errors[field.name]}
            </p>
          )}
        </div>
      );
    }

    if (field.type === 'select') {
      return (
        <div key={field.id} className={`preview-field ${widthClass}`}>
          <label htmlFor={field.name} className="field-label">
            {field.label}{requiredMark}
          </label>
          <select {...commonProps} value={String(formData[field.name] ?? '')}>
            <option value="">Choose...</option>
            {field.options?.map((option, idx) => {
              const val = (option && typeof option === 'object') ? (option.value ?? option.label ?? '') : option;
              const label = (option && typeof option === 'object') ? (option.label ?? String(option.value ?? '')) : String(option ?? '');
              return (<option key={idx} value={String(val)}>{label}</option>);
            })}
          </select>
          {errors[field.name] && (
            <p className="field-error">
              <AlertCircle size={14} />
              {errors[field.name]}
            </p>
          )}
        </div>
      );
    }

    if (field.type === 'radio') {
      const optionCount = Array.isArray(field.options) ? field.options.length : 0;
      const inlineGroup = optionCount > 0 && optionCount <= 3; // inline Yes/No style for small sets
      return (
        <div key={field.id} className={`preview-field ${widthClass}`}>
          <label className="field-label">
            {field.label}{requiredMark}
          </label>
          <div className={`radio-group ${inlineGroup ? 'inline' : 'stacked'}`}>
            {field.options?.map((option, idx) => {
              const val = (option && typeof option === 'object') ? (option.value ?? option.label ?? '') : option;
              const label = (option && typeof option === 'object') ? (option.label ?? String(option.value ?? '')) : String(option ?? '');
              return (
                <label key={idx} className="radio-label">
                  <input
                    type="radio"
                    name={field.name}
                    value={String(val)}
                    checked={String(formData[field.name] ?? '') === String(val)}
                    onChange={() => handleInputChange(field.name, String(val))}
                    disabled={readOnly}
                  />
                  <span className="radio-custom"></span>
                  {label}
                </label>
              );
            })}
          </div>
          {errors[field.name] && (
            <p className="field-help" style={{ color: '#b91c1c' }}>
              <AlertCircle size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {errors[field.name]}
            </p>
          )}
        </div>
      );
    }

    if (field.type === 'checkbox') {
      if (field.options) {
        const currentValues = Array.isArray(formData[field.name]) ? formData[field.name] : [];
        return (
          <div key={field.id} className={`preview-field ${widthClass}`}>
            <label className="field-label">
              {field.label}{requiredMark}
            </label>
            <div className="checkbox-group">
              {field.options.map((option, idx) => {
                const val = (option && typeof option === 'object') ? (option.value ?? option.label ?? '') : option;
                const label = (option && typeof option === 'object') ? (option.label ?? String(option.value ?? '')) : String(option ?? '');
                return (
                  <label key={idx} className="checkbox-label">
                    <input
                      type="checkbox"
                      value={String(val)}
                      checked={currentValues.map(String).includes(String(val))}
                      onChange={(e) => {
                        const valStr = String(val);
                        const cur = currentValues.map(String);
                        const next = e.target.checked
                          ? [...cur, valStr]
                          : cur.filter(v => v !== valStr);
                        handleInputChange(field.name, next);
                      }}
                      disabled={readOnly}
                    />
                    <span className="checkbox-custom"></span>
                    {label}
                  </label>
                );
              })}
            </div>
            {errors[field.name] && (
              <p className="field-error">
                <AlertCircle size={14} />
                {errors[field.name]}
              </p>
            )}
          </div>
        );
      }
      return (
        <div key={field.id} className={`preview-field ${widthClass}`}>
          <label className="checkbox-label single">
            <input
              type="checkbox"
              name={field.name}
              checked={Boolean(formData[field.name])}
              onChange={(e) => handleInputChange(field.name, e.target.checked)}
              disabled={readOnly}
            />
            <span className="checkbox-custom"></span>
            {(field.checkboxText || field.placeholder || field.label)}{requiredMark}
          </label>
          {errors[field.name] && (
            <p className="field-error">
              <AlertCircle size={14} />
              {errors[field.name]}
            </p>
          )}
        </div>
      );
    }

    if (field.type === 'multiselect') {
      const currentValues = Array.isArray(formData[field.name]) ? formData[field.name] : [];
      return (
        <div key={field.id} className={`preview-field ${widthClass}`}>
          <label className="field-label">{field.label}{requiredMark}</label>
          <div className="checkbox-group">
            {(field.options || []).map((option, idx) => {
              const val = (option && typeof option === 'object') ? (option.value ?? option.label ?? '') : option;
              const label = (option && typeof option === 'object') ? (option.label ?? String(option.value ?? '')) : String(option ?? '');
              const checked = currentValues.map(String).includes(String(val));
              return (
                <label key={idx} className="checkbox-label">
                  <input
                    type="checkbox"
                    value={String(val)}
                    checked={checked}
                    onChange={(e) => {
                      const valStr = String(val);
                      const cur = currentValues.map(String);
                      const next = e.target.checked ? [...cur, valStr] : cur.filter(v => v !== valStr);
                      handleInputChange(field.name, next);
                    }}
                    disabled={readOnly}
                  />
                  <span className="checkbox-custom"></span>
                  {label}
                </label>
              );
            })}
          </div>
          {errors[field.name] && (
            <p className="field-error">
              <AlertCircle size={14} />
              {errors[field.name]}
            </p>
          )}
        </div>
      );
    }

    if (field.type === 'rating') {
      const maxStars = Number(field.validation?.maxStars || 5);
      return (
        <div key={field.id} className={`preview-field ${widthClass}`}>
          <label className="field-label">
            {field.label}{requiredMark}
          </label>
          <div className="rating-group">
            {[...Array(maxStars)].map((_, idx) => (
              <Star
                key={idx}
                size={28}
                className={`rating-star ${idx < (Number(formData[field.name] || 0)) ? 'filled' : ''}`}
                onClick={() => !readOnly && handleInputChange(field.name, idx + 1)}
              />
            ))}
          </div>
          {errors[field.name] && (
            <p className="field-error">
              <AlertCircle size={14} />
              {errors[field.name]}
            </p>
          )}
        </div>
      );
    }

    // Dedicated rendering for Location fields to attach refs
    if (String(field.type || '').toLowerCase() === 'location') {
      return (
        <div key={field.id} className={`preview-field ${widthClass}`}>
          <label htmlFor={field.name} className="field-label">
            {field.label}{requiredMark}
          </label>
          <input
            ref={ensureRef(field.id)}
            type="text"
            {...commonProps}
            placeholder={field.placeholder || 'Search address'}
          />
          {errors[field.name] && (
            <p className="field-error">
              <AlertCircle size={14} />
              {errors[field.name]}
            </p>
          )}
        </div>
      );
    }

    return (
      <div key={field.id} className={`preview-field ${widthClass}`}>
        <label htmlFor={field.name} className="field-label">
          {field.label}{requiredMark}
        </label>
        {field.type === 'file' ? (
          <input
            id={field.name}
            name={field.name}
            type="file"
            className="field-input file-input"
            disabled={readOnly}
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              if (!f) return handleInputChange(field.name, '');
              handleInputChange(field.name, { name: f.name, size: f.size, type: f.type });
            }}
          />
        ) : (
          <input
            type={field.mask ? 'password' : (field.type === 'phone' ? 'tel' : (String(field.type||'').toLowerCase() === 'location' ? 'text' : (field.type || 'text')))}
            {...commonProps}
            placeholder={field.placeholder || (field.mask ? '••••••' : (String(field.type||'').toLowerCase() === 'location' ? 'Search address' : `Enter ${(field.label || field.name).toLowerCase()}`))}
            onFocus={(e) => { if (field.mask) try { e.currentTarget.type = 'text'; } catch {} }}
            onBlur={(e) => { if (field.mask) try { e.currentTarget.type = 'password'; } catch {} }}
            onClick={(e) => {
              if (readOnly) return;
              if (String(field.type || '').toLowerCase() === 'date' && field.autoToday) {
                const cur = formData[field.name];
                if (!cur) {
                  const v = todayStr();
                  try { e.currentTarget.value = v; } catch {}
                  handleInputChange(field.name, v);
                }
              }
            }}
          />
        )}
        {errors[field.name] && (
          <p className="field-error">
            <AlertCircle size={14} />
            {errors[field.name]}
          </p>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-card">
          <div className="spinner"></div>
          <p className="loading-text">Loading form...</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="error-container">
        <div className="error-card">
          <div className="error-icon">
            <AlertCircle size={48} />
          </div>
          <h1 className="error-title">Form Not Found</h1>
          <p className="error-text">The requested form could not be found.</p>
          <button onClick={() => navigate(-1)} className="btn-primary">
            <ArrowLeft size={18} /> Go Back
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="success-container">
        <div className="success-card">
          <div className="success-icon">
            <CheckCircle2 size={56} />
          </div>
          <h1 className="success-title">Form Submitted!</h1>
          <p className="success-text">
            Thank you for completing <strong>{form.title}</strong>. 
            Your submission has been received and will be reviewed.
          </p>
          <div className="success-actions">
            <button onClick={() => navigate('/dashboard')} className="btn-primary">
              Return to Dashboard
            </button>
            {fromEnrollment && (
              <button onClick={() => navigate('/enrollment')} className="btn-secondary">
                Continue Enrollment
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="form-container">
      <style>{`
        * { box-sizing: border-box; }
        
        .form-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
          padding: 40px 20px;
        }
        
        .form-wrapper {
          max-width: 900px;
          margin: 0 auto;
          background: white;
          border-radius: 24px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
          overflow: hidden;
        }
        
        .form-header {
          background: linear-gradient(135deg, #000000 0%, #1a1a1a 100%);
          color: white;
          padding: 48px 40px;
          text-align: center;
          position: relative;
        }
        
        .form-header::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
        }
        
        .form-title {
          font-size: 32px;
          font-weight: 700;
          margin: 0 0 12px;
          letter-spacing: -0.5px;
        }
        
        .form-description {
          font-size: 16px;
          opacity: 0.9;
          margin: 0;
          line-height: 1.6;
        }
        
        .status-badges {
          display: flex;
          justify-content: center;
          gap: 12px;
          margin-top: 20px;
          flex-wrap: wrap;
        }
        
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 600;
          backdrop-filter: blur(10px);
        }
        
        .status-badge.pending {
          background: rgba(251, 191, 36, 0.2);
          color: #fbbf24;
          border: 1px solid rgba(251, 191, 36, 0.3);
        }
        
        .status-badge.completed {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        
        .form-body {
          padding: 40px;
        }
        
        .validation-alert {
          background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
          border: 2px solid #fecaca;
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 24px;
        }
        
        .validation-alert-header {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 700;
          color: #991b1b;
          margin-bottom: 12px;
        }
        
        .validation-alert ul {
          margin: 0;
          padding-left: 24px;
          color: #7f1d1d;
        }
        
        .validation-alert li {
          margin: 4px 0;
        }
        
        .preview-fields {
          display: grid;
          gap: 24px;
        }
        
        .preview-field {
          animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .preview-field.width-half {
          grid-column: span 1;
        }
        
        .preview-field.width-third {
          grid-column: span 1;
        }
        
        .preview-field.width-quarter {
          grid-column: span 1;
        }
        
        .preview-field.width-full {
          grid-column: 1 / -1;
        }
        
        @media (min-width: 640px) {
          .preview-fields {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        
        @media (min-width: 768px) {
          .preview-fields {
            grid-template-columns: repeat(4, 1fr);
          }
        }
        
        .field-heading {
          font-size: 22px;
          font-weight: 700;
          margin: 16px 0 8px;
          padding-bottom: 12px;
          border-bottom: 3px solid #000;
          color: #000;
        }
        
        .field-divider {
          border: none;
          height: 2px;
          background: linear-gradient(90deg, transparent, #e5e7eb, transparent);
          margin: 20px 0;
        }
        
        .field-label {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #000;
          margin-bottom: 8px;
          letter-spacing: 0.3px;
        }
        
        .required {
          color: #ef4444;
          margin-left: 4px;
        }
        
        .field-input {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          font-size: 15px;
          transition: all 0.2s;
          background: white;
        }
        
        .field-input:hover:not(:disabled) {
          border-color: #d1d5db;
        }
        
        .field-input:focus {
          outline: none;
          border-color: #000;
          box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.05);
        }
        
        .field-input:disabled {
          background: #f9fafb;
          cursor: not-allowed;
          opacity: 0.7;
        }
        
        textarea.field-input {
          resize: vertical;
          min-height: 120px;
          font-family: inherit;
        }
        
        select.field-input {
          cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23000' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 16px center;
          padding-right: 40px;
        }
        
        .file-input {
          padding: 8px 16px;
          cursor: pointer;
        }
        
        .radio-group,
        .checkbox-group {
          gap: 12px;
          margin-bottom: 6px;
        }
        .radio-group {
          display: flex;
          flex-direction: column;
        }
        .radio-group.inline {
          flex-direction: row;
          flex-wrap: wrap;
          gap: 16px;
        }
        .checkbox-group {
          display: flex;
          flex-direction: column;
        }
        
        .radio-label,
        .checkbox-label {
          display: flex;
          align-items: center;
          cursor: pointer;
          color: #000;
          font-size: 15px;
          position: relative;
          padding-left: 32px;
          min-height: 24px;
        }
        
        .checkbox-label.single {
          padding-left: 32px;
        }
        
        .radio-label input,
        .checkbox-label input {
          position: absolute;
          opacity: 0;
          cursor: pointer;
        }
        
        .radio-custom,
        .checkbox-custom {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 20px;
          height: 20px;
          border: 2px solid #d1d5db;
          background: white;
          transition: all 0.2s;
        }
        
        .radio-custom {
          border-radius: 50%;
        }
        
        .checkbox-custom {
          border-radius: 6px;
        }
        
        .radio-label input:checked ~ .radio-custom,
        .checkbox-label input:checked ~ .checkbox-custom {
          border-color: #000;
          background: #000;
        }
        
        .radio-custom::after {
          content: '';
          position: absolute;
          display: none;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: white;
        }
        
        .checkbox-custom::after {
          content: '✓';
          position: absolute;
          display: none;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: white;
          font-size: 12px;
          font-weight: bold;
        }
        
        .radio-label input:checked ~ .radio-custom::after,
        .checkbox-label input:checked ~ .checkbox-custom::after {
          display: block;
        }
        
        .rating-group {
          display: flex;
          gap: 8px;
        }
        
        .rating-star {
          cursor: pointer;
          color: #e5e7eb;
          transition: all 0.2s;
        }
        
        .rating-star:hover {
          transform: scale(1.1);
        }
        
        .rating-star.filled {
          color: #fbbf24;
          fill: #fbbf24;
        }
        
        .admin-text-block {
          background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 20px;
          color: #374151;
        }
        
        .admin-text-line {
          margin: 0 0 8px;
          line-height: 1.6;
        }
        
        .admin-text-line:last-child {
          margin-bottom: 0;
        }
        
        .inline-text-block {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          line-height: 1.8;
        }
        
        .inline-input {
          border: none;
          border-bottom: 2px solid #d1d5db;
          background: transparent;
          padding: 4px 8px;
          min-width: 120px;
          font-size: 15px;
          transition: border-color 0.2s;
        }
        
        .inline-input:focus {
          outline: none;
          border-color: #000;
        }
        
        .signature-field {
          min-height: 160px;
          border: 2px dashed #d1d5db;
          border-radius: 12px;
          background: #f9fafb;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 20px;
          transition: all 0.2s;
        }
        
        .signature-field:hover {
          border-color: #9ca3af;
          background: #f3f4f6;
        }
        
        .signature-display {
          min-height: 160px;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          background: #f9fafb;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        
        .signature-img {
          max-height: 120px;
          max-width: 100%;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
        }
        
        .btn-sign {
          background: #000;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }
        
        .btn-sign:hover {
          background: #1a1a1a;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        
        .btn-text {
          background: transparent;
          color: #6b7280;
          border: none;
          padding: 8px 16px;
          font-size: 14px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: color 0.2s;
        }
        
        .btn-text:hover {
          color: #000;
        }
        
        .field-error {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          color: #dc2626;
          font-size: 14px;
          animation: slideIn 0.2s ease;
        }
        
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        
        .empty-value {
          color: #9ca3af;
          font-size: 18px;
        }
        
        .form-footer {
          border-top: 2px solid #f3f4f6;
          padding: 32px 40px;
          display: flex;
          justify-content: center;
          gap: 16px;
        }
        
        .btn-primary {
          background: #000;
          color: white;
          border: none;
          padding: 14px 32px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }
        
        .btn-primary:hover:not(:disabled) {
          background: #1a1a1a;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.15);
        }
        
        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .btn-secondary {
          background: white;
          color: #000;
          border: 2px solid #000;
          padding: 14px 32px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-secondary:hover {
          background: #f9fafb;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.1);
        }
        
        .loading-container,
        .error-container,
        .success-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
          padding: 20px;
        }
        
        .loading-card,
        .error-card,
        .success-card {
          background: white;
          border-radius: 24px;
          padding: 48px;
          text-align: center;
          box-shadow: 0 4px 24px rgba(0,0,0,0.06);
          max-width: 480px;
          width: 100%;
        }
        
        .spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #f3f4f6;
          border-top-color: #000;
          border-radius: 50%;
          margin: 0 auto 24px;
          animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .loading-text {
          color: #6b7280;
          font-size: 16px;
          margin: 0;
        }
        
        .error-icon,
        .success-icon {
          margin-bottom: 24px;
        }
        
        .error-icon {
          color: #ef4444;
        }
        
        .success-icon {
          color: #22c55e;
        }
        
        .error-title,
        .success-title {
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 12px;
          color: #000;
        }
        
        .error-text,
        .success-text {
          color: #6b7280;
          font-size: 16px;
          margin: 0 0 32px;
          line-height: 1.6;
        }
        
        .success-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        @media (min-width: 640px) {
          .success-actions {
            flex-direction: row;
            justify-content: center;
          }
        }
      `}</style>

      <div className="form-wrapper">
        <div className="form-header">
          <h1 className="form-title">{form.title}</h1>
          {form.description && <p className="form-description">{form.description}</p>}
          {readOnly && (
            <div className="status-badges">
              {isPendingReview && (
                <span className="status-badge pending">
                  <Clock size={16}/> Pending Review
                </span>
              )}
              {isCompleted && (
                <span className="status-badge completed">
                  <CheckCircle2 size={16}/> Completed
                </span>
              )}
            </div>
          )}
        </div>

        <div className="form-body">
          {readOnly ? (
            <div className="preview-fields">
              {form.fields?.map(field => (
                <div key={field.id} className={`preview-field width-${field.width || 'full'}`}>
                  {field.type === 'heading' ? (
                    (() => { const H = `h${field.level || 3}`; return <H className="field-heading">{field.label}</H>; })()
                  ) : field.type === 'divider' ? (
                    <hr className="field-divider" />
                  ) : field.type === 'adminText' ? (
                    <div className="admin-text-block">
                      {(field.content || '').split('\n').map((ln, idx) => (
                        <p key={idx} className="admin-text-line">{ln}</p>
                      ))}
                    </div>
                  ) : (
                    <>
                      <label className="field-label">{field.label}</label>
                      {String(field.type||'').toLowerCase() === 'signature' ? (
                        <div className="signature-display">
                          {formData[field.name] ? (
                            <img alt="signature" src={formData[field.name]} className="signature-img" />
                          ) : <span className="empty-value">—</span>}
                        </div>
                      ) : String(field.type||'').toLowerCase() === 'inlinetext' ? (
                        <div className="field-input" style={{ background:'#f9fafb' }}>
                          <div className="inline-text-block">
                            {(field.parts || []).map((p, i) => {
                              if (p.t === 'text') return <span key={i}>{p.v}</span>;
                              const raw = String(formData[p.name] || '');
                              const masked = raw ? (p.mask ? '•'.repeat(Math.max(4, raw.length)) : raw) : '—';
                              return <span key={i} style={{ fontWeight:600 }}>{masked}</span>;
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="field-input" style={{ background:'#f9fafb' }}>
                          {formatValue(field, formData[field.name])}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              {validationErrors.length > 0 && (
                <div className="validation-alert">
                  <div className="validation-alert-header">
                    <AlertCircle size={20} />
                    Please fix the following errors:
                  </div>
                  <ul>
                    {validationErrors.map((error, idx) => (<li key={idx}>{error}</li>))}
                  </ul>
                </div>
              )}
              <form onSubmit={handleSubmit}>
                <div className="preview-fields">
                  {form.fields?.map(field => renderField(field))}
                </div>
              </form>
            </>
          )}
        </div>

        {!readOnly && (
          <div className="form-footer">
            <button 
              type="submit" 
              disabled={submitting} 
              className="btn-primary"
              onClick={handleSubmit}
            >
              {submitting ? (
                <>Submitting...</>
              ) : (
                <>
                  <Send size={18} />
                  Submit Form
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FormViewer;
