#!/usr/bin/env node

import readline from "readline";
import chalk from "chalk";
import { runCascade } from "./cascade.js";

function printResult(result) {
  console.log("");
  const header =
    result.source === "router"
      ? chalk.greenBright("✅ Router handled the query")
      : chalk.yellowBright("⚠️  Escalated to heavy agent");
  console.log(header);
  console.log("");
  console.log(result.answer);
  console.log("");
  if (result.source === "heavy" && process.env.DEBUG) {
    console.log(chalk.gray("debug events:"), result.heavy.events);
    console.log("");
    console.log(
      chalk.gray("debug heavy.raw:"),
      JSON.stringify(result.heavy.raw, null, 2)
    );
    console.log("");
  }
  const timings = result.timings ?? {};
  const formatMs = (value) =>
    value == null ? "—" : `${Math.round(value).toLocaleString()} ms`;
  console.log(
    chalk.gray(
      `timings → router: ${formatMs(timings.router_ms)} | heavy: ${formatMs(
        timings.heavy_ms
      )} | total: ${formatMs(timings.total_ms)}`
    )
  );
  console.log("");
  console.log(chalk.gray("--- router decision ---"));
  console.log(
    chalk.gray(
      JSON.stringify(
        {
          handoff: result.router.decision.handoff,
          reason: result.router.decision.reason,
          confidence: result.router.decision.confidence ?? null,
          follow_up_needed:
            result.router.decision.follow_up_needed ?? undefined,
        },
        null,
        2
      )
    )
  );
  console.log("");
}

async function handleQuestion(question, history) {
  let interimReply = null;
  try {
    const result = await runCascade({
      question,
      history,
      onRouterDecision: ({ quickReply }) => {
        interimReply = quickReply;
        console.log("");
        console.log(chalk.blueBright(quickReply));
        console.log("");
      },
    });
    printResult(result);
    history.push({ role: "user", content: question });
    if (interimReply && result.source === "heavy") {
      history.push({ role: "assistant", content: interimReply });
    }
    history.push({ role: "assistant", content: result.answer });
  } catch (error) {
    console.error(chalk.red("Failed to get a response:"), error.message);
    if (process.env.DEBUG) {
      console.error(error);
    }
  }
}

function buildInteractiveLoop() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const history = [];

  const ask = () => {
    rl.question(chalk.cyan("? ") + "Ask a question (or type exit): ", async (q) => {
      const trimmed = q.trim();
      if (!trimmed) {
        ask();
        return;
      }
      if (["exit", "quit", "q"].includes(trimmed.toLowerCase())) {
        rl.close();
        return;
      }
      await handleQuestion(trimmed, history);
      ask();
    });
  };

  ask();
}

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (question) {
    await handleQuestion(question, []);
    return;
  }

  console.log(
    chalk.magentaBright(
      "OpenAI cascading agents demo. Type a question or 'exit' to quit."
    )
  );
  buildInteractiveLoop();
}

main().catch((error) => {
  console.error("Unexpected error", error);
  process.exitCode = 1;
});


