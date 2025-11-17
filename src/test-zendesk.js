#!/usr/bin/env node

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import chalk from "chalk";
import { createZendeskTicket, isZendeskConfigured } from "../server/zendesk.js";

// Load environment variables from .env.local
const projectRoot = process.cwd();
const envPath = path.join(projectRoot, ".env.local");

// Check if ZENDESK_SUBDOMAIN is already set in shell environment (which would override .env.local)
const shellSubdomain = process.env.ZENDESK_SUBDOMAIN;
if (shellSubdomain) {
  console.log(
    chalk.yellow(
      `⚠️  WARNING: ZENDESK_SUBDOMAIN is already set in shell environment: "${shellSubdomain}"`
    )
  );
  console.log(
    chalk.yellow(
      "   This will override .env.local. Unset it with: unset ZENDESK_SUBDOMAIN\n"
    )
  );
}

if (fs.existsSync(envPath)) {
  // Read the file to check for multiple entries
  const envContent = fs.readFileSync(envPath, "utf8");
  const subdomainMatches = envContent.match(/^ZENDESK_SUBDOMAIN\s*=\s*(.+)$/gim);
  if (subdomainMatches && subdomainMatches.length > 1) {
    console.log(
      chalk.yellow(
        `⚠️  WARNING: Found ${subdomainMatches.length} ZENDESK_SUBDOMAIN entries in .env.local:`
      )
    );
    subdomainMatches.forEach((match, index) => {
      console.log(chalk.yellow(`   ${index + 1}. ${match.trim()}`));
    });
    console.log(
      chalk.yellow(
        "   Only the FIRST one will be used. Remove or comment out the others.\n"
      )
    );
  }
  
  // Use override: true to ensure .env.local values override shell env vars
  const result = dotenv.config({ path: envPath, override: true });
  if (result.error) {
    console.error(chalk.red(`Error loading .env.local: ${result.error.message}`));
    process.exit(1);
  }
} else {
  console.error(
    chalk.red("Error: .env.local file not found. Please create it with your Zendesk credentials.")
  );
  process.exit(1);
}

const getOptionValue = (flag) => {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    return undefined;
  }
  return next;
};

const parsePriority = (value) => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 4) {
    return 2; // default to normal
  }
  return parsed;
};

const parseType = (value) => {
  const allowed = ["question", "incident", "problem", "task"];
  if (!value || !allowed.includes(value.toLowerCase())) {
    return "question"; // default
  }
  return value.toLowerCase();
};

