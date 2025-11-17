# FYI Support Assistant Cascade

This project combines a **fast FYI triage agent** with a **heavier FYI expert agent** using the OpenAI Responses (Agents) API. The router delivers an immediate answer (or flags the need for escalation) while the expert model consults the FYI Help Centre vector store for in-depth resolutions. The result is low-latency chat for straightforward queries and thorough support when the issue is complex. The cascade now targets the latest GPT-5 family models and their new parameters (verbosity, reasoning effort, etc.) for tighter control over response style and latency ([OpenAI Cookbook](https://cookbook.openai.com/examples/gpt-5/gpt-5_new_params_and_tools), [Latest model guide](https://platform.openai.com/docs/guides/latest-model#page-top)).

## Prerequisites

- Node.js 18+
- An OpenAI API key with access to the models you plan to use (`gpt-5-mini` powers both passes by default; override via environment variables if needed).
- `.env.local` file at the project root containing:

```ini
OPENAI_API_KEY=sk-your-key
VECTOR_STORE_ID=vs_68f6372d0fc48191a629f4a6eb0a7806
# Optional for OpenAI domain allowlists
# OPENAI_DOMAIN_KEY=domain_pk_69...a495
# Optional overrides
# HEAVY_MODEL=gpt-5-mini
# ROUTER_VERBOSITY=low
# HEAVY_VERBOSITY=medium
# ROUTER_REASONING=low
# HEAVY_REASONING=high
# ROUTER_TEMPERATURE=0
# HEAVY_TEMPERATURE=0.2
# ROUTER_MAX_OUTPUT_TOKENS=400
# PROMPT_CACHE_ENABLED=true
# HEAVY_STREAM=false
# HEAVY_MAX_OUTPUT_TOKENS=900
# HISTORY_MAX_TURNS=4
# HISTORY_MAX_CHAR_LENGTH=2400
# VECTOR_MAX_RESULTS=6
# ROUTER_CONFIDENCE_THRESHOLD=0.75

# Optional attachment support (uploads -> Amazon S3)
# ATTACHMENTS_BUCKET=pubsupchat-attach
# ATTACHMENTS_PREFIX=chat-uploads/
# ATTACHMENTS_MAX_BYTES=52428800          # 50 MB
# ATTACHMENTS_UPLOAD_URL_TTL=300          # seconds
# ATTACHMENTS_DOWNLOAD_URL_TTL=604800     # seconds (7 days)
# IMAGE_DESCRIPTION_MODEL=gpt-4o-mini
# IMAGE_DESCRIPTION_MAX_OUTPUT_TOKENS=400
```

`deploy.ps1` automatically resolves `VITE_CHATKIT_DOMAIN_KEY` (defaulting to `domain_pk_6909d8601d648190bb9ddb0da3c031f301049fa90975526f`), exports it for the Vite build, and forwards it to the Docker build so every bundle carries the registered domain key. Override it if you are targeting a different allow-listed hostname.

The repo already includes `.env.local`; update it with your credentials. `VECTOR_STORE_ID` is required so both agents can call the FYI file search tool.

## Install & Run

```bash
npm install
npm run demo -- "What is 2+2?"
```

Omit the trailing question to launch an interactive prompt.

### Local web UI

Run the HTTP cascade server and the React/Vite chat client in separate terminals:

```bash
npm run server          # exposes POST /cascade and GET /cascade (SSE) on :3000
npm run dev             # launches the chat UI at http://localhost:5173
```

- The Vite dev server proxies API calls to `http://localhost:3000`. Override with `VITE_API_URL`.
- Build static assets with `npm run build`; the Express server will automatically serve `dist/` in production.

### Attachments & Amazon S3 uploads

- Users can attach files via the uploader beneath the quick actions panel. Every upload:
  - Calls `POST /api/attachments/sign` to mint a pre-signed PUT to `s3://pubsupchat-attach/chat-uploads/<thread-id>/…`.
  - Streams the bytes directly from the browser to S3 (so the ECS task doesn’t proxy large payloads).
  - Sends a `fyi.cascade.attachment` action so the backend stores attachment metadata alongside the thread.
- Image attachments trigger `POST /api/attachments/describe`, which signs a short-lived GET URL and asks `IMAGE_DESCRIPTION_MODEL` (default `gpt-4o-mini`) to summarise the picture. The vision summary and S3 link are added to the user context before each cascade run, so both router and heavy agents can reason about the file immediately.
- Set the `ATTACHMENTS_*` env vars (bucket, prefix, size limit, signed URL TTLs) to match your AWS account. The ECS task role needs `s3:PutObject`/`s3:GetObject` for the configured bucket prefix.
- Uploaded links are also prefilling the ChatKit composer so the end user can reference or edit the attachment note before sending their question.

### Container deployment

Build a production image that bundles the compiled UI and the cascade server:

```bash
# Make sure the ChatKit domain key is baked into the UI bundle
docker build --build-arg VITE_CHATKIT_DOMAIN_KEY=$VITE_CHATKIT_DOMAIN_KEY -t fyi-cascade:latest .
```

Run it locally (expects `OPENAI_API_KEY` and `VECTOR_STORE_ID`):

```bash
docker run --rm -p 3000:3000 \
  -e OPENAI_API_KEY=sk-... \
  -e VECTOR_STORE_ID=vs_... \
  -e HEAVY_REASONING=low \
  -e HEAVY_MAX_OUTPUT_TOKENS=900 \
  # -e OPENAI_DOMAIN_KEY=domain_pk_... \
  fyi-cascade:latest
```

To push to Amazon ECR:

```bash
aws ecr create-repository --repository-name fyi-cascade
aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin <account>.dkr.ecr.ap-southeast-2.amazonaws.com
docker tag fyi-cascade:latest <account>.dkr.ecr.ap-southeast-2.amazonaws.com/fyi-cascade:latest
docker push <account>.dkr.ecr.ap-southeast-2.amazonaws.com/fyi-cascade:latest
```

Deploy the image on AWS ECS/Fargate (Sydney region) behind an Application Load Balancer. Set the container env vars (`OPENAI_API_KEY`, `VECTOR_STORE_ID`, optional overrides) and expose port `3000`. The server automatically serves `dist/` and the cascade API.

#### Quick redeploy (existing AWS environment)

Once your ECR repository, ECS service, and IAM wiring are in place you can refresh the running stack in a few minutes. The provided `deploy.ps1` script now:

- Ensures `VITE_CHATKIT_DOMAIN_KEY` is populated (using the default value unless you override `VITE_CHATKIT_DOMAIN_KEY` in your shell).
- Runs `npm run build` so the UI picks up the domain key and other config.
- Builds the docker image with `--build-arg VITE_CHATKIT_DOMAIN_KEY=...`, pushes to ECR, and forces a new ECS deployment.

```powershell
# Rebuild, tag, push, and redeploy in one command
.\deploy.ps1
```

ECS will spin up a new task, wait for it to pass health checks, and then drain the old one from the Application Load Balancer. Give it ~60–90 seconds and then browse the ALB DNS name to confirm the UI picked up the change.

### Terraform deployment (ECS + ALB)

The repo includes `infra/terraform` which provisions:

- VPC with two public subnets across ap-southeast-2a/b
- Internet-facing Application Load Balancer
- ECS Fargate cluster + service running the cascade container
- CloudWatch log group and IAM execution role

Steps to deploy:

1. Update `infra/terraform/environments/prod/providers.tf` backend block with your S3 bucket/DynamoDB table (or remove for local state).
2. Provide variables via `terraform.tfvars` (example):

```hcl
container_image           = "831926595680.dkr.ecr.ap-southeast-2.amazonaws.com/fyi-cascade:latest"
openai_api_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-2:831926595680:secret:openai-api-key"
vector_store_id           = "vs_68f6372d0fc48191a629f4a6eb0a7806"
certificate_arn           = "" # optional ACM certificate ARN
additional_environment = {
  OPENAI_DOMAIN_KEY = "domain_pk_..."
}
```

3. Deploy:

```bash
cd infra/terraform/environments/prod
terraform init
terraform plan
terraform apply
```

Outputs include the ALB DNS name (`alb_dns_name`) that front-ends the chat UI.

### Local HTTP server

Start an HTTP wrapper around `runCascade`:

```bash
npm run server
```

- `POST http://localhost:3000/cascade` with `{ "question": "What is FYI?" }` returns the router/heavy payload once completed.
- Add `"stream": true` (or set `Accept: text/event-stream`) to receive Server-Sent Events: `interim` is emitted after the router decision and `final` when the heavy agent finishes.
- Health check: `GET /health`.

## How It Works

1. `src/cascade.js` defines `runCascade`, orchestrating two policy-aware calls:
  - **Router** (default `gpt-5-mini` with low reasoning) outputs `{ handoff, answer, reason, confidence, follow_up_needed }` via Structured Outputs and only answers if the request is simple.
- **Heavy agent** (default `gpt-5-mini` with high reasoning) inherits the full FYI prompt (`prompts/template_agent_prompt.md`), gains access to the Help Centre vector store plus scoped web search, and produces the escalated reply when the router sets `handoff: true`. Both calls take advantage of GPT-5 parameters like `text.verbosity` and `reasoning.effort` for predictable tone and latency.
2. Both agents now call FYI’s vector store via the file search tool (router for quick citations, heavy for deep dives). The heavy agent also gains a domain-scoped web search tool restricted to `support.fyi.app` and `fyi.app` for the latest updates.
3. Conversation history is automatically trimmed (defaults: last 4 turns and ~2.4k characters) before being sent to either agent, keeping token counts—and latency—predictable on long chats.
4. `src/prompt.js` loads the FYI support template once so both agents share the same policy foundation.
5. `src/demo.js` is a CLI wrapper that reads `.env.local`, streams answers, keeps short-term history, and displays per-call latency (router, heavy, total) so you can monitor GPT-5 performance during manual testing.
6. When the router decides to escalate, it immediately returns a short acknowledgement (e.g., “Let me check that for you…”) before the heavy agent finishes, giving the user instant feedback while the detailed response is prepared.

Key settings you can tweak quickly:

```js
const HEAVY_MODEL = process.env.HEAVY_MODEL ?? "gpt-5-mini";
const ROUTER_MODEL = HEAVY_MODEL; // router inherits the heavy model automatically
```

- Set `HEAVY_MODEL` for faster or more capable models as your latency budget allows; the router automatically follows the same choice with reduced reasoning effort.
- Set `VECTOR_STORE_ID` to point at a different FYI Help Centre vector store if you run multiple environments.
- Leave `PROMPT_CACHE_ENABLED=true` to reuse the static portions of the router/heavy prompts via `prompt_cache_key` (per the [latest model guide](https://platform.openai.com/docs/guides/latest-model#page-top)); toggle to `false` if you need to disable caching in diagnostics.
- `HEAVY_STREAM=true` enables streaming responses so the heavy GPT‑5 answer starts appearing immediately while the final message is still composing. Combine with `HEAVY_MAX_OUTPUT_TOKENS` if you need to cap response length (leave unset for full answers).

## Performance Tuning

- `runCascade` accepts an optional `config` object so you can override models and latency levers per-call instead of relying solely on environment variables:

```js
await runCascade({
  question: "Why am I not receiving email notifications for Tasks or Comments?",
  config: {
    heavyModel: "gpt-4.1",
    routerReasoning: "low",
    heavyReasoning: "high",
    historyMaxTurns: 3,
    historyMaxChars: 2000,
    heavyVerbosity: "medium",
    heavyStreamingEnabled: true,
    vectorMaxResults: 5,
  },
});
```

- History trimming keeps prompts short by default. Override `HISTORY_MAX_TURNS` / `HISTORY_MAX_CHAR_LENGTH` (env) or `historyMaxTurns` / `historyMaxChars` (per call) when you need deeper context.
- Router answers end users only when its confidence meets `ROUTER_CONFIDENCE_THRESHOLD` (default 0.75). Otherwise it responds with “Just a moment, let me check that for you.” and escalates the original user question to the heavy agent.
- Lower `VECTOR_MAX_RESULTS` (minimum 1) to reduce embedding search latency while still surfacing key articles.
- Swap heavy models to match your latency budget: by default both passes use `gpt-5-mini`, with the router constrained to low reasoning and the heavy follow-up boosted to high reasoning. Step down to a `gpt-4o` variant if GPT-5 access is limited.
- All agent replies are returned as HTML snippets (no Markdown). The UI sanitises them with DOMPurify and applies consistent link styling, so include `<p>`, `<ul>`, `<li>`, and `<a>` tags directly in your responses.
- Enable `HEAVY_STREAM=true` to surface long-form answers incrementally. By default the cascade keeps heavy reasoning effort at `low` and caps output to ~900 tokens; override `HEAVY_REASONING` or `HEAVY_MAX_OUTPUT_TOKENS` if you need longer answers.
- When a GPT‑5 family model is in use, the cascade automatically requests at least `low` reasoning effort so it can leverage tools (file search and scoped web search). Legacy GPT‑4o/4.1 models ignore the setting so you avoid “unsupported parameter” errors.

## Parameter Sweep CLI

`src/parameter_sweep.js` exercises the cascade with multiple parameter sets so you can benchmark speed/quality trade-offs against a fixed question (defaults to FYI's notification article).

```bash
npm run sweep -- --repeat 3 --show-article --show-answer
```

- Provide your own question: `npm run sweep -- --question "How do I publish a workflow?"`.
- Filter scenarios: `npm run sweep -- --only streaming`.
- Supply custom sweeps via JSON: `SWEEP_SCENARIOS='[{"label":"mini->mini","config":{"routerModel":"gpt-4o-mini"}}]' npm run sweep`.

Each scenario prints per-run latency (router/heavy/total), whether it escalated, and example answers so you can compare quality versus the FYI Help Centre article.

## Extending the Pattern

- Plug the cascade into your FYI support UI. The router’s JSON decision makes it easy to track escalations and latency.
- Log heavy-agent outputs (and article citations) so the support team can review how issues were resolved.
- Add more FYI-specific tools (SharePoint status checks, automation triggers, etc.) by extending the heavy agent’s `tools` array.
- Wrap `runCascade` in a serverless function or background job for production use.

## Troubleshooting

- **400 Missing required parameter: 'text.format.name'.** Ensure Structured Output schema sets a `name` and `schema`.
- **Router never escalates:** Relax the router instructions or raise its `temperature` to increase caution.
- **File search not running:** Confirm `VECTOR_STORE_ID` is set and the key has access to the vector store.
- **Slow responses even for simple questions:** Choose an even smaller router model (e.g., `gpt-4o-mini`) or reduce history you pass in.
- **Permission errors:** Verify your API key has access to the selected models.

Feel free to adapt the FYI prompt, routing thresholds, or vector store configuration to match your specific support workflow.


