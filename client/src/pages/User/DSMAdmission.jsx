import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  FaUser, FaFileAlt, FaShieldAlt, FaHome, FaGavel,
  FaChevronRight, FaChevronLeft, FaCheck, FaInfoCircle,
  FaSignature, FaCalendarAlt, FaPenNib, FaEraser, FaTimes
} from 'react-icons/fa';

export default function DSMAdmissionForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { api, user, setToast } = useApp();
  const envelopeId = searchParams.get('envelopeId');

  const [submitting, setSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    firstName: '', middleName: '', lastName: '', dateOfBirth: '', age: '', ssn: '',
    dlNumber: '', dlState: '', address: '', city: '', state: '', zip: '',
    homePhone: '', workPhone: '', gender: '', race: '', nationality: '',
    maritalStatus: '', usCitizen: true, primaryLanguage: '', referredBy: '',
    highestGrade: '', yearGraduated: '', currentlyEmployed: false,
    healthcareType: '', terminalIllnesses: '', currentMedications: '',
    emergencyContact1Name: '', emergencyContact1Phone: '', emergencyContact1Relationship: '',
    admissionAgreementAccepted: false, liabilityWaiverAccepted: false, 
    codeOfConductAccepted: false, homeRulesAccepted: false, legalStatusAccepted: false,
    applicantFullName: '', applicantSignatureDataUrl: ''
  });

  const [errors, setErrors] = useState({});
  const [showSigModal, setShowSigModal] = useState(false);
  const [sigTab, setSigTab] = useState('type'); // type | draw
  const [penSize, setPenSize] = useState(2);
  const canvasRef = useRef(null);

  const steps = [
    { title: 'Identity', icon: FaUser },
    { title: 'Work & School', icon: FaFileAlt },
    { title: 'History', icon: FaShieldAlt },
    { title: 'Emergency', icon: FaHome },
    { title: 'Consent', icon: FaGavel }
  ];

  const handleInput = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors(p => ({ ...p, [name]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (currentStep === 0) {
      if (!formData.firstName) errs.firstName = "Required";
      if (!formData.lastName) errs.lastName = "Required";
    }
    if (currentStep === 4) {
      if (!formData.admissionAgreementAccepted) errs.agree = "Must accept";
      if (!formData.applicantSignatureDataUrl) errs.sig = "Signature required";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validate()) setCurrentStep(s => Math.min(s + 1, steps.length - 1)); };
  const prev = () => setCurrentStep(s => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!validate()) {
      setToast?.({ type: 'warn', text: 'Please complete all required fields' });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        submittedBy: user?.id,
        studentId: user?.studentId,
        userEmail: user?.email,
        envelopeId: envelopeId || null,
        submittedAt: new Date().toISOString(),
        status: 'submitted',
      };
      await api.add('admissions', payload);

      // If launched from an envelope assignment, mark recipient completed
      if (envelopeId) {
        try {
          const env = await api.get('envelopes', envelopeId);
          const me = (env?.recipients || []).find(r =>
            String(r.userId) === String(user?.id) ||
            String(r.studentId) === String(user?.studentId)
          );
          if (me) {
            await fetch(`/api/envelopes/${envelopeId}/recipient/${me.id}/status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ status: 'completed' })
            });
          }
        } catch (e) { /* non-fatal */ }
      }

      setToast?.('Application submitted successfully');
      setTimeout(() => navigate('/dashboard'), 1200);
    } catch (err) {
      setToast?.({ type: 'error', text: err?.message || 'Failed to submit application' });
    } finally {
      setSubmitting(false);
    }
  };

  // Mark envelope recipient as 'viewed' on first load
  useEffect(() => {
    if (!envelopeId || !user?.id) return;
    (async () => {
      try {
        const env = await api.get('envelopes', envelopeId);
        const me = (env?.recipients || []).find(r =>
          String(r.userId) === String(user?.id) ||
          String(r.studentId) === String(user?.studentId)
        );
        if (me && String(me.status || '').toLowerCase() === 'pending') {
          await fetch(`/api/envelopes/${envelopeId}/recipient/${me.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: 'viewed' })
          });
        }
      } catch (e) { /* non-fatal */ }
    })();
  }, [envelopeId, user?.id]);

  return (
    <section className="adm-page fade-in">
      <style>{ADM_CSS}</style>
      
      <div className="adm-container">
        <header className="adm-header">
          <div className="adm-brand">
            <div className="logo-box">DSM</div>
            <div>
              <h1>Student Application</h1>
              <p>Discipleship School of Ministry Intake Portal</p>
            </div>
          </div>
          <div className="adm-step-indicator">
            {steps.map((s, i) => (
              <div key={i} className={`step-node ${i <= currentStep ? 'active' : ''} ${i < currentStep ? 'done' : ''}`}>
                <div className="node-icon">{i < currentStep ? <FaCheck /> : <s.icon />}</div>
                <span>{s.title}</span>
              </div>
            ))}
          </div>
        </header>

        <main className="adm-workspace">
          <div className="adm-card">
            <div className="card-head">
              <h2>{steps[currentStep].title}</h2>
              <p>Please provide accurate and complete information.</p>
            </div>
            
            <div className="card-body">
              {currentStep === 0 && (
                <div className="adm-form-grid">
                  <div className="group">
                    <label>First Name</label>
                    <input name="firstName" value={formData.firstName} onChange={handleInput} placeholder="Legal first name" />
                    {errors.firstName && <span className="err">{errors.firstName}</span>}
                  </div>
                  <div className="group">
                    <label>Last Name</label>
                    <input name="lastName" value={formData.lastName} onChange={handleInput} placeholder="Legal last name" />
                  </div>
                  <div className="group">
                    <label>Date of Birth</label>
                    <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleInput} />
                  </div>
                  <div className="group wide">
                    <label>Current Address</label>
                    <input name="address" value={formData.address} onChange={handleInput} placeholder="Street address, Apt #" />
                  </div>
                </div>
              )}

              {currentStep === 4 && (
                <div className="adm-consent-view">
                  <div className="consent-scroller">
                    <h3>Program Agreements</h3>
                    <p>I understand that as a condition of my acceptance into DSM, I must abide by all school regulations. Failure to comply may result in immediate termination.</p>
                    <div className="check-row">
                      <input type="checkbox" name="admissionAgreementAccepted" checked={formData.admissionAgreementAccepted} onChange={handleInput} />
                      <label>I acknowledge and accept the Admission Agreement</label>
                    </div>
                  </div>

                  <div className="signature-area">
                    <div className="sig-head">
                      <label>Applicant Signature</label>
                      <button className="pro-btn small" onClick={() => setShowSigModal(true)}>
                        <FaPenNib /> {formData.applicantSignatureDataUrl ? 'Change Signature' : 'Adopt Signature'}
                      </button>
                    </div>
                    {formData.applicantSignatureDataUrl ? (
                      <div className="sig-display">
                        <img src={formData.applicantSignatureDataUrl} alt="Signature" />
                        <div className="sig-name">{formData.applicantFullName}</div>
                      </div>
                    ) : (
                      <div className="sig-placeholder">Click 'Adopt Signature' to sign this document electronically.</div>
                    )}
                    {errors.sig && <span className="err">{errors.sig}</span>}
                  </div>
                </div>
              )}
            </div>

            <div className="card-foot">
              <button className="pro-btn ghost" onClick={prev} disabled={currentStep === 0}><FaChevronLeft /> Previous</button>
              {currentStep < steps.length - 1 ? (
                <button className="pro-btn primary" onClick={next}>Continue <FaChevronRight /></button>
              ) : (
                <button className="pro-btn success" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Application'} <FaCheck />
                </button>
              )}
            </div>
          </div>
        </main>
      </div>

      {showSigModal && (
        <div className="adm-modal-overlay">
          <div className="adm-modal">
            <div className="modal-head">
              <h3>Adopt Your Signature</h3>
              <button className="close-btn" onClick={() => setShowSigModal(false)}><FaTimes /></button>
            </div>
            <div className="modal-body">
              <div className="modal-tabs">
                <button className={sigTab === 'type' ? 'active' : ''} onClick={() => setSigTab('type')}>Type</button>
                <button className={sigTab === 'draw' ? 'active' : ''} onClick={() => setSigTab('draw')}>Draw</button>
              </div>
              <div className="sig-canvas-area">
                {sigTab === 'type' ? (
                  <div className="type-sig">
                    <input value={formData.applicantFullName} onChange={e => setFormData(p => ({ ...p, applicantFullName: e.target.value }))} placeholder="Type your full name..." />
                    <div className="sig-preview" style={{ fontFamily: "'Dancing Script', cursive" }}>{formData.applicantFullName || 'Your Signature'}</div>
                  </div>
                ) : (
                  <div className="draw-sig">
                    <div className="canvas-tools"><button onClick={() => {}}><FaEraser /> Clear</button></div>
                    <canvas ref={canvasRef} width={600} height={180} />
                  </div>
                )}
              </div>
            </div>
            <div className="modal-foot">
              <button className="pro-btn ghost" onClick={() => setShowSigModal(false)}>Cancel</button>
              <button className="pro-btn primary" onClick={() => { 
                setFormData(p => ({ ...p, applicantSignatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==' }));
                setShowSigModal(false); 
              }}>Adopt & Sign</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const ADM_CSS = `
  .adm-page { min-height: 100vh; background: #f1f5f9; padding: 40px 20px; }
  .adm-container { max-width: 900px; margin: 0 auto; }
  
  .adm-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px; flex-wrap: wrap; gap: 20px; }
  .adm-brand { display: flex; align-items: center; gap: 16px; }
  .logo-box { width: 48px; height: 48px; background: #4f46e5; color: white; border-radius: 12px; display: grid; place-items: center; font-weight: 900; box-shadow: 0 4px 12px rgba(79,70,229,0.3); }
  .adm-brand h1 { font-size: 24px; font-weight: 800; margin: 0; color: #0f172a; }
  .adm-brand p { font-size: 13px; color: #64748b; margin: 2px 0 0; font-weight: 500; }

  .adm-step-indicator { display: flex; gap: 32px; }
  .step-node { display: flex; flex-direction: column; align-items: center; gap: 8px; opacity: 0.4; transition: 0.3s; }
  .step-node.active { opacity: 1; }
  .step-node.done .node-icon { background: #10b981; color: white; border-color: #10b981; }
  .node-icon { width: 32px; height: 32px; border-radius: 50%; border: 2px solid #cbd5e1; display: grid; place-items: center; font-size: 12px; background: white; transition: 0.3s; }
  .step-node.active .node-icon { border-color: #4f46e5; color: #4f46e5; box-shadow: 0 0 0 4px rgba(79,70,229,0.1); }
  .step-node span { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; }

  .adm-card { background: white; border-radius: 24px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden; border: 1px solid #e2e8f0; }
  .card-head { padding: 32px 40px; border-bottom: 1px solid #f1f5f9; }
  .card-head h2 { font-size: 20px; font-weight: 800; margin: 0; color: #0f172a; }
  .card-head p { font-size: 14px; color: #64748b; margin: 4px 0 0; }

  .card-body { padding: 40px; min-height: 400px; }
  .adm-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .group { display: flex; flex-direction: column; gap: 8px; }
  .group.wide { grid-column: 1 / -1; }
  .group label { font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
  .group input { padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 15px; outline: none; transition: 0.2s; }
  .group input:focus { border-color: #4f46e5; background: white; box-shadow: 0 0 0 4px rgba(79,70,229,0.1); }
  
  .card-foot { padding: 24px 40px; background: #f8fafc; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between; }
  .pro-btn { height: 48px; padding: 0 24px; border-radius: 14px; font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 10px; transition: 0.2s; cursor: pointer; border: none; }
  .pro-btn.primary { background: #4f46e5; color: white; box-shadow: 0 4px 12px rgba(79,70,229,0.2); }
  .pro-btn.ghost { background: transparent; color: #64748b; }
  .pro-btn.success { background: #10b981; color: white; box-shadow: 0 4px 12px rgba(16,185,129,0.2); }
  .pro-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .adm-consent-view { display: flex; flex-direction: column; gap: 32px; }
  .consent-scroller { background: #f8fafc; padding: 24px; border-radius: 16px; border: 1px solid #e2e8f0; }
  .consent-scroller h3 { font-size: 16px; font-weight: 800; margin: 0 0 12px; }
  .consent-scroller p { font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 20px; }
  .check-row { display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 700; color: #0f172a; }

  .signature-area { border-top: 1px dashed #cbd5e1; padding-top: 32px; }
  .sig-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .sig-display { background: white; border: 2px solid #e2e8f0; border-radius: 16px; padding: 20px; text-align: center; }
  .sig-display img { max-height: 80px; }
  .sig-name { font-size: 12px; font-weight: 700; color: #94a3b8; margin-top: 8px; text-transform: uppercase; }
  .sig-placeholder { height: 100px; border: 2px dashed #e2e8f0; border-radius: 16px; display: grid; place-items: center; color: #94a3b8; font-size: 14px; font-style: italic; }

  .adm-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(8px); z-index: 1000; display: grid; place-items: center; }
  .adm-modal { width: 640px; background: white; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4); overflow: hidden; }
  .modal-head { padding: 24px 32px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; }
  .modal-body { padding: 32px; }
  .modal-tabs { display: flex; background: #f1f5f9; padding: 4px; border-radius: 12px; gap: 4px; margin-bottom: 24px; }
  .modal-tabs button { flex: 1; height: 40px; border-radius: 10px; border: none; font-weight: 700; font-size: 13px; color: #64748b; background: transparent; cursor: pointer; transition: 0.2s; }
  .modal-tabs button.active { background: white; color: #4f46e5; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }

  /* ============================================================================
     Mobile: admissions wizard on phones
     ============================================================================ */
  @media (max-width: 768px) {
    .adm-page { padding: 18px 12px; }

    .adm-header { margin-bottom: 22px; gap: 14px; }
    .adm-brand h1 { font-size: 20px; }
    .adm-brand p { font-size: 12px; }
    .logo-box { width: 42px; height: 42px; }

    .adm-step-indicator { gap: 14px; width: 100%; justify-content: space-between; }
    .step-node span { font-size: 9px; letter-spacing: 0.3px; }
    .node-icon { width: 28px; height: 28px; font-size: 11px; }

    .card-head { padding: 22px 18px; }
    .card-head h2 { font-size: 18px; }
    .card-head p { font-size: 13px; }

    .card-body { padding: 22px 18px; min-height: auto; }
    .adm-form-grid { grid-template-columns: 1fr; gap: 16px; }
    .group input { padding: 14px 14px; font-size: 16px; min-height: 50px; }

    .card-foot {
      padding: 16px;
      flex-direction: column-reverse;
      gap: 10px;
      position: sticky;
      bottom: 0;
      z-index: 5;
    }
    .pro-btn { width: 100%; height: 52px; justify-content: center; }

    .consent-scroller { padding: 18px; max-height: 50vh; overflow-y: auto; }
    .signature-area { padding-top: 22px; }
    .sig-head { flex-direction: column; align-items: flex-start; gap: 10px; }

    /* Modal full-bleed */
    .adm-modal-overlay { padding: 0; align-items: stretch; }
    .adm-modal { width: 100%; max-width: 100%; height: 100vh; border-radius: 0; display: flex; flex-direction: column; }
    .modal-head { padding: 16px 18px; }
    .modal-body { padding: 18px; flex: 1; overflow-y: auto; }
    .modal-tabs button { height: 44px; }
  }

  @media (max-width: 420px) {
    .adm-step-indicator { display: none; } /* nav by buttons only on tiny screens */
    .adm-card { border-radius: 18px; }
    .card-head { padding: 18px 14px; }
    .card-body { padding: 18px 14px; }
  }
`;
