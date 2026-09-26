import { Sequelize } from "sequelize";

export const sequelize = new Sequelize({
  dialect: "mysql",
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  logging: process.env.DB_LOG_SQL === "true" ? console.log : false,
});

export const initDatabase = async () => {
  await sequelize.authenticate();
};
