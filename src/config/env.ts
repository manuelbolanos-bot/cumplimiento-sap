import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  SAP_URL: z.string().url(),

  SAP_USER: z.string().min(1, "SAP_USER es obligatorio"),

  SAP_PASSWORD: z.string().min(1, "SAP_PASSWORD es obligatorio"),

  SAP_SOCIEDAD: z.string().min(1),

  SAP_HEADLESS: z
    .string()
    .default("false")
    .transform((value) => value === "true"),

  SAP_TIMEOUT_MS: z
    .string()
    .default("60000")
    .transform(Number),

  SAP_DOWNLOAD_TIMEOUT_MS: z
    .string()
    .default("120000")
    .transform(Number),
});

export const env = envSchema.parse(process.env);