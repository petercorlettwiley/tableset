const isDev = process.env.NODE_ENV !== "production";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[];
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  if (isDev) {
    console.log(`[Email stub] To: ${opts.to} | Subject: ${opts.subject}`);
    return;
  }
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY!);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
