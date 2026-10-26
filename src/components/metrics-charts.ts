import type { Expense, Metrics } from "../models";

type Money = (value: number) => string;
type Point = { date: string; value: number };
export type WeekSeries = { label: string; color: string; points: Array<Point | null>; total: number };
export type TreemapTile = { name: string; value: number; x: number; y: number; width: number; height: number };

const DAY = 86_400_000;
const weekColors = ["#d31770", "#2276bb", "#639a21", "#c57919", "#8154b4", "#168b80"];
const tileColors = ["#d9efb7", "#fbd5e6", "#d4e8fa", "#f8e4bc", "#e6dbf7", "#cdece7", "#f5d9cc", "#e2e7ba"];
const paymentColors: Record<string, string> = { cash: "#7dbd25", nequi: "#995ed1", bancolombia: "#277fbe", credit_card: "#e6a22c", other: "#d45b84" };
const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);
const dateTime = (date: string) => Date.parse(`${date}T12:00:00Z`);
const compactMoney = (value: number) => `$ ${new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
const monthFormat = new Intl.DateTimeFormat("es-CO", { month: "short", timeZone: "UTC" });

export function weeklySeries(start: string, end: string, daily: Record<string, number>): WeekSeries[] {
  const weeks = new Map<string, WeekSeries>();
  for (let time = dateTime(start); time <= dateTime(end); time += DAY) {
    const date = isoDate(time);
    const weekday = (new Date(time).getUTCDay() + 6) % 7;
    const monday = isoDate(time - weekday * DAY);
    if (!weeks.has(monday)) {
      const index = weeks.size;
      weeks.set(monday, { label: `Semana ${index + 1}`, color: weekColors[index % weekColors.length], points: Array<Point | null>(7).fill(null), total: 0 });
    }
    const week = weeks.get(monday)!;
    const value = daily[date] ?? 0;
    week.points[weekday] = { date, value };
    week.total += value;
  }
  return [...weeks.values()];
}

function axisStep(maximum: number): number {
  const target = maximum / 4;
  const base = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((factor) => factor * base).find((step) => step >= target) ?? 10 * base;
}

export function renderWeeklyChart(start: string, end: string, daily: Metrics["daily"], money: Money): string {
  const weeks = weeklySeries(start, end, daily);
  const highest = Math.max(0, ...weeks.flatMap((week) => week.points.map((point) => point?.value ?? 0)));
  const content = highest ? (() => {
    const step = axisStep(highest);
    const maximum = Math.ceil(highest / step) * step;
    const left = 92, top = 24, width = 868, height = 278;
    const x = (day: number) => left + (day * width) / 6;
    const y = (value: number) => top + height * (1 - value / maximum);
    const grid = Array.from({ length: Math.round(maximum / step) + 1 }, (_, index) => {
      const value = index * step;
      const row = y(value);
      return `<line x1="${left}" y1="${row}" x2="${left + width}" y2="${row}" class="metrics-grid-line"/><text x="${left - 12}" y="${row + 5}" class="metrics-axis-label" text-anchor="end">${compactMoney(value)}</text>`;
    }).join("");
    const labels = weekdays.map((day, index) => `<text x="${x(index)}" y="333" class="metrics-axis-label" text-anchor="middle">${day}</text>`).join("");
    const lines = weeks.map((week) => {
      const points = week.points.flatMap((point, index) => point ? [{ ...point, index }] : []);
      const path = points.map((point, index) => `${index ? "L" : "M"}${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
      const dots = points.map((point) => {
        const centerX = x(point.index), centerY = y(point.value);
        const day = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${point.date}T12:00:00Z`));
        const label = escapeHtml(`${week.label} · ${day}`), value = escapeHtml(money(point.value));
        return `<g class="metrics-data-point" tabindex="0" role="img" aria-label="${label} · ${value}" data-label="${label}" data-value="${value}"><circle cx="${centerX.toFixed(1)}" cy="${centerY.toFixed(1)}" r="12" fill="transparent"/><circle cx="${centerX.toFixed(1)}" cy="${centerY.toFixed(1)}" r="5.5" fill="${week.color}" stroke="#fff" stroke-width="2"/></g>`;
      }).join("");
      return `<path d="${path}" fill="none" stroke="${week.color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
    }).join("");
    return `<div class="metrics-line-scroll"><svg class="metrics-line-svg" viewBox="0 0 1000 350" role="img" aria-label="Ventas diarias en pesos, una línea por semana, de lunes a domingo"><title>Ventas diarias por semana</title>${grid}${labels}${lines}</svg></div>`;
  })() : `<p class="metrics-chart-empty">Aún no hay ventas en este mes.</p>`;
  const legend = weeks.map((week) => {
    const days = week.points.filter((point): point is Point => point !== null);
    const first = Number(days[0]?.date.slice(8) ?? 0);
    const last = Number(days.at(-1)?.date.slice(8) ?? 0);
    return `<span class="metrics-week-key"><i style="background:${week.color}"></i><b>${week.label}</b><small>${first}${first === last ? "" : `–${last}`} · ${money(week.total)}</small></span>`;
  }).join("");
  return `<section class="panel metrics-main-chart"><div class="metrics-chart-heading"><div><h2>Ventas diarias por semana</h2><p>Cada línea representa una semana del mes; la semana actual llega hasta hoy.</p></div></div>${content}<div class="metrics-week-legend">${legend}</div><div class="metrics-point-popover" id="metrics-point-popover" role="tooltip" hidden><strong></strong><span></span></div></section>`;
}

