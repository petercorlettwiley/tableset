const isDev = process.env.NODE_ENV !== "production";

export async function sendSms(to: string, body: string): Promise<void> {
  if (isDev) {
    console.log(`[SMS stub] To: ${to}\n${body}`);
    return;
  }
  const twilio = (await import("twilio")).default;
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );
  await client.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to,
  });
}
