// src/components/StudentForm.jsx
import React, { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";

const DEFAULT_STUDENT = {
  firstName: "", lastName: "", email: "", mobile: "",
  status: "Current", recordType: "Resident", phase: "1", squad: "",
  dorm: "", intakeDate: "", graduationDate: "", exitDate: "",
  referralSource: "", mentor: "",
  address: "", city: "", state: "", zip: "", country: "",
};

export default function StudentForm({ existing = null, onClose, onSaved }) {
  const { api } = useApp();
  const [v, setV] = useState(DEFAULT_STUDENT);

  useEffect(() => {
    setV((prev) => ({ ...prev, ...(existing || {}) }));
  }, [existing]);

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    const rec = { ...v, updatedAt: Date.now() };
    if (rec.id) {
      await api.put("students", rec);
      await api.logAudit("student-update", "student", rec.id, []);
    } else {
      const created = await api.add("students", rec);
      await api.logAudit("student-create", "student", created.id, []);
    }
    onSaved?.();
    onClose?.();
  }

  return (
    <div className="modal show" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card">
        <div className="modal-header">
          <strong>{existing?.id ? "Edit Student" : "Add Student"}</strong>
          <button className="btn small" onClick={onClose}>✖</button>
        </div>

        <div className="modal-body" style={{display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:10}}>
          <label>First Name<input value={v.firstName} onChange={set("firstName")} /></label>
          <label>Last Name<input value={v.lastName} onChange={set("lastName")} /></label>
          <label>Email<input value={v.email} onChange={set("email")} /></label>
          <label>Mobile<input value={v.mobile} onChange={set("mobile")} /></label>

          <label>Status
            <select value={v.status} onChange={set("status")}>
              <option>Current</option>
              <option>Waitlist</option>
              <option>Future Applicant</option>
              <option>Alumni</option>
              <option>Withdrawn</option>
            </select>
          </label>
          <label>Record Type
            <select value={v.recordType} onChange={set("recordType")}>
              <option>Resident</option>
              <option>Applicant</option>
              <option>Prospect</option>
              <option>Alumni</option>
            </select>
          </label>
          <label>Phase
            <select value={v.phase} onChange={set("phase")}>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>
          <label>Squad
            <select value={v.squad} onChange={set("squad")}>
              <option value="">—</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </label>

          <label>Dorm<input value={v.dorm} onChange={set("dorm")} /></label>
          <label>Intake Date<input type="date" value={v.intakeDate || ""} onChange={set("intakeDate")} /></label>
          <label>Graduation Date<input type="date" value={v.graduationDate || ""} onChange={set("graduationDate")} /></label>
          <label>Exit Date<input type="date" value={v.exitDate || ""} onChange={set("exitDate")} /></label>

          <label>Referral Source<input value={v.referralSource} onChange={set("referralSource")} /></label>
          <label>Mentor/Pastor<input value={v.mentor} onChange={set("mentor")} /></label>

          <label>Address<input value={v.address} onChange={set("address")} /></label>
          <label>City<input value={v.city} onChange={set("city")} /></label>
          <label>State<input value={v.state} onChange={set("state")} /></label>
          <label>Zip<input value={v.zip} onChange={set("zip")} /></label>
          <label>Country<input value={v.country} onChange={set("country")} /></label>
        </div>

        <div style={{display:"flex", justifyContent:"flex-end", gap:8, padding:"10px 12px"}}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