async function testZendeskTicket() {
  console.log(chalk.cyanBright("\n🧪 Testing Zendesk Ticket Creation\n"));

  // Check configuration
  if (!isZendeskConfigured()) {
    console.error(
      chalk.red("❌ Zendesk is not configured.")
    );
    console.error(
      chalk.yellow(
        "\nPlease set the following environment variables in .env.local:\n"
      )
    );
    console.error(chalk.gray("  ZENDESK_SUBDOMAIN=your-subdomain"));
    console.error(chalk.gray("  ZENDESK_EMAIL=your-email@example.com"));
    console.error(chalk.gray("  ZENDESK_API_TOKEN=your-api-token\n"));
    process.exit(1);
  }

  console.log(chalk.green("✅ Zendesk configuration found"));
  
  // Debug: Show raw environment variable value
  const rawSubdomain = process.env.ZENDESK_SUBDOMAIN;
  console.log(chalk.gray(`   Raw ZENDESK_SUBDOMAIN from env: "${rawSubdomain}"`));
  console.log(chalk.gray(`   Length: ${rawSubdomain?.length || 0} characters`));
  
  const subdomain = rawSubdomain?.trim() || "";
  const zendeskDomain = subdomain.includes(".zendesk.com")
    ? subdomain
    : `${subdomain}.zendesk.com`;
  console.log(chalk.gray(`   Subdomain (trimmed): "${subdomain}"`));
  console.log(chalk.gray(`   Domain: ${zendeskDomain}`));
  console.log(chalk.gray(`   Email: ${process.env.ZENDESK_EMAIL}\n`));
  
  // Safety check: Prevent production ticket creation unless explicitly allowed
  const isProduction = subdomain === "fyidocs" || zendeskDomain === "fyidocs.zendesk.com";
  const allowProduction = process.argv.includes("--allow-production");
  
  if (isProduction && !allowProduction) {
    console.error(chalk.red("\n❌ BLOCKED: This would create a ticket in PRODUCTION (fyidocs.zendesk.com)"));
    console.error(chalk.yellow("\n⚠️  Safety check: Production ticket creation is blocked by default."));
    console.error(chalk.yellow("   If you intended to use sandbox (fyidocs1730787350), check your .env.local file."));
    console.error(chalk.yellow("   If you really want to create a ticket in production, use: --allow-production\n"));
    console.error(chalk.gray("   Current configuration:"));
    console.error(chalk.gray(`     Raw ZENDESK_SUBDOMAIN: "${rawSubdomain}"`));
    console.error(chalk.gray(`     Resolved domain: ${zendeskDomain}\n`));
    process.exit(1);
  }
  
  if (isProduction && allowProduction) {
    console.log(chalk.yellow("⚠️  WARNING: Creating ticket in PRODUCTION (fyidocs.zendesk.com)"));
    console.log(chalk.yellow("   Proceeding because --allow-production flag was provided.\n"));
  }

  // Get test parameters from command line or use defaults
  const subject =
    getOptionValue("--subject") ||
    `[TEST] Zendesk Integration Test - ${new Date().toISOString()}`;
  const description =
    getOptionValue("--description") ||
    `This is a test ticket created by the Zendesk integration test script.\n\n` +
      `Created at: ${new Date().toISOString()}\n` +
      `Purpose: Verify that the Zendesk API integration is working correctly.\n\n` +
      `This ticket can be safely deleted after verification.`;
  const priority = parsePriority(getOptionValue("--priority"));
  const type = parseType(getOptionValue("--type"));
  const requesterEmail = getOptionValue("--requester-email");
  const requesterName = getOptionValue("--requester-name");

  console.log(chalk.cyan("📝 Ticket Details:"));
  console.log(chalk.gray(`   Subject: ${subject}`));
  console.log(chalk.gray(`   Type: ${type}`));
  console.log(chalk.gray(`   Priority: ${priority} (${["", "low", "normal", "high", "urgent"][priority]})`));
  if (requesterEmail) {
    console.log(chalk.gray(`   Requester Email: ${requesterEmail}`));
  }
  if (requesterName) {
    console.log(chalk.gray(`   Requester Name: ${requesterName}`));
  }
  console.log(chalk.gray(`   Description length: ${description.length} characters\n`));

  try {
    console.log(chalk.yellow("⏳ Creating ticket...\n"));

    const ticketParams = {
      subject,
      description,
      priority,
      type,
    };

    if (requesterEmail) {
      ticketParams.requesterEmail = requesterEmail;
    }
    if (requesterName) {
      ticketParams.requesterName = requesterName;
    }

    const result = await createZendeskTicket(ticketParams);

    console.log(chalk.green("✅ Ticket created successfully!\n"));
    console.log(chalk.cyan("📋 Ticket Information:"));
    console.log(chalk.white(`   Ticket ID: ${chalk.bold(result.ticketId)}`));
    console.log(chalk.white(`   Subject: ${result.subject}`));
    console.log(chalk.white(`   Status: ${result.status}`));
    console.log(chalk.white(`   Created At: ${result.createdAt}`));
    console.log(chalk.white(`   URL: ${chalk.underline(result.ticketUrl)}\n`));

    console.log(chalk.green("✨ Test completed successfully!\n"));
    console.log(
      chalk.gray(
        "You can view the ticket in Zendesk using the URL above, or delete it if it's no longer needed.\n"
      )
    );

    return result;
  } catch (error) {
    console.error(chalk.red("\n❌ Failed to create ticket\n"));
    console.error(chalk.red(`Error: ${error.message}\n`));

    if (process.env.DEBUG) {
      console.error(chalk.gray("Full error details:"));
      console.error(error);
    }

    // Provide helpful error messages
    if (error.message.includes("401") || error.message.includes("403")) {
      console.error(
        chalk.yellow(
          "💡 This looks like an authentication error. Please check:\n"
        )
      );
      console.error(chalk.gray("   - Your ZENDESK_EMAIL is correct"));
      console.error(chalk.gray("   - Your ZENDESK_API_TOKEN is valid and active"));
      console.error(
        chalk.gray(
          "   - The API token has permissions to create tickets\n"
        )
      );
    } else if (error.message.includes("404")) {
      console.error(
        chalk.yellow(
          "💡 This looks like a subdomain error. Please check:\n"
        )
      );
      console.error(
        chalk.gray(
          `   - Your ZENDESK_SUBDOMAIN is correct (should be just the subdomain, e.g., 'acme' not 'acme.zendesk.com')\n`
        )
      );
    }

    process.exit(1);
  }
}

// Show usage if --help is requested
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(chalk.cyanBright("\n📖 Zendesk Ticket Creation Test Script\n"));
  console.log(chalk.white("Usage:"));
  console.log(chalk.gray("  node src/test-zendesk.js [options]\n"));
  console.log(chalk.white("Options:"));
  console.log(chalk.gray("  --subject <text>           Ticket subject (default: auto-generated test subject)"));
  console.log(chalk.gray("  --description <text>      Ticket description (default: auto-generated test description)"));
  console.log(chalk.gray("  --priority <1-4>           Priority: 1=low, 2=normal, 3=high, 4=urgent (default: 2)"));
  console.log(chalk.gray("  --type <type>              Type: question, incident, problem, task (default: question)"));
  console.log(chalk.gray("  --requester-email <email>  Requester email address (optional)"));
  console.log(chalk.gray("  --requester-name <name>    Requester name (optional)"));
  console.log(chalk.gray("  --allow-production         Allow creating tickets in production (safety check)"));
  console.log(chalk.gray("  --help, -h                 Show this help message\n"));
  console.log(chalk.white("Examples:"));
  console.log(chalk.gray("  node src/test-zendesk.js"));
  console.log(chalk.gray("  node src/test-zendesk.js --subject 'Test Issue' --description 'Testing the integration'"));
  console.log(chalk.gray("  node src/test-zendesk.js --priority 3 --type incident"));
  console.log(chalk.gray("  node src/test-zendesk.js --requester-email user@example.com --requester-name 'John Doe'\n"));
  process.exit(0);
}

testZendeskTicket().catch((error) => {
  console.error(chalk.red("\n💥 Unexpected error:"), error);
  process.exit(1);
});

