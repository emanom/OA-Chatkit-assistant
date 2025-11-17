import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import OpenAI from "openai";

const projectRoot = process.cwd();

const envPath = path.join(projectRoot, ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "Missing OPENAI_API_KEY in environment. Add it to .env.local or your shell."
  );
}

const defaultHeaders =
  process.env.OPENAI_DOMAIN_KEY && process.env.OPENAI_DOMAIN_KEY.trim().length > 0
    ? {
        "OpenAI-Domain-Key": process.env.OPENAI_DOMAIN_KEY.trim(),
      }
    : undefined;

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...(defaultHeaders ? { defaultHeaders } : {}),
});

export const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID ?? null;

