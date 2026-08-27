import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tradingRouter from "./trading";
import authRouter from "./auth";
import aiRouter from "./ai";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tradingRouter);
router.use(authRouter);
router.use(aiRouter);
router.use('/settings', settingsRouter);

export default router;
