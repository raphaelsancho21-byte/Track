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
const config = new Conf({ projectName: 'track-cli' });

// --- CONFIGURAÇÃO DE VERSÃO E UPDATE ---
const VERSION = "1.1.0";
// IMPORTANTE: Altere o link abaixo para o seu repositório no GitHub quando subir!
// Exemplo: https://raw.githubusercontent.com/seu-usuario/track/main/package.json
const REPO_RAW_PACKAGE = "https://raw.githubusercontent.com/rafael/dreams/main/package.json";
const REPO_URL = "https://github.com/rafael/dreams"; // Link para o npm install

let updateAvailable = false;

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
    
    console.log(
        boxen(title + '\n' + chalk.cyan.dim(`SYSTEM VERSION ${VERSION} // ENHANCED ACCESS`), {
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

// --- Lógica de Update ---

const performUpdate = async () => {
    const spinner = ora('Atualizando sistema...').start();
    try {
        // Tenta reinstalar via link do github
        await execAsync(`npm install -g ${REPO_URL}`);
        spinner.succeed(chalk.green('Sistema atualizado com sucesso! Reinicie o programa para aplicar as mudanças.'));
        process.exit(0);
    } catch (err) {
        spinner.fail(chalk.red('Falha ao atualizar. Verifique sua conexão ou se o npm está configurado.'));
        console.log(chalk.dim(`Erro: ${err.message}`));
    }
};

const checkUpdate = async (silent = false) => {
    if (!silent) {
        var spinner = ora('Verificando atualizações...').start();
    }
    try {
        const res = await axios.get(REPO_RAW_PACKAGE, { timeout: 5000 });
        const remoteVersion = res.data.version;

        if (remoteVersion !== VERSION) {
            if (spinner) spinner.stop();
            updateAvailable = true;
            
            console.log(boxen(
                chalk.yellow.bold('NOVA VERSÃO DISPONÍVEL!') + '\n' +
                chalk.white(`Versão atual: ${VERSION}`) + '\n' +
                chalk.green(`Nova versão: ${remoteVersion}`),
                { padding: 1, borderColor: 'yellow', borderStyle: 'round' }
            ));

            const { update } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'update',
                    message: 'Deseja atualizar o sistema agora?',
                    default: true
                }
            ]);

            if (update) {
                await performUpdate();
            }
        } else {
            if (spinner) spinner.succeed(chalk.dim('Sistema atualizado.'));
        }
    } catch (err) {
        if (spinner) spinner.fail(chalk.dim('Não foi possível verificar atualizações.'));
    }
};

// --- Tab 1: IP ---

const ipTab = async () => {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: chalk.cyan('ABA 1: IP'),
            choices: [
                'Ver meu IP',
                'Rastrear IP',
                'Ping Host/IP',
                'Scanner de Portas',
                'Bloquear IP',
                'Voltar'
            ]
        }
    ]);

    switch (action) {
        case 'Ver meu IP':
            const spinner = ora('Obtendo seu IP...').start();
            try {
                const res = await axios.get('https://api.ipify.org?format=json');
                spinner.succeed(chalk.green(`Seu IP público é: ${chalk.bold(res.data.ip)}`));
            } catch (err) {
                spinner.fail(chalk.red('Falha ao obter IP.'));
            }
            break;

        case 'Rastrear IP':
            const { targetIp } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'targetIp',
                    message: 'Digite o IP para rastrear:',
                    validate: (input) => input ? true : 'IP não pode ser vazio.'
                }
            ]);
            const trackSpinner = ora(`Rastreando ${targetIp}...`).start();
            try {
                const res = await axios.get(`http://ip-api.com/json/${targetIp}`);
                if (res.data.status === 'fail') throw new Error(res.data.message);
                
                trackSpinner.stop();
                console.log(boxen(
                    `${chalk.cyan('IP:')} ${res.data.query}\n` +
                    `${chalk.cyan('País:')} ${res.data.country} (${res.data.countryCode})\n` +
                    `${chalk.cyan('Região:')} ${res.data.regionName}\n` +
                    `${chalk.cyan('Cidade:')} ${res.data.city}\n` +
                    `${chalk.cyan('ISP:')} ${res.data.isp}\n` +
                    `${chalk.cyan('Lat/Lon:')} ${res.data.lat}, ${res.data.lon}`,
                    { padding: 1, borderColor: 'yellow', title: 'Resultados do Rastreamento' }
                ));
            } catch (err) {
                trackSpinner.fail(chalk.red(`Erro: ${err.message}`));
            }
            break;

        case 'Ping Host/IP':
            const { host } = await inquirer.prompt([{ type: 'input', name: 'host', message: 'Host ou IP para Ping:' }]);
            const pingSpinner = ora(`Pingando ${host}...`).start();
            try {
                const { stdout } = await execAsync(`ping -n 4 ${host}`);
                pingSpinner.stop();
                console.log(chalk.dim(stdout));
            } catch (err) {
                pingSpinner.fail(chalk.red('Falha no Ping.'));
            }
            break;

        case 'Scanner de Portas':
            const { scanIp } = await inquirer.prompt([{ type: 'input', name: 'scanIp', message: 'IP para scan:' }]);
            const ports = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 3306, 3389, 8080];
            console.log(chalk.yellow(`Escaneando portas comuns em ${scanIp}...`));
            
            for (const port of ports) {
                const scanSpinner = ora(`Testando porta ${port}...`).start();
                const isOpen = await new Promise((resolve) => {
                    const socket = new net.Socket();
                    socket.setTimeout(1000);
                    socket.on('connect', () => { socket.destroy(); resolve(true); });
                    socket.on('timeout', () => { socket.destroy(); resolve(false); });
                    socket.on('error', () => { socket.destroy(); resolve(false); });
                    socket.connect(port, scanIp);
                });
                if (isOpen) scanSpinner.succeed(chalk.green(`Porta ${port}: ABERTA`));
                else scanSpinner.stop();
            }
            break;

        case 'Bloquear IP':
            const { blockIp } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'blockIp',
                    message: 'Digite o IP para bloquear (Firewall):',
                    validate: (input) => input ? true : 'IP não pode ser vazio.'
                }
            ]);
            
            const blockSpinner = ora(`Tentando bloquear ${blockIp} no Firewall...`).start();
            try {
                const cmd = `netsh advfirewall firewall add rule name="BLOCK IP ${blockIp}" dir=in action=block remoteip=${blockIp}`;
                await execAsync(cmd);
                blockSpinner.succeed(chalk.green(`IP ${blockIp} bloqueado com sucesso!`));
            } catch (err) {
                blockSpinner.fail(chalk.red('Falha ao bloquear IP. (Requer Administrador)'));
            }
            break;

        case 'Voltar':
            return;
    }
    await backToMenu();
    await ipTab();
};

