const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { spawn } = require('child_process');

const OPENCODE_PATH = 'C:\\Users\\syedr\\AppData\\Local\\nvm\\v24.13.0\\node_modules\\opencode-ai\\bin\\opencode.exe';
function askOpencode(question, model = 'opencode/mimo-v2.5-free') {
    return new Promise((resolve, reject) => {
        const args = ['run', '--format', 'json', '--model', model, question];

        console.log('Spawning:', OPENCODE_PATH, args);

        const proc = spawn(OPENCODE_PATH, args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        console.log('PID:', proc.pid);

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            console.log('STDOUT chunk:', data.toString());
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            console.log('STDERR chunk:', data.toString());
            stderr += data.toString();
        });

        proc.on('close', (code, signal) => {
            console.log('CLOSED. code:', code, 'signal:', signal);
            if (code !== 0) {
                reject(new Error(`opencode exited with code ${code}: ${stderr}`));
                return;
            }
            resolve(parseOpencodeOutput(stdout));
        });

        proc.on('error', (err) => {
            console.log('SPAWN ERROR:', err);
            reject(err);
        });

        setTimeout(() => {
            if (!proc.killed) {
                console.log('TIMEOUT — killing process');
                proc.kill();
            }
        }, 30000); // give the free tier extra time, it may be slower than a paid model
    });
}
function parseOpencodeOutput(raw) {
    const chunks = [];
    for (const line of raw.trim().split('\n')) {
        if (!line.trim()) continue;
        let event;
        try {
            event = JSON.parse(line);
        } catch {
            continue;
        }
        if (event.type === 'text') {
            chunks.push(event.part?.text || '');
        }
    }
    return chunks.join('');
}

// Create a new client instance
const client = new Client();

client.once('ready', () => {
    console.log('Client is ready!');
});

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

client.on('message', async (msg) => {
    console.log('Received message:', msg.body);

    if (msg.body === '!everyone') {
        const chat = await msg.getChat();
        if (!chat.isGroup) {
            await msg.reply('This command only works in a group chat.');
            return;
        }
        let text = '';
        const mentions = [];
        for (const participant of chat.participants) {
            const userId = participant.id.user;
            mentions.push(`${userId}@c.us`);
            text += `@${userId} `;
        }
        await chat.sendMessage(text, { mentions });
        return;
    }

    if (msg.body.toLowerCase() === 'hi') {
        await msg.reply('Hello! I am your bot.');
    }

    if (msg.body.toLowerCase().startsWith('!ai:')) {
        let prompt = msg.body.slice(4).trim();
        if ((prompt.startsWith('"') && prompt.endsWith('"')) ||
            (prompt.startsWith("'") && prompt.endsWith("'"))) {
            prompt = prompt.slice(1, -1).trim();
        }
        if (!prompt) {
            await msg.reply('Please provide a prompt. Usage: !ai: "your question here"');
            return;
        }
        try {
            await msg.reply('⏳ Thinking...');
            const response = await askOpencode(prompt);
            await msg.reply(`🤖 *AI:*\n\n${response}`);
        } catch (error) {
            console.error('opencode error:', error.message);
            await msg.reply('❌ Sorry, I encountered an error while processing your request.');
        }
    }
});

client.initialize();