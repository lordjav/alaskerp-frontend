export function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function metricsPeriod(month: string, currentDate: string): { start: string; end: string; historyStart: string; historyEnd: string } {
  const currentMonth = currentDate.slice(0, 7);
  const selectedMonth = month > currentMonth ? currentMonth : month;
  const [year, number] = selectedMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  return {
    start: `${selectedMonth}-01`,
    end: selectedMonth === currentMonth ? currentDate : lastDay,
    historyStart: `${shiftMonth(currentMonth, -5)}-01`,
    historyEnd: currentDate,
  };
}
