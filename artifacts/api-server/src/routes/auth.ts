import { Router } from "express";

const authRouter = Router();

authRouter.post("/verify-pin", (req, res) => {
    const { pin } = req.body;
    // You can change this PIN to whatever you want in your environment variables.
    // Defaulting to "2026" just so it works immediately out of the box if ENV is missing.
    const correctPin = process.env.APP_PIN || "2026";
    
    if (pin === correctPin) {
        res.json({ success: true, token: "authorized" });
    } else {
        res.status(401).json({ success: false, message: "Invalid PIN" });
    }
});

export default authRouter;
