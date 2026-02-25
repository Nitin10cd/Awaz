import { createContext, useContext, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { fetchPatientById } from "../_helpers/patient";

const PatientContext = createContext();

function getCookie(name) {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

export function PatientProvider({ children }) {
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchU = async (id) => {
    setLoading(true);
    try {
      const res = await fetchPatientById(id);
      if (res.success) {
        console.log("fetch")
        console.log(res)
        setPatient(res.data.data);
      } else {
        console.log(res)
        toast.error("No patient found. Please create a profile.");
        setPatient(null);
      }
    } catch (error) {
      toast.error("Network Error");
      console.error(error);
      setPatient(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const patientDataCookie = getCookie("patient_data");

    if (patientDataCookie) {
      try {
        const parsed = JSON.parse(patientDataCookie);
        console.log(parsed)
        if (parsed.success && parsed.data) {
          setPatient(parsed.data);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.error("Failed to parse patient_data cookie", e);
      }
    }

    const parsed = JSON.parse(patientDataCookie);
    if (parsed) {
      fetchU(parsed.data.name);
    } else {
      setLoading(false); // no cookie at all
    }
  }, []);

  return (
    <PatientContext.Provider value={{ patient, setPatient, fetchU, loading }}>
      {children}
    </PatientContext.Provider>
  );
}

export const usePatient = () => useContext(PatientContext);