import { AppError } from "@/domain/errors";
import { devAuthAllowed } from "@/domain/phone";

export type OtpDelivery = {
  channel: "PHONE" | "EMAIL";
  destination: string;
  code: string;
};

export async function deliverOtp(input: OtpDelivery): Promise<void> {
  if (process.env.NODE_ENV === "production" && process.env.OTP_PROVIDER !== "http") {
    throw new AppError("CONFIG", "OTP delivery is not configured.", 500);
  }
  if (process.env.OTP_PROVIDER === "http") {
    const url = process.env.OTP_HTTP_URL;
    if (!url) throw new AppError("CONFIG", "OTP delivery is not configured.", 500);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: input.channel, destination: input.destination, code: input.code }),
    });
    if (!response.ok) throw new AppError("OTP_DELIVERY", "We could not send the code. Try again.", 502);
    return;
  }
  if (!devAuthAllowed()) throw new AppError("CONFIG", "OTP delivery is not configured.", 500);
}