// --- Tab 2: SOCIAL ---

const socialTab = async () => {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: chalk.magenta('ABA 2: SOCIAL'),
            choices: [
                'Pesquisa Instagram/TikTok',
                'Pesquisa GitHub',
                'Voltar'
            ]
        }
    ]);

    if (action === 'Voltar') return;

    const { username } = await inquirer.prompt([
        {
            type: 'input',
            name: 'username',
            message: 'Digite o username para pesquisar:',
            validate: (input) => input ? true : 'Username não pode ser vazio.'
        }
    ]);

    const spinner = ora(`Pesquisando por "${username}"...`).start();
    const results = [];

    const checkSocial = async (name, url) => {
        try {
            const response = await axios.get(url, { 
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
                validateStatus: (status) => status < 500
            });
            const data = response.data.toString();
            if (response.status === 200 && !data.includes('Page Not Found') && !data.includes('not-found')) {
                results.push({ name, url, status: 'ENCONTRADO' });
            } else {
                results.push({ name, url, status: 'NÃO ENCONTRADO' });
            }
        } catch (err) {
            results.push({ name, url, status: 'ERRO/PRIVADO' });
        }
    };

    if (action === 'Pesquisa Instagram/TikTok') {
        await Promise.all([
            checkSocial('Instagram', `https://www.instagram.com/${username}/`),
            checkSocial('TikTok', `https://www.tiktok.com/@${username}`)
        ]);
    } else if (action === 'Pesquisa GitHub') {
        await checkSocial('GitHub', `https://github.com/${username}`);
    }

    spinner.stop();
    console.log(boxen(
        results.map(r => `${chalk.bold(r.name)}: ${r.status === 'ENCONTRADO' ? chalk.green(r.status) : chalk.red(r.status)}\n${chalk.dim(r.url)}`).join('\n\n'),
        { padding: 1, borderColor: 'magenta', title: `Resultados: ${username}` }
    ));

    await backToMenu();
    await socialTab();
};

// --- Tab 3: DATABASE ---

