const fs = require('fs');
const path = require('path');
const rl = require('readline');

const file = process.argv[2];
const statuses = {};
const urls404 = {};

const reader = rl.createInterface({
    input: fs.createReadStream(file),
});

reader.on('line', (line) => {
    if (line.includes('http_reqs') && line.includes('"status":')) {
        try {
            const data = JSON.parse(line);
            if (data.metric === 'http_reqs') {
                const status = data.data.tags.status;
                statuses[status] = (statuses[status] || 0) + 1;
                
                if (status === '404') {
                    const url = data.data.tags.url;
                    const method = data.data.tags.method;
                    const key = `${method} ${url}`;
                    urls404[key] = (urls404[key] || 0) + 1;
                }
            }
        } catch(e) {}
    }
});

reader.on('close', () => {
    console.log('HTTP Statuses:', statuses);
    console.log('404 URLs:', urls404);
});
