// loading the env file
import dotenv from "dotenv";
dotenv.config();
// importing the requirements
import express from "express";
import cors from "cors";

// paitent route and the error handler middleware
import patientRoutes from "./src/routes/patient.routes.js"
import { errorHandler } from "./src/middlewares/error.middleware.js";



// main express server creation
const app = express();

// middlewares 
// 1: CORS => for sercurity purpose of the 
app.use(
  cors({
    origin: "*",          
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

app.use("/api/patients", patientRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(` Server running at http://localhost:${PORT}`);
});