import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiRoutes from "./api";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", apiRoutes);

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error(err.stack);
    res.status(500).json({ success: false, error: err.message });
  },
);

app.listen(PORT, () => {
  console.log(`Aurum API running on http://localhost:${PORT}`);
});
