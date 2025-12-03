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

export default function StudentForm({ existing = null, onClose, onSaved, cardStyle = null }) {
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
    <div className={`card ${cardStyle || "card-light"}`}>
      <div className="card-header">
        <h3 className="card-title">{existing ? "Edit Student" : "New Student"}</h3>
      </div>
    </div>
  );
}
