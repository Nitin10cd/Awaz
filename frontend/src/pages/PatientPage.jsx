import { useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { createPatient } from "../_helpers/patient.js";

export default function PatientPage() {
  const [form, setForm] = useState({
    name: "",
    dob: "",
    phone: "",
    address: "",
    diagnosis: "",
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { success, message } = await createPatient(form);

    if (success) {
      toast.success(message);
      setForm({ name: "", dob: "", phone: "", address: "", diagnosis: "" });
    } else {
      toast.error(message);
    }

    setLoading(false);
  };

  return (
    <>
      <Toaster position="top-right" />
      <div className="container">
        <div className="patientPage">
          <div className="leftHero">
            <h1>CREATE PATIENT RECORD</h1>
          </div>

          <form className="patientForm" onSubmit={handleSubmit}>
            <div className="field">
              <label>FULL NAME*</label>
              <input
                name="name"
                placeholder="Patient Name"
                value={form.name}
                onChange={handleChange}
              />
            </div>

            <div className="field">
              <label>DATE OF BIRTH*</label>
              <input
                type="date"
                name="dob"
                value={form.dob}
                onChange={handleChange}
              />
            </div>

            <div className="field">
              <label>PHONE NUMBER*</label>
              <input
                name="phone"
                placeholder="Phone Number"
                value={form.phone}
                onChange={handleChange}
              />
            </div>

            <div className="field">
              <label>ADDRESS*</label>
              <input
                name="address"
                placeholder="Address"
                value={form.address}
                onChange={handleChange}
              />
            </div>

            <div className="field">
              <label>DIAGNOSIS*</label>
              <textarea
                name="diagnosis"
                placeholder="Diagnosis"
                value={form.diagnosis}
                onChange={handleChange}
              />
            </div>

            <button className="submitBtn" type="submit" disabled={loading}>
              {loading ? "Creating..." : "CREATE PATIENT"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}