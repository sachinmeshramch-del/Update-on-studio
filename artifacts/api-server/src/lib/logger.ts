import pino from "pino";
import fs from "fs";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    targets: [
      {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      },
      {
        target: "pino/file",
        options: { destination: "/tmp/server.log" }
      }
    ],
  },
});
