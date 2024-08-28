import { ethers } from 'ethers';
import axios from 'axios';
import fs from 'fs';
import { csvParse } from 'd3-dsv';
import { Buffer } from 'buffer';

const provider = new ethers.JsonRpcProvider('https://ethereum-rpc.publicnode.com');
const CACHE_FILE = 'ens_avatar_cache.json';
const MAX_REQUESTS_PER_RUN = 50;

const namesToIgnore = [
    'example1.eth',
    'example2.eth',
    // Добавьте сюда другие имена, которые нужно игнорировать
];

let avatarCache = {};

function loadCache() {
    if (fs.existsSync(CACHE_FILE)) {
        const cacheData = fs.readFileSync(CACHE_FILE, 'utf-8');
        avatarCache = JSON.parse(cacheData);
    }
}

function saveCache() {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(avatarCache, null, 2));
}

async function getENSAvatarInfo(ensName) {
    if (ensName in avatarCache) {
        console.log(`Использую кэшированный результат для ${ensName}`);
        return avatarCache[ensName];
    }

    try {
        const resolver = await provider.getResolver(ensName);
        if (!resolver) {
            console.log(`Resolver не найден для ${ensName}`);
            avatarCache[ensName] = null;
            saveCache();
            return null;
        }

        const textRecord = await resolver.getText('avatar');
        const avatarUrl = await provider.getAvatar(ensName);

        const result = { textRecord, avatarUrl };
        avatarCache[ensName] = result;
        saveCache();
        return result;
    } catch (error) {
        console.error(`Ошибка при получении информации об аватаре для ${ensName}:`, error);
        avatarCache[ensName] = null;
        saveCache();
        return null;
    }
}

function parseIpfsUrl(url) {
    if (url.startsWith('ipfs://')) {
        const parts = url.replace('ipfs://', '').split('/');
        return { cid: parts[0], path: parts.slice(1).join('/') };
    }
    return null;
}

async function downloadWithTimeout(url, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

async function downloadAvatar(ensName, avatarInfo) {
    if (fs.existsSync(`avatars/${ensName}.jpg`) || 
        fs.existsSync(`avatars/${ensName}.png`) || 
        fs.existsSync(`avatars/${ensName}.gif`) ||
        fs.existsSync(`avatars/${ensName}.webp`) ||
        fs.existsSync(`avatars/${ensName}.svg`)) {
        console.log(`Аватар для ${ensName} уже существует, пропускаем скачивание`);
        return;
    }

    const { textRecord, avatarUrl } = avatarInfo;
    console.log(`Текстовая запись аватара для ${ensName}: ${textRecord}`);
    console.log(`URL аватара от getAvatar для ${ensName}: ${avatarUrl}`);

    let downloadUrl = avatarUrl;
    let response;
    let fileContent;
    let fileExtension;

    try {
        if (avatarUrl && avatarUrl.startsWith('data:')) {
            // Обработка Data URL
            const matches = avatarUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches.length !== 3) {
                throw new Error('Invalid Data URL');
            }
            const contentType = matches[1];
            const base64Data = matches[2];
            fileContent = Buffer.from(base64Data, 'base64');

            if (contentType === 'image/svg+xml') {
                fileExtension = 'svg';
            } else {
                console.log(`Неподдерживаемый тип данных для Data URL: ${contentType}`);
                return;
            }
        } else if (textRecord.startsWith('http')) {
            response = await downloadWithTimeout(avatarUrl);
        } else if (textRecord.startsWith('eip155:')) {
            if (!avatarUrl) {
                console.log(`Пропускаем EIP запись для ${ensName}, так как не удалось получить ссылку через getAvatar`);
                return;
            }
            try {
                response = await downloadWithTimeout(avatarUrl, 10000); // 10 секунд таймаут
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log(`Таймаут при получении EIP аватара для ${ensName}, пропускаем`);
                    return;
                }
                throw error;
            }
        } else if (textRecord.startsWith('ipfs://')) {
            try {
                if (avatarUrl) {
                    response = await downloadWithTimeout(avatarUrl);
                } else {
                    throw new Error('avatarUrl не доступен');
                }
            } catch (error) {
                console.log(`Не удалось скачать с getAvatar URL, пробуем w3s.link`);
                const ipfsData = parseIpfsUrl(textRecord);
                if (ipfsData) {
                    const w3sUrl = `https://${ipfsData.cid}.ipfs.w3s.link/${ipfsData.path}`;
                    response = await downloadWithTimeout(w3sUrl);
                    downloadUrl = w3sUrl;
                }
            }
        } else {
            console.log(`Неизвестный формат записи аватара для ${ensName}, пропускаем`);
            return;
        }

        if (response) {
            fileContent = response.data;
            const contentType = response.headers['content-type'];

            if (contentType.includes('image/jpeg')) fileExtension = 'jpg';
            else if (contentType.includes('image/png')) fileExtension = 'png';
            else if (contentType.includes('image/gif')) fileExtension = 'gif';
            else if (contentType.includes('image/webp')) fileExtension = 'webp';
            else if (contentType.includes('image/svg+xml')) fileExtension = 'svg';
            else fileExtension = 'img';
        }

        if (fileContent) {
            const fileName = `avatars/${ensName}.${fileExtension}`;
            fs.writeFileSync(fileName, fileContent);
            console.log(`Аватар для ${ensName} успешно сохранен как ${fileName}`);
        } else {
            throw new Error('Не удалось получить данные аватара');
        }
    } catch (error) {
        console.error(`Не удалось скачать аватар для ${ensName}:`, error.message);
    }
}
function readCSV(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return csvParse(fileContent);
}

async function main() {
    loadCache();

    if (!fs.existsSync('avatars')) {
        fs.mkdirSync('avatars');
    }

    const csvData = readCSV('public/data/d_ledgers.csv');
    
    const ensNames = [...new Set(csvData
        .map(row => row.To_name)
        .filter(name => name && name.endsWith('.eth') && !namesToIgnore.includes(name)))];

    console.log(`Найдено ${ensNames.length} уникальных ENS имен (исключая игнорируемые)`);

    let processedCount = 0;
    let apiRequestCount = 0;

    for (const ensName of ensNames) {
        if (apiRequestCount >= MAX_REQUESTS_PER_RUN) {
            console.log(`Достигнут лимит API запросов (${MAX_REQUESTS_PER_RUN}). Останавливаем обработку.`);
            break;
        }

        if (namesToIgnore.includes(ensName)) {
            console.log(`Пропускаем ${ensName}, так как оно находится в списке игнорируемых`);
            continue;
        }

        if (!(ensName in avatarCache)) {
            apiRequestCount++;
        }

        const avatarInfo = await getENSAvatarInfo(ensName);
        if (avatarInfo) {
            await downloadAvatar(ensName, avatarInfo);
        } else {
            console.log(`Информация об аватаре не найдена для ${ensName}`);
        }
        processedCount++;

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Обработано ${processedCount} ENS имен`);
    console.log(`Выполнено ${apiRequestCount} запросов к API`);
    console.log('Скачивание аватаров завершено');
}

main().catch(console.error);