export function renderHourlySalesChart(hourly: Metrics["hourly"], money: Money): string {
  const hours = [...Array.from({ length: 17 }, (_, index) => index + 7), 0];
  const values = hours.map((hour) => hourly?.[String(hour)] ?? 0);
  const highest = Math.max(...values);
  const step = highest ? axisStep(highest) : 1;
  const maximum = highest ? Math.ceil(highest / step) * step : 1;
  const left = 86, top = 22, width = 860, height = 270;
  const grid = highest ? Array.from({ length: Math.round(maximum / step) + 1 }, (_, index) => {
    const value = index * step, y = top + height * (1 - value / maximum);
    return `<line x1="${left}" y1="${y.toFixed(1)}" x2="${left + width}" y2="${y.toFixed(1)}" class="metrics-grid-line"/><text x="${left - 12}" y="${(y + 5).toFixed(1)}" class="metrics-axis-label" text-anchor="end">${compactMoney(value)}</text>`;
  }).join("") : `<line x1="${left}" y1="${top + height}" x2="${left + width}" y2="${top + height}" class="metrics-grid-line"/>`;
  const bars = hours.map((hour, index) => {
    const center = left + width * (index + 0.5) / hours.length;
    const value = values[index];
    const barHeight = height * value / maximum;
    const label = `${String(hour).padStart(2, "0")}:00`;
    const description = escapeHtml(`${label} · ${money(value)}`);
    return `<g class="metrics-data-point metrics-hour-point" tabindex="0" role="img" aria-label="${description}" data-label="${label}" data-value="${escapeHtml(money(value))}"><rect x="${(center - 12).toFixed(1)}" y="${top}" width="24" height="${height}" fill="transparent"/><rect data-tooltip-anchor="true" x="${(center - 12).toFixed(1)}" y="${(top + height - barHeight).toFixed(1)}" width="24" height="${barHeight.toFixed(1)}" fill="#d31770"/><text x="${center.toFixed(1)}" y="325" class="metrics-axis-label" text-anchor="middle">${label.slice(0, 2)}</text></g>`;
  }).join("");
  return `<section class="panel metrics-hourly-chart"><div class="metrics-chart-heading"><div><h2>Ventas por hora del día</h2><p>Acumulado del mes · de 7:00 a. m. a 12:00 de la noche · COP</p></div></div><div class="metrics-line-scroll"><svg class="metrics-line-svg" viewBox="0 0 1000 345" role="img" aria-label="Ventas por hora del día de 7 de la mañana a 12 de la noche">${grid}${bars}</svg></div>${highest ? "" : `<p class="metrics-chart-empty">Aún no hay ventas en este mes.</p>`}</section>`;
}

export type ExpenseMonth = { key: string; label: string; total: number; categories: Record<string, number> };

