#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import boxen from 'boxen';
import axios from 'axios';
import Conf from 'conf';
import CryptoJS from 'crypto-js';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';
import net from 'net';

const execAsync = promisify(exec);
// Database principal para configurações e dados locais
const config = new Conf({ projectName: 'track-cli' });

// --- CONFIGURAÇÃO DE BANCO DE DADOS CENTRALIZADO ---
// ATENÇÃO: Se você for distribuir este código, lembre-se que o TOKEN dá acesso ao seu repo.
const DB_TOKEN = "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"; // Coloque seu token aqui para todos usarem o mesmo DB
const DB_REPO = "raphaelsancho21-byte/track-db"; // Repositório privado central
const DB_FILE = "users.json";

// --- CONFIGURAÇÃO DE VERSÃO E UPDATE ---
const VERSION = "1.4.0";
const REPO_RAW_PACKAGE = "https://raw.githubusercontent.com/raphaelsancho21-byte/Track/main/package.json";
const REPO_URL = "git+https://github.com/raphaelsancho21-byte/Track.git"; // Força o uso de HTTPS em vez de SSH

let updateAvailable = false;
let currentUser = null;

// --- UI Helpers ---

const header = () => {
    console.clear();
    const title = chalk.bold.cyan(`
  _______ _____            _____ _  __
 |__   __|  __ \\     /\\   / ____| |/ /
    | |  | |__) |   /  \\ | |    | ' / 
    | |  |  _  /   / /\\ \\| |    |  <  
    | |  | | \\ \\  / ____ \\ |____| . \\ 
    |_|  |_|  \\_\\/_/    \\_\\_____|_|\\_\\
    `);
    
    const userDisplay = currentUser ? chalk.yellow(` | USUÁRIO: ${currentUser.toUpperCase()}`) : '';
    
    console.log(
        boxen(title + '\n' + chalk.cyan.dim(`SYSTEM VERSION ${VERSION} // ENHANCED ACCESS${userDisplay}`), {
            padding: { top: 0, bottom: 1, left: 4, right: 4 },
            margin: 1,
            borderStyle: 'double',
            borderColor: 'cyan',
            float: 'center'
        })
    );
};

const backToMenu = async () => {
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: chalk.dim('Pressione ENTER para voltar ao menu...')
        }
    ]);
};

// --- Funções GitHub DB ---

const fetchRemoteUsers = async () => {
    try {
        const url = `https://api.github.com/repos/${DB_REPO}/contents/${DB_FILE}`;
        const res = await axios.get(url, {
            headers: { Authorization: `token ${DB_TOKEN}` }
        });
        const content = Buffer.from(res.data.content, 'base64').toString();
        return JSON.parse(content);
    } catch (err) {
        if (err.response && err.response.status === 404) return []; // Arquivo não existe ainda
        console.log(chalk.red('\n✘ Erro de conexão com o banco central. Verifique o Token/Repo no código.'));
        return [];
    }
};

const pushRemoteUsers = async (users) => {
    const spinner = ora('Sincronizando banco de dados global...').start();
    try {
        const url = `https://api.github.com/repos/${DB_REPO}/contents/${DB_FILE}`;
        let sha;
        
        try {
            const res = await axios.get(url, { headers: { Authorization: `token ${DB_TOKEN}` } });
            sha = res.data.sha;
        } catch (e) {}

        const content = Buffer.from(JSON.stringify(users, null, 2)).toString('base64');
        await axios.put(url, {
            message: "update users database",
            content: content,
            sha: sha
        }, {
            headers: { Authorization: `token ${DB_TOKEN}` }
        });
        spinner.succeed(chalk.green('Banco de dados sincronizado para todos!'));
    } catch (err) {
        spinner.fail(chalk.red('Falha na sincronização global.'));
    }
};

// --- Sistema de Autenticação ---

