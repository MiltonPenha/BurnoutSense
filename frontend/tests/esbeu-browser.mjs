// Optional browser QA against the isolated stack started by verify-esbeu-e2e.py.
// Playwright is loaded from an explicit local installation, not a production dependency.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.BURNOUTSENSE_PLAYWRIGHT_MODULE).href);
const base = process.env.BURNOUTSENSE_E2E_BASE_URL;
const output = process.env.BURNOUTSENSE_E2E_OUTPUT;
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-background-networking"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route("**/*", (route) => {
  const hostname = new URL(route.request().url()).hostname;
  return ["127.0.0.1", "localhost"].includes(hostname) ? route.continue() : route.abort();
});
const page = await context.newPage();
const exceptions = [];
page.on("pageerror", (error) => exceptions.push(error.message));
const checks = [];

async function check(name, condition) { assert.ok(condition, name); checks.push(name); }

async function fillContext() {
  const fields = page.locator('[name^="ctx-"]');
  assert.equal(await fields.count(), 22);
  for (const element of await fields.all()) {
    const tag = await element.evaluate((node) => node.tagName);
    const name = await element.getAttribute("name");
    if (tag === "SELECT") await element.selectOption(name === "ctx-study_work_difficulty" ? "na" : "0");
    else await element.fill(name === "ctx-sleep_hours" ? "7.5" : name === "ctx-semester" ? "4" : name === "ctx-subject_count" ? "5" : "0");
  }
}

async function consent() {
  for (const name of ["adult", "enrolled", "consent"]) await page.locator(`[name="${name}"]`).check();
}

try {
  await page.goto(base + "/login");
  await page.locator("#email").fill(process.env.BURNOUTSENSE_E2E_EMAIL);
  await page.locator("#password").fill(process.env.BURNOUTSENSE_E2E_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("heading", { name: "Dashboard ESB-eu", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Seu acompanhamento começa aqui" }).waitFor();
  await check("authenticated_empty_dashboard", true);
  await page.goto(base + "/registro");
  await page.locator("#ctx-semester").waitFor();
  await fillContext();
  await check("consent_required_in_browser", !(await page.locator("form").evaluate((form) => form.checkValidity())));
  await consent();
  await page.getByRole("button", { name: "Calcular e salvar avaliação", exact: true }).click();
  await page.getByText("Avaliação salva na sua conta.", { exact: true }).waitFor();
  await check("context_only_result_distinguishes_missing_observed", await page.getByText("Não respondida", { exact: true }).count() === 1);
  await page.getByRole("link", { name: "Ver avaliação salva", exact: true }).click();
  await page.getByRole("heading", { name: "Respostas contextuais enviadas", exact: true }).waitFor();
  await page.getByRole("button", { name: "Excluir avaliação", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar exclusão", exact: true }).click();
  await page.getByRole("heading", { name: "Nenhuma avaliação ESB-eu", exact: true }).waitFor();
  await check("owner_can_delete_from_ui", true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/registro");
  await page.locator("#ctx-semester").waitFor();
  await fillContext();
  await consent();
  await page.getByRole("checkbox", { name: "Quero responder aos 14 itens da ESB-eu.", exact: true }).check();
  for (const element of await page.locator('[name^="item-"]').all()) await element.selectOption("2");
  await check("all_fourteen_items_rendered", await page.locator('[name^="item-"]').count() === 14);
  await check("mobile_no_horizontal_overflow", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: path.join(output, "form-mobile.png") });
  await page.getByRole("button", { name: "Calcular e salvar avaliação", exact: true }).click();
  await page.getByText("Avaliação salva na sua conta.", { exact: true }).waitFor();
  await check("observed_dimensions_rendered", await page.getByText("Desgaste emocional e físico", { exact: true }).count() === 1);
  await page.getByRole("link", { name: "Ir ao dashboard", exact: true }).click();
  await page.getByRole("heading", { name: "Última avaliação", exact: true }).waitFor();
  await page.getByRole("table").first().waitFor();
  await check("mobile_dashboard_no_horizontal_overflow", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: path.join(output, "dashboard-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(output, "dashboard-desktop.png"), fullPage: true });
  await page.goto(base + "/historico");
  await page.getByRole("link", { name: "Ver avaliação", exact: true }).first().waitFor();
  await check("history_shows_persisted_record", true);
  await check("no_browser_exceptions", exceptions.length === 0);
  await fs.writeFile(path.join(output, "browser.aggregate.json"), JSON.stringify({ passed: true, checks, synthetic_inputs_only: true }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: checks.length }));
} catch (error) {
  await page.screenshot({ path: path.join(output, "browser-failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
