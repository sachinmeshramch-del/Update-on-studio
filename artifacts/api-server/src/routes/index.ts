import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tradingRouter from "./trading";
import authRouter from "./auth";
import settingsRouter from "./settings";
import { hermesRouter } from "./hermes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tradingRouter);
router.use(authRouter);
router.use('/settings', settingsRouter);
router.use('/hermes', hermesRouter);
router.use(hermesRouter); // enables /api/webhook/tradingview as well

export default router;
