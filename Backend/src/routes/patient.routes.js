import express from "express";
import {
  createPatient,
  getPatientByName,
} from "../controllers/paitent.controllers.js";

const router = express.Router();

router.post("/", createPatient);
router.get("/", getPatientByName);

export default router;