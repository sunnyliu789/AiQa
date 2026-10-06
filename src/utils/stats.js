// 按日期统计每天的提问数量，键为本地日期（YYYY-MM-DD），值为当天提问次数
// 说明：记录的时间字段为 createdAt，格式是 ISO 8601 字符串（UTC）
function countQuestionsByDay(records) {
  const stats = {};
  records.forEach((record) => {
    if (!record || !record.createdAt) return;
    // createdAt 是 UTC 时间，这里按本地时区取日期，避免凌晨时段被算到前一天
    const d = new Date(record.createdAt);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    stats[date] = (stats[date] || 0) + 1;
  });
  return stats;
}

module.exports = {
  countQuestionsByDay
};
