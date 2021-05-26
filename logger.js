const winston = require("winston");
//const config = require("./config");

const enumerateErrorFormat = winston.format((info) => {
  if (info instanceof Error) {
    Object.assign(info, { message: info.stack });
  }
  return info;
});

const logger = winston.createLogger({
  level: "debug",
  //level: config.env === "development" ? "debug" : "info",
  format: winston.format.combine(
    enumerateErrorFormat(),
    winston.format.colorize({ all: true }),
    winston.format.label({ label: "[LOGGER]" }),
    winston.format.timestamp({
      format: "DD-MM-YYYY HH:MM:SS",
    }),
    winston.format.printf(
      (info) => `${info.label} ${info.timestamp} ${info.level}: ${info.message}`
    )
    /*config.env === "development"
      ? winston.format.colorize()
      : winston.format.uncolorize(),*/
    //winston.format.splat(),
    //winston.format.printf(({ level, message }) => `${level}: ${message}`)
  ),
  transports: [
    new winston.transports.File({
      filename: "logs/log.log",
      level: "info",
    }),
    new winston.transports.File({
      filename: "logs/debug.log",
      level: "silly",
    }),
    new winston.transports.Console({
      stderrLevels: ["error"],
    }),
  ],
});

module.exports = logger;
