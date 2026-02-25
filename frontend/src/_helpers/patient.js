import axios from "axios";
import Cookies from "js-cookie";

const api = axios.create({
  baseURL: import.meta.env.AAVAAZ_URI || "http://localhost:3000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

const COOKIE_OPTIONS = { expires: 7, secure: true, sameSite: "Strict" };

export async function createPatient(patientData) {
  try {
    if (
      !patientData.name ||
      !patientData.dob ||
      !patientData.phone ||
      !patientData.address ||
      !patientData.diagnosis
    ) {
      return { success: false, message: "Please enter all fields.", data: null };
    }

    const today = new Date();
    const dob = new Date(patientData.dob);

    if (isNaN(dob.getTime())) {
      return { success: false, message: "Invalid date of birth.", data: null };
    }

    if (dob >= today) {
      return {
        success: false,
        message: "Date of birth cannot be today or in the future.",
        data: null,
      };
    }

    const ageInYears = (today - dob) / (1000 * 60 * 60 * 24 * 365.25);
    if (ageInYears > 130) {
      return { success: false, message: "Age cannot exceed 130 years.", data: null };
    }

    const response = await api.post("/patients", patientData);

    // Store patient data in cookies
    Cookies.set("patient_data", JSON.stringify(response.data), COOKIE_OPTIONS);
    Cookies.set("patient_id", response.data.data.id, COOKIE_OPTIONS);

    return {
      success: true,
      message: "Patient created successfully.",
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || error.message,
      data: null,
    };
  }
}

export async function fetchPatientById(name) {
  try {
    // Check cookie first before making an API call
    const cached = Cookies.get("patient_data");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.name === name) {
        return {
          success: true,
          message: "Patient fetched from cache.",
          data: parsed,
        };
      }
    }

    const response = await api.get(`/patients?name=${name}`);

    // Store fetched patient in cookies
    Cookies.set("patient_data", JSON.stringify(response.data), COOKIE_OPTIONS);
    Cookies.set("patient_id", response.data.data.id, COOKIE_OPTIONS);

    return {
      success: true,
      message: "Patient fetched successfully.",
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || error.message,
      data: null,
    };
  }
}

export async function fetchAllPatients(params = {}) {
  try {
    const response = await api.get("/patients", { params });

    // Store the full list in cookies
    Cookies.set("patients_list", JSON.stringify(response.data), COOKIE_OPTIONS);

    return {
      success: true,
      message: "Patients fetched successfully.",
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || error.message,
      data: null,
    };
  }
}

// Helper to clear all patient cookies (e.g., on logout)
export function clearPatientCookies() {
  Cookies.remove("patient_data");
  Cookies.remove("patient_id");
  Cookies.remove("patients_list");
}