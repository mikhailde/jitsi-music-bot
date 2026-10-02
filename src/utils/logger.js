const RESET = '\x1b[0m';
const LEVELS = {
    DEBUG: { tag: '\x1b[90m', name: 'DEBUG', out: console.log },
    INFO:  { tag: '\x1b[36m', name: 'INFO ', out: console.log },
    WARN:  { tag: '\x1b[33m', name: 'WARN ', out: console.warn },
    ERROR: { tag: '\x1b[31m', name: 'ERROR', out: console.error }
};

const isDebug = () => process.env.DEBUG_MODE === 'true';

const str = (v) => {
    if (v instanceof Error) return v.stack || v.message;
    if (typeof v === 'object' && v !== null) {
        try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v ?? '');
};

const write = (lvl, pfx, msg, extra) => {
    const time = new Date().toTimeString().slice(0, 8);
    const ext = (extra !== undefined && extra !== '') ? ` ${str(extra)}` : '';
    const text = `${str(msg)}${ext}`;
    const { tag, name, out } = LEVELS[lvl];
    const header = `${tag}[${time}] [${name}] [${pfx}]${RESET} `;

    if (!text.includes('\n')) {
        const trimmed = text.trimEnd();
        if (trimmed) out(`${header}${trimmed}`);
        return;
    }

    for (const line of text.split('\n')) {
        const trimmed = line.trimEnd();
        if (trimmed) out(`${header}${trimmed}`);
    }
};

module.exports = {
    debug: (p, m, e) => isDebug() && write('DEBUG', p, m, e),
    info: (p, m, e) => write('INFO', p, m, e),
    warn: (p, m, e) => write('WARN', p, m, e),
    error: (p, m, e) => write('ERROR', p, m, e)
};