const authMenu = async () => {
    header();
    const { mode } = await inquirer.prompt([
        {
            type: 'list',
            name: 'mode',
            message: 'BEM-VINDO AO TRACK. IDENTIFIQUE-SE:',
            choices: ['Login', 'Cadastro', 'Sair']
        }
    ]);

    if (mode === 'Sair') process.exit(0);

    const spinner = ora('Acessando banco de dados central...').start();
    const users = await fetchRemoteUsers();
    spinner.stop();

    if (mode === 'Cadastro') {
        const { newUsername, newPassword } = await inquirer.prompt([
            {
                type: 'input',
                name: 'newUsername',
                message: 'Escolha um Username:',
                validate: (input) => {
                    if (!input) return 'Username não pode ser vazio.';
                    if (users.find(u => u.username.toLowerCase() === input.toLowerCase())) {
                        return chalk.red('Este username já está em uso por alguém! Escolha outro.');
                    }
                    return true;
                }
            },
            {
                type: 'password',
                name: 'newPassword',
                message: 'Crie uma Senha:'
            }
        ]);

        users.push({ 
            username: newUsername, 
            password: CryptoJS.SHA256(newPassword).toString(), // Hash para segurança
            createdAt: new Date().toISOString()
        });
        
        await pushRemoteUsers(users); // Salva no GitHub Central
        console.log(chalk.green('\n✔ Cadastro global realizado com sucesso! Faça login agora.'));
        await backToMenu();
        return authMenu();
    }

    if (mode === 'Login') {
        const { loginUser, loginPass } = await inquirer.prompt([
            { type: 'input', name: 'loginUser', message: 'Username:' },
            { type: 'password', name: 'loginPass', message: 'Senha:' }
        ]);

        const user = users.find(u => u.username.toLowerCase() === loginUser.toLowerCase());
        const hashedPass = CryptoJS.SHA256(loginPass).toString();

        if (user && user.password === hashedPass) {
            currentUser = user.username;
            console.log(chalk.green(`\n✔ Acesso concedido! Bem-vindo ao sistema, ${currentUser}.`));
            await new Promise(r => setTimeout(r, 1000));
        } else {
            console.log(chalk.red('\n✘ Username ou Senha incorretos no banco central.'));
            await backToMenu();
            return authMenu();
        }
    }
};

// --- Lógica de Update ---

const performUpdate = async () => {
    const spinner = ora('Atualizando sistema...').start();
    try {
        await execAsync(`npm install -g ${REPO_URL} --force`);
        spinner.succeed(chalk.green('Sistema atualizado com sucesso!'));
        console.log(boxen(
            chalk.cyan.bold('[SYSTEM-TRACK]') + '\n' +
            chalk.white('Track baixado com Sucesso!, Escreva ') + chalk.green.bold('track') + chalk.white(' no seu CMD e aproveite.'),
            { padding: 1, borderColor: 'cyan', borderStyle: 'round', margin: 1 }
        ));
        process.exit(0);
    } catch (err) {
        spinner.fail(chalk.red('Falha ao atualizar. Verifique sua conexão ou se o npm está configurado.'));
        console.log(chalk.dim(`Erro: ${err.message}`));
    }
};

const checkUpdate = async () => {
    try {
        const spinner = ora(chalk.dim('Verificando integridade do sistema...')).start();
        const res = await axios.get(REPO_RAW_PACKAGE, { timeout: 5000 });
        const remoteVersion = res.data.version;
        spinner.stop();

        if (remoteVersion !== VERSION) {
            updateAvailable = true;
            
            console.log(boxen(
                chalk.yellow.bold(' ⚠ ATUALIZAÇÃO DISPONÍVEL ⚠ ') + '\n\n' +
                chalk.white(`Sua versão: ${VERSION}`) + '\n' +
                chalk.green(`Versão nova: ${remoteVersion}`) + '\n\n' +
                chalk.dim('Novas funções foram detectadas no GitHub.'),
                { padding: 1, borderColor: 'yellow', borderStyle: 'double', title: 'Update System' }
            ));

            const { update } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'update',
                    message: 'Deseja baixar a nova versão agora?',
                    default: true
                }
            ]);

            if (update) {
                await performUpdate();
            } else {
                console.log(chalk.yellow('\nℹ Você pode atualizar depois no menu principal.\n'));
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    } catch (err) {
        // Silencioso se falhar
    }
};

// --- Tab 1: IP ---

