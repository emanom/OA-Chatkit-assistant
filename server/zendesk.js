/**
 * Zendesk API integration for creating support tickets
 */

// Read environment variables at function call time, not module load time
// This ensures .env.local values override shell environment variables
const getZendeskConfig = () => ({
  subdomain: process.env.ZENDESK_SUBDOMAIN,
  email: process.env.ZENDESK_EMAIL,
  apiToken: process.env.ZENDESK_API_TOKEN,
});

/**
 * Creates a Zendesk support ticket
 * @param {Object} params - Ticket parameters
 * @param {string} params.subject - Ticket subject
 * @param {string} params.description - Ticket description/body
 * @param {string} [params.requesterEmail] - Requester email (optional, defaults to ZENDESK_EMAIL)
 * @param {string} [params.requesterName] - Requester name (optional)
 * @param {number} [params.priority] - Ticket priority (1=low, 2=normal, 3=high, 4=urgent)
 * @param {string} [params.type] - Ticket type (question, incident, problem, task)
 * @returns {Promise<Object>} Created ticket information
 */
export async function createZendeskTicket({
  subject,
  description,
  requesterEmail,
  requesterName,
  priority = 2,
  type = "question",
}) {
  // Read config at function call time to ensure latest env vars are used
  const config = getZendeskConfig();
  const { subdomain: ZENDESK_SUBDOMAIN, email: ZENDESK_EMAIL, apiToken: ZENDESK_API_TOKEN } = config;
  
  if (!ZENDESK_SUBDOMAIN || !ZENDESK_EMAIL || !ZENDESK_API_TOKEN) {
    throw new Error(
      "Zendesk configuration missing. Please set ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, and ZENDESK_API_TOKEN environment variables."
    );
  }

  if (!subject || !description) {
    throw new Error("Subject and description are required to create a ticket.");
  }

  // Handle both subdomain format (e.g., "fyidocs") and full domain format (e.g., "fyidocs1730787350.zendesk.com")
  const subdomain = ZENDESK_SUBDOMAIN.trim();
  const zendeskDomain = subdomain.includes(".zendesk.com")
    ? subdomain
    : `${subdomain}.zendesk.com`;
  
  // Safety check: Prevent production ticket creation unless explicitly allowed
  const isProduction = subdomain === "fyidocs" || zendeskDomain === "fyidocs.zendesk.com";
  const allowProduction = process.env.ZENDESK_ALLOW_PRODUCTION === "true";
  
  if (isProduction && !allowProduction) {
    throw new Error(
      `BLOCKED: Attempted to create ticket in PRODUCTION (${zendeskDomain}). ` +
      `This is blocked by default for safety. ` +
      `If you really need to create tickets in production, set ZENDESK_ALLOW_PRODUCTION=true. ` +
      `For testing, use sandbox: ZENDESK_SUBDOMAIN=fyidocs1730787350`
    );
  }
  
  const url = `https://${zendeskDomain}/api/v2/tickets.json`;
  
  const auth = Buffer.from(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`).toString("base64");

  const ticketData = {
    ticket: {
      subject: subject.trim(),
      comment: {
        body: description.trim(),
      },
      priority: priority,
      type: type,
    },
  };

  // Add requester information if provided
  if (requesterEmail || requesterName) {
    ticketData.ticket.requester = {};
    if (requesterEmail) {
      ticketData.ticket.requester.email = requesterEmail.trim();
    }
    if (requesterName) {
      ticketData.ticket.requester.name = requesterName.trim();
    }
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(ticketData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Zendesk API error: ${response.status} ${response.statusText}`;
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error) {
          errorMessage = `Zendesk API error: ${errorData.error}`;
        }
        if (errorData.description) {
          errorMessage += ` - ${errorData.description}`;
        }
      } catch {
        errorMessage += ` - ${errorText}`;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    
    if (!result.ticket) {
      throw new Error("Zendesk API returned unexpected response format.");
    }

    const ticket = result.ticket;
    const ticketUrl = `https://${zendeskDomain}/agent/tickets/${ticket.id}`;

    return {
      success: true,
      ticketId: ticket.id,
      ticketUrl: ticketUrl,
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.created_at,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Zendesk API error")) {
      throw error;
    }
    throw new Error(`Failed to create Zendesk ticket: ${error.message}`);
  }
}

/**
 * Checks if Zendesk is configured
 * @returns {boolean}
 */
export function isZendeskConfigured() {
  // Read config at function call time to ensure latest env vars are used
  const config = getZendeskConfig();
  return !!(
    config.subdomain &&
    config.email &&
    config.apiToken
  );
}