export function monthlyExpenseCategories(expenses: Expense[], end: string): { months: ExpenseMonth[]; categoryNames: Record<string, string> } {
  const current = new Date(`${end.slice(0, 7)}-01T12:00:00Z`);
  const months: ExpenseMonth[] = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(current);
    date.setUTCMonth(current.getUTCMonth() - (5 - index));
    return { key: date.toISOString().slice(0, 7), label: monthFormat.format(date), total: 0, categories: {} };
  });
  const byMonth = new Map(months.map((month) => [month.key, month]));
  const categoryNames: Record<string, string> = {};
  for (const expense of [...expenses].sort((a, b) => a.expense_date.localeCompare(b.expense_date))) {
    const month = byMonth.get(expense.expense_date.slice(0, 7));
    if (!month) continue;
    month.total += expense.amount;
    month.categories[expense.category_id] = (month.categories[expense.category_id] ?? 0) + expense.amount;
    categoryNames[expense.category_id] = expense.category_name;
  }
  return { months, categoryNames };
}

export function renderExpenseCategoryChart(expenses: Expense[], end: string, money: Money): string {
  const { months, categoryNames } = monthlyExpenseCategories(expenses, end);
  const categoryIds = Object.keys(categoryNames).sort((a, b) => categoryNames[a].localeCompare(categoryNames[b], "es"));
  const colors = new Map(categoryIds.map((id, index) => [id, `hsl(${(index * 137.5 + 92) % 360} 55% 56%)`]));
  const highest = Math.max(...months.map((month) => month.total));
  const step = highest ? axisStep(highest) : 1;
  const maximum = highest ? Math.ceil(highest / step) * step : 1;
  const left = 86, top = 22, width = 860, height = 270;
  const grid = highest ? Array.from({ length: Math.round(maximum / step) + 1 }, (_, index) => {
    const value = index * step, y = top + height * (1 - value / maximum);
    return `<line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" class="metrics-grid-line"/><text x="${left - 12}" y="${y + 5}" class="metrics-axis-label" text-anchor="end">${compactMoney(value)}</text>`;
  }).join("") : `<line x1="${left}" y1="${top + height}" x2="${left + width}" y2="${top + height}" class="metrics-grid-line"/>`;
  const bars = months.map((month, index) => {
    const center = left + width * (index + 0.5) / 6;
    let bottom = top + height;
    const segments = categoryIds.map((id) => {
      const value = month.categories[id] ?? 0;
      if (!value) return "";
      const segmentHeight = height * value / maximum;
      bottom -= segmentHeight;
      const description = escapeHtml(`${categoryNames[id]} · ${month.label}: ${money(value)}`);
      return `<rect x="${(center - 43).toFixed(1)}" y="${bottom.toFixed(1)}" width="86" height="${segmentHeight.toFixed(1)}" fill="${colors.get(id)}" aria-label="${description}"><title>${description}</title></rect>`;
    }).join("");
    return `${segments}<text x="${center.toFixed(1)}" y="325" class="metrics-axis-label" text-anchor="middle">${escapeHtml(month.label)}</text>`;
  }).join("");
  const legend = categoryIds.map((id) => `<span class="metrics-expense-key"><i style="background:${colors.get(id)}"></i>${escapeHtml(categoryNames[id])}</span>`).join("");
  return `<section class="panel metrics-expense-chart"><div class="metrics-chart-heading"><div><h2>Gastos por categoría</h2><p>Últimos 6 meses · valores en COP</p></div></div><div class="metrics-line-scroll"><svg class="metrics-line-svg" viewBox="0 0 1000 345" role="img" aria-label="Gastos mensuales agrupados por categoría">${grid}${bars}</svg></div>${highest ? `<div class="metrics-expense-legend">${legend}</div>` : `<p class="metrics-chart-empty">Aún no hay gastos registrados en estos seis meses.</p>`}</section>`;
}

