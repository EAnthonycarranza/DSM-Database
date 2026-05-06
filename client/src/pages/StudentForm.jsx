// src/pages/StudentForm.jsx
import React, { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import {
  FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt, FaIdCard, FaClipboardCheck,
  FaSave, FaHeartbeat, FaBriefcase, FaHandsHelping,
  FaTshirt, FaRunning, FaUserSlash, FaGraduationCap
} from "react-icons/fa";

const DEFAULT_STUDENT = {
  firstName: "", lastName: "", email: "", mobile: "",
  gender: "",
  status: "Current", recordType: "Resident", phase: "", squad: "",
  dorm: "", intakeDate: "", exitDate: "", graduationDate: "",
  referralSource: "", referralFromPastor: false, mentor: "", location: "",
  // Application & background check (Board minutes 4.2 / 3.2)
  applicationStatus: "Not Started", // Not Started, In Progress, Completed, Not Needed
  backgroundStatus: "Not Started",  // Not Started, In Progress, Completed, Not Needed
  backgroundFee: "",                 // dollars charged ($75 default per motion 4.2)
  backgroundPaidDate: "",
  hasID: "",                         // Yes / No / N/A
  // Employment
  employment: "", readiness: "", employmentPlacement: "",
  // Engagement
  workshops: "", volunteerHours: "",
  // Health & Recovery (Jay's recommendation: vague tracking, no specific diagnoses)
  referredToClinic: false,
  healthRecovery: "",
  spiritualNotes: "",
  // Dismissal tracking (board minutes 4.3: "Number of dismissals")
  dismissed: false, dismissalDate: "", dismissalReason: "",
  // Program participation (board minutes 4.6)
  uniformIssued: false,
  fitnessParticipation: "",          // Active / Limited / Exempt
  // Existing
  celebrate: "",
  archived: false
};

export default function StudentForm({ existing = null, onClose, onSaved }) {
  const { api, setToast, data } = useApp();
  const [v, setV] = useState(DEFAULT_STUDENT);
  const [saving, setSaving] = useState(false);

  const settings = data?.settings || {};
  const statuses = (settings.statuses || []).map(s => s.name);
  if (!statuses.length) statuses.push("Current", "Waitlist", "Future Applicant", "Alumni", "Withdrawn");

  const recordTypes = (settings.recordTypes || []).map(rt => rt.name);
  if (!recordTypes.length) recordTypes.push("Resident", "Applicant", "Prospect", "Alumni");

  const phases = (settings.phases || []).map(p => p.name);
  const squads = (settings.squads || []).map(sq => sq.name);
  const dorms = (settings.dorms || []).map(d => d.name);
  const appStatuses = (settings.appStatuses || []).map(as => as.name);
  const bgStatuses = (settings.bgStatuses || []).map(bs => bs.name);
  const idOptions = (settings.idOptions || []).map(id => id.name);
  const readinessOptions = (settings.readinessOptions || []).map(ro => ro.name);
  const fitnessOptions = (settings.fitnessOptions || []).map(fo => fo.name);
  const genders = (settings.genders || []).map(g => g.name);

  useEffect(() => {
    if (existing) setV(prev => ({ ...prev, ...existing }));
  }, [existing]);

  const set = (k, val) => setV(s => ({ ...s, [k]: val }));

  const save = async () => {
    if (!v.firstName.trim() || !v.lastName.trim()) return setToast({ type: "warn", text: "Name is required" });
    setSaving(true);
    try {
      const payload = { 
        ...v, 
        id: v.id || crypto.randomUUID(),
        pipeline: v.phase ? `phase${v.phase}` : "",
        createdAt: v.createdAt || Date.now(),
        updatedAt: Date.now() 
      };
      if (v.id) await api.put("students", payload);
      else await api.add("students", payload);
      setToast("Student record synchronized");
      onSaved?.(payload);
      onClose?.();
    } catch {
      setToast({ type: "error", text: "Failed to sync record" });
    } finally { setSaving(false); }
  };

  return (
    <div className="sf-workspace">
      <style>{SF_CSS}</style>
      
      <div className="sf-grid">
        <div className="sf-section">
          <div className="sf-section-head"><FaUser /> Personal Information</div>
          <div className="sf-form-group">
            <div className="group">
              <label>First Name *</label>
              <input value={v.firstName} onChange={e => set("firstName", e.target.value)} placeholder="Legal first name" />
            </div>
            <div className="group">
              <label>Last Name *</label>
              <input value={v.lastName} onChange={e => set("lastName", e.target.value)} placeholder="Legal last name" />
            </div>
            <div className="group">
              <label><FaEnvelope /> Email</label>
              <input type="email" value={v.email} onChange={e => set("email", e.target.value)} placeholder="student@example.com" />
            </div>
            <div className="group">
              <label><FaPhone /> Mobile</label>
              <input value={v.mobile} onChange={e => set("mobile", e.target.value)} placeholder="+1 (555) 000-0000" />
            </div>
            <div className="group">
              <label>Gender</label>
              <select value={v.gender} onChange={e => set("gender", e.target.value)}>
                <option value="">Select</option>
                {genders.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="sf-section">
          <div className="sf-section-head"><FaIdCard /> Program Status</div>
          <div className="sf-form-group">
            <div className="group">
              <label>Status</label>
              <select value={v.status} onChange={e => set("status", e.target.value)}>
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="group">
              <label>Record Type</label>
              <select value={v.recordType} onChange={e => set("recordType", e.target.value)}>
                {recordTypes.map(rt => <option key={rt} value={rt}>{rt}</option>)}
              </select>
            </div>
            <div className="group">
              <label>Phase</label>
              {phases.length > 0 ? (
                <select value={v.phase} onChange={e => set("phase", e.target.value)}>
                  <option value="">Select Phase</option>
                  {phases.map(p => <option key={p} value={p}>Phase {p}</option>)}
                </select>
              ) : (
                <input value={v.phase} onChange={e => set("phase", e.target.value)} placeholder="e.g. 1" />
              )}
            </div>
            <div className="group">
              <label>Squad</label>
              {squads.length > 0 ? (
                <select value={v.squad} onChange={e => set("squad", e.target.value)}>
                  <option value="">Select Squad</option>
                  {squads.map(sq => <option key={sq} value={sq}>Squad {sq}</option>)}
                </select>
              ) : (
                <input value={v.squad} onChange={e => set("squad", e.target.value)} placeholder="e.g. A" />
              )}
            </div>
          </div>
        </div>

        <div className="sf-section wide">
          <div className="sf-section-head"><FaMapMarkerAlt /> Housing & Referral</div>
          <div className="sf-form-group grid-3">
            <div className="group">
              <label>Dorm/Housing</label>
              <select value={v.dorm} onChange={e => set("dorm", e.target.value)}>
                <option value="">Select Dorm</option>
                {dorms.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="group">
              <label>Intake Date</label>
              <input type="date" value={v.intakeDate ? new Date(v.intakeDate).toISOString().slice(0,10) : ''} onChange={e => set("intakeDate", e.target.value)} />
            </div>
            <div className="group">
              <label>Exit Date</label>
              <input type="date" value={v.exitDate ? new Date(v.exitDate).toISOString().slice(0,10) : ''} onChange={e => set("exitDate", e.target.value)} />
            </div>
            <div className="group">
              <label><FaGraduationCap /> Graduation Date</label>
              <input type="date" value={v.graduationDate ? new Date(v.graduationDate).toISOString().slice(0,10) : ''} onChange={e => set("graduationDate", e.target.value)} />
            </div>
            <div className="group">
              <label>Referral Source</label>
              <input value={v.referralSource} onChange={e => set("referralSource", e.target.value)} placeholder="Church, Pastor, etc." />
            </div>
            <div className="group">
              <label>Referral From Pastor?</label>
              <select value={v.referralFromPastor ? "yes" : "no"} onChange={e => set("referralFromPastor", e.target.value === "yes")}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div className="group">
              <label>Mentor</label>
              <input value={v.mentor} onChange={e => set("mentor", e.target.value)} placeholder="Mentor name" />
            </div>
            <div className="group">
              <label>Location</label>
              <input value={v.location} onChange={e => set("location", e.target.value)} placeholder="Current location" />
            </div>
          </div>
        </div>

        <div className="sf-section wide">
          <div className="sf-section-head"><FaClipboardCheck /> Application &amp; Background Check</div>
          <div className="sf-form-group grid-3">
            <div className="group">
              <label>Application Status</label>
              <select value={v.applicationStatus} onChange={e => set("applicationStatus", e.target.value)}>
                {appStatuses.map(as => <option key={as} value={as}>{as}</option>)}
              </select>
            </div>
            <div className="group">
              <label>Background Check Status</label>
              <select value={v.backgroundStatus} onChange={e => set("backgroundStatus", e.target.value)}>
                {bgStatuses.map(bs => <option key={bs} value={bs}>{bs}</option>)}
              </select>
            </div>
            <div className="group">
              <label><FaIdCard /> Has Valid ID?</label>
              <select value={v.hasID} onChange={e => set("hasID", e.target.value)}>
                <option value="">Select</option>
                {idOptions.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </div>
            <div className="group">
              <label>Background Fee Charged ($75 standard)</label>
              <input type="number" min="0" step="0.01" value={v.backgroundFee} onChange={e => set("backgroundFee", e.target.value)} placeholder="75.00" />
            </div>
            <div className="group">
              <label>Background Fee Paid Date</label>
              <input type="date" value={v.backgroundPaidDate ? new Date(v.backgroundPaidDate).toISOString().slice(0,10) : ''} onChange={e => set("backgroundPaidDate", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="sf-section wide">
          <div className="sf-section-head"><FaBriefcase /> Employment &amp; Engagement</div>
          <div className="sf-form-group grid-3">
            <div className="group">
              <label>Employment Status</label>
              <input value={v.employment} onChange={e => set("employment", e.target.value)} placeholder="e.g. Employed" />
            </div>
            <div className="group">
              <label>Employment Readiness</label>
              <select value={v.readiness} onChange={e => set("readiness", e.target.value)}>
                <option value="">Select</option>
                {readinessOptions.map(ro => <option key={ro} value={ro}>{ro}</option>)}
              </select>
            </div>
            <div className="group">
              <label>Employment Placement</label>
              <input value={v.employmentPlacement} onChange={e => set("employmentPlacement", e.target.value)} placeholder="Employer / placement details" />
            </div>
            <div className="group">
              <label>Workshops / Trainings</label>
              <input value={v.workshops} onChange={e => set("workshops", e.target.value)} placeholder="e.g. Completed financial workshop" />
            </div>
            <div className="group">
              <label><FaHandsHelping /> Volunteer / Service Hours</label>
              <input type="number" min="0" value={v.volunteerHours} onChange={e => set("volunteerHours", e.target.value)} placeholder="e.g. 20" />
            </div>
            <div className="group">
              <label><FaTshirt /> Uniform Issued</label>
              <select value={v.uniformIssued ? "yes" : "no"} onChange={e => set("uniformIssued", e.target.value === "yes")}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div className="group">
              <label><FaRunning /> Physical Fitness</label>
              <select value={v.fitnessParticipation} onChange={e => set("fitnessParticipation", e.target.value)}>
                <option value="">Select</option>
                {fitnessOptions.map(fo => <option key={fo} value={fo}>{fo}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="sf-section wide">
          <div className="sf-section-head"><FaHeartbeat /> Health, Recovery &amp; Spiritual</div>
          <div className="sf-form-group grid-3">
            <div className="group">
              <label>Referred to Clinic?</label>
              <select value={v.referredToClinic ? "yes" : "no"} onChange={e => set("referredToClinic", e.target.value === "yes")}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div className="group wide">
              <label>Health / Recovery Improvements</label>
              <textarea
                style={{ width: '100%', minHeight: '70px', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}
                value={v.healthRecovery}
                onChange={e => set("healthRecovery", e.target.value)}
                placeholder="General progress notes — avoid specific HIPAA-protected diagnoses unless covered by partnership/agreement."
              />
            </div>
            <div className="group wide">
              <label>Spiritual Notes</label>
              <textarea
                style={{ width: '100%', minHeight: '70px', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}
                value={v.spiritualNotes}
                onChange={e => set("spiritualNotes", e.target.value)}
                placeholder="Engagement in Bible study, testimonies, spiritual growth..."
              />
            </div>
            <div className="group wide">
              <label>Achievements / Things to Celebrate</label>
              <textarea
                style={{ width: '100%', minHeight: '80px', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}
                value={v.celebrate}
                onChange={e => set("celebrate", e.target.value)}
                placeholder="List achievements or things to celebrate..."
              />
            </div>
          </div>
        </div>

        <div className="sf-section wide">
          <div className="sf-section-head"><FaUserSlash /> Dismissal (if applicable)</div>
          <div className="sf-form-group grid-3">
            <div className="group">
              <label>Dismissed?</label>
              <select value={v.dismissed ? "yes" : "no"} onChange={e => set("dismissed", e.target.value === "yes")}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div className="group">
              <label>Dismissal Date</label>
              <input type="date" value={v.dismissalDate ? new Date(v.dismissalDate).toISOString().slice(0,10) : ''} onChange={e => set("dismissalDate", e.target.value)} disabled={!v.dismissed} />
            </div>
            <div className="group wide">
              <label>Dismissal Reason</label>
              <input value={v.dismissalReason} onChange={e => set("dismissalReason", e.target.value)} placeholder="Reason for dismissal" disabled={!v.dismissed} />
            </div>
          </div>
        </div>
      </div>

      <div className="sf-footer">
        <button className="dsm-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="dsm-btn-primary" onClick={save} disabled={saving}>
          <FaSave /> {saving ? "Saving..." : existing ? "Update Student" : "Create Student"}
        </button>
      </div>
    </div>
  );
}

const SF_CSS = `
  .sf-workspace { display: flex; flex-direction: column; gap: 24px; }
  .sf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .sf-section { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 24px; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
  .sf-section:hover { border-color: var(--primary); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.05); }
  .sf-section.wide { grid-column: 1 / -1; }
  .sf-section-head { font-size: 12px; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 10px; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
  
  .sf-form-group { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .sf-form-group.grid-3 { grid-template-columns: 1fr 1fr 1fr; }
  
  .group { display: flex; flex-direction: column; gap: 8px; }
  .group label { font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-left: 4px; }
  .group input, .group select { padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 14px; font-weight: 600; outline: none; transition: all 0.2s; }
  .group input:focus, .group select:focus { border-color: var(--primary); background: var(--surface); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
  .group input::placeholder { color: var(--text-muted); font-weight: 400; }

  .group.wide { grid-column: 1 / -1; }

  .sf-footer { display: flex; justify-content: flex-end; gap: 12px; padding-top: 24px; margin-top: 12px; border-top: 1px solid var(--border); }

  @media (max-width: 900px) {
    .sf-grid { grid-template-columns: 1fr; gap: 18px; }
    .sf-form-group.grid-3 { grid-template-columns: 1fr 1fr; }
  }

  @media (max-width: 640px) {
    .sf-workspace { gap: 16px; }
    .sf-grid { gap: 14px; }
    .sf-section { padding: 18px 16px; border-radius: 16px; }
    .sf-section:hover { transform: none; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .sf-section-head { font-size: 11px; margin-bottom: 16px; padding-bottom: 10px; }

    .sf-form-group, .sf-form-group.grid-3 { grid-template-columns: 1fr; gap: 14px; }

    /* iOS: 16px+ inputs prevent zoom */
    .group input, .group select { padding: 14px 14px; font-size: 16px; min-height: 48px; border-radius: 10px; }
    .group label { font-size: 10px; }

    /* Sticky save bar at the bottom */
    .sf-footer {
      padding: 14px;
      margin: 0 -16px -16px;
      gap: 10px;
      flex-direction: column-reverse;
      position: sticky;
      bottom: 0;
      background: var(--surface);
      z-index: 5;
    }
    .sf-footer button { width: 100%; min-height: 50px; justify-content: center; font-size: 15px; }
  }

  @media (max-width: 380px) {
    .sf-section { padding: 14px 12px; }
  }
`;