const databaseTab = async () => {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: chalk.yellow('ABA 3: BANCO DE DADOS'),
            choices: [
                'Armazenar informações',
                'Armazenar Informações Sigilozas (PASSWORD)',
                'Ver armazenamentos',
                'Exportar JSON',
                'Limpar Tudo',
                'Voltar'
            ]
        }
    ]);

    const data = config.get('data') || [];
    const secureData = config.get('secureData') || [];

    switch (action) {
        case 'Armazenar informações':
            const { info } = await inquirer.prompt([{ type: 'input', name: 'info', message: 'O que deseja armazenar?' }]);
            data.push({ content: info, date: new Date().toLocaleString() });
            config.set('data', data);
            console.log(chalk.green('Armazenado!'));
            break;

        case 'Armazenar Informações Sigilozas (PASSWORD)':
            const { secretInfo, password } = await inquirer.prompt([
                { type: 'input', name: 'secretInfo', message: 'Informação SIGILOSA:' },
                { type: 'password', name: 'password', message: 'PASSWORD:' }
            ]);
            const encrypted = CryptoJS.AES.encrypt(secretInfo, password).toString();
            secureData.push({ content: encrypted, date: new Date().toLocaleString(), id: Math.random().toString(36).substr(2, 9) });
            config.set('secureData', secureData);
            console.log(chalk.red.bold('Criptografado e armazenado!'));
            break;

        case 'Ver armazenamentos':
            console.log(chalk.bold('\n--- PÚBLICAS ---'));
            data.forEach((item, i) => console.log(`${chalk.yellow(i + 1)}: [${chalk.dim(item.date)}] ${item.content}`));
            console.log(chalk.bold('\n--- SIGILOSAS ---'));
            console.log(chalk.dim(`${secureData.length} item(s) criptografado(s).`));
            if (secureData.length > 0) {
                const { viewSecure } = await inquirer.prompt([{ type: 'confirm', name: 'viewSecure', message: 'Descriptografar item?', default: false }]);
                if (viewSecure) {
                    const { itemId, pass } = await inquirer.prompt([
                        { type: 'list', name: 'itemId', message: 'Item:', choices: secureData.map((d, i) => ({ name: `Item ${i+1}`, value: d.id })) },
                        { type: 'password', name: 'pass', message: 'PASSWORD:' }
                    ]);
                    const item = secureData.find(d => d.id === itemId);
                    try {
                        const bytes = CryptoJS.AES.decrypt(item.content, pass);
                        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                        if (!decrypted) throw new Error();
                        console.log(chalk.bgRed.white.bold(` CONTEÚDO: ${decrypted} `));
                    } catch (err) { console.log(chalk.red('Erro no password!')); }
                }
            }
            break;

        case 'Exportar JSON':
            const allData = { public: data, secure: secureData };
            console.log(chalk.cyan('Copiando dados para o console (JSON):'));
            console.log(JSON.stringify(allData, null, 2));
            break;

        case 'Limpar Tudo':
            const { confirmClear } = await inquirer.prompt([{ type: 'confirm', name: 'confirmClear', message: 'Limpar TUDO?', default: false }]);
            if (confirmClear) { config.clear(); console.log(chalk.green('Resetado!')); }
            break;

        case 'Voltar':
            return;
    }
    await backToMenu();
    await databaseTab();
};

// --- Tab 4: TOOLS ---

const toolsTab = async () => {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: chalk.green('ABA 4: FERRAMENTAS'),
            choices: [
                'Gerador de Senhas',
                'Sistema Info (OS)',
                'Voltar'
            ]
        }
    ]);

    switch (action) {
        case 'Gerador de Senhas':
            const { len } = await inquirer.prompt([{ type: 'number', name: 'len', message: 'Tamanho da senha:', default: 16 }]);
            const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
            let pass = "";
            for (let i = 0; i < len; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
            console.log(boxen(chalk.bold.green(pass), { title: 'Senha Gerada', padding: 1, borderColor: 'green' }));
            break;

        case 'Sistema Info (OS)':
            console.log(chalk.cyan(`OS: ${process.platform} ${process.arch}`));
            console.log(chalk.cyan(`Node Version: ${process.version}`));
            console.log(chalk.cyan(`Uptime: ${Math.floor(process.uptime())}s`));
            break;

        case 'Voltar':
            return;
    }
    await backToMenu();
    await toolsTab();
};

// --- Main Loop ---

const main = async () => {
    header();
    await checkUpdate(); // Verifica ao iniciar

    while (true) {
        header();
        
        const choices = [
            'ABA 1: IP',
            'ABA 2: SOCIAL',
            'ABA 3: BANCO DE DADOS',
            'ABA 4: FERRAMENTAS',
        ];

        if (updateAvailable) {
            choices.push(chalk.green.bold('ATUALIZAR AGORA'));
        }

        choices.push('Sair');

        const { tab } = await inquirer.prompt([
            {
                type: 'list',
                name: 'tab',
                message: 'Escolha uma ABA:',
                choices: choices
            }
        ]);

        if (tab === 'Sair') { console.log(chalk.cyan('Encerrando...')); process.exit(0); }
        if (tab === 'ABA 1: IP') await ipTab();
        if (tab === 'ABA 2: SOCIAL') await socialTab();
        if (tab === 'ABA 3: BANCO DE DADOS') await databaseTab();
        if (tab === 'ABA 4: FERRAMENTAS') await toolsTab();
        if (tab.includes('ATUALIZAR AGORA')) await performUpdate();
    }
};

main().catch(err => { console.error(chalk.red('Erro:'), err); process.exit(1); });