export function renderPaymentStack(values: Metrics["payment_types"], labels: Record<string, string>, money: Money): string {
  const entries = Object.entries(values).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (!total) return `<section class="panel metrics-payment-chart"><h2>Por método de pago</h2><p class="metrics-chart-empty">Aún no hay ventas en este mes.</p></section>`;
  const segments = entries.map(([name, value]) => `<div class="metrics-payment-segment" style="width:${(100 * value / total).toFixed(3)}%;background:${paymentColors[name] ?? "#758b9d"}" title="${escapeHtml(`${labels[name] ?? name}: ${money(value)}`)}"></div>`).join("");
  const legend = entries.map(([name, value]) => `<div class="metrics-payment-item"><i style="background:${paymentColors[name] ?? "#758b9d"}"></i><span>${escapeHtml(labels[name] ?? name)}</span><b>${money(value)}</b><small>${Math.round(100 * value / total)} %</small></div>`).join("");
  return `<section class="panel metrics-payment-chart"><div class="metrics-chart-heading"><div><h2>Por método de pago</h2><p>Participación en las ventas netas del mes</p></div></div><div class="metrics-payment-track" role="img" aria-label="Distribución de ventas por método de pago">${segments}</div><div class="metrics-payment-legend">${legend}</div></section>`;
}

export function treemapTiles(values: Record<string, number>): TreemapTile[] {
  const entries = Object.entries(values).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  const result: TreemapTile[] = [];
  const split = (group: typeof entries, x: number, y: number, width: number, height: number): void => {
    if (group.length === 1) {
      result.push({ name: group[0][0], value: group[0][1], x, y, width, height });
      return;
    }
    const total = group.reduce((sum, [, value]) => sum + value, 0);
    let cut = 1, accumulated = group[0][1], firstTotal = accumulated;
    let difference = Math.abs(total / 2 - accumulated);
    for (let index = 2; index < group.length; index++) {
      accumulated += group[index - 1][1];
      const nextDifference = Math.abs(total / 2 - accumulated);
      if (nextDifference < difference) { cut = index; firstTotal = accumulated; difference = nextDifference; }
    }
    const ratio = firstTotal / total;
    if (width >= height) {
      split(group.slice(0, cut), x, y, width * ratio, height);
      split(group.slice(cut), x + width * ratio, y, width * (1 - ratio), height);
    } else {
      split(group.slice(0, cut), x, y, width, height * ratio);
      split(group.slice(cut), x, y + height * ratio, width, height * (1 - ratio));
    }
  };
  if (entries.length) split(entries, 0, 0, 100, 100);
  return result;
}

export function renderTreemap(title: string, values: Record<string, number>, formatValue: (value: number) => string, subtitle: string): string {
  const tiles = treemapTiles(values);
  if (!tiles.length) return `<section class="panel metrics-treemap-panel"><h2>${escapeHtml(title)}</h2><p class="metrics-chart-empty">Aún no hay ventas en este mes.</p></section>`;
  const total = tiles.reduce((sum, tile) => sum + tile.value, 0);
  const percentFormat = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
  const content = tiles.map((tile, index) => {
    const area = tile.width * tile.height / 100;
    const tiny = tile.width < 8 || tile.height < 8 || area < 1.2;
    const medium = !tiny && (tile.width < 28 || tile.height < 25 || area < 10);
    const color = tileColors[index % tileColors.length];
    const value = formatValue(tile.value);
    const percent = `${percentFormat.format(100 * tile.value / total)} %`;
    const description = escapeHtml(`${tile.name}: ${value} · ${percent}`);
    return `<div class="metrics-treemap-tile${tiny ? " tiny" : medium ? " medium" : ""}" role="listitem" aria-label="${description}" title="${description}" style="left:${tile.x.toFixed(4)}%;top:${tile.y.toFixed(4)}%;width:${tile.width.toFixed(4)}%;height:${tile.height.toFixed(4)}%;background:${color}">${tiny ? "" : `<strong aria-hidden="true">${escapeHtml(tile.name)}</strong><div class="metrics-treemap-value" aria-hidden="true"><span>${escapeHtml(value)}</span><span class="metrics-treemap-percent">${percent}</span></div>`}</div>`;
  }).join("");
  return `<section class="panel metrics-treemap-panel"><div class="metrics-chart-heading"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div></div><div class="metrics-treemap" role="list" aria-label="${escapeHtml(title)}">${content}</div></section>`;
}