const ipTab = async () => {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: chalk.cyan('ABA 1: IP'),
            choices: ['Ver meu IP', 'Rastrear IP', 'Ping Host/IP', 'Scanner de Portas', 'Bloquear IP', 'Voltar']
        }
    ]);

    switch (action) {
        case 'Ver meu IP':
            const spinner = ora('Obtendo seu IP...').start();
            try {
                const res = await axios.get('https://api.ipify.org?format=json');
                spinner.succeed(chalk.green(`Seu IP público é: ${chalk.bold(res.data.ip)}`));
            } catch (err) { spinner.fail(chalk.red('Falha ao obter IP.')); }
            break;
        case 'Rastrear IP':
            const { targetIp } = await inquirer.prompt([{ type: 'input', name: 'targetIp', message: 'IP para rastrear:' }]);
            const trackSpinner = ora(`Rastreando ${targetIp}...`).start();
            try {
                const res = await axios.get(`http://ip-api.com/json/${targetIp}`);
                trackSpinner.stop();
                console.log(boxen(`${chalk.cyan('IP:')} ${res.data.query}\n${chalk.cyan('País:')} ${res.data.country}\n${chalk.cyan('ISP:')} ${res.data.isp}`, { padding: 1, borderColor: 'yellow' }));
            } catch (err) { trackSpinner.fail(chalk.red(`Erro: ${err.message}`)); }
            break;
        case 'Ping Host/IP':
            const { host } = await inquirer.prompt([{ type: 'input', name: 'host', message: 'Host/IP:' }]);
            const pingSpinner = ora(`Pingando ${host}...`).start();
            try {
                const { stdout } = await execAsync(`ping -n 4 ${host}`);
                pingSpinner.stop(); console.log(chalk.dim(stdout));
            } catch (err) { pingSpinner.fail(chalk.red('Falha no Ping.')); }
            break;
        case 'Scanner de Portas':
            const { scanIp } = await inquirer.prompt([{ type: 'input', name: 'scanIp', message: 'IP para scan:' }]);
            const ports = [21, 22, 80, 443, 3306, 3389];
            for (const port of ports) {
                const s = ora(`Porta ${port}...`).start();
                const isOpen = await new Promise((resolve) => {
                    const socket = new net.Socket();
                    socket.setTimeout(800);
                    socket.on('connect', () => { socket.destroy(); resolve(true); });
                    socket.on('timeout', () => { socket.destroy(); resolve(false); });
                    socket.on('error', () => { socket.destroy(); resolve(false); });
                    socket.connect(port, scanIp);
                });
                if (isOpen) s.succeed(chalk.green(`Porta ${port}: ABERTA`)); else s.stop();
            }
            break;
        case 'Bloquear IP':
            const { blockIp } = await inquirer.prompt([{ type: 'input', name: 'blockIp', message: 'IP para bloquear:' }]);
            const bS = ora(`Bloqueando ${blockIp}...`).start();
            try {
                await execAsync(`netsh advfirewall firewall add rule name="BLOCK IP ${blockIp}" dir=in action=block remoteip=${blockIp}`);
                bS.succeed(chalk.green('Bloqueado!'));
            } catch (err) { bS.fail(chalk.red('Falha (Requer Admin).')); }
            break;
        case 'Voltar': return;
    }
    await backToMenu(); await ipTab();
};

// --- Tab 2: SOCIAL ---

const socialTab = async () => {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: chalk.magenta('ABA 2: SOCIAL'),
            choices: ['Pesquisa Instagram/TikTok', 'Pesquisa GitHub', 'Voltar']
        }
    ]);
    if (action === 'Voltar') return;
    const { username } = await inquirer.prompt([{ type: 'input', name: 'username', message: 'Username:' }]);
    const spinner = ora(`Pesquisando...`).start();
    const results = [];
    const check = async (name, url) => {
        try {
            const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, validateStatus: s => s < 500 });
            if (res.status === 200 && !res.data.toString().includes('Page Not Found')) results.push({ name, url, status: 'ENCONTRADO' });
            else results.push({ name, url, status: 'NÃO ENCONTRADO' });
        } catch (e) { results.push({ name, url, status: 'ERRO' }); }
    };
    if (action.includes('Instagram')) {
        await Promise.all([check('Instagram', `https://www.instagram.com/${username}/`), check('TikTok', `https://www.tiktok.com/@${username}`)]);
    } else { await check('GitHub', `https://github.com/${username}`); }
    spinner.stop();
    console.log(boxen(results.map(r => `${chalk.bold(r.name)}: ${r.status === 'ENCONTRADO' ? chalk.green(r.status) : chalk.red(r.status)}\n${chalk.dim(r.url)}`).join('\n\n'), { padding: 1, borderColor: 'magenta' }));
    await backToMenu(); await socialTab();
};

// --- Tab 3: DATABASE ---

