#!/usr/bin/env node

import { performance } from "perf_hooks";
import chalk from "chalk";
import { runCascade } from "./cascade.js";

const ARTICLE_URL =
  "https://support.fyi.app/hc/en-us/articles/12919291901337";
const DEFAULT_QUESTION =
  "Why am I not receiving email notifications for Tasks or Comments?";

const args = process.argv.slice(2);

const getOptionValue = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    return undefined;
  }
  return next;
};

const parseRepeatValue = (value) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const parseScenarios = (raw) => {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("Scenarios JSON must be an array.");
    }
    return parsed;
  } catch (error) {
    console.error(
      chalk.red(
        `Failed to parse scenarios JSON. Provide a JSON array via --scenarios or SWEEP_SCENARIOS. (${error.message})`
      )
    );
    process.exitCode = 1;
    return undefined;
  }
};

const formatMs = (value) =>
  value == null ? "—" : `${Math.round(value).toLocaleString()} ms`;

const average = (values) =>
  values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;

const formatAverage = (values) => {
  const avg = average(values);
  return avg == null ? "—" : `${Math.round(avg).toLocaleString()} ms`;
};

const truncate = (text, maxLength = 320) => {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
};

const defaultScenarios = [
  {
    label: "Baseline (gpt-5-nano → gpt-5-mini)",
    config: {},
  },
  {
    label: "Faster router (gpt-5-nano → gpt-5-mini)",
    config: {
      routerModel: "gpt-5-nano",
      routerReasoning: "low",
      historyMaxTurns: 3,
      historyMaxChars: 1800,
    },
  },
  {
    label: "Balanced quality (gpt-5-nano → gpt-5-mini)",
    config: {
      routerModel: "gpt-5-nano",
      routerReasoning: "low",
      heavyModel: "gpt-5-mini",
      heavyVerbosity: "medium",
      heavyReasoning: "medium",
      heavyMaxOutputTokens: 1200,
      vectorMaxResults: 5,
    },
  },
  {
    label: "Streaming heavy (gpt-4o-mini → gpt-4.1, streaming)",
    config: {
      routerModel: "gpt-4o-mini",
      routerReasoning: "low",
      heavyModel: "gpt-4.1",
      heavyVerbosity: "medium",
      heavyReasoning: "medium",
      heavyStreamingEnabled: true,
      vectorMaxResults: 5,
    },
  },
  {
    label: "Ultra-fast (gpt-5-nano → gpt-5-mini, minimal retrieval)",
    config: {
      routerModel: "gpt-5-nano",
      routerReasoning: "low",
      heavyModel: "gpt-5-mini",
      heavyVerbosity: "low",
      heavyReasoning: "low",
      vectorMaxResults: 1,
      promptCacheEnabled: true,
      historyMaxTurns: 2,
      historyMaxChars: 1200,
    },
  },
];

const showAnswer = args.includes("--show-answer");
const showConfig = args.includes("--show-config");
const showInterim = args.includes("--show-interim");
const showArticle = args.includes("--show-article");

const question =
  (getOptionValue("--question") ?? DEFAULT_QUESTION).trim() ||
  DEFAULT_QUESTION;
const repeat = parseRepeatValue(getOptionValue("--repeat"));
const onlyFilter = getOptionValue("--only");

const scenariosOverride =
  getOptionValue("--scenarios") ?? process.env.SWEEP_SCENARIOS;

let scenarios = parseScenarios(scenariosOverride) ?? defaultScenarios;

if (onlyFilter) {
  scenarios = scenarios.filter((scenario) =>
    scenario.label.toLowerCase().includes(onlyFilter.toLowerCase())
  );
}

if (!scenarios.length) {
  console.error(
    chalk.red(
      "No scenarios left to execute. Adjust your --only filter or provide scenarios."
    )
  );
  process.exit(1);
}

const printArticleSummary = async () => {
  console.log(chalk.gray(`\nReference article → ${ARTICLE_URL}`));
  try {
    const response = await fetch(ARTICLE_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    console.log(chalk.gray(truncate(cleaned, 600)));
  } catch (error) {
    console.error(
      chalk.red(
        `Could not fetch reference article automatically (${error.message}).`
      )
    );
  }
};

const runScenario = async (scenario) => {
  console.log(chalk.bold(`\n▶ ${scenario.label}`));
  if (showConfig) {
    console.log(
      chalk.gray(
        `   config overrides: ${JSON.stringify(scenario.config ?? {}, null, 2)}`
      )
    );
  }

  const totalTimes = [];
  const routerTimes = [];
  const heavyTimes = [];
  let heavyResponses = 0;
  let lastResult = null;

  for (let iteration = 0; iteration < repeat; iteration += 1) {
    const iterationStart = performance.now();
    try {
      const result = await runCascade({
        question,
        history: [],
        config: scenario.config,
      });
      const totalMs =
        result?.timings?.total_ms ?? performance.now() - iterationStart;

      totalTimes.push(totalMs);
      if (result?.timings?.router_ms != null) {
        routerTimes.push(result.timings.router_ms);
      }
      if (result?.timings?.heavy_ms != null) {
        heavyTimes.push(result.timings.heavy_ms);
      }
      if (result?.source === "heavy") {
        heavyResponses += 1;
      }
      lastResult = result;

      const label =
        repeat > 1 ? `run ${iteration + 1}/${repeat}` : "single run";
      const sourceLabel =
        result?.source === "router"
          ? chalk.greenBright("ROUTER")
          : chalk.yellowBright("HEAVY");

      console.log(
        `  • ${label} → ${sourceLabel} | total ${formatMs(
          totalMs
        )} (router ${formatMs(result?.timings?.router_ms)}, heavy ${formatMs(
          result?.timings?.heavy_ms
        )})`
      );

      if (showInterim && result?.interim) {
        console.log(chalk.cyan(`    interim: ${result.interim}`));
      }

      if (showAnswer && result?.answer) {
        console.log(chalk.magenta(`    answer: ${result.answer}`));
      }

      if (result?.router?.decision?.reason) {
        console.log(
          chalk.gray(`    router reason: ${result.router.decision.reason}`)
        );
      }
    } catch (error) {
      console.error(
        chalk.red(
          `  • iteration ${iteration + 1} failed → ${error.message}`
        )
      );
      if (process.env.DEBUG) {
        console.error(error);
      }
      break;
    }
  }

  if (!totalTimes.length) {
    console.log(chalk.red("  Skipping metrics; scenario produced no results."));
    return;
  }

  console.log(
    chalk.gray(
      `  avg total ${formatAverage(totalTimes)} | avg router ${formatAverage(
        routerTimes
      )} | avg heavy ${formatAverage(heavyTimes)} | handoffs ${heavyResponses}/${totalTimes.length}`
    )
  );

  if (!showAnswer && lastResult?.answer) {
    console.log(chalk.gray(`  sample answer: ${truncate(lastResult.answer)}`));
  }
};

const main = async () => {
  console.log(
    chalk.cyanBright(
      `Running ${scenarios.length} scenario(s) × ${repeat} run(s) per scenario`
    )
  );
  console.log(chalk.cyanBright(`Question: ${question}`));

  if (showArticle) {
    await printArticleSummary();
  }

  for (const scenario of scenarios) {
    // eslint-disable-next-line no-await-in-loop
    await runScenario(scenario);
  }
};

main().catch((error) => {
  console.error(chalk.red("Benchmark sweep failed"), error);
  process.exitCode = 1;
});

