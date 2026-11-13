// Optional real-stack browser QA with a temporary account and explicit Playwright installation.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL(process.env.BURNOUTSENSE_PLAYWRIGHT_MODULE).href);
const base = process.env.BURNOUTSENSE_E2E_BASE_URL;
const apiBase = process.env.BURNOUTSENSE_E2E_API_URL || "http://localhost:3001";
const output = process.env.BURNOUTSENSE_E2E_OUTPUT;
const example = JSON.parse(process.env.BURNOUTSENSE_E2E_CONTEXT);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
const page = await context.newPage();
const exceptions = [];
page.on("pageerror", error => exceptions.push(error.message));
const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); }
async function api(route) {
  return page.evaluate(async ({ route, apiBase }) => {
    const result = await fetch(apiBase + route, { headers: { Authorization: "Bearer " + localStorage.getItem("burnoutsense.auth.accessToken") } });
    if (!result.ok) throw new Error("QA API status " + result.status);
    return result.json();
  }, { route, apiBase });
}
async function fit(name) { check(name, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
async function fillVisible(fields, values, prefix = "ctx") {
  for (const field of fields) {
    const elements = page.locator('[name="' + prefix + '-' + field.identifier + '"]');
    if (!await elements.count()) continue;
    const value = values[field.identifier];
    const tag = await elements.first().evaluate(node => node.tagName);
    const selected = value === "Não se aplica" ? "na" : String(field.choices.indexOf(value));
    if (tag === "SELECT") await elements.selectOption(selected);
    else if (await elements.first().getAttribute("type") === "radio") await page.locator('[name="' + prefix + '-' + field.identifier + '"][value="' + selected + '"]').check();
    else await elements.fill(String(value));
  }
}
try {
  await page.goto(base + "/login");
  await page.locator("#email").fill(process.env.BURNOUTSENSE_E2E_EMAIL);
  await page.locator("#password").fill(process.env.BURNOUTSENSE_E2E_PASSWORD);
  await page.getByRole("button", { name: "Mostrar senha", exact: true }).click();
  check("login_password_can_be_revealed", await page.locator("#password").getAttribute("type") === "text");
  await page.getByRole("button", { name: "Ocultar senha", exact: true }).click();
  check("login_password_can_be_hidden_again", await page.locator("#password").getAttribute("type") === "password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("heading", { name: "Sua primeira avaliação" }).waitFor();
  check("empty_dashboard_without_fabricated_index", true);
  check("guidance_sections_visible_and_locked_before_first_record", await page.getByText("Disponível após salvar sua primeira avaliação.", { exact: true }).count() === 2);
  const schema = await api("/esbeu-assessments/form");
  await page.goto(base + "/registro");
  await page.waitForURL("**/contexto");
  await page.locator('[name="ctx-semester"]').waitFor();
  const completeScales = {
    sleep_quality: ["Muito ruim", "Ruim", "Regular", "Boa", "Muito boa"],
    personal_support: ["Nenhum apoio", "Pouco apoio", "Apoio moderado", "Bastante apoio", "Muito apoio"],
    academic_support: ["Nenhum apoio", "Pouco apoio", "Apoio moderado", "Bastante apoio", "Muito apoio"]
  };
  const verifiedScales = new Set();
  for (let step = 0; step < 5; step++) {
    for (const [id, labels] of Object.entries(completeScales)) {
      const field = page.locator(`#ctx-${id}`);
      if (!await field.count()) continue;
      assert.deepEqual(await field.locator("label span").allTextContents(), labels);
      assert.deepEqual(await field.getByRole("radio").evaluateAll(options => options.map(option => option.value)), ["0", "1", "2", "3", "4"]);
      verifiedScales.add(id);
    }
    await fillVisible(schema.fields, example);
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
  }
  check("sleep_and_support_scales_have_labels_and_preserve_values", verifiedScales.size === Object.keys(completeScales).length);
  await page.getByRole("heading", { name: "Tudo pronto para calcular?" }).waitFor();
  check("guided_initial_context_reaches_review", true);
  await page.getByRole("button", { name: "Ver meu primeiro índice", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Confirme que revisou" }).waitFor();
  for (const name of ["Confirmo que tenho 18 anos ou mais.", "Confirmo que estou matriculado(a) em um curso de graduação.", "Li e concordo com o uso das minhas respostas para meu acompanhamento.", "Revisei minhas respostas e confirmo que representam minha rotina recente."]) await page.getByRole("checkbox", { name, exact: true }).check();
  await page.getByRole("button", { name: "Ver meu primeiro índice", exact: true }).click();
  await page.getByText("Seu primeiro índice está pronto.", { exact: true }).waitFor();
  const initial = await api("/esbeu-assessments/current");
  check("first_index_immediate_with_complete_canonical_context", Object.keys(initial.assessment.context).length === 22 && initial.canReuseConsent);
  check("sidebar_displays_normalized_index", Number(await page.getByRole("meter", { name: "Índice de acompanhamento" }).getAttribute("aria-valuenow")) === initial.assessment.estimatedOverall * 25);
  await page.getByRole("link", { name: "Ver meu acompanhamento", exact: true }).click();
  await page.getByRole("heading", { name: "Calendário de check-ins", exact: true }).waitFor();
  const chart = page.getByRole("region", { name: "Evolução do acompanhamento", exact: true });
  await chart.getByRole("button", { name: "Diário", exact: true }).click();
  await chart.getByText("Só há índice calculado em um dia.").waitFor();
  check("single_index_is_plotted_on_its_calculation_day", await chart.locator(".index-chart-value").isVisible()
    && await chart.locator(".index-chart-point").count() === 1
    && await chart.locator(".index-chart-tick").count() === 7
    && await chart.locator(".index-chart-line").count() === 0);
  const routine = page.getByRole("region", { name: "Sua rotina recente", exact: true });
  await routine.getByRole("link", { name: "Revisar minha rotina", exact: true }).waitFor();
  check("routine_review_is_optional_before_the_weekly_suggestion", (await api("/esbeu-assessments/review-topics")).suggested === null
    && await page.getByRole("complementary", { name: "Sugestão de revisão da rotina" }).count() === 0);
  await routine.getByRole("link", { name: "Revisar minha rotina", exact: true }).click();
  await page.waitForURL("**/contexto?revisao=escolher");
  await page.goto(base + "/registro");
  await page.getByRole("heading", { name: "Como foi seu dia?", exact: true }).waitFor();
  await page.getByRole("radio", { name: "Triste", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "check-in-etapa-1.png"), style: "nextjs-portal { display: none }" });
  check("new_day_has_no_mocked_answers", await page.locator('input[type="radio"]:checked').count() === 0 && await page.locator("#daily-sleep").inputValue() === "");
  await page.getByRole("radio", { name: "Triste", exact: true }).check();
  await page.locator("#daily-sleep").fill("7.5");
  await page.locator('[name="sleep_quality"][value="3"]').check();
  await page.getByRole("button", { name: "Ontem", exact: true }).click();
  await page.getByRole("dialog", { name: "Trocar o dia do check-in?" }).waitFor();
  await page.getByRole("button", { name: "Continuar preenchendo", exact: true }).click();
  check("date_switch_keeps_unsaved_answers_when_cancelled", await page.locator("#daily-sleep").inputValue() === "7.5" && await page.getByRole("radio", { name: "Triste", exact: true }).isChecked());
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  for (const [key, value] of Object.entries({ assessment_pressure: 3, study_rest_difficulty: 3, personal_support: 1 })) await page.locator(`[name="${key}"][value="${value}"]`).check();
  await page.locator("#daily-note").fill("Registro fictício para verificação.");
  await fit("daily_desktop_no_overflow");
  await page.screenshot({ path: path.join(output, "daily-desktop.png"), fullPage: true });
  const saveEndpoint = /\/daily-check-ins$/;
  await page.route(saveEndpoint, route => route.request().method() === "PUT"
    ? route.fulfill({ status: 503, headers: { "access-control-allow-origin": new URL(base).origin }, json: { message: "Falha simulada" } })
    : route.continue());
  await page.getByRole("button", { name: "Salvar meu dia", exact: true }).click();
  await page.getByText("Não foi possível confirmar o check-in.", { exact: false }).waitFor();
  check("failed_check_in_save_preserves_route_and_draft", new URL(page.url()).pathname === "/registro" && (await page.locator("#daily-note").inputValue()).startsWith("Registro fictício"));
  await page.unroute(saveEndpoint);
  await page.getByRole("button", { name: "Salvar meu dia", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.getByText("Check-in salvo", { exact: true }).waitFor();
  await page.locator(".tracking-today").getByText("Feito", { exact: true }).waitFor();
  check("saved_check_in_returns_to_dashboard_with_feedback", true);
  const firstDay = await api("/daily-check-ins/overview");
  await page.locator("main").getByRole("link", { name: "Novo registro", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.locator('[name="assessment_pressure"][value="4"]').check();
  const update = page.waitForResponse(response => response.url().endsWith("/daily-check-ins") && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Atualizar esse dia", exact: true }).click();
  assert.ok((await update).ok());
  await page.waitForURL("**/dashboard");
  const updatedDay = await api("/daily-check-ins/overview");
  const afterDaily = await api("/esbeu-assessments/current");
  check("same_day_updates_one_record_and_recalculates_real_context", updatedDay.completedDays === 1 && firstDay.todayCheckIn.id === updatedDay.todayCheckIn.id && afterDaily.assessment.id !== initial.assessment.id && afterDaily.assessment.context.assessment_pressure === 4 && afterDaily.assessment.source === "daily_experimental");
  await page.locator("main").getByRole("link", { name: "Novo registro", exact: true }).click();
  await page.locator("#check-in-date").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.keyboard.press("Escape");
  check("mobile_navigation_opens_and_closes", true);
  await fit("daily_mobile_no_overflow");
  await page.screenshot({ path: path.join(output, "daily-mobile.png"), fullPage: true });
  const yesterday = new Date(updatedDay.today + "T00:00:00Z"); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  await page.locator("#check-in-date").click();
  const calendar = page.getByRole("dialog", { name: "Selecionar data" });
  await calendar.getByRole("grid").waitFor();
  check("calendar_fits_small_mobile", await calendar.evaluate(element => element.scrollWidth <= element.clientWidth));
  const month = calendar.getByRole("button", { name: "Mês", exact: true });
  const initialMonth = await month.innerText();
  await calendar.getByRole("button", { name: "Mês anterior" }).click();
  check("calendar_can_navigate_to_previous_month", await month.innerText() !== initialMonth);
  await calendar.getByRole("button", { name: "Próximo mês" }).click();
  await page.screenshot({ path: path.join(output, "check-in-calendar-dark.png") });
  const selectedDay = calendar.locator(`[data-day="${updatedDay.today}"] button`);
  await selectedDay.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await calendar.waitFor({ state: "hidden" });
  check("calendar_selects_retroactive_day_with_keyboard", await page.locator("#check-in-date").getAttribute("data-date") === yesterday.toISOString().slice(0, 10));
  await page.evaluate(() => document.documentElement.dataset.theme = "");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await page.getByRole("button", { name: "Ontem", exact: true }).click();
  check("yesterday_shortcut_selects_local_calendar_day", await page.locator("#check-in-date").getAttribute("data-date") === yesterday.toISOString().slice(0, 10));
  await page.getByRole("radio", { name: "Calmo", exact: true }).check();
  await page.locator("#daily-sleep").fill("8");
  await page.locator('[name="sleep_quality"][value="4"]').check();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  for (const [key, value] of Object.entries({ assessment_pressure: 0, study_rest_difficulty: 0, personal_support: 4 })) await page.locator(`[name="${key}"][value="${value}"]`).check();
  await page.getByRole("button", { name: "Salvar meu dia", exact: true }).click();
  await page.waitForURL("**/dashboard");
  const retro = await api("/daily-check-ins/overview");
  check("forgotten_day_saved_without_overwriting_today", retro.today === updatedDay.today && retro.completedDays === 2 && retro.todayCheckIn.id === firstDay.todayCheckIn.id);
  const beforeReview = await api("/esbeu-assessments/current");
  check("daily_index_provenance_is_preserved", beforeReview.assessment.source === "daily_experimental" && beforeReview.assessment.evolution.recordedDays === 2);
  await chart.getByRole("button", { name: "Diário", exact: true }).click();
  await chart.locator(`.index-chart-checkin[data-date="${retro.today}"]`).waitFor();
  await chart.locator(`.index-chart-checkin[data-date="${yesterday.toISOString().slice(0, 10)}"]`).waitFor();
  await chart.getByRole("button", { name: "Período anterior" }).click();
  await chart.getByText("Check-in registrado. Sem índice calculado nesta data.").waitFor();
  check("retroactive_check_in_has_its_own_marker_without_a_backdated_score", await chart.locator(".index-chart-checkin").count() === 2
    && await chart.locator(".index-chart-point").count() === 1
    && await chart.locator(".index-chart-value").count() === 0);
  await chart.getByRole("button", { name: "Próximo período" }).click();
  await page.screenshot({ path: path.join(output, "dashboard-experimental-mobile.png"), fullPage: true });
  await page.goto(base + "/historico/" + beforeReview.assessment.id);
  const result = page.getByRole("region", { name: "Indicadores do seu registro" });
  await result.getByText("2 dias usados no cálculo", { exact: true }).waitFor();
  check("daily_result_omits_test_badge", await result.getByText("Atualização em teste", { exact: true }).count() === 0);
  await page.goto(base + "/registro");
  await page.getByRole("link", { name: "Minha rotina mudou", exact: true }).click();
  await page.getByRole("link", { name: "Revisão completa", exact: true }).click();
  await page.getByRole("heading", { name: "Tudo pronto para calcular?" }).waitFor();
  check("valid_consent_not_repeated_on_review", await page.getByRole("checkbox", { name: "Confirmo que tenho 18 anos ou mais.", exact: true }).count() === 0 && await page.getByRole("checkbox", { name: "Revisei minhas respostas e confirmo que representam minha rotina recente.", exact: true }).count() === 1);
  await page.getByRole("button", { name: "Revisar respostas", exact: true }).nth(1).click();
  const sleep = page.locator('[name="ctx-sleep_hours"]');
  check("review_prefills_actual_saved_context", await sleep.inputValue() === String(beforeReview.assessment.context.sleep_hours));
  await sleep.fill("6.5");
  await page.getByRole("button", { name: "Voltar ao resumo", exact: true }).click();
  await page.getByRole("checkbox", { name: "Revisei minhas respostas e confirmo que representam minha rotina recente.", exact: true }).check();
  await page.getByText("Questionário complementar opcional", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Quero responder às perguntas complementares.", exact: true }).check();
  const optional = Object.fromEntries(schema.fields.filter(field => field.group === "esbeu").map(field => [field.identifier, 2]));
  await fillVisible(schema.fields.filter(field => field.group === "esbeu"), optional, "item");
  await fit("context_mobile_no_overflow");
  await page.screenshot({ path: path.join(output, "context-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Atualizar meu índice", exact: true }).click();
  await page.getByText("Sua rotina foi atualizada e seu índice foi recalculado.", { exact: true }).waitFor();
  const revised = await api("/esbeu-assessments/current");
  check("review_new_index_preserves_original_consent", revised.assessment.id !== initial.assessment.id && revised.assessment.consentAcceptedAt === initial.assessment.consentAcceptedAt && revised.assessment.context.sleep_hours === 6.5 && revised.assessment.observedOverall === 2);
  await page.getByRole("link", { name: "Ver meu acompanhamento", exact: true }).click();
  await page.getByRole("heading", { name: "Evolução do acompanhamento", exact: true }).waitFor();
  check("guidance_sections_unlock_after_first_record", await page.getByText("Disponível após salvar sua primeira avaliação.", { exact: true }).count() === 0);
  await page.getByText("2 dias acompanhados", { exact: true }).waitFor();
  check("dashboard_calendar_marks_only_real_check_ins", await page.locator(".tracking-days li").count() === 28 && await page.locator('.tracking-days li[data-recorded="true"]').count() === 2);
  check("calendar_days_open_the_corresponding_check_in", await page.locator(".tracking-days li a").evaluateAll(links => links.every(link => new URL(link.href).searchParams.get("date") === link.querySelector("time").dateTime)));
  check("dashboard_days_have_visible_dates", await page.locator(".tracking-days time").count() === 28 && /^\d{2}\/\d{2}$/.test(await page.locator(".tracking-days time").first().innerText()));
  check("dashboard_has_one_header_action_and_no_help_link", await page.locator("main .dashboard-heading").getByRole("link", { name: "Novo registro" }).count() === 1 && await page.locator('main a[href="/como-funciona"]').count() === 0);
  check("feedback_boxes_are_separate_and_unfabricated", await page.locator(".dashboard-feedback > section").count() === 2);
  check("research_details_absent_from_student_dashboard", !/ESB-eu|MAE|RMSE|metodologia/i.test(await page.locator("main").innerText()));
  await fit("dashboard_mobile_no_overflow");
  await page.screenshot({ path: path.join(output, "dashboard-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fit("dashboard_desktop_no_overflow");
  const meter = page.locator(".sidebar:not(.mobile-sidebar) .sidebar-index-meter");
  await meter.locator("strong").waitFor();
  check("sidebar_index_uses_yellow_in_the_middle_band", await meter.getAttribute("data-band") === "yellow");
  const ring = meter.locator(".sidebar-index-fill");
  check("sidebar_ring_transitions_to_the_current_percentage", await ring.evaluate(element => {
    const meter = element.closest('[role="meter"]');
    return getComputedStyle(element).transitionProperty.includes("stroke-dashoffset")
      && Math.abs(Number(meter.style.getPropertyValue("--index-offset")) + Number(meter.getAttribute("aria-valuenow")) - 100) < 0.01;
  }));
  check("only_sidebar_ring_animates", await meter.locator("strong").evaluate(element => getComputedStyle(element).animationName === "none"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  check("sidebar_ring_respects_reduced_motion", await ring.evaluate(element => getComputedStyle(element).transitionDuration === "0s"));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await meter.screenshot({ path: path.join(output, "sidebar-index-meter.png") });
  await page.screenshot({ path: path.join(output, "dashboard-desktop.png"), fullPage: true });
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  await page.screenshot({ path: path.join(output, "dashboard-dark.png"), fullPage: true });
  await page.goto(base + "/historico");
  const calmMood = page.locator(".daily-history-mood").filter({ hasText: "Calmo" }).first();
  await calmMood.waitFor();
  check("daily_history_reuses_the_checkin_mood_icon", await calmMood.locator("svg.lucide-waves").isVisible());
  check("daily_history_actions_have_labeled_icons", await page.getByRole("link", { name: "Editar dia", exact: true }).first().locator("svg.lucide-pencil").isVisible()
    && await page.getByRole("button", { name: /^Excluir check-in de/ }).first().locator("svg.lucide-trash-2").isVisible());
  await page.locator(".daily-history-list").screenshot({ path: path.join(output, "historico-check-ins.png") });
  const beforeDelete = (await api("/esbeu-assessments")).items;
  const linkedIds = beforeDelete.filter(row => row.triggerCheckIn).map(row => row.id);
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: /^Excluir check-in de/ }).first().click();
    const removed = page.waitForResponse(response => response.url().includes("/daily-check-ins/") && response.request().method() === "DELETE");
    await page.getByRole("button", { name: "Confirmar exclusão", exact: true }).click();
    assert.ok((await removed).ok());
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  await page.getByRole("heading", { name: "Seu primeiro check-in está esperando por você", exact: true }).waitFor();
  const remainingIndices = (await api("/esbeu-assessments")).items;
  check("daily_delete_removes_linked_results_and_preserves_manual_context", remainingIndices.every(row => !linkedIds.includes(row.id)) && remainingIndices.some(row => row.id === revised.assessment.id));
  await page.getByRole("tab", { name: "Check-ins diários", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  check("history_tabs_work_from_the_keyboard", await page.getByRole("tab", { name: "Índices e rotina", exact: true }).getAttribute("aria-selected") === "true");
  await page.getByRole("link", { name: "Ver avaliação", exact: true }).first().waitFor();
  check("separate_index_history", await page.getByRole("link", { name: "Ver avaliação", exact: true }).count() === remainingIndices.length);
  await page.goto(base + "/perfil");
  await page.locator("#course").fill("Curso fictício de verificação");
  await page.locator("#semester").selectOption("4");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await page.getByText("Perfil atualizado com sucesso.", { exact: true }).waitFor();
  const profile = await api("/users/me");
  check("typed_profile_contract_still_saves", profile.course === "Curso fictício de verificação" && profile.semester === "4º Semestre");
  await page.getByRole("tab", { name: "Preferências", exact: true }).click();
  await page.getByRole("button", { name: /Escuro/ }).click();
  check("theme_draft_does_not_apply_before_save", await page.evaluate(() => document.documentElement.dataset.theme !== "dark"));
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  check("typed_theme_applies_after_save", true);
  await page.setViewportSize({ width: 390, height: 844 });
  await fit("profile_dark_mobile_no_overflow");
  await page.screenshot({ path: path.join(output, "profile-typescript-mobile.png"), fullPage: true });
  check("no_browser_exceptions", exceptions.length === 0);
  await fs.writeFile(path.join(output, "browser.aggregate.json"), JSON.stringify({ passed: true, checks, synthetic_inputs_only: true }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: checks.length }));
} catch (error) {
  await page.screenshot({ path: path.join(output, "browser-failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
