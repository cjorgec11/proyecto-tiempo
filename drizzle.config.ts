import { defineConfig } from "drizzle-kit";
export default defineConfig({ dialect: "sqlite", schema: "./datos/esquema.ts", out: "./drizzle" });
