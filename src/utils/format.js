const formatTime = (s = 0) => {
    const sec = Math.max(0, Math.floor(+s || 0));
    const m = Math.floor(sec / 60);
    const r = String(sec % 60).padStart(2, '0');
    return m >= 60 
        ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${r}` 
        : `${m}:${r}`;
};

const getProgressBar = (current = 0, total = 0, len = 15) => {
    const max = Math.max(1, len - 1);
    if (!total) return `🔘${'▬'.repeat(max)} (Live)`;
    const pos = Math.min(max, Math.max(0, Math.round((current / total) * max)));
    return `${'▬'.repeat(pos)}🔘${'▬'.repeat(max - pos)}`;
};

module.exports = { formatTime, getProgressBar };