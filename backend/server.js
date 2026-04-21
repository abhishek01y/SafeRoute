const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Routes
const safetyRoutes = require("./safetyRoutes");
app.use("/api", safetyRoutes);

app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "SafeRoute Node Backend" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`SafeRoute backend running on http://localhost:${PORT}`);
});