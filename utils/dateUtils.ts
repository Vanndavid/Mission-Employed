
export const isWeekday = (date: Date) => {
  const day = date.getDay();
  return day !== 0 && day !== 6;
};

export const getRecentWeekdays = (count: number) => {
  const dates: string[] = [];
  let d = new Date();
  while (dates.length < count) {
    if (isWeekday(d)) {
      dates.push(d.toISOString().split('T')[0]);
    }
    d.setDate(d.getDate() - 1);
  }
  return dates;
};
