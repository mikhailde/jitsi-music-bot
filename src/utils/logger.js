const colors = {
    DEBUG: '\x1b[90m',
    INFO: '\x1b[36m',
    WARN: '\x1b[33m',
    ERROR: '\x1b[31m',
    RESET: '\x1b[0m'
};

const isDebug = () => process.env.DEBUG_MODE === 'true';

const str = (v) => {
    if (v instanceof Error) return v.stack || v.message;
    if (typeof v === 'object' && v !== null) return JSON.stringify(v);
    return v;
};

const write = (lvl, pfx, msg, extra = '') => {
    const time = new Date().toLocaleTimeString('ru-RU', { hour12: false });
    const c = colors[lvl] || '';
    const r = colors.RESET;
    const ext = extra ? ` ${str(extra)}` : '';
    const line = `${c}[${time}] [${lvl.padEnd(5)}] [${pfx}]${r} ${str(msg)}${ext}`;

    if (lvl === 'ERROR') {
        console.error(line);
    } else if (lvl === 'WARN') {
        console.warn(line);
    } else {
        console.log(line);
    }
};

module.exports = {
    debug: (p, m, e) => isDebug() && write('DEBUG', p, m, e),
    info: (p, m, e) => write('INFO', p, m, e),
    warn: (p, m, e) => write('WARN', p, m, e),
    error: (p, m, e) => write('ERROR', p, m, e)
};