const databaseTab = async () => {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: chalk.yellow('ABA 3: BANCO DE DADOS'),
            choices: ['Armazenar informações', 'Armazenar Sigilosas', 'Ver armazenamentos', 'Exportar JSON', 'Limpar Tudo', 'Voltar']
        }
    ]);
    const userKey = `data_${currentUser}`; // Dados vinculados ao usuário atual
    const userSecureKey = `secureData_${currentUser}`;
    const data = config.get(userKey) || [];
    const secureData = config.get(userSecureKey) || [];

    switch (action) {
        case 'Armazenar informações':
            const { info } = await inquirer.prompt([{ type: 'input', name: 'info', message: 'Conteúdo:' }]);
            data.push({ content: info, date: new Date().toLocaleString() });
            config.set(userKey, data);
            console.log(chalk.green('Salvo!'));
            break;
        case 'Armazenar Sigilosas':
            const { sI, pass } = await inquirer.prompt([{ type: 'input', name: 'sI', message: 'Sigiloso:' }, { type: 'password', name: 'pass', message: 'Senha:' }]);
            const enc = CryptoJS.AES.encrypt(sI, pass).toString();
            secureData.push({ content: enc, date: new Date().toLocaleString(), id: Math.random().toString(36).substr(2, 9) });
            config.set(userSecureKey, secureData);
            console.log(chalk.red('Criptografado!'));
            break;
        case 'Ver armazenamentos':
            console.log(chalk.bold('\n--- PÚBLICAS ---'));
            data.forEach((it, i) => console.log(`${chalk.yellow(i+1)}: ${it.content}`));
            console.log(chalk.bold('\n--- SIGILOSAS ---'));
            console.log(chalk.dim(`${secureData.length} itens.`));
            if (secureData.length > 0) {
                const { view } = await inquirer.prompt([{ type: 'confirm', name: 'view', message: 'Descriptografar?' }]);
                if (view) {
                    const { id, p } = await inquirer.prompt([{ type: 'list', name: 'id', message: 'Item:', choices: secureData.map((d, i) => ({ name: `Item ${i+1}`, value: d.id })) }, { type: 'password', name: 'p', message: 'Senha:' }]);
                    const item = secureData.find(d => d.id === id);
                    try {
                        const bytes = CryptoJS.AES.decrypt(item.content, p);
                        const dec = bytes.toString(CryptoJS.enc.Utf8);
                        if (!dec) throw new Error();
                        console.log(chalk.bgRed.white.bold(` CONTEÚDO: ${dec} `));
                    } catch (e) { console.log(chalk.red('Senha incorreta!')); }
                }
            }
            break;
        case 'Exportar JSON': console.log(JSON.stringify({ public: data, secure: secureData }, null, 2)); break;
        case 'Limpar Tudo': config.delete(userKey); config.delete(userSecureKey); console.log(chalk.green('Limpo!')); break;
        case 'Voltar': return;
    }
    await backToMenu(); await databaseTab();
};

// --- Tab 4: TOOLS ---

const toolsTab = async () => {
    const { action } = await inquirer.prompt([
        { type: 'list', name: 'action', message: chalk.green('ABA 4: FERRAMENTAS'), choices: ['Gerador de Senhas', 'Sistema Info', 'Logout', 'Voltar'] }
    ]);
    switch (action) {
        case 'Gerador de Senhas':
            const { l } = await inquirer.prompt([{ type: 'number', name: 'l', message: 'Tamanho:', default: 16 }]);
            const c = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
            let p = ""; for (let i = 0; i < l; i++) p += c.charAt(Math.floor(Math.random() * c.length));
            console.log(boxen(chalk.bold.green(p), { title: 'Senha', padding: 1 }));
            break;
        case 'Sistema Info': console.log(chalk.cyan(`OS: ${process.platform} | Node: ${process.version}`)); break;
        case 'Logout': currentUser = null; return;
        case 'Voltar': return;
    }
    await backToMenu(); if (currentUser) await toolsTab();
};

// --- Main Loop ---

const main = async () => {
    while (!currentUser) {
        await authMenu();
    }

    header();
    await checkUpdate();
    
    while (true) {
        header();
        const choices = ['ABA 1: IP', 'ABA 2: SOCIAL', 'ABA 3: BANCO DE DADOS', 'ABA 4: FERRAMENTAS'];
        if (updateAvailable) choices.push(chalk.green.bold('➜ ATUALIZAR AGORA'));
        choices.push('Sair');

        const { tab } = await inquirer.prompt([{ type: 'list', name: 'tab', message: 'MENU PRINCIPAL:', choices }]);

        if (tab === 'Sair') process.exit(0);
        if (tab === 'ABA 1: IP') await ipTab();
        if (tab === 'ABA 2: SOCIAL') await socialTab();
        if (tab === 'ABA 3: BANCO DE DADOS') await databaseTab();
        if (tab === 'ABA 4: FERRAMENTAS') await toolsTab();
        if (typeof tab === 'string' && tab.includes('ATUALIZAR AGORA')) await performUpdate();
    }
};

main().catch(err => { console.error(chalk.red('Erro:'), err); process.exit(1); });
