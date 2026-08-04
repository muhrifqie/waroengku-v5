import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const rnd = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const humanSleep = (base, varMs) => sleep(base + Math.random() * (varMs || base * 0.5));

let NAMES = null;
function loadNames() {
  if (NAMES) return NAMES;
  const find = (n) => [
    path.join(__dirname, "../../resources/data", n),
    path.join(process.resourcesPath || "", "data", n),
    path.join(__dirname, "../../../resources/data", n),
  ].find((p) => fs.existsSync(p));
  const read = (n) => {
    const f = find(n);
    return f ? fs.readFileSync(f, "utf-8").split("\n").map((x) => x.trim()).filter(Boolean) : ["Alex", "Jordan"];
  };
  NAMES = { first: read("firstname.txt"), last: read("lastname.txt") };
  return NAMES;
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function generateUaid() { return crypto.randomBytes(16).toString("hex"); }
function getSignupUrl() {
  return `https://signup.live.com/signup?cobrandid=ab0455a0-8d03-46b9-b18b-df2f57b9e44c&id=292841&contextid=O222&opid=O222&bk=1737029337&uiflavor=web&uaid=${generateUaid()}&mkt=EN-US&lc=1033&lic=1&aadredir=1`;
}
function generateUsername() {
  const n = loadNames();
  return (pick(n.first) + pick(n.last)).toLowerCase().replace(/[^a-z]/g, "") + Math.floor(10 + Math.random() * 90);
}
function generateDOB() {
  const y = new Date().getFullYear() - Math.floor(20 + Math.random() * 16);
  const m = Math.floor(1 + Math.random() * 12);
  return { year: y, month: m, day: Math.floor(1 + Math.random() * 19) };
}
function generatePassword() {
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ", L = "abcdefghjkmnpqrstuvwxyz", D = "23456789", S = "@#$!&";
  const p = (s) => s[Math.floor(Math.random() * s.length)];
  let out = p(U);
  for (let i = 0; i < 5; i++) out += p(L);
  out += p(D) + p(S);
  for (let i = 0; i < 4; i++) out += p(L);
  return out + p(D);
}

async function mouseTo(page, x, y) {
  await page.mouse.move(rnd(100, 900), rnd(100, 500));
  await humanSleep(50, 100);
  await page.mouse.move(x, y, { steps: 15 + Math.floor(Math.random() * 25) });
  await humanSleep(100, 200);
}
async function humanType(page, text) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    let d = 40 + Math.random() * 140;
    if (Math.random() < 0.08) d += 300 + Math.random() * 600;
    if (ch === " " || ch === "@" || ch === ".") d += 100 + Math.random() * 300;
    await sleep(d);
  }
}
async function clickNext(page) {
  await humanSleep(800, 1500);
  for (const sel of ['button[data-testid="primaryButton"]', "input#iSignupAction", "button#iSignupAction", 'button[type="submit"]']) {
    const el = await page.$(sel);
    const box = el && (await el.boundingBox());
    if (box) {
      await mouseTo(page, box.x + box.width / 2 + rnd(-4, 4), box.y + box.height / 2 + rnd(-2, 2));
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await humanSleep(3000, 2000);
      return;
    }
  }
  throw new Error("Next button not found");
}
async function waitType(page, selectors, value) {
  const sel = selectors.join(", ");
  await page.waitForSelector(sel, { timeout: 15000 });
  await humanSleep(400, 800);
  let box = null;
  for (const s of selectors) { const el = await page.$(s); if (el) { box = await el.boundingBox(); if (box) break; } }
  if (!box) throw new Error(`Input not found: ${sel}`);
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await mouseTo(page, cx + rnd(-5, 5), cy);
  await page.mouse.click(cx, cy);
  await humanSleep(200, 400);
  await page.mouse.click(cx, cy, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await humanSleep(200, 400);
  await humanType(page, value);
  await humanSleep(300, 600);
}
async function selectDropdown(page, id, optionText) {
  await page.waitForSelector(`#${id}`, { timeout: 10000 });
  const dd = await page.$(`#${id}`);
  const b = await dd.boundingBox();
  await mouseTo(page, b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await humanSleep(800, 1200);
  await page.waitForSelector('[role="option"]', { timeout: 5000 });
  for (const opt of await page.$$('[role="option"]')) {
    const t = (await opt.evaluate((el) => el.textContent)).trim();
    if (t === optionText) { const ob = await opt.boundingBox(); if (ob) { await page.mouse.click(ob.x + ob.width / 2, ob.y + ob.height / 2); await humanSleep(400, 600); return; } }
  }
  throw new Error(`Dropdown option "${optionText}" not found`);
}

async function detectCaptcha(page) {
  return page.evaluate(() => {
    const t = document.body?.innerText || "";
    return t.includes("Press and hold") || t.includes("prove you") || t.includes("Accessible challenge") ||
      !!document.querySelector("#enforcementContainer") || !!document.querySelector('[data-theme="enforcement"]');
  }).catch(() => false);
}
async function waitCaptchaManual(page, log) {
  log("Captcha detected — selesaikan manual di browser (maks 5 menit)", "captcha");
  const end = Date.now() + 5 * 60 * 1000;
  while (Date.now() < end) {
    await sleep(1500);
    if (page.isClosed()) return false;
    let url = ""; try { url = page.url(); } catch { return false; }
    if (url.includes("account.microsoft.com") || url.includes("account.live.com") || url.includes("login.live.com/ppsecure")) return true;
    let still = false;
    try {
      still = await page.evaluate(() => {
        const t = (document.body?.innerText || "").toLowerCase();
        return t.includes("press and hold") || t.includes("press again") || t.includes("prove you") || t.includes("please try again");
      });
    } catch { return true; }
    if (!still) return true;
  }
  return false;
}
async function waitResult(page, log) {
  const end = Date.now() + 180000;
  const OK = ["Your account is ready", "account has been created", "You're all set", "All done", "Welcome to Microsoft"];
  const BLOCKED = ["has been blocked", "unusual activity"];
  while (Date.now() < end) {
    await sleep(1000);
    if (page.isClosed()) return "Browser closed";
    let url = ""; try { url = page.url(); } catch { return "Browser closed"; }
    if (url.includes("account.microsoft.com")) return "success";
    if (url.includes("blocked")) return "blocked";
    if (url.includes("error.aspx") || url.includes("errcode=")) return `Microsoft error (${url.match(/errcode=(\d+)/)?.[1] || "?"})`;
    const body = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (OK.some((k) => body.includes(k))) return "success";
    if (BLOCKED.some((k) => body.includes(k))) return "blocked";
  }
  return "Timeout";
}

export async function createOutlookAccount(page, cfg, log) {
  const username = generateUsername();
  const password = cfg.password || generatePassword();
  const first = pick(loadNames().first), last = pick(loadNames().last);
  const dob = generateDOB();
  const email = `${username}@outlook.com`;

  await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
  await humanSleep(500, 500);
  log(`Opening signup for ${email}`, "step");
  await page.goto(getSignupUrl(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await humanSleep(3000, 3000);
  await page.mouse.move(rnd(200, 600), rnd(200, 500), { steps: 20 });

  log(`Email → ${email}`);
  await waitType(page, ["input#floatingLabelInput5", "input#MemberName", 'input[name="MemberName"]', 'input[type="email"]'], username);
  await clickNext(page);

  log("Password");
  await waitType(page, ['input[type="password"]', "input#floatingLabelInput18", "input#PasswordInput"], password);
  await clickNext(page);

  log(`DOB → ${dob.day} ${MONTHS[dob.month]} ${dob.year}`);
  await selectDropdown(page, "BirthMonthDropdown", MONTHS[dob.month]);
  await selectDropdown(page, "BirthDayDropdown", String(dob.day));
  await waitType(page, ["input#floatingLabelInput29", "input#BirthYear", 'input[name="BirthYear"]'], String(dob.year));
  await clickNext(page);

  log(`Name → ${first} ${last}`);
  await waitType(page, ["input#firstNameInput", 'input[name="firstNameInput"]'], first);
  await waitType(page, ["input#lastNameInput", 'input[name="lastNameInput"]'], last);
  await clickNext(page);

  await humanSleep(3000, 2000);
  if (await detectCaptcha(page)) {
    const ok = await waitCaptchaManual(page, log);
    if (!ok) return { success: false, email, error: "Captcha timeout" };
  }

  log("Waiting for result");
  const res = await waitResult(page, log);
  if (res === "success") return { success: true, email, password, first, last, dob: `${dob.day}/${dob.month}/${dob.year}` };
  return { success: false, email, error: res };
}
