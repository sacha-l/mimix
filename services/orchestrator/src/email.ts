import nodemailer from "nodemailer";

/**
 * SMTP-backed notifications. Both senders are best-effort: if SMTP env is
 * unset the functions log a warning and return, so local dev and CI runs
 * without mail config still complete normally.
 */

function getTransport(): nodemailer.Transporter | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn("[email] SMTP env not configured — skipping email send");
    return null;
  }
  const port = Number(SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

function fromAddress(): string {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "mimix@localhost";
}

export async function sendRunStartedEmail(input: {
  requesterEmail?: string;
  target: { url: string; name: string };
  personas: string[];
  goal?: string;
  runId: string;
}): Promise<void> {
  const operator = process.env.MIMIX_OPERATOR_EMAIL;
  if (!operator) {
    console.warn("[email] MIMIX_OPERATOR_EMAIL unset — skipping run-started email");
    return;
  }
  const transport = getTransport();
  if (!transport) return;

  const lines = [
    `A new Mimix run just started.`,
    ``,
    `Run ID:    ${input.runId}`,
    `Requester: ${input.requesterEmail || "(anonymous)"}`,
    `Target:    ${input.target.name} — ${input.target.url}`,
    `Personas:  ${input.personas.join(", ")}`,
    `Goal:      ${input.goal || "(none stated)"}`,
  ];
  try {
    await transport.sendMail({
      from: fromAddress(),
      to: operator,
      subject: `Mimix run started — ${input.target.name}`,
      text: lines.join("\n"),
    });
  } catch (err) {
    console.error("[email] run-started send failed:", err);
  }
}

export async function sendReportReadyEmail(input: {
  requesterEmail?: string;
  runId: string;
  target: { url: string; name: string };
}): Promise<void> {
  if (!input.requesterEmail) {
    console.warn("[email] no requester email — skipping report-ready email");
    return;
  }
  const transport = getTransport();
  if (!transport) return;

  const base = process.env.MIMIX_PUBLIC_URL || "http://localhost:3000";
  const reportUrl = `${base.replace(/\/$/, "")}/report/${input.runId}`;
  const lines = [
    `Your Mimix report is ready.`,
    ``,
    `Target: ${input.target.name} — ${input.target.url}`,
    `View the full report:`,
    reportUrl,
    ``,
    `— Mimix`,
  ];
  try {
    await transport.sendMail({
      from: fromAddress(),
      to: input.requesterEmail,
      subject: `Your Mimix report is ready — ${input.target.name}`,
      text: lines.join("\n"),
    });
  } catch (err) {
    console.error("[email] report-ready send failed:", err);
  }
}
