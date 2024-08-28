import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { csvParse } from 'd3-dsv';
import cron from 'node-cron';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

const csvFilePath = path.join(__dirname, 'public', 'data', 'd_ledgers.csv');
let df;
try {
    const csvData = fs.readFileSync(csvFilePath, 'utf8');
    df = csvParse(csvData);
    df = df.map(row => {
        if (row['Transaction Hash'] === 'Stream') {
          return { ...row, To_category: 'Stream' };
        }
        return row;
      });
} catch (error) {
    console.error('Error reading CSV file:', error);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

function saveFlowDataToJSON(flowData) {
    const jsonFilePath = path.join(__dirname, 'public', 'data', 'flow_data.json');
    try {
        fs.writeFileSync(jsonFilePath, JSON.stringify(flowData, null, 2));
    } catch (error) {
        console.error('Error writing to JSON file:', error);
    }
}

// Function to perform interquarter transactions.
function getNextQuarter(currentQuarter) {
    const [year, q] = currentQuarter.split('Q');
    const quarter = parseInt(q);
    const nextQuarter = (quarter % 4) + 1;
    const nextYear = nextQuarter === 1 ? parseInt(year) + 1 : parseInt(year);
    return `${nextYear}Q${nextQuarter}`;
}

// Function to calculate quarters. Helps set positions for nodes.
function countUniqueQuarters(dataFrame) {
    const uniqueQuarters = new Set();
    dataFrame.forEach(row => {
        uniqueQuarters.add(row.Quarter);
    });
    return uniqueQuarters.size;
}

// Main function to create Sankey data.
function createSankeyData(df, bigPicture = false, quarter = null, walletFilter, hideMode = true) {
    
    console.log('Creating Sankey data:', { bigPicture, quarter, walletFilter, hideMode });
    // Special Wallet = Payment Account
    const specialWallets = {
        'Ecosystem': 0.9,
        'Public Goods': 0.9,
        'Metagov': 0.9,
        'Community WG': 0.9,
        'Providers': 0.9
    };
    const colorMap = {
        'USDC': '#5294e2',
        'ETH': '#b97cf3',
        'ENS': '#5ac8fa'
    };
    const colorHideModeMap = {
        'USDC': '#5294e233',
        'ETH' : '#b97cf333',
        'ENS': '#5ac8fa33'
    }

    let flowData = {};

    let categoryMode = true;

    let nodes = [];
    let nodeIndices = {};
    let linkSources = [];
    let linkTargets = [];
    let linkReceipts = [];
    let linkValues = [];
    let linkColors = [];
    let linkAlternativeColors = [];
    let linkLabels = [];
    let nodeCustomdata = [];
    let nodeColors = [];
    let nodeX = [];
    let nodeY = [];
    let safeYAxisImport = [];

    let nodeSenderSafeExport = [];



    let linkCustomDataDate = [];
    let linkCustomDataValue = [];
    let linkCustomDataSymbol = [];
    let linkCustomDataUSD = [];
    let linkCustomDataTo = [];
    let linkCustomDataFrom = [];
    let linkCustomDataQtr = [];
    let linkCustomDataAddr = [];

    // Variables for dividing into quarters in Big Picture mode
    let quarterCount = countUniqueQuarters(df);
    let border = 0.01;
    let quarterNumber = (1 - border) / quarterCount;

    // Variables for positioning nodes

    // In big picture:
    let startPoint = 0;

    // For detailed
    let registrarZone = 0.005;
    
    let daoWalletZone = 0.01;
    let daoWalletZoneRecipients = 0;
    let daoWalletList = [];

    let ecosystemZone = 0.15;
    let ecosystemZoneRecipients, ecosystemZoneSenders = ecosystemZone;

    let publicGoodsZone = 0.405;
    let publicGoodsZoneRecipients, publicGoodsZoneSenders = publicGoodsZone;

    let metagovZone = 0.71;
    let metagovZoneRecipient, metagovZoneSenders = metagovZone;

    let communityWGZone = 0.85;
    let communityWGZoneRecipients, communityWGZoneSenders = communityWGZone;

    let spsZone = 0.9;
    let spsZoneRecipients, spsZoneSenders = spsZone;

    // For catergory mode
    let registrarZoneCat = 0.075;

    let daoWalletZoneCat = 0.125;
    let daoWalletZoneRecipientsCat = 0;

    let ecosystemZoneCat = 0.27;
    let ecosystemZoneRecipientsCat, ecosystemZoneSendersCat = ecosystemZoneCat;
    let zoneSendersList = [];

    let publicGoodsZoneCat = 0.51;
    let publicGoodsZoneRecipientsCat, publicGoodsZoneSendersCat = publicGoodsZoneCat;

    let metagovZoneCat = 0.67;
    let metagovZoneRecipientCat, metagovZoneSendersCat = metagovZoneCat;

    let communityWGZoneCat = 0.74;
    let communityWGZoneRecipientsCat = communityWGZoneCat;

    let spsZoneCat = 0.83;
    let spsZoneRecipientsCat, spsZoneSendersCat = spsZoneCat;

    // In quarterly display:
    let daoWalletY = 0.2;
    let daoWalletX = 0.05;
    let lastDaoWalletY = daoWalletY;

    let lastX = 0.95;
    let specialWalletsX = 0.3;
    let daoWalletRecipients = [];

    let lastEcosystemY = 0;
    let ecosystemRecipients = [];
    let ecosystemSenders = [];
    let lastEcosystemSenderY = daoWalletY + 0.2;

    let lastPublicGoodsY = 0;
    let publicGoodsRecipients = [];
    let publicGoodsSenders = [];
    let lastPublicGoodsSenderY = lastEcosystemSenderY + 0.2;

    let lastMetagovY = 0;
    let metagovRecipients = [];
    let metagovSenders = [];
    let lastMetagovSenderY = lastPublicGoodsSenderY + 0.2; 

    let lastCommunityWGY = 0;
    let communityWGRecipients = [];
    let communityWGSenders = [];
    let lastCommunityWGSenderY = lastMetagovSenderY + 0.2;

    let lastSpsY = 0;
    let spsRecipients = [];
    let spsSenders = [];
    let lastSpsSenderY = lastMetagovSenderY + 0.2;

    let qtrSendersList = [];
    let qtrReceiversList = [];

    // Flags
    let interCatFlag = false;
    let interSenderFlag = false;
    let interSenderEcoFlag = false;
    let interSenderPGFlag = false;
    let interSenderMGFlag = false;
    let senderFlag = false;
    
    // Conditions for different models
    let condition1 = false;
    let condition2 = false;
    let condition3 = false;
    let innerTransfers = false;

    // Auxiliary Variables
    let daoWalletRecipientsSet = new Set();
    let specialWalletSenders = new Set();
    let specialWalletTransactions = [];
    let dummyNodeXY = -10000;

    let unspentNodes = new Set();

    // Condition checker
    df.forEach(row => {
        if (quarter !== 'big_picture' && row['Transaction Hash'] === 'Interquarter') {
            return;
        }

        const sender = row.From_name;
        const receiver = row.To_name;
        const qtr = row.Quarter;

        if (!flowData[qtr]) {
            flowData[qtr] = [];
        }    

        if (sender === 'DAO Wallet') {
            if (!specialWallets.hasOwnProperty(receiver)) {
                if (walletFilter) {
                    condition1 = false;
                } else {
                    condition1 = true;
                } daoWalletRecipientsSet.add(receiver);
            } else {
                if (walletFilter) {
                    condition1 = false;
                } else {
                    condition2 = true;
                } daoWalletRecipientsSet.add(receiver);
            }
        }
        

        if (specialWallets.hasOwnProperty(receiver) && sender !== 'DAO Wallet') {
            specialWalletSenders.add(sender);
            specialWalletTransactions.push({ sender, receiver });
        }
    });


    specialWalletTransactions.forEach(({ sender, receiver }) => {
        if (specialWallets.hasOwnProperty(sender) && specialWallets.hasOwnProperty(receiver)) {
            condition3 = false;
            innerTransfers = true;
        } else if (specialWallets.hasOwnProperty(sender) && specialWallets.hasOwnProperty(receiver)) {
            condition3 = false;
        } else {
            condition3 = true;
        }
    });

    // Model assigner
    let model;
    if (condition1 && condition2 && !condition3) {
        model = (quarter === '2024Q3') ? 'temp' : 1;
    } else if (condition1 && !condition2 && !condition3) {
        model = 2;
    } else if (condition2 && condition3 && !condition1) {
        model = 3;
    } else if (condition1 && condition3 && !condition2) {
        model = 4;
    } else if (condition1 && condition2 && condition3) {
        model = (quarter === '2022Q3') ? 'dissolution' : 5;
    } else if (walletFilter) {
        model = 'detailed';
    } else {
        model = 'NaN'
    }

    let somevar = 0;
    let counter = false;
    let counter2 = false;

    // Assigning positions to nodes;
    // The assignment is based on the enabled display modes, models, and node names;
    // These complex structures can and should be simplified in the future;
    // But at the moment they are quite detailed so that I can remain flexible.
    const getNodeIndex = (nodeName, sender, receiver, model, quarter = null) => {
        const specialWallets = ['Ecosystem', 'Public Goods', 'Metagov', 'Community WG', 'Providers'];
        if (bigPicture) {
            if (!nodeIndices[nodeName]) {
                nodeIndices[nodeName] = nodes.length;
                nodes.push(nodeName);
                const account = df.find(d => d.To_name === nodeName);
                nodeCustomdata.push(`Account: ${account ? account.From : 'N/A'}`);
                nodeColors.push('rgba(255, 255, 255, 0)');
                if (nodeName.startsWith('DAO Wallet')) {
                    nodeColors.push('rgba(0, 0, 0, 0)')
                }

                if (!categoryMode) {
                    if (!hideMode) {
                        registrarZone = 0.0175;
                        daoWalletZone = 0.11;
                        ecosystemZone = 0.245;
                        publicGoodsZone = 0.494;
                        metagovZone = 0.79;
                        communityWGZone = 0.93;
                        spsZone = 0.975;
                        if (nodeName.startsWith('Registrar')) {
                            nodeX.push(registrarZoneCat)
                        }
                    }
                    if (nodeName.includes('2022Q1')) {
                        startPoint = quarterNumber*0 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.004;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.004);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                        } else if (nodeName.startsWith('Community WG')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(communityWGZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Community WG')) {
                            if (interCatFlag) {
                                communityWGZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(communityWGZoneRecipients += 0.0025);
                        }

                    } else if (nodeName.includes('2022Q2')) {
                        startPoint = quarterNumber*1 - quarterNumber + border
                        if (nodeName.includes('Registrar')) {
                            if (hideMode) {
                                nodeX.push(startPoint - quarterNumber + 3.5*border)
                                nodeY.push(registrarZone)
                            } else {
                                nodeX.push(startPoint - (quarterNumber/2))
                                nodeY.push(registrarZone)
                            }
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (hideMode) {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.02;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber -  3.5*border);
                                nodeY.push(daoWalletZoneRecipients += 0.02);
                            } else {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.1;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber/2);
                                nodeY.push(daoWalletZoneRecipients += 0.01);
                            }
                            ecosystemZoneRecipients = ecosystemZone;
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0075);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0075);
                            metagovZoneRecipient = metagovZone;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.0125;
                                interCatFlag = false;
                            }
                            metagovZoneSenders = metagovZone;
                            spsZoneRecipients = spsZone;
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipient += 0.0075);
                            communityWGZoneRecipients = communityWGZone;
                        } else if (nodeName.startsWith('Community WG')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(communityWGZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Community WG')) {
                            if (interCatFlag) {
                                communityWGZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(communityWGZoneRecipients += 0.0075);
                        }

                    } else if (nodeName.includes('2022Q3')) {
                        startPoint = quarterNumber*2 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            if (hideMode) {
                                nodeX.push(startPoint - quarterNumber + 3.5*border)
                                nodeY.push(registrarZone)
                            } else {
                                nodeX.push(startPoint - (quarterNumber/2))
                                nodeY.push(registrarZone)
                            }
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (hideMode) {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.02;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber -  3.5*border);
                                nodeY.push(daoWalletZoneRecipients += 0.02);
                            } else {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.1;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber/2);
                                nodeY.push(daoWalletZoneRecipients += 0.01);
                            }
                            ecosystemZoneRecipients = ecosystemZone;
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0075);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0075);
                            metagovZoneRecipient = metagovZone;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.0125;
                                interCatFlag = false;
                            }
                            metagovZoneSenders = metagovZone;
                            spsZoneRecipients = spsZone;
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipient += 0.0075);
                            communityWGZoneRecipients = communityWGZone;
                        } else if (nodeName.startsWith('Community WG')) {
                            nodeX.push(2*startPoint - border);
                            nodeY.push(communityWGZone);
                            interCatFlag = true;
                        }
                    } else if (nodeName.includes('2022Q4')) {
                        startPoint = quarterNumber*3 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            if (hideMode) {
                                nodeX.push(startPoint - quarterNumber + 3.5*border)
                                nodeY.push(registrarZone)
                            } else {
                                nodeX.push(startPoint - (quarterNumber/2))
                                nodeY.push(registrarZone)
                            }
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (hideMode) {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.02;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber -  3.5*border);
                                nodeY.push(daoWalletZoneRecipients += 0.02);
                            } else {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.1;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber/2);
                                nodeY.push(daoWalletZoneRecipients += 0.01);
                            }
                            ecosystemZoneRecipients = ecosystemZone;
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0075);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0075);
                            metagovZoneRecipient = metagovZone;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.0125;
                                interCatFlag = false;
                            }
                            metagovZoneSenders = metagovZone;
                            spsZoneRecipients = spsZone;
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipient += 0.0075);
                            communityWGZoneRecipients = communityWGZone;
                        }

                    } else if (nodeName.includes('2023Q1')) {
                        startPoint = quarterNumber*4 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            if (hideMode) {
                                nodeX.push(startPoint - quarterNumber + 3.5*border)
                                nodeY.push(registrarZone)
                            } else {
                                nodeX.push(startPoint - (quarterNumber/2))
                                nodeY.push(registrarZone)
                            }
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (hideMode) {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.02;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber -  3.5*border);
                                nodeY.push(daoWalletZoneRecipients += 0.02);
                            } else {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.1;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber/2);
                                nodeY.push(daoWalletZoneRecipients += 0.01);
                            }
                            ecosystemZoneRecipients = ecosystemZone;
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0075);
                            ecosystemZoneSenders = ecosystemZone;
                            publicGoodsZoneRecipients = publicGoodsZone;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderEcoFlag) {
                                ecosystemZoneSenders -= 0.04;
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSenders += 0.0065)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0075);
                            publicGoodsZoneSenders = publicGoodsZone;
                            metagovZoneRecipient = metagovZone;
                            interSenderPGFlag = true;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderPGFlag) {
                                publicGoodsZoneSenders -= 0.03;
                                interSenderPGFlag = false;
                            }
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.0045)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.0125;
                                interCatFlag = false;
                            }
                            metagovZoneSenders = metagovZone;
                            spsZoneRecipients = spsZone;
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipient += 0.0075);
                            communityWGZoneRecipients = communityWGZone;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderMGFlag) {
                                metagovZoneSenders -= 0.03;
                                interSenderMGFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSenders += 0.0045)
                            zoneSendersList.push(nodeName)
                        }
                    } else if (nodeName.includes('2023Q2')) {
                        startPoint = quarterNumber*5 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            if (hideMode) {
                                nodeX.push(startPoint - quarterNumber + 3.5*border)
                                nodeY.push(registrarZone)
                            } else {
                                nodeX.push(startPoint - (quarterNumber/2))
                                nodeY.push(registrarZone)
                            }
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (hideMode) {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.02;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber -  3.5*border);
                                nodeY.push(daoWalletZoneRecipients += 0.02);
                            } else {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.1;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber/2);
                                nodeY.push(daoWalletZoneRecipients += 0.01);
                            }
                            ecosystemZoneRecipients = ecosystemZone;
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0075);
                            ecosystemZoneSenders = ecosystemZone;
                            publicGoodsZoneRecipients = publicGoodsZone;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderEcoFlag) {
                                ecosystemZoneSenders -= 0.04;
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSenders += 0.0065)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0075);
                            publicGoodsZoneSenders = publicGoodsZone;
                            metagovZoneRecipient = metagovZone;
                            interSenderPGFlag = true;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderPGFlag) {
                                publicGoodsZoneSenders -= 0.03;
                                interSenderPGFlag = false;
                            }
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.0045)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.0125;
                                interCatFlag = false;
                            }
                            metagovZoneSenders = metagovZone;
                            spsZoneRecipients = spsZone;
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipient += 0.0075);
                            communityWGZoneRecipients = communityWGZone;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderMGFlag) {
                                metagovZoneSenders -= 0.03;
                                interSenderMGFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSenders += 0.0045)
                            zoneSendersList.push(nodeName)
                        }
                    } else if (nodeName.includes('2023Q3')) {
                        startPoint = quarterNumber*6 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            if (hideMode) {
                                nodeX.push(startPoint - quarterNumber + 3.5*border)
                                nodeY.push(registrarZone)
                            } else {
                                nodeX.push(startPoint - (quarterNumber/2))
                                nodeY.push(registrarZone)
                            }
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (hideMode) {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.02;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber -  3.5*border);
                                nodeY.push(daoWalletZoneRecipients += 0.02);
                            } else {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.1;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber/2);
                                nodeY.push(daoWalletZoneRecipients += 0.01);
                            }
                            ecosystemZoneRecipients = ecosystemZone;
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0075);
                            ecosystemZoneSenders = ecosystemZone;
                            publicGoodsZoneRecipients = publicGoodsZone;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderEcoFlag) {
                                ecosystemZoneSenders -= 0.04;
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSenders += 0.0065)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0075);
                            publicGoodsZoneSenders = publicGoodsZone;
                            metagovZoneRecipient = metagovZone;
                            interSenderPGFlag = true;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderPGFlag) {
                                publicGoodsZoneSenders -= 0.03;
                                interSenderPGFlag = false;
                            }
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.0045)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.0125;
                                interCatFlag = false;
                            }
                            metagovZoneSenders = metagovZone;
                            spsZoneRecipients = spsZone;
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipient += 0.0075);
                            communityWGZoneRecipients = communityWGZone;
                            interSenderMGFlag = true;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderMGFlag) {
                                metagovZoneSenders -= 0.04;
                                interSenderMGFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSenders += 0.0065)
                            zoneSendersList.push(nodeName)
                        }
                    } else if (nodeName.includes('2023Q4')) {
                        startPoint = quarterNumber*7 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            if (hideMode) {
                                nodeX.push(startPoint - quarterNumber + 3.5*border)
                                nodeY.push(registrarZone)
                            } else {
                                nodeX.push(startPoint - (quarterNumber/2))
                                nodeY.push(registrarZone)
                            }
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (hideMode) {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.02;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber -  3.5*border);
                                nodeY.push(daoWalletZoneRecipients += 0.02);
                            } else {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.075;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber/2);
                                nodeY.push(daoWalletZoneRecipients += 0.02);
                            }
                            ecosystemZoneRecipients = ecosystemZone;
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0075);
                            ecosystemZoneSenders = ecosystemZone;
                            publicGoodsZoneRecipients = publicGoodsZone;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderEcoFlag) {
                                ecosystemZoneSenders -= 0.04;
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSenders += 0.0065)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0075);
                            publicGoodsZoneSenders = publicGoodsZone;
                            metagovZoneRecipient = metagovZone;
                            interSenderPGFlag = true;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderPGFlag) {
                                publicGoodsZoneSenders -= 0.03;
                                interSenderPGFlag = false;
                            }
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.0045)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.0125;
                                interCatFlag = false;
                            }
                            metagovZoneSenders = metagovZone;
                            spsZoneRecipients = spsZone;
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipient += 0.0075);
                            communityWGZoneRecipients = communityWGZone;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderMGFlag) {
                                metagovZoneSenders -= 0.03;
                                interSenderMGFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSenders += 0.0045)
                            zoneSendersList.push(nodeName)
                        }

                    } else if (nodeName.includes('2024Q1')) {
                        startPoint = quarterNumber*8 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            if (hideMode) {
                                nodeX.push(startPoint - quarterNumber + 3.5*border)
                                nodeY.push(registrarZone)
                            } else {
                                nodeX.push(startPoint - (quarterNumber/2))
                                nodeY.push(registrarZone)
                            }
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (hideMode) {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.02;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber -  3.5*border);
                                nodeY.push(daoWalletZoneRecipients += 0.02);
                            } else {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.1;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber/2);
                                nodeY.push(daoWalletZoneRecipients += 0.01);
                            }
                            ecosystemZoneRecipients = ecosystemZone;
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0075);
                            ecosystemZoneSenders = ecosystemZone;
                            publicGoodsZoneRecipients = publicGoodsZone;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderEcoFlag) {
                                ecosystemZoneSenders -= 0.04;
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSenders += 0.0065)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0075);
                            publicGoodsZoneSenders = publicGoodsZone;
                            metagovZoneRecipient = metagovZone;
                            interSenderPGFlag = true;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderPGFlag) {
                                publicGoodsZoneSenders -= 0.03;
                                interSenderPGFlag = false;
                            }
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.0045)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.0125;
                                interCatFlag = false;
                            }
                            metagovZoneSenders = metagovZone;
                            spsZoneRecipients = spsZone;
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipient += 0.0075);
                            interSenderMGFlag = true;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderMGFlag) {
                                metagovZoneSenders -= 0.04;
                                interSenderMGFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSenders += 0.0065)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Providers')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(spsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Providers')) {
                            if (interCatFlag) {
                                if (hideMode) {
                                    spsZoneRecipients += 0.0125;
                                } else {
                                    spsZoneRecipients += 0.0075;
                                }
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            if (hideMode) {
                                nodeY.push(spsZoneRecipients += 0.0075);
                            } else {
                                nodeY.push(spsZoneRecipients += 0.0065);
                            }
                        }
                    } else if (nodeName.includes('2024Q2')) {
                        startPoint = quarterNumber*9 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            if (hideMode) {
                                nodeX.push(startPoint - quarterNumber + 3.5*border)
                                nodeY.push(registrarZone)
                            } else {
                                nodeX.push(startPoint - (quarterNumber/2))
                                nodeY.push(registrarZone)
                            }
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (hideMode) {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.02;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber -  3.5*border);
                                nodeY.push(daoWalletZoneRecipients += 0.02);
                            } else {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.1;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber/2);
                                nodeY.push(daoWalletZoneRecipients += 0.01);
                            }
                            ecosystemZoneRecipients = ecosystemZone;
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0075);
                            ecosystemZoneSenders = ecosystemZone;
                            publicGoodsZoneRecipients = publicGoodsZone;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderEcoFlag) {
                                ecosystemZoneSenders -= 0.04;
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSenders += 0.0065)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0075);
                            publicGoodsZoneSenders = publicGoodsZone;
                            metagovZoneRecipient = metagovZone;
                            interSenderPGFlag = true;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderPGFlag) {
                                publicGoodsZoneSenders -= 0.03;
                                interSenderPGFlag = false;
                            }
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.0045)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.0125;
                                interCatFlag = false;
                            }
                            metagovZoneSenders = metagovZone;
                            spsZoneRecipients = spsZone;
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipient += 0.0075);
                            interSenderMGFlag = true;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderMGFlag) {
                                metagovZoneSenders -= 0.04;
                                interSenderMGFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSenders += 0.0065)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Providers')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(spsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Providers')) {
                            if (interCatFlag) {
                                if (hideMode) {
                                    spsZoneRecipients += 0.0125;
                                } else {
                                    spsZoneRecipients += 0.0075;
                                }
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            if (hideMode) {
                                nodeY.push(spsZoneRecipients += 0.0075);
                            } else {
                                nodeY.push(spsZoneRecipients += 0.0065);
                            }
                        }
                    } else if (nodeName.includes('2024Q3')) {
                        startPoint = quarterNumber*10 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            if (hideMode) {
                                nodeX.push(startPoint - quarterNumber + 3.5*border)
                                nodeY.push(registrarZone)
                            } else {
                                nodeX.push(startPoint - (quarterNumber/2))
                                nodeY.push(registrarZone)
                            }
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (hideMode) {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.02;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber -  3.5*border);
                                nodeY.push(daoWalletZoneRecipients += 0.02);
                            } else {
                                if (interCatFlag) {
                                    daoWalletZoneRecipients += 0.1;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber/2);
                                nodeY.push(daoWalletZoneRecipients += 0.01);
                            }
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0075);
                            ecosystemZoneSenders = ecosystemZone;
                            publicGoodsZoneRecipients = publicGoodsZone;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderEcoFlag) {
                                ecosystemZoneSenders -= 0.04;
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSenders += 0.0065)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.0125;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0075);
                            publicGoodsZoneSenders = publicGoodsZone;
                            metagovZoneRecipient = metagovZone;
                            interSenderPGFlag = true;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderPGFlag) {
                                publicGoodsZoneSenders -= 0.03;
                                interSenderPGFlag = false;
                            }
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.0045)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (hideMode) {
                                if (interCatFlag) {
                                    metagovZoneRecipient += 0.0125;
                                    nodeX.push(startPoint + quarterNumber -  3.5*border);
                                    nodeY.push(metagovZoneRecipient += 0.0075);
                                    metagovZoneRecipient += 0.0075;
                                    interCatFlag = false;
                                } else {
                                    nodeX.push(startPoint + quarterNumber -  3.5*border);
                                    nodeY.push(metagovZoneRecipient += 0.0075);
                                }
                            } else {
                                if (interCatFlag) {
                                    metagovZoneRecipient += 0.0125;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber -  3.5*border);
                                nodeY.push(metagovZoneRecipient += 0.0075);
                            }
                            metagovZoneSenders = metagovZone;
                            spsZoneRecipients = spsZone;
                            interSenderMGFlag = true;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderMGFlag) {
                                metagovZoneSenders -= 0.04;
                                interSenderMGFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSenders += 0.0065)
                            zoneSendersList.push(nodeName)
                        } else if (nodeName.startsWith('Providers')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(spsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Providers')) {
                            if (interCatFlag) {
                                if (hideMode) {
                                    spsZoneRecipients += 0.0125;
                                } else {
                                    spsZoneRecipients += 0.0075;
                                }
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            if (hideMode) {
                                nodeY.push(spsZoneRecipients += 0.0075);
                            } else {
                                nodeY.push(spsZoneRecipients += 0.0065);
                            }
                        }                     
                    } else if (nodeName.includes('2024Q4')) {
                        startPoint = quarterNumber*11 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.002);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                            spsZoneRecipients = spsZone;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(metagovZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(spsZoneRecipients += 0.0025);
                        } else if (receiver.startsWith('Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSenders -= 0.0075)
                        }
                    } else if (nodeName.includes('2025Q1')) {
                        startPoint = quarterNumber*12 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.002);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                            spsZoneRecipients = spsZone;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(metagovZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(spsZoneRecipients += 0.0025);
                        } else if (receiver.startsWith('Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSenders -= 0.0075)
                        }
                    } else if (nodeName.includes('2025Q2')) {
                        startPoint = quarterNumber*14 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.002);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                            spsZoneRecipients = spsZone;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(metagovZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(spsZoneRecipients += 0.0025);
                        } else if (receiver.startsWith('Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSenders -= 0.0075)
                        }
                    } else if (nodeName.includes('2025Q3')) {
                        startPoint = quarterNumber*15 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.002);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                            spsZoneRecipients = spsZone;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(metagovZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(spsZoneRecipients += 0.0025);
                        } else if (receiver.startsWith('Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSenders -= 0.0075)
                        }
                    } else if (sender === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    }
                } else if (categoryMode) {
                    if (!hideMode) {
                        daoWalletZoneCat = 0.2;
                        ecosystemZoneCat = 0.45;
                        publicGoodsZoneCat = 0.6;
                        metagovZoneCat = 0.74;
                        communityWGZoneCat = 0.88;
                        spsZoneCat = 0.88;
                        if (nodeName.startsWith('Registrar')) {
                            nodeX.push(registrarZoneCat)
                        }
                    }
                    if (nodeName.includes('2022Q1')) {
                        startPoint = quarterNumber*0 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            nodeX.push(startPoint - quarterNumber + 2.5*border)
                            nodeY.push(registrarZoneCat)
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                if (hideMode) {
                                    daoWalletZoneRecipientsCat += 0.025;
                                } else {
                                    daoWalletZoneRecipientsCat += 0.14;
                                }
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.0075);
                            } else {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.01);
                            }
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                            ecosystemZoneSendersCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.03;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.01);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.01);
                            }
                            metagovZoneRecipientCat = metagovZoneCat;
                            metagovZoneSendersCat = metagovZoneCat;
                            interSenderFlag = true;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(metagovZoneRecipientCat += 0.0125);
                            } else {
                                nodeY.push(metagovZoneRecipientCat += 0.01);
                            }
                            interSenderFlag = true;
                            communityWGZoneRecipientsCat = communityWGZoneCat;
                        } else if (nodeName.startsWith('Community WG')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(communityWGZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Community WG')) {
                            if (interCatFlag) {
                                communityWGZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            nodeY.push(communityWGZoneRecipientsCat += 0.01);
                        }
                    
                    } else if (nodeName.includes('2022Q2')) {
                        startPoint = quarterNumber*1 - quarterNumber + border
                        if (nodeName.includes('Registrar')) {
                            nodeX.push(startPoint - quarterNumber + 2.5*border)
                            nodeY.push(registrarZoneCat)
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                if (hideMode) {
                                    daoWalletZoneRecipientsCat += 0.025;
                                } else {
                                    daoWalletZoneRecipientsCat += 0.14;
                                }
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.0075);
                            } else {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.01);
                            }
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                            ecosystemZoneSendersCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.03;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.01);
                            }
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.01);
                            }
                            metagovZoneRecipientCat = metagovZoneCat;
                            metagovZoneSendersCat = metagovZoneCat;
                            interSenderFlag = true;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(metagovZoneRecipientCat += 0.0125);
                            } else {
                                nodeY.push(metagovZoneRecipientCat += 0.01);
                            }
                            communityWGZoneRecipientsCat = communityWGZoneCat;
                            interSenderFlag = true;
                        } else if (nodeName.startsWith('Community WG')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(communityWGZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Community WG')) {
                            if (interCatFlag) {
                                communityWGZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            nodeY.push(communityWGZoneRecipientsCat += 0.01);
                        }
                    
                    } else if (nodeName.includes('2022Q3')) {
                        startPoint = quarterNumber*2 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            nodeX.push(startPoint - quarterNumber + 2.5*border)
                            nodeY.push(registrarZoneCat)
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                if (hideMode) {
                                    daoWalletZoneRecipientsCat += 0.025;
                                } else {
                                    daoWalletZoneRecipientsCat += 0.14;
                                }
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.0075);
                            } else {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.01);
                            }
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                            ecosystemZoneSendersCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.03;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.0075);
                            }
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem') && !sender.startsWith('Community WG')) {
                            if (interSenderEcoFlag) {
                                ecosystemZoneSendersCat -= 0.075
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(quarterNumber*3 - quarterNumber + border);
                            nodeY.push(ecosystemZoneSendersCat += 0.015)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.01);
                            }
                            metagovZoneRecipientCat = metagovZoneCat;
                            metagovZoneSendersCat = metagovZoneCat;
                            interSenderFlag = true;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(metagovZoneRecipientCat += 0.0125);
                            } else {
                                nodeY.push(metagovZoneRecipientCat += 0.01);
                            }
                            interSenderFlag = true;
                        } else if (nodeName.startsWith('Dissolution')) {
                            nodeX.push(startPoint);;
                            nodeY.push(communityWGZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Community WG')) {
                            if (interCatFlag) {
                                communityWGZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            nodeY.push(communityWGZoneRecipientsCat += 0.01);
                        }
                    
                    } else if (nodeName.includes('2022Q4')) {
                    startPoint = quarterNumber*3 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            nodeX.push(startPoint - quarterNumber + 2.5*border)
                            nodeY.push(registrarZoneCat)
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                if (hideMode) {
                                    daoWalletZoneRecipientsCat += 0.025;
                                } else {
                                    daoWalletZoneRecipientsCat += 0.14;
                                }
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.0075);
                            } else {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.01);
                            }
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                            ecosystemZoneSendersCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.03;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.01);
                            }
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderFlag) {
                                if (hideMode) {
                                    ecosystemZoneSendersCat += 0.035;
                                } else {
                                    ecosystemZoneSendersCat += 0.025
                                }
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.01);
                            }
                            metagovZoneRecipientCat = metagovZoneCat;
                            metagovZoneSendersCat = metagovZoneCat;
                            interSenderFlag = true;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/4));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(metagovZoneRecipientCat += 0.0125);
                            } else {
                                nodeY.push(metagovZoneRecipientCat += 0.01);
                            }
                            interSenderFlag = true;
                        } else if (nodeName.startsWith('Community WG')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(communityWGZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Community WG')) {
                            if (interCatFlag) {
                                communityWGZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            nodeY.push(communityWGZoneRecipientsCat += 0.01);
                        }
                    
                    } else if (nodeName.includes('2023Q1')) {
                        startPoint = quarterNumber*4 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            nodeX.push(startPoint - quarterNumber + 2.5*border)
                            nodeY.push(registrarZoneCat)
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                if (hideMode) {
                                    daoWalletZoneRecipientsCat += 0.025;
                                } else {
                                    daoWalletZoneRecipientsCat += 0.14;
                                }
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.0075);
                            } else {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.01);
                            }
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                            ecosystemZoneSendersCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.03;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.01);
                            }
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderEcoFlag) {
                                if (hideMode) {
                                    ecosystemZoneSendersCat -= 0.1
                                } else {
                                    ecosystemZoneSendersCat -= 0.075
                                }
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3));
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.01);
                            }
                            metagovZoneRecipientCat = metagovZoneCat;
                            metagovZoneSendersCat = metagovZoneCat;
                            interSenderFlag = true;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderFlag) {
                                publicGoodsZoneSendersCat -= 0.004
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(publicGoodsZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(metagovZoneRecipientCat += 0.0125);
                            } else {
                                nodeY.push(metagovZoneRecipientCat += 0.01);
                            }
                            interSenderMGFlag = true;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderMGFlag) {
                                metagovZoneSendersCat -= 0.06
                                interSenderMGFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);
                        }                 
                    } else if (nodeName.includes('2023Q2')) {
                        startPoint = quarterNumber*5 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            nodeX.push(startPoint - quarterNumber + 2.5*border)
                            nodeY.push(registrarZoneCat)
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                if (hideMode) {
                                    daoWalletZoneRecipientsCat += 0.025;
                                } else {
                                    daoWalletZoneRecipientsCat += 0.14;
                                }
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.0075);
                            } else {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.01);
                            }
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                            ecosystemZoneSendersCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                            ecosystemZoneSendersCat = ecosystemZoneCat + 0.005;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.03;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.01);
                            }
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderEcoFlag) {
                                if (hideMode) {
                                    ecosystemZoneSendersCat -= 0.1
                                } else {
                                    ecosystemZoneSendersCat -= 0.075
                                }
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.01);
                            }
                            metagovZoneRecipientCat = metagovZoneCat;
                            metagovZoneSendersCat = metagovZoneCat;
                            interSenderFlag = true;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderFlag) {
                                publicGoodsZoneSendersCat -= 0.004
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(publicGoodsZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(metagovZoneRecipientCat += 0.0125);
                            } else {
                                nodeY.push(metagovZoneRecipientCat += 0.01);
                            }
                            interSenderMGFlag = true;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderMGFlag) {
                                metagovZoneSendersCat -= 0.06
                                interSenderMGFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);
                        }
                    
                    } else if (nodeName.includes('2023Q3')) {
                        startPoint = quarterNumber*6 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            nodeX.push(startPoint - quarterNumber + 2.5*border)
                            nodeY.push(registrarZoneCat)
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                if (hideMode) {
                                    daoWalletZoneRecipientsCat += 0.025;
                                } else {
                                    daoWalletZoneRecipientsCat += 0.14;
                                }
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.0075);
                            } else {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.01);
                            }
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                            ecosystemZoneSendersCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                            ecosystemZoneSendersCat = ecosystemZoneCat + 0.005;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.03;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.01);
                            }
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderEcoFlag) {
                                if (hideMode) {
                                    ecosystemZoneSendersCat -= 0.1
                                } else {
                                    ecosystemZoneSendersCat -= 0.075
                                }
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.01);
                            }
                            metagovZoneRecipientCat = metagovZoneCat;
                            metagovZoneSendersCat = metagovZoneCat;
                            interSenderFlag = true;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderFlag) {
                                publicGoodsZoneSendersCat -= 0.004
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(publicGoodsZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(metagovZoneRecipientCat += 0.0125);
                            } else {
                                nodeY.push(metagovZoneRecipientCat += 0.01);
                            }
                            interSenderMGFlag = true;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderMGFlag) {
                                metagovZoneSendersCat -= 0.06
                                interSenderMGFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);
                        }       
                    
                    } else if (nodeName.includes('2023Q4')) {
                        startPoint = quarterNumber*7 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            nodeX.push(startPoint - quarterNumber + 2.5*border)
                            nodeY.push(registrarZoneCat)
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                if (hideMode) {
                                    daoWalletZoneRecipientsCat += 0.025;
                                } else {
                                    daoWalletZoneRecipientsCat += 0.125;
                                }
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.0075);
                            } else {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.03);
                            }
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                            ecosystemZoneSendersCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                            ecosystemZoneSendersCat = ecosystemZoneCat + 0.005;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.03;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.01);
                            }
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderEcoFlag) {
                                if (hideMode) {
                                    ecosystemZoneSendersCat -= 0.1
                                } else {
                                    ecosystemZoneSendersCat -= 0.075
                                }
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.01);
                            }
                            metagovZoneRecipientCat = metagovZoneCat;
                            metagovZoneSendersCat = metagovZoneCat;
                            interSenderFlag = true;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderFlag) {
                                publicGoodsZoneSendersCat -= 0.004
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(publicGoodsZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(metagovZoneRecipientCat += 0.0125);
                            } else {
                                nodeY.push(metagovZoneRecipientCat += 0.01);
                            }
                            interSenderMGFlag = true;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderMGFlag) {
                                metagovZoneSendersCat -= 0.06
                                interSenderMGFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);
                        }       
                    
                    } else if (nodeName.includes('2024Q1')) {
                        startPoint = quarterNumber*8 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            nodeX.push(startPoint - quarterNumber + 2.5*border)
                            nodeY.push(registrarZoneCat)
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                if (hideMode) {
                                    daoWalletZoneRecipientsCat += 0.025;
                                } else {
                                    daoWalletZoneRecipientsCat += 0.14;
                                }
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.0075);
                            } else {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.01);
                            }
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                            ecosystemZoneSendersCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                            ecosystemZoneSendersCat = ecosystemZoneCat + 0.03;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.03;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.01);
                            }
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderEcoFlag) {
                                if (hideMode) {
                                    ecosystemZoneSendersCat -= 0.1
                                } else {
                                    ecosystemZoneSendersCat -= 0.075
                                }
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.01);
                            }
                            metagovZoneRecipientCat = metagovZoneCat;
                            metagovZoneSendersCat = metagovZoneCat;
                            interSenderFlag = true;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderFlag) {
                                publicGoodsZoneSendersCat -= 0.004
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(publicGoodsZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(metagovZoneRecipientCat += 0.0125);
                            } else {
                                nodeY.push(metagovZoneRecipientCat += 0.01);
                            }
                            spsZoneRecipientsCat = spsZoneCat;
                            interSenderMGFlag = true;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderMGFlag) {
                                metagovZoneSendersCat -= 0.06
                                interSenderMGFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);     
                        } else if (nodeName.startsWith('Providers')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(spsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            nodeY.push(spsZoneRecipientsCat += 0.01);
                        } else if (receiver.startsWith('Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSendersCat -= 0.0075)
                        }
                    
                    } else if (nodeName.includes('2024Q2')) {
                        startPoint = quarterNumber*9 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            nodeX.push(startPoint - quarterNumber + 2.5*border)
                            nodeY.push(registrarZoneCat)
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                if (hideMode) {
                                    daoWalletZoneRecipientsCat += 0.025;
                                } else {
                                    daoWalletZoneRecipientsCat += 0.14;
                                }
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.0075);
                            } else {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.01);
                            }
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                            ecosystemZoneSendersCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                            ecosystemZoneSendersCat = ecosystemZoneCat + 0.03;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.03;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.01);
                            }
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderEcoFlag) {
                                if (hideMode) {
                                    ecosystemZoneSendersCat -= 0.1
                                } else {
                                    ecosystemZoneSendersCat -= 0.075
                                }
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.01);
                            }
                            metagovZoneRecipientCat = metagovZoneCat;
                            metagovZoneSendersCat = metagovZoneCat;
                            interSenderFlag = true;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderFlag) {
                                publicGoodsZoneSendersCat -= 0.004
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(publicGoodsZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(metagovZoneRecipientCat += 0.0125);
                            } else {
                                nodeY.push(metagovZoneRecipientCat += 0.01);
                            }
                            spsZoneRecipientsCat = spsZoneCat;
                            interSenderMGFlag = true;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderMGFlag) {
                                metagovZoneSendersCat -= 0.06
                                interSenderMGFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Providers')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(spsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            nodeY.push(spsZoneRecipientsCat += 0.01);
                        } else if (receiver.startsWith('Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSendersCat -= 0.0075)
                        }

                    } else if (nodeName.includes('2024Q3')) {
                        startPoint = quarterNumber*10 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            nodeX.push(startPoint - quarterNumber + 2.5*border)
                            nodeY.push(registrarZoneCat)
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                if (hideMode) {
                                    daoWalletZoneRecipientsCat += 0.025;
                                } else {
                                    daoWalletZoneRecipientsCat += 0.14;
                                }
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.0075);
                            } else {
                                nodeY.push(daoWalletZoneRecipientsCat += 0.01);
                            }
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                            spsZoneRecipientsCat = spsZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                            ecosystemZoneSendersCat = ecosystemZoneCat + 0.03;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.03;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(ecosystemZoneRecipientsCat += 0.01);
                            }
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                            interSenderEcoFlag = true;
                        } else if (receiver.startsWith('Ecosystem')) {
                            if (interSenderEcoFlag) {
                                if (hideMode) {
                                    ecosystemZoneSendersCat -= 0.1
                                } else {
                                    ecosystemZoneSendersCat -= 0.075
                                }
                                interSenderEcoFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(ecosystemZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            if (hideMode) {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.0125);
                            } else {
                                nodeY.push(publicGoodsZoneRecipientsCat += 0.01);
                            }
                            metagovZoneRecipientCat = metagovZoneCat;
                            metagovZoneSendersCat = metagovZoneCat;
                            interSenderFlag = true;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderFlag) {
                                publicGoodsZoneSendersCat -= 0.004
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(publicGoodsZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (hideMode) {
                                if (interCatFlag) {
                                    metagovZoneRecipientCat += 0.04;
                                    nodeX.push(startPoint + quarterNumber -  3.5*border);
                                    nodeY.push(metagovZoneRecipientCat += 0.01);
                                    metagovZoneRecipientCat += 0.03;
                                    interCatFlag = false;
                                } else {
                                    nodeX.push(startPoint + quarterNumber -  3.5*border);
                                    nodeY.push(metagovZoneRecipientCat += 0.0125);
                                }
                            } else {
                                if (interCatFlag) {
                                    metagovZoneRecipientCat += 0.02;
                                    interCatFlag = false;
                                }
                                nodeX.push(startPoint + quarterNumber -  3.5*border);
                                nodeY.push(metagovZoneRecipientCat += 0.01);
                            }
                            spsZoneRecipientsCat = spsZoneCat;
                            interSenderMGFlag = true;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderMGFlag) {
                                metagovZoneSendersCat -= 0.06
                                interSenderMGFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSendersCat += 0.01)
                            zoneSendersList.push(nodeName);   
                        } else if (nodeName.startsWith('Providers')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(spsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            nodeY.push(spsZoneRecipientsCat += 0.01);
                        } else if (receiver.startsWith('Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSendersCat -= 0.0075)
                        }
                        
                    } else if (nodeName.includes('2024Q4')) {
                        startPoint = quarterNumber*11 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            nodeX.push(startPoint - quarterNumber + 2.5*border)
                            nodeY.push(registrarZoneCat)
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.002);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderFlag) {
                                publicGoodsZoneSendersCat -= 0.004
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(publicGoodsZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                            spsZoneRecipientsCat = spsZoneCat;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderFlag) {
                                metagovZoneSendersCat -= 0.04
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            nodeY.push(spsZoneRecipientsCat += 0.01);
                        } else if (receiver.startsWith('Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSendersCat -= 0.0075)
                        }
                    } else if (nodeName.includes('2025Q1')) {
                        startPoint = quarterNumber*12 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            nodeX.push(startPoint - quarterNumber + 2.5*border)
                            nodeY.push(registrarZoneCat)
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.002);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderFlag) {
                                publicGoodsZoneSendersCat -= 0.004
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(publicGoodsZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                            spsZoneRecipientsCat = spsZoneCat;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderFlag) {
                                metagovZoneSendersCat -= 0.04
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            nodeY.push(spsZoneRecipientsCat += 0.01);
                        } else if (receiver.startsWith('Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSendersCat -= 0.0075)
                        }
                    } else if (nodeName.includes('2025Q2')) {
                        startPoint = quarterNumber*13 - quarterNumber + border;
                        if (nodeName.includes('Registrar')) {
                            nodeX.push(startPoint - quarterNumber + 2.5*border)
                            nodeY.push(registrarZoneCat)
                        }
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.002);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderFlag) {
                                publicGoodsZoneSendersCat -= 0.004
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(publicGoodsZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                            spsZoneRecipientsCat = spsZoneCat;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderFlag) {
                                metagovZoneSendersCat -= 0.04
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            nodeY.push(spsZoneRecipientsCat += 0.01);
                        } else if (receiver.startsWith('Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSendersCat -= 0.0075)
                        }
                    } else if (nodeName.includes('2025Q3')) {
                        startPoint = quarterNumber*14 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.002);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            if (interSenderFlag) {
                                publicGoodsZoneSendersCat -= 0.004
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(publicGoodsZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                            spsZoneRecipientsCat = spsZoneCat;
                        } else if (receiver.startsWith('Metagov')) {
                            if (interSenderFlag) {
                                metagovZoneSendersCat -= 0.04
                                interSenderFlag = false;
                            }
                            nodeX.push(startPoint);
                            nodeY.push(metagovZoneSendersCat += 0.005)
                            zoneSendersList.push(nodeName);
                        } else if (nodeName.startsWith('Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipientsCat += 0.02;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  2.5*border);
                            nodeY.push(spsZoneRecipientsCat += 0.01);
                        } else if (receiver.startsWith('Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSendersCat -= 0.0075)
                        }
                    } else if (sender === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    }
                }
            }
            safeYAxisImport.push(nodeY);
            return nodeIndices[nodeName];
        }
        
        if (quarter) {
            if (nodeName.includes('Registrar')) {
                return -1;
            }
            if (!nodeIndices[nodeName]) {
                nodeIndices[nodeName] = nodes.length;
                nodes.push(nodeName);
                nodeColors.push('rgba(255, 255, 255, 0)');

                if (model === 1) {
                    if (nodeName === 'DAO Wallet') {
                        nodeX.push(daoWalletX);
                        nodeY.push(daoWalletY += 0.1);
                    } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                        daoWalletRecipients.push(nodeName);
                        nodeX.push(0.95);
                        if (daoWalletRecipients.length != 1) {
                            if (categoryMode) {
                                nodeY.push(lastDaoWalletY += (daoWalletRecipients.length * 0.175));
                            } else {
                                nodeY.push(lastDaoWalletY += (daoWalletRecipients.length * 0.125));
                            }
                        } else {
                            nodeY.push(lastDaoWalletY = daoWalletY - 0.1)
                        }
                    } else if (nodeName === 'Ecosystem') {
                        nodeX.push(specialWalletsX);
                        nodeY.push(lastEcosystemY = lastDaoWalletY + 0.15);
                        interCatFlag = true;
                    } else if (sender === 'Ecosystem') {
                        if (interCatFlag) {
                            lastX = 0.98;
                            interCatFlag = false;
                        }
                        nodeX.push(lastX -= 0.03);
                        nodeY.push(lastEcosystemY += 0.05);
                        ecosystemRecipients.push(nodeName);
                    } else if (nodeName === 'Public Goods') {
                        nodeX.push(specialWalletsX);
                        nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.05);
                        interCatFlag = true;
                    } else if (sender === 'Public Goods') {
                        if (interCatFlag) {
                            lastX = 0.98;
                            interCatFlag = false;
                        }
                        nodeX.push(lastX -= 0.03);
                        nodeY.push(lastPublicGoodsY += 0.05);
                        publicGoodsRecipients.push(nodeName);
                    } else if (nodeName === 'Metagov') {
                        nodeX.push(specialWalletsX);
                        nodeY.push(lastMetagovY = lastPublicGoodsY + 0.05);
                        interCatFlag = true;
                    } else if (sender === 'Metagov') {
                        if (interCatFlag) {
                            lastX = 0.98;
                            interCatFlag = false;
                        }
                        nodeX.push(lastX -= 0.03);
                        nodeY.push(lastMetagovY += 0.05);
                        metagovRecipients.push(nodeName);
                    } else if (nodeName === 'Community WG') {
                        nodeX.push(specialWalletsX);
                        nodeY.push(lastCommunityWGY = lastMetagovY + 0.05);
                        interCatFlag = true;
                    } else if (sender === 'Community WG') {
                        if (interCatFlag) {
                            lastX = 0.98;
                            interCatFlag = false;
                        }
                        nodeX.push(lastX -= 0.03);
                        nodeY.push(lastCommunityWGY += 0.05);
                        communityWGRecipients.push(nodeName);
                    } else if (nodeName === 'Providers') {
                        nodeX.push(specialWalletsX);
                        nodeY.push(lastSpsY = lastMetagovY + 0.05);
                        interCatFlag = true;
                    } else if (sender == 'Providers') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            interCatFlag = false;
                        }
                        nodeX.push(lastX -= 0.03);
                        nodeY.push(lastSpsY += 0.05);
                        spsRecipients.push(nodeName);
                    } else if (nodeName === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    } else if (sender === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    }
                                        // console.log(`Node ${nodeName}: X=${nodeX[nodeIndices[nodeName]]}, Y=${nodeY[nodeIndices[nodeName]]}`);
                    qtrReceiversList = ecosystemRecipients.concat(publicGoodsRecipients, metagovRecipients, communityWGRecipients, spsZoneRecipients, daoWalletRecipients)
                    qtrSendersList = ecosystemSenders.concat(publicGoodsSenders, metagovSenders, communityWGSenders, spsSenders)
                } else if (model === 2) {
                    if (nodeName === 'DAO Wallet') {
                        daoWalletY -= categoryMode ? 0.1 : 0.15;
                        nodeX.push(daoWalletX);
                        nodeY.push(daoWalletY);
                    } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                        daoWalletRecipients.push(nodeName);
                        nodeX.push(0.95);
                        if (daoWalletRecipients.length != 1) {
                            if (categoryMode) {
                                lastDaoWalletY += (daoWalletRecipients.length * 0.1)
                            } else {
                                nodeY.push(lastDaoWalletY += (daoWalletRecipients.length * 0.075));
                            }
                        } else {
                            nodeY.push(lastDaoWalletY = daoWalletY)
                        }
                    } else if (nodeName === 'Ecosystem') {
                        nodeX.push(daoWalletX);
                        if (categoryMode) {
                            nodeY.push(lastEcosystemY = lastDaoWalletY + 0.4);
                        } else {
                            nodeY.push(lastEcosystemY = lastDaoWalletY + 0.2);
                        } 
                        interCatFlag = true;
                    } else if (sender === 'Ecosystem') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastEcosystemY);
                                }
                                return nodeIndices[receiver];
                            }
                            if (categoryMode) {
                                lastEcosystemY += 0.11;
                            } else {
                                lastEcosystemY += 0.05;
                            }
                            interCatFlag = false;
                        }
                        if (categoryMode) {
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastEcosystemY += 0.06);
                        } else {
                            nodeX.push(lastX -= 0.01);
                            nodeY.push(lastEcosystemY += 0.04);
                        }
                        ecosystemRecipients.push(nodeName);
                    } else if (nodeName === 'Public Goods') {
                        if (innerTransfers) {
                            nodeX.push(daoWalletX + 0.15);
                        } else {
                            nodeX.push(daoWalletX);
                        }
                        if (categoryMode) {
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.1);
                        } else {
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.05);
                        } 
                        interCatFlag = true;
                    } else if (sender === 'Public Goods') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastPublicGoodsY);
                                }
                                return nodeIndices[receiver];
                            }
                            if (categoryMode) {
                                lastPublicGoodsY += 0.025;
                            } else {
                                lastPublicGoodsY += 0.007;
                            }
                            interCatFlag = false;
                        }
                        if (categoryMode) {
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastPublicGoodsY += 0.06);
                        } else {
                            nodeX.push(lastX -= 0.01);
                            nodeY.push(lastPublicGoodsY += 0.04);
                        }
                        publicGoodsRecipients.push(nodeName);
                    } else if (nodeName === 'Metagov') {
                        nodeX.push(daoWalletX);
                        if (categoryMode) {
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.1);
                        } else {
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.05);
                        } 
                        interCatFlag = true;
                    } else if (sender === 'Metagov') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastMetagovY);
                                }
                                return nodeIndices[receiver];
                            }
                            if (categoryMode) {
                                lastMetagovY += 0.025;
                            } else {
                                lastMetagovY += 0.007;
                            }
                            interCatFlag = false;
                        }
                        if (categoryMode) {
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastMetagovY += 0.06);
                        } else {
                            nodeX.push(lastX -= 0.01);
                            nodeY.push(lastMetagovY += 0.04);
                        }
                        metagovRecipients.push(nodeName);
                    } else if (nodeName === 'Providers') {
                        nodeX.push(daoWalletX);
                        if (categoryMode) {
                            lastSpsY = lastMetagovY + 0.07;
                        } else {
                            lastSpsY = lastMetagovY + 0.05;
                        }
                        interCatFlag = true;
                    } else if (sender == 'Providers') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            interCatFlag = false;
                        }
                        nodeX.push(lastX -= 0.03);
                        nodeY.push(lastSpsY += 0.04);
                        spsRecipients.push(nodeName);
                    } else if (nodeName === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    } else if (sender === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    }
                    qtrReceiversList = ecosystemRecipients.concat(publicGoodsRecipients, metagovRecipients, communityWGRecipients, spsZoneRecipients, daoWalletRecipients)
                    qtrSendersList = ecosystemSenders.concat(publicGoodsSenders, metagovSenders, communityWGSenders, spsSenders)
                                        // console.log(`Node ${nodeName}: X=${nodeX[nodeIndices[nodeName]]}, Y=${nodeY[nodeIndices[nodeName]]}`);
                } else if (model === 3) {
                    if (!categoryMode) {
                        if (nodeName === 'DAO Wallet') {
                            nodeX.push(daoWalletX);
                            nodeY.push(daoWalletY);
                        } else if (nodeName === 'Ecosystem') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(daoWalletY - 0.105);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Ecosystem') {
                            if (interCatFlag) {
                                lastX = 0.95;
                                interCatFlag = false;
                                lastEcosystemY -= 0.225
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastEcosystemY += 0.065);
                            ecosystemRecipients.push(nodeName);
                        } else if (receiver === 'Ecosystem') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastEcosystemSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastEcosystemSenderY += 0.05);
                            ecosystemSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Public Goods') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.02);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Public Goods') {
                            if (interCatFlag) {
                                lastX = 0.95;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastPublicGoodsY += 0.03);
                            publicGoodsRecipients.push(nodeName);
                        } else if (receiver === 'Public Goods') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastPublicGoodsSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastPublicGoodsSenderY += 0.05);
                            publicGoodsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Metagov') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.03);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Metagov') {
                            if (interCatFlag) {
                                lastX = 0.95;
                                interCatFlag = false;
                                lastMetagovY += 0.015
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastMetagovY += 0.03);
                            metagovRecipients.push(nodeName);
                        } else if (receiver === 'Metagov') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastMetagovSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastMetagovSenderY += 0.05);
                            metagovSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Community WG') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastCommunityWGY = lastMetagovY + 0.02);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Community WG') {
                            if (interCatFlag) {
                                lastX = 0.95;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastCommunityWGY += 0.02);
                            communityWGRecipients.push(nodeName);
                        } else if (receiver === 'Community WG') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastCommunityWGSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastCommunityWGSenderY += 0.05);
                            communityWGSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Providers') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastSpsY = lastMetagovY + 0.02);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender == 'Providers') {
                            if (interCatFlag) {
                                lastX = 0.95;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastSpsY += 0.02);
                            spsRecipients.push(nodeName);
                        } else if (receiver === 'Providers') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastSpsSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastSpsSenderY += 0.05);
                            spsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        } else if (sender === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        }
                    } else if (categoryMode) {
                        if (nodeName === 'DAO Wallet') {
                            nodeX.push(daoWalletX);
                            nodeY.push(daoWalletY);
                        } else if (nodeName === 'Ecosystem') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastDaoWalletY = daoWalletY - 0.1);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Ecosystem') {
                            if (interCatFlag) {
                                lastX = 0.95;
                                interCatFlag = false;
                                lastEcosystemY -= 0.225
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastEcosystemY += 0.085);
                            ecosystemRecipients.push(nodeName);
                        } else if (receiver === 'Ecosystem') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastEcosystemSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastEcosystemSenderY += 0.05);
                            ecosystemSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Public Goods') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.05);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Public Goods') {
                            if (interCatFlag) {
                                lastX = 0.95;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastPublicGoodsY += 0.085);
                            publicGoodsRecipients.push(nodeName);
                        } else if (receiver === 'Public Goods') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastPublicGoodsSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastPublicGoodsSenderY += 0.05);
                            publicGoodsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Metagov') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.05);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Metagov') {
                            if (interCatFlag) {
                                lastX = 0.95;
                                interCatFlag = false;
                                lastMetagovY += 0.015
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastMetagovY += 0.085);
                            metagovRecipients.push(nodeName);
                        } else if (receiver === 'Metagov') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastMetagovSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastMetagovSenderY += 0.05);
                            metagovSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Community WG') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastCommunityWGY = lastMetagovY + 0.05);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Community WG') {
                            if (interCatFlag) {
                                lastX = 0.95;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastCommunityWGY += 0.085);
                            communityWGRecipients.push(nodeName);
                        } else if (receiver === 'Community WG') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastCommunityWGSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastCommunityWGSenderY += 0.05);
                            communityWGSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Providers') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastSpsY = lastMetagovY + 0.05);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender == 'Providers') {
                            if (interCatFlag) {
                                lastX = 0.95;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastSpsY += 0.085);
                            spsRecipients.push(nodeName);
                        } else if (receiver === 'Providers') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastSpsSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastSpsSenderY += 0.05);
                            spsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        } else if (sender === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        }
                    }
                                        // console.log(`Node ${nodeName}: X=${nodeX[nodeIndices[nodeName]]}, Y=${nodeY[nodeIndices[nodeName]]}`);
                    qtrReceiversList = ecosystemRecipients.concat(publicGoodsRecipients, metagovRecipients, communityWGRecipients, spsRecipients, daoWalletRecipients)
                    qtrSendersList = ecosystemSenders.concat(publicGoodsSenders, metagovSenders, communityWGSenders, spsSenders)

                } else if (model === 4) {
                    if (nodeName === 'DAO Wallet') {
                        nodeX.push(daoWalletX);
                        nodeY.push(daoWalletY -= 0.1);
                    } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                        daoWalletRecipients.push(nodeName);
                        nodeX.push(0.95);
                        if (daoWalletRecipients.length != 1) {
                            nodeY.push(lastDaoWalletY += (daoWalletRecipients.length * 0.05));
                        } else {
                            nodeY.push(lastDaoWalletY = daoWalletY)
                        }
                    } else if (nodeName === 'Ecosystem') {
                        nodeX.push(specialWalletsX);
                        if (categoryMode) {
                            nodeY.push(lastEcosystemY = lastDaoWalletY + 0.4);
                        } else {
                            nodeY.push(lastEcosystemY = lastDaoWalletY + 0.3);
                        }
                        lastEcosystemSenderY = lastEcosystemY + 0.1;
                        interCatFlag = true;
                    } else if (sender === 'Ecosystem') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastEcosystemY);
                                }
                                return nodeIndices[receiver];
                            }
                            lastEcosystemY += 0.1;
                            interCatFlag = false;
                        }
                        nodeX.push(lastX -= 0.03);
                        nodeY.push(lastEcosystemY += 0.06);
                        ecosystemRecipients.push(nodeName);
                    } else if (receiver === 'Ecosystem') {
                        nodeX.push(daoWalletX);
                        nodeY.push(lastEcosystemSenderY);
                        lastEcosystemSenderY += 0.06;
                        ecosystemSenders.push(nodeName);
                    } else if (nodeName === 'Public Goods') {
                        nodeX.push(specialWalletsX);
                        nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.1);
                        interCatFlag = true;
                    } else if (sender === 'Public Goods') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastPublicGoodsY);
                                }
                                return nodeIndices[receiver];
                            }
                            lastPublicGoodsY += 0.02;
                            interCatFlag = false;
                        }
                        nodeX.push(lastX -= 0.03);
                        nodeY.push(lastPublicGoodsY += 0.06);
                        publicGoodsRecipients.push(nodeName);
                    } else if (receiver === 'Public Goods') {
                        if (!specialWallets.hasOwnProperty(sender)) {
                        nodeX.push(daoWalletX + 0.1);
                        nodeY.push(lastPublicGoodsSenderY);
                        lastPublicGoodsSenderY += 0.06;
                        publicGoodsSenders.push(nodeName);
                        }
                    } else if (nodeName === 'Metagov') {
                        nodeX.push(specialWalletsX);
                        nodeY.push(lastMetagovY = lastPublicGoodsY + 0.1);
                        lastMetagovSenderY = lastMetagovY;
                        interCatFlag = true;
                    } else if (sender === 'Metagov') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastMetagovY);
                                }
                                return nodeIndices[receiver];
                            }
                            lastMetagovY += 0.02;
                            interCatFlag = false;
                        }
                        nodeX.push(lastX -= 0.03);
                        nodeY.push(lastMetagovY += 0.06);
                        metagovRecipients.push(nodeName);
                    } else if (receiver === 'Metagov') {
                        if (!specialWallets.hasOwnProperty(sender)) {
                        nodeX.push(daoWalletX);
                        nodeY.push(lastMetagovSenderY);
                        lastMetagovSenderY += 0.04;
                        metagovSenders.push(nodeName);
                        }
                    } else if (nodeName === 'Providers') {
                        nodeX.push(specialWalletsX);
                        nodeY.push(lastSpsY = lastMetagovY + 0.08);
                        interCatFlag = true;
                    } else if (sender == 'Providers') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastSpsY);
                                }
                                return nodeIndices[receiver];
                            }
                            lastSpsY += 0.02;
                            interCatFlag = false;
                        }
                        nodeX.push(lastX -= 0.03);
                        nodeY.push(lastSpsY += 0.04);
                        spsRecipients.push(nodeName);
                    } else if (receiver === 'Providers') {
                        if (!specialWallets.hasOwnProperty(sender)) {
                        nodeX.push(daoWalletX + 0.1);
                        nodeY.push(lastSpsSenderY);
                        lastSpsSenderY += 0.06;
                        spsSenders.push(nodeName);
                        }
                    } else if (nodeName === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    } else if (sender === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    }
                                        // console.log(`Node ${nodeName}: X=${nodeX[nodeIndices[nodeName]]}, Y=${nodeY[nodeIndices[nodeName]]}`);
                    qtrReceiversList = ecosystemRecipients.concat(publicGoodsRecipients, metagovRecipients, communityWGRecipients, spsRecipients, daoWalletRecipients)
                    qtrSendersList = ecosystemSenders.concat(publicGoodsSenders, metagovSenders, communityWGSenders, spsSenders)
                } else if (model === 5) {
                    if (nodeName === 'DAO Wallet') {
                        nodeX.push(daoWalletX);
                        if (categoryMode) {
                            nodeY.push(daoWalletY);
                        } else {
                            nodeY.push(daoWalletY -= 0.1);
                        }
                    } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                        daoWalletRecipients.push(nodeName);
                        nodeX.push(0.95);
                        if (daoWalletRecipients.length != 1) {
                            if (categoryMode) {
                                nodeY.push(lastDaoWalletY += (daoWalletRecipients.length * 0.1));
                            } else {
                                nodeY.push(lastDaoWalletY += (daoWalletRecipients.length * 0.075));
                            }
                        } else {
                            nodeY.push(lastDaoWalletY = daoWalletY)
                        }
                    } else if (nodeName === 'Ecosystem') {
                        nodeX.push(daoWalletX + 0.175);
                        if (categoryMode) {
                            nodeY.push(lastEcosystemY = lastDaoWalletY + 0.3);
                        } else {
                            nodeY.push(lastEcosystemY = lastDaoWalletY + 0.2);
                        }
                        lastEcosystemSenderY = lastEcosystemY + 0.01;
                        interCatFlag = true;
                    } else if (sender === 'Ecosystem') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastEcosystemY);
                                }
                                return nodeIndices[receiver];
                            }
                            if (categoryMode) {
                                if (quarter == '2023Q4') {
                                    lastEcosystemY += 0.07;
                                } else {
                                    lastEcosystemY += 0.1;
                                }
                            } else { 
                                if (quarter == '2023Q4') {
                                    lastEcosystemY += 0.03;
                                } else {
                                    lastEcosystemY += 0.08;
                                }
                            }
                            interCatFlag = false;
                        }
                        if (categoryMode) {
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastEcosystemY += 0.05);
                        } else {
                            if (quarter == '2023Q4') {
                                nodeX.push(lastX -= 0.015);
                                nodeY.push(lastEcosystemY += 0.03);
                            } else {
                                nodeX.push(lastX -= 0.03);
                                nodeY.push(lastEcosystemY += 0.04);
                            }
                        }
                        ecosystemRecipients.push(nodeName);
                    } else if (receiver === 'Ecosystem') {
                        nodeX.push(daoWalletX);
                        nodeY.push(lastEcosystemSenderY);
                        lastEcosystemSenderY += 0.06;
                        ecosystemSenders.push(nodeName);
                    } else if (nodeName === 'Public Goods') {
                        nodeX.push(daoWalletX + 0.175);
                        nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.08);
                        interCatFlag = true;
                    } else if (sender === 'Public Goods') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastPublicGoodsY);
                                }
                                return nodeIndices[receiver];
                            }
                            if (categoryMode) {
                                lastPublicGoodsY += 0.02;
                            } else { 
                                lastPublicGoodsY += 0.02;
                            }
                            interCatFlag = false;
                        }
                        if (categoryMode) {
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastPublicGoodsY += 0.05);
                        } else {
                            if (quarter == '2023Q4') {
                                nodeX.push(lastX -= 0.015);
                                nodeY.push(lastPublicGoodsY += 0.03);
                            } else {
                                nodeX.push(lastX -= 0.03);
                                nodeY.push(lastPublicGoodsY += 0.04);
                            }
                        }
                        publicGoodsRecipients.push(nodeName);
                    } else if (receiver === 'Public Goods') {
                        if (!specialWallets.hasOwnProperty(sender)) {
                        nodeX.push(daoWalletX + 0.1);
                        nodeY.push(lastPublicGoodsSenderY);
                        lastPublicGoodsSenderY += 0.06;
                        publicGoodsSenders.push(nodeName);
                        }
                    } else if (nodeName === 'Metagov') {
                        nodeX.push(daoWalletX + 0.175);
                        nodeY.push(lastMetagovY = lastPublicGoodsY + 0.08);
                        lastMetagovSenderY = lastMetagovY;
                        interCatFlag = true;
                    } else if (sender === 'Metagov') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastMetagovY);
                                }
                                return nodeIndices[receiver];
                            }
                            if (categoryMode) {
                                lastMetagovY += 0.03;
                            } else { 
                                lastMetagovY += 0.02;
                            }
                            interCatFlag = false;
                        }
                        if (categoryMode) {
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastMetagovY += 0.05);
                        } else {
                            if (quarter == '2023Q4') {
                                nodeX.push(lastX -= 0.015);
                                nodeY.push(lastMetagovY += 0.03);
                            } else {
                                nodeX.push(lastX -= 0.03);
                                nodeY.push(lastMetagovY += 0.04);
                            }
                        }
                        metagovRecipients.push(nodeName);
                    } else if (receiver === 'Metagov') {
                        if (!specialWallets.hasOwnProperty(sender)) {
                        nodeX.push(daoWalletX);
                        nodeY.push(lastMetagovSenderY);
                        lastMetagovSenderY += 0.04;
                        metagovSenders.push(nodeName);
                        }
                    } else if (nodeName === 'Community WG') {
                        nodeX.push(daoWalletX + 0.175);
                        nodeY.push(lastCommunityWGY = lastMetagovY + 0.08);
                        interCatFlag = true;
                    } else if (sender === 'Community WG') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastCommunityWGY);
                                }
                                return nodeIndices[receiver];
                            }
                            lastCommunityWGY += 0.02;
                            interCatFlag = false;
                        }
                        if (quarter == '2023Q4') {
                            nodeX.push(lastX -= 0.015);
                            nodeY.push(lastCommunityWGY += 0.03);
                        }
                        else {
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastCommunityWGY += 0.04);
                        }
                        communityWGRecipients.push(nodeName);
                    } else if (receiver === 'Community WG') {
                        if (!specialWallets.hasOwnProperty(sender)) {
                        nodeX.push(daoWalletX + 0.1);
                        nodeY.push(lastCommunityWGSenderY);
                        lastCommunityWGSenderY += 0.06;
                        communityWGSenders.push(nodeName);
                        }
                    } else if (nodeName === 'Providers') {
                        nodeX.push(daoWalletX + 0.175);
                        nodeY.push(lastSpsY = lastMetagovY + 0.08);
                        interCatFlag = true;
                    } else if (sender == 'Providers') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastSpsY);
                                }
                                return nodeIndices[receiver];
                            }
                            if (categoryMode) {
                                lastSpsY += 0.1;
                            } else {
                                lastSpsY += 0.02;
                            }
                            interCatFlag = false;
                        }
                        if (quarter == '2023Q4') {
                            nodeX.push(lastX -= 0.015);
                            nodeY.push(lastSpsY += 0.03);
                        }
                        else {
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastSpsY += 0.01);
                        }
                        spsRecipients.push(nodeName);
                    } else if (receiver === 'Providers') {
                        if (!specialWallets.hasOwnProperty(sender)) {
                        nodeX.push(daoWalletX + 0.1);
                        nodeY.push(lastSpsSenderY);
                        lastSpsSenderY += 0.06;
                        spsSenders.push(nodeName);
                        }
                    } else if (nodeName === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    } else if (sender === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    }
                    console.log(nodes.length);
                    console.log(nodeX.length);
                                        console.log(`Node ${nodeName}: X=${nodeX[nodeIndices[nodeName]]}, Y=${nodeY[nodeIndices[nodeName]]}`);
                    qtrReceiversList = ecosystemRecipients.concat(publicGoodsRecipients, metagovRecipients, communityWGRecipients, spsRecipients, daoWalletRecipients)
                    qtrSendersList = ecosystemSenders.concat(publicGoodsSenders, metagovSenders, communityWGSenders, spsSenders)
                } else if (model === 'detailed') {
                } else if (model === 'dissolution') {
                    if (nodeName === 'DAO Wallet') {
                        nodeX.push(daoWalletX);
                        if (categoryMode) {
                            nodeY.push(daoWalletY += 0.05);
                        } else {
                            nodeY.push(daoWalletY);
                        }
                    } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                        daoWalletRecipients.push(nodeName);
                        nodeX.push(0.95);
                        if (daoWalletRecipients.length != 1) {
                            nodeY.push(lastDaoWalletY += (daoWalletRecipients.length * 0.075));
                        } else {
                            nodeY.push(daoWalletY)
                        }
                    } else if (nodeName === 'Ecosystem') {
                        nodeX.push(daoWalletX + 0.175);
                        if (daoWalletRecipients.length > 1) {
                            nodeY.push(lastEcosystemY = daoWalletY + 0.4 + (daoWalletRecipients.length * 0.1));
                        } else {
                            nodeY.push(lastEcosystemY = daoWalletY + 0.3)
                        }
                        if (categoryMode) {
                            lastEcosystemSenderY = lastEcosystemY + 0.13;
                        } else {
                            lastEcosystemSenderY = lastEcosystemY + 0.105;
                        }
                        interCatFlag = true;
                    } else if (sender === 'Ecosystem') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastEcosystemY);
                                }
                                return nodeIndices[receiver];
                            }
                            lastEcosystemY += 0.05;
                            interCatFlag = false;
                        }
                        nodeX.push(lastX -= 0.03);
                        nodeY.push(lastEcosystemY += 0.05);
                        ecosystemRecipients.push(nodeName);
                    } else if (receiver === 'Ecosystem') {
                        nodeX.push(daoWalletX);
                        nodeY.push(lastEcosystemSenderY - 0.007);
                        lastEcosystemSenderY += 0.05;
                        ecosystemSenders.push(nodeName);
                    } else if (nodeName === 'Public Goods') {
                        nodeX.push(daoWalletX + 0.175);
                        nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.08);
                        interCatFlag = true;
                    } else if (sender === 'Public Goods') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastPublicGoodsY);
                                }
                                return nodeIndices[receiver];
                            }
                            lastPublicGoodsY += 0.01;
                            interCatFlag = false;
                        }
                        nodeX.push(lastX -= 0.03);
                        nodeY.push(lastPublicGoodsY += 0.05);
                        publicGoodsRecipients.push(nodeName);
                    } else if (receiver === 'Public Goods') {
                        if (!specialWallets.hasOwnProperty(sender)) {
                        nodeX.push(daoWalletX + 0.1);
                        nodeY.push(lastPublicGoodsSenderY);
                        lastPublicGoodsSenderY += 0.06;
                        publicGoodsSenders.push(nodeName);
                        }
                    } else if (nodeName === 'Metagov') {
                        nodeX.push(daoWalletX + 0.175);
                        nodeY.push(lastMetagovY = lastPublicGoodsY + 0.08);
                        lastMetagovSenderY = lastMetagovY;
                        interCatFlag = true;
                    } else if (sender === 'Metagov') {
                        if (interCatFlag) {
                            lastX = 0.95;
                            if (receiver.startsWith('Unspent')) {
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastMetagovY);
                                }
                                return nodeIndices[receiver];
                            }
                            lastMetagovY += 0.01;
                            interCatFlag = false;
                        }
                        nodeX.push(lastX -= 0.03);
                        nodeY.push(lastMetagovY += 0.05);
                        metagovRecipients.push(nodeName);
                    } else if (receiver === 'Metagov') {
                        if (!specialWallets.hasOwnProperty(sender)) {
                        nodeX.push(daoWalletX);
                        nodeY.push(lastMetagovSenderY);
                        lastMetagovSenderY += 0.04;
                        metagovSenders.push(nodeName);
                        }
                    } else if (nodeName === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    } else if (sender === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    }
                                        // console.log(`Node ${nodeName}: X=${nodeX[nodeIndices[nodeName]]}, Y=${nodeY[nodeIndices[nodeName]]}`);
                    qtrReceiversList = ecosystemRecipients.concat(publicGoodsRecipients, metagovRecipients, communityWGRecipients, spsZoneRecipients, daoWalletRecipients)
                    qtrSendersList = ecosystemSenders.concat(publicGoodsSenders, metagovSenders, communityWGSenders, spsSenders)
                } else if (model === 'temp') {
                    if (nodeName === 'DAO Wallet') {
                        nodeX.push(daoWalletX);
                        nodeY.push(daoWalletY += 0.1);
                    } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                        daoWalletRecipients.push(nodeName);
                        nodeX.push(0.95);
                        if (daoWalletRecipients.length != 1) {
                            if (categoryMode) {
                                nodeY.push(lastDaoWalletY += (daoWalletRecipients.length * 0.1));
                            } else {
                                nodeY.push(lastDaoWalletY += (daoWalletRecipients.length * 0.075));
                            }
                        } else {
                            nodeY.push(lastDaoWalletY = daoWalletY - 0.25)
                        }
                    } else if (nodeName === 'Ecosystem') {
                        nodeX.push(specialWalletsX);
                        nodeY.push(lastEcosystemY = lastDaoWalletY + 0.15);
                        interCatFlag = true;
                    } else if (sender === 'Ecosystem') {
                        if (interCatFlag) {
                            lastX = 0.98;
                            interCatFlag = false;
                        }
                        if (receiver.startsWith('Unspent')) {
                            lastX = 0.95;
                            if (!unspentNodes.has(receiver)) {
                                unspentNodes.add(receiver);
                                nodeX.push(lastX);
                                nodeY.push(lastEcosystemY);
                            }
                            lastEcosystemY += 0.04;
                            return nodeIndices[receiver];
                        } else {
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastEcosystemY += 0.04);
                        }
                        ecosystemRecipients.push(nodeName);
                    } else if (nodeName === 'Public Goods') {
                        nodeX.push(specialWalletsX);
                        nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.1);
                        interCatFlag = true;
                    } else if (sender === 'Public Goods') {
                        if (interCatFlag) {
                            lastX = 0.98;
                            interCatFlag = false;
                        }
                        if (receiver.startsWith('Unspent')) {
                            lastX = 0.95;
                            if (!unspentNodes.has(receiver)) {
                                unspentNodes.add(receiver);
                                nodeX.push(lastX);
                                nodeY.push(lastPublicGoodsY);
                            }
                            lastPublicGoodsY += 0.01;
                            return nodeIndices[receiver];
                        } else {
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastPublicGoodsY += 0.04);
                        }
                        publicGoodsRecipients.push(nodeName);
                    } else if (nodeName === 'Metagov') {
                        nodeX.push(specialWalletsX);
                        nodeY.push(lastMetagovY = lastPublicGoodsY + 0.3);
                        interCatFlag = true;
                    } else if (sender === 'Metagov') {
                        if (categoryMode) {
                            if (receiver.startsWith('Unspent')) {
                                lastX = 0.95;
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastMetagovY - 0.1);
                                }
                                lastMetagovY += 0.17;
                                return nodeIndices[receiver];
                            } else {
                                nodeX.push(lastX -= 0.03);
                                nodeY.push(lastMetagovY += 0.04);
                            }
                        } else {
                            if (receiver.startsWith('Unspent')) {
                                lastX = 0.95;
                                if (!unspentNodes.has(receiver)) {
                                    unspentNodes.add(receiver);
                                    nodeX.push(lastX);
                                    nodeY.push(lastMetagovY - 0.1);
                                }
                                lastMetagovY += 0.1;
                                return nodeIndices[receiver];
                            } else if (interCatFlag) {
                                    nodeX.push(lastX -= 0.03);
                                    nodeY.push(lastMetagovY += 0.04);
                                    lastMetagovY += 0.1;
                                    interCatFlag = false;
                            } else {
                                nodeX.push(lastX -= 0.03);
                                nodeY.push(lastMetagovY += 0.04);
                            }
                        }
                        metagovRecipients.push(nodeName);
                    } else if (nodeName === 'Providers') {
                        nodeX.push(specialWalletsX);
                        nodeY.push(lastSpsY = lastMetagovY + 0.2);
                        interCatFlag = true;
                    } else if (sender == 'Providers') {
                        if (interCatFlag) {
                            lastX = 0.98;
                            interCatFlag = false;
                        }
                        if (receiver.startsWith('Unspent')) {
                            lastX = 0.95;
                            if (!unspentNodes.has(receiver)) {
                                unspentNodes.add(receiver);
                                nodeX.push(lastX);
                                nodeY.push(lastSpsY);
                            }
                            lastSpsY += 0.05;
                            return nodeIndices[receiver];
                        } else {
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastSpsY += 0.04);
                        }
                        spsRecipients.push(nodeName);
                    } else if (nodeName === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    } else if (sender === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    }
                     // console.log(`Node ${nodeName}: X=${nodeX[nodeIndices[nodeName]]}, Y=${nodeY[nodeIndices[nodeName]]}`);
                    qtrReceiversList = ecosystemRecipients.concat(publicGoodsRecipients, metagovRecipients, communityWGRecipients, spsRecipients)
                    qtrSendersList = ecosystemSenders.concat(publicGoodsSenders, metagovSenders, communityWGSenders, spsSenders)
                }
            }
            return nodeIndices[nodeName];
        }
    };

    df.forEach(row => {
        const dollarValue = Math.round(row.DOT_USD, 0);
        const formattedDollarValue = dollarValue.toLocaleString('en-US') + '$';

        const sender = row.From_category;

        let receiver = row.To_category;
        if (bigPicture && hideMode && row.To_category === 'Airdrop' && row['Transaction Hash'] !== '0xb7e613cfa0bcc27379c6c937c7df32b2540a07b71a7bac8a12d55934073bd61f') {
            receiver = null; 
        }

        const qtr = row.Quarter;

        const receipt = qtr === null 
        ? (row['Transaction Hash'] === 'Unspent' 
            ? 'Interquarter' 
            : row['Transaction Hash']) 
        : row['Transaction Hash'];

        const color = bigPicture && (row['From_name'] === 'DAO Wallet' || row['To_name'] === 'DAO Wallet') && (hideMode) 
        ? colorHideModeMap[row.Symbol] 
        : colorMap[row.Symbol];

        const rawValue = (row.Symbol === 'ENS' || row.Symbol === 'USDC')
        ? Math.round(row.Value, 0) 
        : Math.round(row.Value, 2);

        const label = row.Symbol !== 'USDC'
        ? (row['Transaction Hash'] === 'Interquarter' || row['Transaction Hash'] === 'Unspent' 
           ? `Date: ${row.Date}<br>Amount: ${rawValue} ${row.Symbol}`
           : `Date: ${row.Date}<br>Amount: ${rawValue} ${row.Symbol} <br>Value: ${formattedDollarValue}`)
        : `Date: ${row.Date}<br>Value: ${rawValue} ${row.Symbol}`

        const customDataDateArray = row.Date;
        const customDataValueArray = rawValue;
        const customDataSymbolArray = row.Symbol;
        const customDataUSDArray = formattedDollarValue;
        const customDataToArray = row.To_name;
        const customDataFromArray = row.From_name;
        const customDataQtrArray = row.Quarter;
        const customDataAddrArray = row.To;

        if (bigPicture) {

            if (receiver !== null) {

                const specialReceipts = [
                    '0xf40e1c129ab1d20576a4a6776b16624e0a7d08d492b2433a214127e45584121d',
                    '0x9bf05272c1debfd466109f0dc99f6aac323934ee04b92a8cffb8720ff8bbf0c1'
                ];
                
                const isSpecialReceipt = specialReceipts.includes(receipt);
                const specialWallets = ['Ecosystem', 'Public Goods', 'Metagov', 'Community WG', 'Providers'];

                const value = (hideMode 
                ? (row['From_name'] == 'DAO Wallet' 
                    ? Math.log(dollarValue) 
                    : row['From_name'] == 'DAO Wallet' && (row['Transaction Hash'] == 'Interquarter' || isSpecialReceipt)  
                        ? Math.log(dollarValue) 
                        : row['From_name'] == 'DAO Wallet' && (row['Transaction Hash'] == 'Interquarter' || isSpecialReceipt) 
                            ? Math.log(dollarValue) 
                            : row['From_name'] == 'Old Registrar' 
                                ? Math.log(dollarValue) 
                                : row['From_name'] == 'New Registrar' 
                                    ? Math.log(dollarValue) 
                                    : row['To_name'] == 'Endowment' ? Math.log(dollarValue) 
                                        : row['From_name'] !== 'Plchld' 
                                        ? dollarValue : 1) 
                : row['From_name'] !== 'Plchld' ? dollarValue : 1)
    
                const qtr = row['From_name'] !== 'Plchld' 
                ? row.Quarter 
                : 'Plchld';

                const nextQuarter = (row['Transaction Hash'] === 'Interquarter' || isSpecialReceipt) 
                ? getNextQuarter(qtr) 
                : qtr;

                let senderNodeName = `${sender} (${qtr})`;
                let receiverNodeName = `${receiver} (${nextQuarter})`;

                if (specialWallets.includes(sender) && !(specialWallets.includes(receiver))) {
                    receiverNodeName = `${receiver} (${nextQuarter})${sender.substring(0, 2)}`;
                }
                const senderIndex = getNodeIndex(senderNodeName, sender, receiver, model, qtr);
                const receiverIndex = getNodeIndex(receiverNodeName, sender, receiver, model, nextQuarter);

                nodeSenderSafeExport.push(sender);

                linkSources.push(senderIndex);
                linkTargets.push(receiverIndex);
                linkValues.push(value);
                linkColors.push(color);
                linkReceipts.push(receipt);
                linkLabels.push(label);

                linkCustomDataDate.push(customDataDateArray);
                linkCustomDataValue.push(customDataValueArray);
                linkCustomDataSymbol.push(customDataSymbolArray);
                linkCustomDataUSD.push(customDataUSDArray);
                linkCustomDataTo.push(customDataToArray);
                linkCustomDataFrom.push(customDataFromArray);
                linkCustomDataQtr.push(customDataQtrArray);
                linkCustomDataAddr.push(customDataAddrArray);

                flowData[qtr] = flowData[qtr] || [];
                flowData[qtr].push({
                    sender: sender,
                    receiver: receiver,
                    value: value,
                    label: label,
                    quarter: qtr,
                    receipt: receipt
                });

                return;
            }

        } else if (!bigPicture) {
            const senderIndex = getNodeIndex(sender, sender, receiver, model, qtr);
            const receiverIndex = getNodeIndex(receiver, sender, receiver, model, qtr);
            const value =                         
            row['From_name'] == 'Old Registrar' 
            ? dollarValue / 100 
            : row['From_name'] == 'New Registrar' 
                ? dollarValue / 100 
                : row['To_name'] == 'Endowment' 
                    ? dollarValue / 25 
                    : dollarValue;
    
            if (senderIndex !== -1 && receiverIndex !== -1) {
                linkSources.push(senderIndex);
                linkTargets.push(receiverIndex);
                linkValues.push(value);
                linkColors.push(color);
                linkReceipts.push(receipt);
                linkLabels.push(label);

                linkCustomDataDate.push(customDataDateArray);
                linkCustomDataValue.push(customDataValueArray);
                linkCustomDataSymbol.push(customDataSymbolArray);
                linkCustomDataUSD.push(customDataUSDArray);
                linkCustomDataTo.push(customDataToArray);
                linkCustomDataFrom.push(customDataFromArray);
                linkCustomDataQtr.push(customDataQtrArray);
                linkCustomDataAddr.push(customDataAddrArray);
            }
            flowData[qtr].push({
                sender: sender,
                receiver: receiver,
                value: value,
                label: label,
                quarter: qtr
            });
            return;
        }

        if (!flowData[qtr]) {
            flowData[qtr] = [];
        }
    });

    let conditions = {
        condition1: condition1 ? '+' : '-',
        condition2: condition2 ? '+' : '-',
        condition3: condition3 ? '+' : '-',
        model: model,
        quarterCount: quarterCount
    };
    safeYAxisImport.push(nodeY);
    const maxY = Math.max(...safeYAxisImport[0])  
    
    return {
        nodes: nodes.map((node, index) => {
            let nodeName = node.startsWith('Unspent_') ? 'Unspent' : node.split(' (')[0];
            const bpNodeName = node;
            return { 
                name: nodeName, 
                customdata: { 
                    account: nodeCustomdata[index],
                    bpIndex: bpNodeName,
                    sender: nodeSenderSafeExport[index],
                },
                color: nodeColors[index], 
                x: nodeX[index], 
                y: nodeY[index],
                bpIndex: bpNodeName,
            };
        }),
        links: linkSources.map((source, index) => ({
            source: source,
            target: linkTargets[index],
            value: linkValues[index],
            color: linkColors[index],
            label: linkLabels[index],
            customdata: {
                receipt: linkReceipts[index],
                date: linkCustomDataDate[index],
                value: linkCustomDataValue[index],
                symbol: linkCustomDataSymbol[index],
                usd: linkCustomDataUSD[index],
                to: linkCustomDataTo[index],
                from: linkCustomDataFrom[index],
                qtr: linkCustomDataQtr[index],
                addr: linkCustomDataAddr[index]
            },
        })),

        conditions: conditions,
        model: model,
        zoneSendersList: zoneSendersList,  
        qtrSendersList: qtrSendersList,
        qtrReceiversList: qtrReceiversList,
        maxY: maxY,
    };
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/fullview', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
  
  app.get('/quarter/:quarter', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
  
  app.get('/quarter/:quarter/:wallet', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

app.get('/quarters', (req, res) => {
    const uniqueQuarters = Array.from(new Set(df.map(row => row.Quarter)))
        .filter(quarter => {
            const [year, q] = quarter.split('Q');
            return parseInt(year) > 2022 || (parseInt(year) === 2022 && parseInt(q) >= 2);
        });
    res.json({ quarters: uniqueQuarters });
});

app.get('/data/big_picture', (req, res) => {
    try {
        const hideMode = req.query.hideMode === 'true';
        let modifiedDf = JSON.parse(JSON.stringify(df));

        modifiedDf = modifiedDf.map(row => {
            if (row['Transaction Hash'] === 'Unspent') {
                if (row.Quarter === '2022Q3' && row.From_name === 'Community WG') {
                    return {
                        ...row,
                        'Transaction Hash': 'Interquarter',
                        To_name : 'Ecosystem',
                        To_category : 'Ecosystem'
                    }
                } else {
                    return {
                        ...row,
                        'Transaction Hash': 'Interquarter',
                        To_name : row.From_name !== 'Community WG' ? row.From_name : 'Dissoluton',
                        To_category : row.From_category !== 'Community WG' ? row.From_category : 'Dissoluton',
                    }
                }
            }
            return row;
        });
        const sankeyData = createSankeyData(modifiedDf, true, null, null, hideMode);
        res.json(sankeyData);
    } catch (error) {
        console.error('Error creating Sankey data:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/data/:quarter', (req, res) => {
    try {
        const quarter = req.params.quarter;
        const [year, q] = quarter.split('Q');
        if (parseInt(year) < 2022 || (parseInt(year) === 2022 && parseInt(q) < 2)) {
            return res.status(400).send('Invalid quarter: data not available for quarters before 2022Q2');
        }

        let filteredDf = df.filter(row => {
            if (row.Quarter === quarter) {
                if (row['Transaction Hash'] === 'Interquarter') {
                    if (row.From_name !== 'DAO Wallet') {
                        row.To_name = `Unspent_${row.From_name}`;
                        row.To_category = `Unspent_${row.From_name}`;
                        row['Transaction Hash'] = 'Unspent';
                        return true;
                    }
                    return false; 
                }
                return true;
            }
            return false; 
        });

        const sankeyData = createSankeyData(filteredDf, false, quarter, null);
        res.json(sankeyData);
    } catch (error) {
        console.error('Error creating Sankey data:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/data/:quarter/:wallet', (req, res) => {
    try {
        const quarter = req.params.quarter;
        const walletFilter = req.params.wallet;

        let filteredDf = df.filter(row => {
            if (row.Quarter === quarter) {
                if (row['Transaction Hash'] === 'Interquarter') {
                    if (row.From_name !== 'DAO Wallet') {
                        row.To_name = `Unspent_${row.From_name}`;
                        row.To_category = `Unspent_${row.From_name}`;
                        row['Transaction Hash'] = 'Unspent';
                        return true;
                    }
                    return false; 
                }
                return true;
            }
            return false; 
        });

        filteredDf = filteredDf.filter(row => row.From_category === walletFilter || row.To_category === walletFilter || row['Transaction Hash'] === walletFilter);

        const sankeyData = createSankeyData(filteredDf, false, quarter, walletFilter);
        res.json(sankeyData);
    } catch (error) {
        console.error('Error creating Sankey data:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/export-data', (req, res) => {
    const view = req.query.view;
    const filter = req.query.filter;
    const quarter = req.query.quarter;

    let filteredDf;

    if (view === 'big_picture') {
        filteredDf = df;
    } else if (view === 'quarter') {
        filteredDf = df.filter(row => row.Quarter === quarter);
    } else if (view === 'wallet') {
        filteredDf = df.filter(row => 
            row.Quarter === quarter && 
            (row.From_name === filter || row.To_name === filter)
        );
    }

    filteredDf.sort((a, b) => new Date(a.Date) - new Date(b.Date));

    res.json(filteredDf);
});

app.get('/recipient_details/:recipient', (req, res) => {
    const recipient = req.params.recipient;
    const isCategory = req.query.isCategory === 'true';    
    let transactions;
    if (isCategory) {
        transactions = df.filter(row => row.To_category === recipient);
    } else {
        transactions = df.filter(row => row.To_name === recipient);
    }
    
    const summary = {
        ETH: 0,
        USDC: 0,
        ENS: 0,
        total_usd: 0
    };

    transactions.forEach(tx => {
        summary[tx.Symbol] = (summary[tx.Symbol] || 0) + parseFloat(tx.Value);
        summary.total_usd += parseFloat(tx.DOT_USD);
    });

    res.json({
        transactions: transactions,
        summary: summary
    });
});

app.get('/unknown_contractors', (req, res) => {
    const csvFilePath = path.join(__dirname, 'public', 'data', 'unknown_contractors.csv');

    fs.readFile(csvFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading CSV file:', err);
            return res.status(500).json({ error: 'Error reading CSV file' });
        }

        try {
            const transactions = csvParse(data);
            res.json(transactions);
        } catch (parseError) {
            console.error('Error parsing CSV data:', parseError);
            res.status(500).json({ error: 'Error parsing CSV data' });
        }
    });
});

app.post('/save_transaction', (req, res) => {
    const transactionData = req.body;
    const filePath = path.join(__dirname, 'responses.json');

    fs.readFile(filePath, 'utf8', (err, fileContent) => {
        let data = [];
        if (!err) {
            try {
                data = JSON.parse(fileContent);
            } catch (parseError) {
                console.error('Error parsing existing file:', parseError);
            }
        }

        data.push(transactionData);

        fs.writeFile(filePath, JSON.stringify(data, null, 2), (writeErr) => {
            if (writeErr) {
                console.error('Error saving transaction:', writeErr);
                res.status(500).json({ error: "Error saving transaction" });
            } else {
                res.json({ message: "Transaction saved successfully" });
            }
        });
    });
});

const pythonPath = path.join(__dirname, 'venv', 'bin', 'python3');
const dataMergerPath = path.join(__dirname, 'data_miner', 'merger.py');
const dataMinerPath = path.join(__dirname, 'data_miner', 'new_miner.py');
const dailyStreamGrouperScriptPath = path.join(__dirname, 'data_miner', 'stream_grouper.py');
const avatarParserPath = path.join(__dirname, 'avatar_parser.mjs');
const CACHE_FILE = path.join(__dirname, 'ens_avatar_cache.json');

function runPythonScript(scriptPath) {
    exec(`${pythonPath} ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing ${path.basename(scriptPath)}: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`stderr from ${path.basename(scriptPath)}: ${stderr}`);
        }
        console.log(`stdout from ${path.basename(scriptPath)}: ${stdout}`);
        });
    }

function runAvatarParser() {
    exec(`node ${avatarParserPath}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing avatar parser: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`stderr from avatar parser: ${stderr}`);
        }
        console.log(`stdout from avatar parser: ${stdout}`);
    });
}

function clearCache() {
    if (fs.existsSync(CACHE_FILE)) {
        fs.unlinkSync(CACHE_FILE);
    }
}

cron.schedule('0 */2 * * *', () => {
    runPythonScript(dataMergerPath);
});

cron.schedule('1 */2 * * *', () => {
    runPythonScript(dataMinerPath);
});

cron.schedule('0 0 * * *', () => {
    runPythonScript(dailyStreamGrouperScriptPath);
});

cron.schedule('0 0 * * 0', () => {
    runAvatarParser();
});

cron.schedule('0 0 1 * *', () => {
    clearCache();
});

app.get('/contractors/:category', (req, res) => {
    const category = req.params.category;
    const quarter = req.query.quarter;
    const sender = req.query.sender;


    let filteredData = df.filter(row =>
        row.Quarter === quarter &&
        row.To_category === category
    );

    if (sender) {
        filteredData = filteredData.filter(row => row.From_name === sender);
    }

    const contractorsData = filteredData.reduce((acc, row) => {
        if (!acc[row.To_name]) {
            acc[row.To_name] = 0;
        }
        acc[row.To_name] += parseFloat(row.DOT_USD);
        return acc;
    }, {});

    const result = Object.entries(contractorsData).map(([name, value]) => ({
        name,
        value: Math.round(value) // Round to whole number
    }));

    result.sort((a, b) => b.value - a.value);

    res.json(result);
});

app.get('/avatars/:filename', (req, res) => {
    const filename = req.params.filename;
    const avatarPath = path.join(__dirname, 'avatars', filename);
    
    res.sendFile(avatarPath, (err) => {
        if (err) {
            res.status(404).send('Avatar not found');
        }
    });
});

app.get('/static_avatars/:filename', (req, res) => {
    const filename = req.params.filename;
    const avatarPath = path.join(__dirname, 'static_avatars', filename);
    
    res.sendFile(avatarPath, (err) => {
        if (err) {
            res.status(404).send('Avatar not found');
        }
    });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}/`);
});
