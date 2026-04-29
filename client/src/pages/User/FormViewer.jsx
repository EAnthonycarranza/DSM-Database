import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { 
  FaArrowLeft, FaPaperPlane, FaCalendarAlt, FaUser, 
  FaFileAlt, FaExclamationCircle, FaCheckCircle, 
  FaClock, FaStar, FaPenNib, FaShieldAlt, FaFileSignature,
  FaPlus, FaTimes 
} from 'react-icons/fa';

export default function FormViewer() {
  const { formId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { api, user, setToast } = useApp();

  const envelopeId = searchParams.get('envelopeId');

  const [form, setForm] = useState(null);
  const [envelope, setEnvelope] = useState(null);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
  const [existingSubmission, setExistingSubmission] = useState(null);
  const [me, setMe] = useState(null);

  const submissionStatus = String(existingSubmission?.status || '').toLowerCase();
  const isPendingReview = !!existingSubmission && submissionStatus === 'pending';
  const isCompleted = (!!existingSubmission && submissionStatus === 'completed') || submitted;
  const readOnly = (!!existingSubmission && (isPendingReview || isCompleted)) || submitted;

  useEffect(() => {
    if (formId) loadForm();
  }, [formId, envelopeId]);

  const loadForm = async () => {
    try {
      setLoading(true);
      const data = await api.get('forms', formId);
      setForm(data);
      const initial = {};
      data?.fields?.forEach(f => {
        initial[f.name] = f.defaultValue ?? (f.type === 'checkbox' ? false : '');
      });
      const subs = await api.getFormSubmissions(formId);
      const mine = subs?.find(s => String(s.submittedBy) === String(user?.id));
      if (mine) { setExistingSubmission(mine); setFormData(mine.submissionData || initial); }
      else setFormData(initial);

      if (envelopeId) {
        try {
          const env = await api.get('envelopes', envelopeId);
          setEnvelope(env);
          const myRecip = (env?.recipients || []).find(r =>
            String(r.userId) === String(user?.id) ||
            String(r.studentId) === String(user?.studentId) ||
            (String(r.role).toLowerCase() === 'admin' && user?.role?.toLowerCase() === 'admin')
          );
          if (myRecip) setMe(myRecip);
          if (myRecip && String(myRecip.status || '').toLowerCase() === 'pending') {
            await fetch(`/api/envelopes/${envelopeId}/recipient/${myRecip.id}/status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ status: 'viewed' })
            });
          }
        } catch (e) { /* non-fatal */ }
      }
    } catch {
      setForm(null);
    } finally { setLoading(false); }
  };

  const evaluateLogic = (field, data) => {
    if (!field.logic || !field.logic.conditions || field.logic.conditions.length === 0) return true;
    const { conditions, operator = 'and' } = field.logic;
    const results = conditions.map(c => {
      const val = data[c.parentName];
      return Array.isArray(val) ? val.includes(c.value) : val === c.value;
    });
    return operator === 'or' ? results.some(r => r) : results.every(r => r);
  };

  const validate = () => {
    const errs = {};
    const fields = form?.fields || [];
    
    fields.forEach(f => {
      if (!evaluateLogic(f, formData)) return;
      if (f.required && !f.groupRequired) {
        const v = formData[f.name];
        if (v === undefined || v === null || String(v).trim() === '' || v === false) {
          errs[f.name] = 'Required';
        }
      }
    });

    const requiredGroups = [...new Set(fields.filter(f => f.groupRequired).map(f => f.group))];
    requiredGroups.forEach(groupId => {
      const groupFields = fields.filter(f => f.group === groupId);
      const isAnyFilled = groupFields.some(f => {
        const v = formData[f.name];
        return v !== undefined && v !== null && v !== '' && v !== false;
      });
      if (!isAnyFilled) {
        groupFields.forEach(f => { errs[f.name] = 'Selection required in group'; });
      }
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      setToast?.({ type: 'warn', text: 'Please complete all required fields' });
      return;
    }
    setSubmitting(true);
    try {
      await api.submitForm(formId, formData);

      if (envelopeId && envelope) {
        const me = (envelope.recipients || []).find(r =>
          String(r.userId) === String(user?.id) ||
          String(r.studentId) === String(user?.studentId) ||
          (String(r.role).toLowerCase() === 'admin' && user?.role?.toLowerCase() === 'admin')
        );
        if (me) {
          try {
            await fetch(`/api/envelopes/${envelopeId}/recipient/${me.id}/status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ status: 'completed' })
            });
          } catch (e) { /* non-fatal */ }
        }
      }

      setSubmitted(true);
      setToast?.('Form submitted');
      
      if (user?.role?.toLowerCase() === 'admin' && envelope?.recipients) {
        const studentId = envelope.recipients.find(r => r.studentId)?.studentId;
        if (studentId) return setTimeout(() => navigate(`/admin/students/${studentId}`), 1200);
      }
      setTimeout(() => navigate('/dashboard'), 1200);
    } catch (err) {
      setToast?.({ type: 'error', text: err?.message || 'Failed to submit form' });
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="fv-loading">Initializing form engine...</div>;
  if (!form) return <div className="fv-error">Form not found</div>;

  return (
    <section className="fv-page fade-in">
      <style>{FV_CSS}</style>
      
      <div className="fv-container">
        <header className="fv-header">
          <div className="fv-header-content">
            <button className="fv-back" onClick={() => navigate(-1)}><FaArrowLeft /> Back</button>
            <h1 className="fv-title">{form.title}</h1>
            <p className="fv-subtitle">{form.description}</p>
            {envelope && (
              <div className="fv-status-wrap">
                <span className="fv-badge envelope">
                  <FaFileSignature /> Sent by admin · {envelope.subject || 'Document'}
                </span>
              </div>
            )}
            {readOnly && !envelope && (
              <div className="fv-status-wrap">
                <span className={`fv-badge ${submissionStatus || 'completed'}`}>
                  {isCompleted ? <FaCheckCircle /> : <FaClock />}
                  {(submissionStatus || 'COMPLETED').toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </header>

        <main className="fv-workspace">
          <div className="fv-card">
            <div className="fv-body">
              {form.fields?.map(f => {
                if (!evaluateLogic(f, formData)) return null;
                return (
                  <ViewerField 
                    key={f.id} 
                    field={f} 
                    value={formData[f.name]} 
                    role={me?.role || 'student'}
                    readOnly={readOnly}
                    error={errors[f.name]}
                    onChange={(val) => {
                      setFormData(p => ({ ...p, [f.name]: val }));
                      if (errors[f.name]) setErrors(p => { const n = { ...p }; delete n[f.name]; return n; });
                    }} 
                  />
                );
              })}
            </div>
            {!readOnly && (
              <div className="fv-footer">
                <button className="fv-btn primary" onClick={handleSubmit} disabled={submitting}>
                  <FaPaperPlane /> {submitting ? 'Submitting...' : 'Submit Form'}
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </section>
  );
}

function ViewerField({ field, value, onChange, role, readOnly, error }) {
  const isReserved = field.recipientRole && field.recipientRole !== role;
  const isFieldDisabled = readOnly || isReserved;
  const [showSigModal, setShowSigModal] = useState(false);
  const [sigName, setSigName] = useState('');

  if (field.type === 'heading') {
    const Level = `h${field.level || 1}`;
    return <div className="fv-field-row"><Level className="fv-heading">{field.label}</Level></div>;
  }
  if (field.type === 'divider') {
    return <div className="fv-field-row"><hr className="fv-divider" /></div>;
  }
  if (field.type === 'adminText') {
    return <div className="fv-field-row"><div className="fv-text-block">{field.content}</div></div>;
  }

  const renderInput = () => {
    const safeRole = (field.recipientRole || 'student').toUpperCase();

    switch (field.type) {
      case 'signature':
        return (
          <>
            <div className={`pv-sig-box ${value ? 'filled' : ''} ${error ? 'has-error' : ''}`} onClick={() => !isFieldDisabled && setShowSigModal(true)}>
              {value ? (
                <>
                  <div className="pv-sig-display">{value}</div>
                  <div className="pv-sig-meta">Digitally Signed by {value} • {new Date().toLocaleDateString()}</div>
                </>
              ) : (
                <>
                  <FaPenNib style={{ fontSize: '24px', marginBottom: '8px' }} />
                  <span>Click to Adopt Signature</span>
                </>
              )}
            </div>

            {showSigModal && (
              <div className="sig-modal-overlay" onClick={() => setShowSigModal(false)}>
                <div className="sig-modal" onClick={e => e.stopPropagation()}>
                  <h3>Adopt Signature ({safeRole})</h3>
                  <p>Type your full name exactly as it appears on official documents.</p>
                  <div className="sig-input-wrap">
                    <input 
                      autoFocus
                      placeholder="Type your name..." 
                      value={sigName}
                      onChange={e => setSigName(e.target.value)}
                    />
                  </div>
                  <div className="sig-preview-box">
                    <div className="sig-preview-text">{sigName || 'Your Signature'}</div>
                  </div>
                  <div className="sig-actions">
                    <button className="fv-modal-btn secondary" onClick={() => setShowSigModal(false)}>Cancel</button>
                    <button className="fv-modal-btn primary" disabled={!sigName} onClick={() => {
                      onChange(sigName);
                      setShowSigModal(false);
                    }}>Adopt and Sign</button>
                  </div>
                </div>
              </div>
            )}
          </>
        );

      case 'inlineText':
        return (
          <div className="pv-inline-text-wrap">
            {field.parts?.map((p, i) => (
              <React.Fragment key={i}>
                {p.t === 'text' ? (
                  <span>{p.v}</span>
                ) : (
                  <input 
                    className={`pv-inline-field ${error ? 'has-error' : ''}`}
                    placeholder={p.placeholder}
                    disabled={isFieldDisabled}
                    value={value?.[p.name] || ''}
                    onChange={e => onChange({ ...value, [p.name]: e.target.value })}
                    style={{ width: (p.placeholder?.length || 10) * 10 + 'px' }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        );

      case 'textarea':
        return <textarea className={`pv-input ${error ? 'has-error' : ''}`} disabled={isFieldDisabled} rows={field.rows || 3} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />;
      
      case 'select':
        return (
          <select className={`pv-input ${error ? 'has-error' : ''}`} disabled={isFieldDisabled} value={value || ''} onChange={e => onChange(e.target.value)}>
            <option value="">Select...</option>
            {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );

      case 'radio':
        return (
          <div className="pv-radio-group">
            {field.options?.map(o => (
              <label key={o.value} className="pv-opt-label">
                <input type="radio" disabled={isFieldDisabled} name={field.id} checked={value === o.value} onChange={() => onChange(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        );

      case 'checkbox':
        return (
          <div className="pv-checkbox-group">
            <label className="pv-opt-label">
              <input type="checkbox" disabled={isFieldDisabled} checked={!!value} onChange={e => onChange(e.target.checked)} />
              <span>{field.placeholder || 'Confirm / Accept'}</span>
            </label>
          </div>
        );

      case 'multiselect':
        const selected = Array.isArray(value) ? value : [];
        const toggleOption = (val) => {
          const newSelected = selected.includes(val) 
            ? selected.filter(v => v !== val) 
            : [...selected, val];
          onChange(newSelected);
        };
        return (
          <div className="pv-checkbox-group">
            {field.options?.map(o => (
              <label key={o.value} className="pv-opt-label">
                <input type="checkbox" disabled={isFieldDisabled} checked={selected.includes(o.value)} onChange={() => toggleOption(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        );

      case 'date':
        return <input className={`pv-input ${error ? 'has-error' : ''}`} disabled={isFieldDisabled} type="date" value={value || ''} onChange={e => onChange(e.target.value)} />;

      case 'number':
        return <input className={`pv-input ${error ? 'has-error' : ''}`} disabled={isFieldDisabled} type="number" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />;

      case 'rating':
        return (
          <div className="pv-rating" style={{ pointerEvents: isFieldDisabled ? 'none' : 'auto' }}>
            {[1, 2, 3, 4, 5].map(star => (
              <FaStar key={star} className={star <= (value || 0) ? 'active' : ''} onClick={() => onChange(star)} />
            ))}
          </div>
        );

      default:
        return <input className={`pv-input ${error ? 'has-error' : ''}`} disabled={isFieldDisabled} type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />;
    }
  };

  return (
    <div 
      className={`fv-field-row ${field.width || 'full'} ${isReserved ? 'disabled' : ''}`}
      data-recipient={field.recipientRole || 'student'}
    >
      {field.type !== 'inlineText' && field.type !== 'heading' && field.type !== 'divider' && field.type !== 'adminText' && (
        <label className="pv-label">
          {field.label}{field.required && ' *'}
          {isReserved && <span className="reserved-tag">Reserved for {field.recipientRole}</span>}
        </label>
      )}
      {renderInput()}
      {error && <span className="fv-err-msg">{error}</span>}
    </div>
  );
}

const FV_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400..700&display=swap');

  .fv-page { min-height: 100vh; background: #f8fafc; padding: 40px 20px; }
  .fv-container { max-width: 800px; margin: 0 auto; }
  
  .fv-header { background: #0f172a; color: white; border-radius: 24px 24px 0 0; padding: 48px 40px; position: relative; overflow: hidden; }
  .fv-header::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); }
  .fv-title { font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
  .fv-subtitle { font-size: 16px; opacity: 0.7; margin: 12px 0 0; line-height: 1.6; }

  .fv-status-wrap { margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap; }
  .fv-badge { padding: 8px 16px; border-radius: 99px; font-size: 12px; font-weight: 800; display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); }
  .fv-badge.completed { color: #10b981; }
  .fv-badge.pending { color: #f59e0b; }
  .fv-badge.envelope { color: #a5b4fc; background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.35); }

  .fv-heading { font-weight: 800; color: #0f172a; margin: 32px 0 16px; line-height: 1.2; }
  .fv-heading.level-1 { font-size: 28px; text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
  .fv-heading.level-2 { font-size: 20px; text-transform: uppercase; letter-spacing: 1px; color: #4f46e5; }
  .fv-heading.level-3 { font-size: 16px; border-left: 4px solid #4f46e5; padding-left: 12px; }

  .fv-text-block { font-size: 14px; line-height: 1.6; color: #475569; white-space: pre-wrap; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
  .fv-divider { border: none; border-top: 1px solid #e2e8f0; margin: 40px 0; }

  .fv-back { background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; margin-bottom: 16px; }
  .fv-back:hover { background: rgba(255,255,255,0.2); }

  .fv-card { background: white; border-radius: 0 0 24px 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); overflow: hidden; border: 1px solid #e2e8f0; border-top: none; }
  .fv-body { padding: 40px; display: flex; flex-direction: column; gap: 32px; }
  
  .fv-field-row { display: flex; flex-direction: column; gap: 8px; }
  .pv-label { font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; display: flex; justify-content: space-between; align-items: center; }
  .reserved-tag { font-size: 9px; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; color: #94a3b8; }
  
  .pv-input { padding: 14px 16px; border-radius: 12px; border: 2px solid #f1f5f9; background: #f8fafc; font-size: 15px; font-weight: 600; outline: none; transition: all 0.2s; width: 100%; color: #0f172a; }
  .pv-input:focus { border-color: #4f46e5; background: white; box-shadow: 0 0 0 4px rgba(79,70,229,0.1); }
  .pv-input:disabled { opacity: 0.6; cursor: not-allowed; }
  .pv-input.has-error { border-color: #ef4444; background: #fff1f2; }

  .pv-inline-text-wrap { line-height: 2.2; font-size: 16px; color: #1e293b; }
  .pv-inline-field { display: inline-block; border: none; border-bottom: 2px solid #cbd5e1; background: transparent; padding: 0 8px; outline: none; font-weight: 700; color: #4f46e5; transition: 0.2s; margin: 0 4px; }
  .pv-inline-field:focus { border-color: #4f46e5; background: #f8fafc; }
  .pv-inline-field.has-error { border-color: #ef4444; }

  .pv-radio-group, .pv-checkbox-group { display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
  .pv-opt-label { display: flex; align-items: center; gap: 12px; font-size: 15px; font-weight: 600; color: #334155; cursor: pointer; padding: 12px 16px; border-radius: 12px; border: 2px solid #f1f5f9; transition: 0.2s; }
  .pv-opt-label:hover { background: #f8fafc; border-color: #e2e8f0; }
  .pv-opt-label input { width: 20px; height: 20px; cursor: pointer; accent-color: #4f46e5; }
  
  .pv-rating { display: flex; gap: 10px; color: #cbd5e1; font-size: 28px; }
  .pv-rating svg { cursor: pointer; transition: 0.2s; }
  .pv-rating svg:hover { transform: scale(1.2); }
  .pv-rating svg.active { color: #f59e0b; }

  .pv-sig-box { width: 100%; min-height: 140px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #64748b; cursor: pointer; transition: 0.2s; overflow: hidden; padding: 24px; position: relative; }
  .pv-sig-box:hover { border-color: #4f46e5; background: rgba(79, 70, 229, 0.05); color: #4f46e5; }
  .pv-sig-box.filled { border-style: solid; background: white; border-color: #10b981; color: #0f172a; }
  .pv-sig-box.has-error { border-color: #ef4444; background: #fff1f2; }
  .pv-sig-display { font-family: 'Dancing Script', cursive; font-size: 48px; text-align: center; line-height: 1; }
  .pv-sig-meta { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin-top: 16px; letter-spacing: 1px; }

  .sig-modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(8px); z-index: 1000; display: grid; place-items: center; padding: 20px; }
  .sig-modal { background: white; border-radius: 32px; width: 100%; max-width: 550px; padding: 40px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255,255,255,0.1); }
  .sig-modal h3 { margin: 0 0 12px; font-size: 24px; font-weight: 800; color: #0f172a; }
  .sig-modal p { margin: 0 0 32px; color: #64748b; font-size: 15px; line-height: 1.6; }
  .sig-input-wrap { margin-bottom: 32px; }
  .sig-input-wrap input { width: 100%; padding: 20px; border-radius: 16px; border: 2px solid #f1f5f9; font-size: 20px; font-weight: 600; outline: none; transition: 0.2s; background: #f8fafc; color: #0f172a; }
  .sig-input-wrap input:focus { border-color: #4f46e5; box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1); background: white; }
  .sig-preview-box { height: 160px; background: #f8fafc; border-radius: 20px; border: 1px solid #e2e8f0; display: grid; place-items: center; margin-bottom: 32px; }
  .sig-preview-text { font-family: 'Dancing Script', cursive; font-size: 64px; color: #4f46e5; }
  .sig-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  .fv-modal-btn { height: 56px; border-radius: 16px; font-weight: 800; font-size: 15px; cursor: pointer; border: none; transition: 0.2s; }
  .fv-modal-btn.primary { background: #4f46e5; color: white; box-shadow: 0 4px 12px rgba(79,70,229,0.3); }
  .fv-modal-btn.secondary { background: #f1f5f9; color: #64748b; }
  .fv-modal-btn:hover:not(:disabled) { transform: translateY(-1px); }

  .fv-field-row.disabled { opacity: 0.5; position: relative; }
  .fv-field-row.disabled * { pointer-events: none !important; }

  .fv-err-msg { font-size: 12px; color: #ef4444; font-weight: 700; margin-top: 4px; }

  .fv-footer { padding: 32px 40px; background: #f8fafc; border-top: 1px solid #f1f5f9; display: flex; justify-content: center; }
  .fv-btn { height: 56px; padding: 0 40px; border-radius: 18px; font-weight: 800; font-size: 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; border: none; transition: all 0.2s; }
  .fv-btn.primary { background: #4f46e5; color: white; box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3); }
  .fv-btn.primary:hover:not(:disabled) { background: #4338ca; transform: translateY(-2px); box-shadow: 0 20px 25px -5px rgba(79, 70, 229, 0.4); }

  .fv-loading { height: 100vh; display: grid; place-items: center; font-weight: 800; color: #64748b; background: #f8fafc; font-size: 18px; }
  .fv-error { height: 100vh; display: grid; place-items: center; font-weight: 800; color: #ef4444; background: #f8fafc; }

  /* ============================================================================
     Mobile: optimize for student form-fill on phones
     ============================================================================ */
  @media (max-width: 768px) {
    .fv-page { padding: 20px 12px; }
    .fv-header { padding: 28px 22px; border-radius: 18px 18px 0 0; }
    .fv-title { font-size: 24px; }
    .fv-subtitle { font-size: 14px; margin-top: 8px; }

    .fv-card { border-radius: 0 0 18px 18px; }
    .fv-body { padding: 22px 18px; gap: 22px; }

    .fv-heading.level-1 { font-size: 22px; margin: 22px 0 12px; }
    .fv-heading.level-2 { font-size: 17px; }
    .fv-heading.level-3 { font-size: 15px; }

    /* iOS: 16px+ inputs prevent forced page zoom on focus */
    .pv-input { padding: 14px; font-size: 16px; }
    .pv-inline-text-wrap { line-height: 2; font-size: 15px; }
    .pv-opt-label { padding: 14px; font-size: 15px; min-height: 48px; }
    .pv-opt-label input { width: 22px; height: 22px; }

    .pv-rating { gap: 14px; font-size: 32px; }

    .pv-sig-box { min-height: 130px; padding: 18px; }
    .pv-sig-display { font-size: 38px; }

    /* Sticky submit on mobile so user always sees it */
    .fv-footer {
      padding: 16px;
      position: sticky;
      bottom: 0;
      background: #fff;
      border-top: 1px solid #e2e8f0;
      z-index: 10;
    }
    .fv-btn { width: 100%; height: 56px; padding: 0 24px; border-radius: 14px; font-size: 16px; }

    /* Sig modal becomes full-bleed for usable canvas */
    .sig-modal-overlay { padding: 12px; align-items: flex-start; }
    .sig-modal { padding: 24px 18px; border-radius: 22px; max-height: calc(100vh - 24px); overflow-y: auto; }
    .sig-modal h3 { font-size: 20px; }
    .sig-modal p { font-size: 13px; margin-bottom: 20px; }
    .sig-input-wrap input { padding: 16px; font-size: 18px; }
    .sig-input-wrap { margin-bottom: 20px; }
    .sig-preview-box { height: 120px; margin-bottom: 20px; }
    .sig-preview-text { font-size: 44px; }
    .sig-actions { gap: 10px; }
    .fv-modal-btn { height: 50px; font-size: 14px; }

    .fv-status-wrap { gap: 8px; margin-top: 18px; }
    .fv-badge { padding: 6px 12px; font-size: 11px; }
  }

  @media (max-width: 420px) {
    .fv-page { padding: 12px 8px; }
    .fv-header { padding: 22px 18px; }
    .fv-title { font-size: 20px; }
    .fv-body { padding: 18px 14px; gap: 18px; }
    .fv-heading.level-1 { font-size: 19px; }
    .pv-sig-display { font-size: 32px; }
  }
`;
