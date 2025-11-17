import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_PATH = path.join(__dirname, "..", "prompts", "template_agent_prompt.md");

export const SUPPORT_PROMPT = fs.readFileSync(TEMPLATE_PATH, "utf8").trim();


