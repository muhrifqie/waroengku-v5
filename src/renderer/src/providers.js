import { Fingerprint } from "lucide-react";
import litensi from "./assets/providers/litensi.png";
import smsvirtual from "./assets/providers/smsvirtual.png";
import smsbower from "./assets/providers/smsbower.png";
import herosms from "./assets/providers/herosms.png";
import tmail from "./assets/providers/tmail.png";
import generatoremail from "./assets/providers/generatoremail.png";
import twocaptcha from "./assets/providers/2captcha.png";
import capsolver from "./assets/providers/capsolver.png";

// kind: otp = penyedia nomor/email OTP · captcha = solver captcha
export const PROVIDERS = [
  { id: "litensi", name: "Litensi", kind: "otp", logo: litensi,
    endpoint: "https://litensi.id/api",
    fields: [{ key: "apiId", label: "API ID" }, { key: "apiKey", label: "API Key" }] },
  { id: "smsvirtual", name: "SMS Virtual", kind: "otp", logo: smsvirtual,
    endpoint: "https://api.smsvirtual.co",
    fields: [{ key: "apiKey", label: "API Key" }] },
  { id: "smsbower", name: "SMSBower", kind: "otp", logo: smsbower,
    endpoint: "https://smsbower.app/stubs/handler_api.php",
    fields: [{ key: "apiKey", label: "API Key" }] },
  { id: "herosms", name: "HeroSMS", kind: "otp", logo: herosms,
    endpoint: "https://hero-sms.com/api/v1",
    fields: [{ key: "apiKey", label: "API Key" }] },
  { id: "tmail", name: "TMail", kind: "otp", logo: tmail,
    endpoint: "https://yourdomain.com",
    fields: [{ key: "apiKey", label: "API Key" }] },
  { id: "generator", name: "Generator.email", kind: "otp", logo: generatoremail,
    endpoint: "https://generator.email",
    fields: [] },
  { id: "adspower", name: "AdsPower", kind: "browser", icon: Fingerprint,
    endpoint: "http://local.adspower.net:50325",
    fields: [{ key: "apiKey", label: "API Key" }] },
  { id: "twocaptcha", name: "2Captcha", kind: "captcha", logo: twocaptcha,
    endpoint: "https://2captcha.com",
    fields: [{ key: "apiKey", label: "API Key" }] },
  { id: "capsolver", name: "CapSolver", kind: "captcha", logo: capsolver,
    endpoint: "https://api.capsolver.com",
    fields: [{ key: "apiKey", label: "API Key" }] },
];

export const defaultIntegrations = () =>
  Object.fromEntries(
    PROVIDERS.map((p) => [
      p.id,
      { endpoint: p.endpoint, ...Object.fromEntries(p.fields.map((f) => [f.key, ""])) },
    ])
  );
