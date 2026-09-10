import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tradingRouter from "./trading";
import authRouter from "./auth";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tradingRouter);
router.use(authRouter);
router.use('/settings', settingsRouter);

export default router;
