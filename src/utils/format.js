const formatTime = (s = 0) => {
    const sec = Math.max(0, Math.floor(+s || 0));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

const getProgressBar = (current = 0, total = 0, len = 15) => {
    if (!total) return '🔘' + '▬'.repeat(len - 1) + ' (Live)';
    const pos = Math.min(len - 1, Math.max(0, Math.round((current / total) * (len - 1))));
    return '▬'.repeat(pos) + '🔘' + '▬'.repeat(len - 1 - pos);
};

module.exports = { formatTime, getProgressBar };
