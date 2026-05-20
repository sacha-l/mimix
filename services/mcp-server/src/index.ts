/**
 * Mimix MCP server — exposes Mimix runs as tools so any MCP client
 * (Claude Code, etc.) can drive a run. "run mimix with default" maps to
 * calling `run_mimix` with no arguments.
 *
 * stdout carries the JSON-RPC stream; all logging goes to stderr.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createRun, prisma } from "@mimix/orchestrator";
import { listLivePersonas } from "@mimix/personas";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MIMIX_ROOT || resolve(__dirname, "../../..");
const DEFAULT_TARGET = "https://demo-target.vercel.app/?test=1";

async function readRun(runId: string): Promise<any | null> {
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    target_dapp: {
      url: run.targetUrl,
      name: run.targetName,
      description: run.targetDescription,
    },
    target_kind: run.targetKind,
    personas: run.personas,
    agents: run.agents,
  };
}

function readFragment(runId: string, persona: string): any | null {
  const p = join(ROOT, "runs", runId, `report-${persona}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

const server = new Server(
  { name: "mimix", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "run_mimix",
      description:
        "Start a Mimix test run: AI personas browse a target app in a real browser, " +
        "complete real tasks, and report UX friction. Call with NO arguments to run the " +
        "default (hosted DemoPay target, all live personas).",
      inputSchema: {
        type: "object" as const,
        properties: {
          target_url: {
            type: "string",
            description: `App URL to test. Default: ${DEFAULT_TARGET}`,
          },
          target_kind: {
            type: "string",
            enum: ["web", "solana"],
            description:
              "'web' for a normal web app, 'solana' for a Solana dApp (adds a funded wallet + onchain leg). Defaults to 'solana' for the bundled demo target, 'web' otherwise.",
          },
          personas: {
            type: "array",
            items: { type: "string" },
            description: "Live persona IDs to run. Default: all live personas.",
          },
          goal: {
            type: "string",
            description: "What you want to learn from the test.",
          },
        },
      },
    },
    {
      name: "get_run_status",
      description: "Check the status of a Mimix run by its run_id.",
      inputSchema: {
        type: "object" as const,
        properties: { run_id: { type: "string" } },
        required: ["run_id"],
      },
    },
    {
      name: "get_report",
      description:
        "Fetch the report (per-persona outcomes + observations) for a Mimix run.",
      inputSchema: {
        type: "object" as const,
        properties: { run_id: { type: "string" } },
        required: ["run_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  if (name === "run_mimix") {
    const targetUrl = (args.target_url as string) || DEFAULT_TARGET;
    const requested = args.personas as string[] | undefined;
    const personas = requested && requested.length ? requested : listLivePersonas();
    const goal = (args.goal as string) || undefined;
    const targetKind =
      args.target_kind === "solana"
        ? "solana"
        : args.target_kind === "web"
          ? "web"
          : args.target_url
            ? "web"
            : "solana";

    // MCP runs are attributed to MCP_OWNER_EMAIL (the operator). Without it
    // there's no User to own the run.
    const ownerEmail = process.env.MCP_OWNER_EMAIL;
    if (!ownerEmail) {
      return {
        content: [{ type: "text", text: "MCP_OWNER_EMAIL is not set — can't attribute the run." }],
        isError: true,
      };
    }
    const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (!owner) {
      return {
        content: [
          {
            type: "text",
            text: `No user found with email ${ownerEmail}. Sign in via the web app first to provision the account.`,
          },
        ],
        isError: true,
      };
    }

    const { runId, accessToken } = await createRun({
      ownerId: owner.id,
      targetUrl,
      targetName: "MCP run",
      targetDescription: "Started via the Mimix MCP server.",
      targetKind,
      personas,
      paymentSignature: "mcp",
      paymentVerified: false,
      goal,
    });

    return {
      content: [
        {
          type: "text",
          text:
            `Started Mimix run ${runId} — ${personas.length} persona(s) ` +
            `(${personas.join(", ")}) against ${targetUrl}. ` +
            `Poll get_run_status with run_id "${runId}". ` +
            `Web URL: ${process.env.MIMIX_PUBLIC_URL || "http://localhost:3000"}/run/${runId}?token=${accessToken}`,
        },
      ],
    };
  }

  if (name === "get_run_status") {
    const runId = args.run_id as string;
    const run = await readRun(runId);
    if (!run) {
      return { content: [{ type: "text", text: `Run ${runId} not found.` }], isError: true };
    }
    return {
      content: [
        { type: "text", text: JSON.stringify({ status: run.status, agents: run.agents }, null, 2) },
      ],
    };
  }

  if (name === "get_report") {
    const runId = args.run_id as string;
    const run = await readRun(runId);
    if (!run) {
      return { content: [{ type: "text", text: `Run ${runId} not found.` }], isError: true };
    }
    const fragments = (run.personas as string[])
      .map((p) => readFragment(runId, p))
      .filter(Boolean);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { status: run.status, target: run.target_dapp, fragments },
            null,
            2,
          ),
        },
      ],
    };
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mimix-mcp] server ready on stdio");
