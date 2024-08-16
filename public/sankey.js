document.addEventListener('DOMContentLoaded', () => {

    let categoryMode = true;
    let hideMode = true;
    let currentWalletFilter = null;
    let zoneSendersList = [];
    let qtrSendersList = []
    let nodeName;
    let currentQuarter = 'big_picture';
    let specialWallets = ['Ecosystem', 'Public Goods', 'Metagov', 'Community WG', 'Providers'];
    let registrars = ['Old Registrar', 'New Registrar'];
    let daoWallet = ['DAO Wallet'];
    let isQuarter = false;

    const helpIdentifyButton = document.getElementById('helpIdentifyButton');
    const identifyTransactionsModal = document.getElementById('identifyTransactionsModal');
    const closeIdentifyModal = document.getElementById('closeIdentifyModal');
    const transactionsTable = document.getElementById('transactionsTable').getElementsByTagName('tbody')[0];
    const collapseButton = document.getElementById('collapseButton');
    const toolContainer = document.querySelector('.tool-container');
    const sankeyContainer = document.querySelector('.sankey-container');
    const sankeyDiv = document.getElementById('sankeyDiagram');
    const categoryModeButton = document.getElementById('categoryModeButton');
    const hideModeButton = document.getElementById('hideModeButton');

    const getWidth = window.innerWidth;
    const getHeight = window.innerHeight;

    function toggleButton(button) {
        button.classList.toggle('active');
        return button.classList.contains('active');
    }

    categoryModeButton.addEventListener('click', function() {
        categoryMode = toggleButton(this);
        drawSankey(currentQuarter, currentWalletFilter, categoryMode, hideMode);
    });

    categoryModeButton.classList.add('active');
    categoryModeButton.setAttribute('data-off-text', 'Categories');

    hideModeButton.addEventListener('click', function() {
        hideMode = toggleButton(this);
        drawSankey(currentQuarter, currentWalletFilter, categoryMode, hideMode);
    });

    hideModeButton.classList.add('active');
    hideModeButton.setAttribute('data-off-text', 'Readability');

    document.getElementById('savePngButton').addEventListener('click', () => {
        exportCustomSVG(categoryMode, 'png');
    });
    document.getElementById('saveSvgButton').addEventListener('click', () => {
        exportCustomSVG(categoryMode, 'svg');
    });
    document.getElementById('exportCSV').addEventListener('click', () => 
        exportData('csv')
    );
    document.getElementById('exportXLSX').addEventListener('click', () => 
        exportData('xlsx')
    );
    document.getElementById('exportJSON').addEventListener('click', () => 
        exportData('json')
    );
    document.getElementById('bigPictureButton').addEventListener('click', () => {
        drawSankey('big_picture', null, categoryMode, hideMode);
    });

    document.getElementById('closeDetails').addEventListener('click', function() {
        document.getElementById('recipientDetails').style.display = 'none';
    });

    collapseButton.addEventListener('click', () => {
        toolContainer.classList.toggle('collapsed');
        sankeyContainer.classList.toggle('expanded');
    });

    helpIdentifyButton.addEventListener('click', function() {
        identifyTransactionsModal.style.display = 'block';
        loadTransactions();
    });

    closeIdentifyModal.addEventListener('click', function() {
        identifyTransactionsModal.style.display = 'none';
    });

    // Navigator and stuff for handling navigation

    class LedgerNavigator {
        constructor() {
            this.baseUrl = '://ledger';
            this.currentView = 'big_picture';
            this.currentQuarter = null;
            this.walletFilter = null;
            this.categoryMode = true;
            this.hideMode = true;
            this.history = [{
                currentView: this.currentView,
                currentQuarter: this.currentQuarter,
                walletFilter: this.walletFilter,
                categoryMode: this.categoryMode,
                hideMode: this.hideMode
            }];
            this.currentHistoryIndex = 0;
            this.maxHistoryLength = 50;
        }
    
        updateUrl() {
            let url = '://ledger/';
        
            if (this.currentView === 'big_picture') {
                url += 'big_picture';
            } else if (this.currentView === 'quarter') {
                url += `quarters/${this.currentQuarter}`;
                if (this.walletFilter) {
                    const formattedWallet = this.walletFilter.replace(/ /g, '_').toLowerCase();
                    url += `/${formattedWallet}`;
                }
            }
        
            let params = [];
            if (this.categoryMode) {
                params.push('category=true');
            } else {
                params.push('contractors=true');
            }
            if (this.currentView === 'big_picture') {
                if (this.hideMode) {
                    params.push('readability=true');
                } else {
                    params.push('realdata=true');
                }
            }
            if (params.length > 0) {
                url += '?' + params.join('&');
            }
        
            return url;
        }
    
        updateUrlBar() {
            const urlBar = document.getElementById('urlBar');
            const url = this.updateUrl();
            const colorizedUrl = url
                .replace(/(:\/{2}ledger\/)/g, '<span style="color: #000000;">$1</span>')
                .replace(/(big_picture|quarters)/g, '<span style="color: #ba51b2;">$1</span>')
                .replace(/(\d{4}Q\d|\/[a-zA-Z]+)(?=\?|$)/g, '<span style="color: #ba51b2;">$1</span>')
                .replace(/(category|contractors|readability|realdata)/g, '<span style="color: #17c6ff;">$1</span>')
                .replace(/(true|false)/g, '<span style="color: blue;">$1</span>');
        
            urlBar.innerHTML = colorizedUrl;

            

        }        

        saveState() {
            const state = {
                currentView: this.currentView,
                currentQuarter: this.currentQuarter,
                walletFilter: this.walletFilter,
                categoryMode: this.categoryMode,
                hideMode: this.hideMode
            };
        
            const lastState = this.history[this.currentHistoryIndex];
            if (JSON.stringify(state) !== JSON.stringify(lastState)) {
                this.history = this.history.slice(0, this.currentHistoryIndex + 1);
                this.history.push(state);
                if (this.history.length > this.maxHistoryLength) {
                    this.history.shift();
                }
                
                this.currentHistoryIndex = this.history.length - 1;
            }
            
            this.updateNavigationButtons();
        }
    
        updateNavigationButtons() {
            const backButton = document.getElementById('backButton');
            const forwardButton = document.getElementById('forwardButton');
            
            backButton.disabled = this.currentHistoryIndex <= 0;
            forwardButton.disabled = this.currentHistoryIndex >= this.history.length - 1;
        }
    
        goBack() {
            if (this.currentHistoryIndex > 0) {
                this.currentHistoryIndex--;
                this.loadState(this.history[this.currentHistoryIndex]);
            }
        }
        
        goForward() {
            if (this.currentHistoryIndex < this.history.length - 1) {
                this.currentHistoryIndex++;
                this.loadState(this.history[this.currentHistoryIndex]);
            }
        }
        
        loadState(state) {
            this.currentView = state.currentView;
            this.currentQuarter = state.currentQuarter;
            this.walletFilter = state.walletFilter;
            this.categoryMode = state.categoryMode;
            this.hideMode = state.hideMode;
            
            this.updateDiagram();
            this.updateNavigationButtons();
        }
                
        
        updateDiagram() {        
            drawSankey(
                this.currentView === 'big_picture' ? 'big_picture' : this.currentQuarter,
                this.walletFilter,
                this.categoryMode,
                this.hideMode
            );
            
            this.updateUrlBar();
            this.saveState();
        }
    
        setBigPicture() {
            if (this.currentView !== 'big_picture') {
                this.currentView = 'big_picture';
                this.currentQuarter = null;
                this.walletFilter = null;
                this.updateDiagram();
            }
        }
        
        setQuarter(quarter) {
            if (this.currentQuarter !== quarter || this.currentView !== 'quarter') {
                this.currentView = 'quarter';
                this.currentQuarter = quarter;
                this.walletFilter = null;
                this.updateDiagram();
            }
        }
        
        setWalletFilter(wallet) {
            if (this.currentView === 'quarter' && this.currentQuarter) {
                if (this.walletFilter !== wallet) {
                    this.walletFilter = wallet;
                    this.updateDiagram();
                }
            } else {
                console.error('Cannot set wallet filter in big picture view or without a quarter selected');
            }
        }
    
        toggleCategoryMode() {
            this.categoryMode = !this.categoryMode;
            this.updateDiagram();
        }
    
        toggleHideMode() {
            this.hideMode = !this.hideMode;
            this.updateDiagram();
        }
    }

    const navigator = new LedgerNavigator();
    navigator.updateUrlBar();
    navigator.updateNavigationButtons();
    
    document.getElementById('categoryModeButton').addEventListener('click', () => {
        navigator.toggleCategoryMode();
    });
    
    document.getElementById('hideModeButton').addEventListener('click', () => {
        navigator.toggleHideMode();
    });
    
    document.getElementById('bigPictureButton').addEventListener('click', () => {
        navigator.setBigPicture();
    });

    document.getElementById('backButton').addEventListener('click', () => navigator.goBack());
    document.getElementById('forwardButton').addEventListener('click', () => navigator.goForward());

    function populateQuarters(quarters) {
        const dropdown = document.getElementById("quartersDropdown");
        quarters.forEach(quarter => {
            const a = document.createElement('a');
            a.href = "#";
            a.textContent = quarter;
            a.onclick = function() {
                navigator.setQuarter(quarter);
                return false;
            };
            dropdown.appendChild(a);
        });
    }
    
    function populateWallets(activeWallets) {
        const dropdown = document.getElementById("walletsDropdown");
        dropdown.innerHTML = '';
        activeWallets.forEach(wallet => {
            const a = document.createElement('a');
            a.href = "#";
            a.textContent = wallet;
            a.onclick = function() {
                navigator.setWalletFilter(wallet);
                return false;
            };
            dropdown.appendChild(a);
        });
    }

    function toggleWallets() {
        document.getElementById("walletsDropdown").classList.toggle("show");
    }
    
    window.onclick = function(event) {
        if (!event.target.matches('.menu-button')) {
            var dropdowns = document.getElementsByClassName("quarters-content");
            var walletsDropdown = document.getElementById("walletsDropdown");
            
            for (var i = 0; i < dropdowns.length; i++) {
                var openDropdown = dropdowns[i];
                if (openDropdown.classList.contains('show')) {
                    openDropdown.classList.remove('show');
                }
            }
            
            if (walletsDropdown && walletsDropdown.classList.contains('show')) {
                walletsDropdown.classList.remove('show');
            }
        }
    }

    // Functions to manage unidentified txs and update the table
    
    function loadTransactions() {
        fetch('/unknown_contractors')
            .then(response => response.json())
            .then(data => {
                const transactionsTable = document.getElementById('transactionsTable').getElementsByTagName('tbody')[0];
                transactionsTable.innerHTML = '';
                data.forEach(tx => {
                    const row = transactionsTable.insertRow();
                    const isAcquainted = tx['Acquainted?'] === 1;
                    row.innerHTML = `
                        <td>${tx.Date}</td>
                        <td>${getTxLink(tx['Transaction Hash'])}</td>
                        <td>
                            <span style="color: ${getAmountColor(tx.Symbol)}; font-weight: bold;">
                                ${formatValue(-tx.Value)} ${tx.Symbol}
                            </span>
                        </td>
                        <td>${tx['From_name']}</td>
                        <td>${tx.To}</td>
                        <td>${isAcquainted ? tx.To_name : '<input type="text" class="name-input">'}</td>
                        <td>${isAcquainted ? tx.To_category : '<input type="text" class="category-input">'}</td>
                        <td>
                            <button class="submit-button">Submit</button>
                            <span class="checkmark" style="display: none;">✓</span>
                        </td>
                    `;
    
                    const submitButton = row.querySelector('.submit-button');
                    const checkmark = row.querySelector('.checkmark');
                    submitButton.addEventListener('click', function() {
                        const nameInput = row.querySelector('.name-input');
                        const categoryInput = row.querySelector('.category-input');
                        const name = isAcquainted ? tx.To_name : nameInput.value;
                        const category = isAcquainted ? tx.To_category : categoryInput.value;
    
                        saveTransaction({
                            Hash: tx['Transaction Hash'],
                            From: tx['From_name'],
                            Amount: -tx.Value,
                            Address: tx.To,
                            Name: name,
                            Category: category
                        });
    
                        checkmark.style.display = 'inline';
                        submitButton.style.display = 'none';
                    });
                });
            })
            .catch(error => console.error('Error loading transactions:', error));
    }
    
    function saveTransaction(transactionData) {
        fetch('/save_transaction', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(transactionData),
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
    }
    
    function getTxLink(hash) {
        return hash && hash !== 'N/A'
            ? `<a href="https://etherscan.io/tx/${hash}" target="_blank">${hash.substring(0, 6)}...</a>`
            : 'N/A';
    }
    
    function getAmountColor(symbol) {
        const colorMap = {
            'USDC': '#5294e2',
            'ETH': '#b97cf3',
            'ENS': '#5ac8fa'
        };
        return colorMap[symbol] || 'black';
    }
    
    function formatValue(value) {
        return parseFloat(value).toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    }    
    
    // Export data functionality 

    function generateFileName(format) {
        let fileName = '';
        if (navigator.currentView === 'big_picture') {
            fileName = `big_picture_ledger.${format}`;
        } else if (navigator.currentView === 'quarter') {
            if (navigator.walletFilter) {

                const formattedWallet = navigator.walletFilter.replace(/ /g, '_');
                fileName = `${formattedWallet}_${navigator.currentQuarter}_ledger.${format}`;
            } else {
                fileName = `${navigator.currentQuarter}_ledger.${format}`;
            }
        }
        return fileName;
    }

    function saveAsCSV(data) {
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => row[header]).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const fileName = generateFileName('csv');
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
    
    function saveAsXLSX(data) {
        const fileName = generateFileName('xlsx');
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Data");
        XLSX.writeFile(wb, fileName);
    }
    
    function saveAsJSON(data) {
        const fileName = generateFileName('json');
        const jsonContent = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    function exportData(format) {
        const currentView = getCurrentView();
        const currentFilter = getCurrentFilter();
    
        fetch(`/export-data?view=${currentView}&filter=${currentFilter}&quarter=${currentQuarter}`)
            .then(response => response.json())
            .then(data => {
                const filteredData = data
                    .filter(row => row.From_name !== 'Plchld' && row.To_name !== 'Plchld')
                    .sort((a, b) => new Date(a.Date) - new Date(b.Date));
    
                const formattedData = filteredData.map(row => ({
                    'Transaction Hash': row['Transaction Hash'],
                    'Date': row.Date,
                    'Quarter': row.Quarter,
                    'From': row.From_name,
                    'To': row.To_name,
                    'Category': row.To_category,
                    'Amount': row.Value,
                    'Asset': row.Symbol,
                    'Value': row.DOT_USD
                }));
                
                switch (format) {
                    case 'csv':
                        saveAsCSV(formattedData);
                        break;
                    case 'xlsx':
                        saveAsXLSX(formattedData);
                        break;
                    case 'json':
                        saveAsJSON(formattedData);
                        break;
                }
            });
    }

    function getCurrentView() {
        if (currentWalletFilter) {
            return 'wallet';
        } else if (currentQuarter === 'big_picture') {
            return 'big_picture';
        } else {
            return 'quarter';
        }
    }
    
    function getCurrentFilter() {
        if (currentWalletFilter) {
            return currentWalletFilter;
        } else if (currentQuarter === 'big_picture') {
            return null;
        } else {
            return currentQuarter;
        }
    }

    function addSaveButtons(detailsContent, transactions) {
        const saveButtonsContainer = document.createElement('div');
        const colorMap = ['#5294e2','#b97cf3','#5ac8fa']
        saveButtonsContainer.style.cssText = `
            display: flex;
            justify-content: center;
            margin-top: 20px;
        `;
    
        const buttonStyle = (color) => `
            padding: 1vw 2.35vw;
            margin: 0 2vw;
            background-color: ${color};
            color: white;
            border: none;
            cursor: pointer;
            border-radius: 1vw;
            font-size: 1.28vw;
            font-family: montserrat;
            text-shadow: black 0.071vw 0.071vw, 
                        0.0071vw 0.071vw black;
            border: solid 0.071vw black;
        `;

    
['XLSX', 'CSV', 'JSON'].forEach((format, index) => {
        const button = document.createElement('button');
        button.textContent = `Save as ${format}`;
        button.style.cssText = buttonStyle(colorMap[index % colorMap.length]);
        

        button.onmouseover = () => button.style.opacity = '0.8';
        button.onmouseout = () => button.style.opacity = '1';
        
        button.onclick = () => saveTableAs(format.toLowerCase(), transactions);
        saveButtonsContainer.appendChild(button);
    });
    
        detailsContent.appendChild(saveButtonsContainer);
    } 
    
    function saveTableAs(format, transactions) {
        const tableData = transactions.map(tx => ({
            'Transaction Hash': tx['Transaction Hash'],
            'Date': tx.Date,
            'Quarter': tx.Quarter,
            'From': tx.From_name,
            'To': tx.To_name,
            'Category': tx.To_category,
            'Amount': tx.Value,
            'Asset': tx.Symbol,
            'Value': tx.DOT_USD
        }));
    
        switch (format) {
            case 'xlsx':
                saveAsXLSX(tableData);
                break;
            case 'csv':
                saveAsCSV(tableData);
                break;
            case 'json':
                saveAsJSON(tableData);
                break;
        }
    }

    function exportCustomSVG(categoryMode, format = 'svg') {
        const sankeyDiv = document.getElementById('sankeyDiagram');
        const plotSVG = sankeyDiv.getElementsByTagName('svg')[0];
        const gd = sankeyDiv._fullLayout;
    
        const shapes = gd.shapes || [];
        const annotations = gd.annotations || [];
    
        const svgCopy = plotSVG.cloneNode(true);
    
        const width = parseFloat(svgCopy.getAttribute('width'));
        const height = parseFloat(svgCopy.getAttribute('height'));
    
        const overlayGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        overlayGroup.setAttribute('class', 'overlay-group');
    
        shapes.forEach((shape, index) => {
            const shapeElem = createSVGShape(shape, width, height, categoryMode);
            if (shapeElem) {                overlayGroup.appendChild(shapeElem);
            } else {            }
        });
    
        annotations.forEach((annotation, index) => {
            const annotationElem = createSVGAnnotation(annotation, width, height, categoryMode);
            if (annotationElem) {                overlayGroup.appendChild(annotationElem);
            } else {            }
        });
    
        svgCopy.appendChild(overlayGroup);
    
        const maxHeight = 2000;
        const finalHeight = Math.max(height, maxHeight);
        if (height > maxHeight) {
            svgCopy.setAttribute('height', maxHeight);
            svgCopy.setAttribute('viewBox', `0 0 ${width} ${maxHeight}`);
            
            const clipPath = svgCopy.querySelector('clipPath');
            if (clipPath) {
                const rect = clipPath.querySelector('rect');
                if (rect) {
                    rect.setAttribute('height', maxHeight);
                }
            }
        }
            const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(svgCopy);
        
        svgString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
                    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
                    svgString;
    
        if (format === 'svg') {
            const blob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
            const url = URL.createObjectURL(blob);
    
            const fileName = generateFileName('svg');
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute("download", fileName);
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
    
            URL.revokeObjectURL(url);
        } else if (format === 'png') {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = finalHeight;
                const ctx = canvas.getContext('2d');
    
                ctx.drawImage(img, 0, 0);
    
                canvas.toBlob(function(blob) {
                    const url = URL.createObjectURL(blob);


                    const fileName = generateFileName('png');
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute("download", fileName);
                    
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
    
                    URL.revokeObjectURL(url);
                }, 'image/png');
            };
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
        }
        }
    
    function createSVGShape(shape, width, height, categoryMode) {        const svgns = "http://www.w3.org/2000/svg";
        let elem;
    
        try {
            if (shape.type === 'line') {
                elem = document.createElementNS(svgns, 'line');
                
                if (shape.x0 === shape.x1) {
                    elem.setAttribute('x1', shape.x0 * width);
                    elem.setAttribute('y1', 0);
                    elem.setAttribute('x2', shape.x1 * width);
                    elem.setAttribute('y2', height);
                } 
                else if (shape.y0 === shape.y1) {
                    elem.setAttribute('x1', 0);
                    elem.setAttribute('x2', width);
                    elem.setAttribute('y1', 0.035 * height);
                    elem.setAttribute('y2', 0.035 * height);
                }
            } else {
                elem = document.createElementNS(svgns, 'rect');
                elem.setAttribute('x', shape.x0 * width);
                elem.setAttribute('y', shape.y0 * height);
                elem.setAttribute('width', (shape.x1 - shape.x0) * width);
                elem.setAttribute('height', (shape.y1 - shape.y0) * height);
            }
    
            if (elem) {
                elem.setAttribute('fill', shape.fillcolor || 'none');
                elem.setAttribute('stroke', shape.line.color || 'black');
                elem.setAttribute('stroke-width', shape.line.width || 1);
                elem.setAttribute('vector-effect', 'non-scaling-stroke');
            }
        } catch (error) {
            console.error('Error creating shape:', error);
            return null;
        }
    
        return elem;
    }
    
    function createSVGAnnotation(annotation, width, height, categoryMode) {        const svgns = "http://www.w3.org/2000/svg";
        const g = document.createElementNS(svgns, 'g');
    
        try {
            let x;
            let y;

            y = 0.01 * height;
            x = (annotation.x - 0.0175) * width;
            
            const text = document.createElementNS(svgns, 'text');
            text.textContent = annotation.text;
            
            text.setAttribute('x', x);
            text.setAttribute('y', y);
            text.setAttribute('text-anchor', annotation.xanchor);
            text.setAttribute('dominant-baseline', 'hanging');
            text.setAttribute('font-family', 'montserrat');
            text.setAttribute('font-size', `${annotation.font.size}px`);
            text.setAttribute('fill', annotation.font.color);
    
            if (annotation.textangle) {
                text.setAttribute('transform', `rotate(${annotation.textangle}, ${x}, ${y})`);
            }
    
            g.appendChild(text);
    
        } catch (error) {
            console.error('Error creating annotation:', error);
            return null;
        }
    
        return g;
    }

    // Detailed statistics

    function showRecipientDetails(recipientName) {        
        const specialWallets = ['Ecosystem', 'Public Goods', 'Metagov', 'Community WG', 'Providers'];
        if (recipientName === 'DAO Wallet' || specialWallets.includes(recipientName)) {
            return;
        }
    
        fetch(`/recipient_details/${encodeURIComponent(recipientName)}?isCategory=${categoryMode}`)
            .then(response => response.json())
            .then(data => {
                if (!data.transactions || data.transactions.length === 0) {
                    return;
                }
    
                const isCategoryMode = categoryMode;
    
                const title = isCategoryMode 
                    ? `Transactions for category '${data.transactions[0].To_category}'`
                    : `Transactions for counterparty '${recipientName}'`;
    
                const tableHeaders = isCategoryMode
                    ? ['Date', 'Amount', 'USD Value', 'From', 'Address', 'Counterparty', 'TX']
                    : ['Date', 'Amount', 'USD Value', 'From', 'Address', 'Item', 'TX'];
    
                const colorMap = {
                    'USDC': '#5294e2',
                    'ETH': '#b97cf3',
                    'ENS': '#5ac8fa'
                };
                
                const tableRows = data.transactions.map(tx => {
                    const txLink = tx['Transaction Hash'] && tx['Transaction Hash'] !== 'N/A'
                        ? `<a href="https://etherscan.io/tx/${tx['Transaction Hash']}" target="_blank">${tx['Transaction Hash'].substring(0, 6)}...</a>`
                        : 'N/A';
                    

                        const formattedValue = parseFloat(tx.Value).toLocaleString('en-US', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 1
                        });
        
                        const roundedDOT_USD = Math.round(parseFloat(tx.DOT_USD)).toLocaleString('en-US');
                    const amountColor = colorMap[tx.Symbol] || 'white';
                
                    const crossLink = categoryMode
                    ? `<a href="#" onclick="showRecipientDetails('${tx.To_category}'); return false;">${tx.To_name}</a>`
                    : `<a href="#" onclick="showRecipientDetails('${tx.To_name}'); return false;">${tx.To_category}</a>`;

                    return isCategoryMode
                        ? `<tr style="text-align: center; font-family: montserrat; font-size: 1.14vw;">
                             <td style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; font-family: montserrat; font-size: 1.14vw;">${tx.Date}</td>
                            <td style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; font-size: 1.14vw;">
                                <span style="color: ${amountColor}; font-weight: bold;">${formattedValue} ${tx.Symbol}</span>
                            </td>                           
                             <td style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; font-family: montserrat; font-size: 1.14vw;">${roundedDOT_USD}</td>
                             <td style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; font-family: montserrat; font-size: 1.14vw;">${tx.From_name}</td>
                             <td style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; font-family: montserrat; font-size: 1.14vw;">${tx.To}</td>
                             <td style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; font-family: montserrat; font-size: 1.14vw;">${crossLink}</td>
                             <td style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; font-family: montserrat; font-size: 1.14vw;">${txLink}</td>
                           </tr>`
                        : `<tr style="text-align: center; font-family: montserrat; font-size: 1.14vw">
                             <td style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; font-family: montserrat; font-size: 1.14vw;">${tx.Date}</td>
                            <td style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; font-size: 1.14vw;">
                                <span style="color: ${amountColor}; font-weight: bold;">${formattedValue} ${tx.Symbol}</span>
                            </td>                         
                             <td style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; font-family: montserrat; font-size: 1.14vw;">${roundedDOT_USD}</td>
                             <td style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; font-family: montserrat; font-size: 1.14vw;">${tx.From_name}</td>
                             <td style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; font-family: montserrat; font-size: 1.14vw;">${tx.To}</td>
                             <td style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; font-family: montserrat; font-size: 1.14vw;">${crossLink}</td>
                             <td style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; font-family: montserrat; font-size: 1.14vw;">${txLink}</td>
                           </tr>`;
                }).join('');

                const summaryHtml = `
                    <p style="text-align: center; font-size: 1.14vw; background-color: white; padding: 1.07vw; border-radius: 0.71vw; margin-bottom: 1.42vw; font-family: montserrat;">
                        ${isCategoryMode ? 'Category' : 'Counterparty'} '${recipientName}' received 
                        <span style="color: ${colorMap['ETH']}">${data.summary.ETH} ETH</span>, 
                        <span style="color: ${colorMap['USDC']}">${data.summary.USDC} USDC</span> and 
                        <span style="color: ${colorMap['ENS']}">${data.summary.ENS} ENS</span>, 
                        which is the equivalent of <strong>${data.summary.total_usd} USD</strong> at the moment of transactions.
                    </p>
                `;
    
                const tableHtml = `
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                ${tableHeaders.map(header => `<th style="border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; background-color: #f2f2f2; font-size: 1.14vw; font-family: montserrat;">${header}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows.replace(/<td/g, '<td style="border: 0.071vw solid #ddd; padding: 0.857vw;"')}
                        </tbody>
                    </table>
                `;
            
    
                const quarterData = groupDataByField(data.transactions, 'Quarter');
                const senderData = groupDataByField(data.transactions, 'From_name');
                const thirdChartData = isCategoryMode
                    ? groupDataByField(data.transactions, 'To_name')
                    : groupDataByField(data.transactions, 'To_category');
                const thirdChartTitle = isCategoryMode ? 'Counterparties' : 'Category';

                const chartsHtml = `
                    <div style="background-color: white; padding: 1.42vw; border-radius: 0.71vw; margin-bottom: 1.42vw;">
                        <div style="text-align: center; margin-bottom: 1.42vw; font-size: 1.28vw; font-family: montserrat;">Distribution by</div>
                        <div style="display: flex; justify-content: space-between; width: 100%; font-size: 1.07vw; font-family: montserrat">
                            ${createPieChartHtml('Quarter', quarterData)}
                            <div style="width: 0.071vw; background-color: #ddd;"></div>
                            ${createPieChartHtml('Sender', senderData)}
                            <div style="width: 0.071vw; background-color: #ddd;"></div>
                            ${createPieChartHtml(thirdChartTitle, thirdChartData)}
                        </div>
                    </div>
                `;
                
                const contentHtml = `
                    ${chartsHtml}
                    <div style="background-color: white; padding: 1.42vw; border-radius: 0.71vw; margin-bottom: 1.42vw;">
                        ${tableHtml}
                    </div>
                    <div id="saveButtonsContainer"></div>
                `;
    
                const detailsDiv = document.getElementById('recipientDetails');
                const detailsContent = document.getElementById('detailsContent');
                detailsContent.innerHTML = `
                    ${summaryHtml}
                    ${contentHtml}
                `;

                addSaveButtons(document.getElementById('saveButtonsContainer'), data.transactions);    
                detailsDiv.style.display = 'block';
    
                drawPieChart('pieChartQuarter', quarterData);
                drawPieChart('pieChartSender', senderData);
                drawPieChart(`pieChart${thirdChartTitle}`, thirdChartData);
            })
            .catch(error => {
                console.error('Error fetching recipient details:', error);
            });
    }
    
    function groupDataByField(transactions, field) {
        const groupedData = {};
        transactions.forEach(tx => {
            const key = tx[field];
            if (!groupedData[key]) {
                groupedData[key] = 0;
            }
            groupedData[key] += parseFloat(tx.DOT_USD);
        });
        return groupedData;
    }
    
    function createPieChartHtml(title, data) {
        const chartId = `pieChart${title}`;
        return `
            <div style="width: 28%; display: flex; flex-direction: column; align-items: center;">
                <h4 style="text-align: center; margin: 0 0 0.71vw 0;">${title}</h4>
                <div style="width: 100%; aspect-ratio: 1 / 1; position: relative;">
                    <canvas id="${chartId}"></canvas>
                </div>
                <div id="${chartId}Legend" style="width: 100%; margin-top: 0.71vw; display: flex; flex-wrap: wrap; justify-content: center;"></div>
            </div>
        `;
    }
    
    function drawPieChart(chartId, data) {
        const ctx = document.getElementById(chartId).getContext('2d');
        const dataValues = Object.values(data);
        const isSingleValue = dataValues.length === 1;
        
        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: Object.keys(data),
                datasets: [{
                    data: dataValues,
                    backgroundColor: Object.keys(data).map((_, index) => 
                        `hsl(${index * 360 / Object.keys(data).length}, 70%, 60%)`
                    ),
                    borderWidth: isSingleValue ? 0 : 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false,
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                label += `${percentage}% (${value.toFixed(2)} USD)`;
                                return label;
                            }
                        }
                    }
                }
            },
            plugins: [{
                afterDraw: function(chart) {
                    var ctx = chart.ctx;
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    var chartArea = chart.chartArea;
                    var centerX = (chartArea.left + chartArea.right) / 2;
                    var centerY = (chartArea.top + chartArea.bottom) / 2;
    
                    chart.data.datasets.forEach(function(dataset, datasetIndex) {
                        var meta = chart.getDatasetMeta(datasetIndex);
                        meta.data.forEach(function(element, index) {
                            var model = element;
                            var total = dataset.data.reduce((a, b) => a + b, 0);
                            var percentage = Math.round((dataset.data[index] / total) * 100);
                            var midAngle = element.startAngle + (element.endAngle - element.startAngle) / 2;
                            var x = centerX + Math.cos(midAngle) * (chart.outerRadius / 2);
                            var y = centerY + Math.sin(midAngle) * (chart.outerRadius / 2);
    
                            ctx.fillStyle = '#000';
                            ctx.font = 'bold 0.857vw montserrat';
                            ctx.fillText(percentage + '%', x, y);
                        });
                    });
                    ctx.restore();
                },
                afterRender: function(chart) {
                    const legendContainer = document.getElementById(`${chart.canvas.id}Legend`);
                    legendContainer.innerHTML = '';
    
                    const itemsPerRow = 3;
                    let currentRow;
    
                    chart.legend.legendItems.forEach((item, index) => {
                        if (index % itemsPerRow === 0) {
                            currentRow = document.createElement('div');
                            currentRow.style.display = 'flex';
                            currentRow.style.justifyContent = 'center';
                            currentRow.style.width = '100%';
                            currentRow.style.marginBottom = '0.305vw';
                            legendContainer.appendChild(currentRow);
                        }
    
                        const legendItem = document.createElement('div');
                        legendItem.style.display = 'flex';
                        legendItem.style.alignItems = 'center';
                        legendItem.style.marginRight = '0.71vw';
                        legendItem.style.fontSize = '1vw';
    
                        const colorBox = document.createElement('span');
                        colorBox.style.width = '0.71vw';
                        colorBox.style.height = '0.71vw';
                        colorBox.style.backgroundColor = item.fillStyle;
                        colorBox.style.marginRight = '0.305vw';
    
                        const label = document.createElement('span');
                        label.textContent = item.text;
    
                        legendItem.appendChild(colorBox);
                        legendItem.appendChild(label);
                        currentRow.appendChild(legendItem);
                    });
                }
            }]
        });
    }

    // Sankey misc. settings

    function sankeyNodeLabelsAlign(position, forcePos) {
        const textAnchor = {left: 'end', right: 'start', center: 'middle'}[position];
        const nodes = document.getElementsByClassName('sankey-node');
        const TEXTPAD = 3;

        Array.from(nodes).forEach((node, index) => {
            const d = node.__data__;
            const label = node.getElementsByClassName('node-label').item(0);
    
            label.setAttribute('x', 0);
    
            if (!d.horizontal)
                return;
            
            const padX = d.nodeLineWidth / 2 + TEXTPAD;
            const posX = padX + d.visibleWidth;
            let x, y;  
    
            const isSpecialCase = zoneSendersList.includes(nodeName[index]);
            const registrarsCase = registrars.some(reg => nodeName[index].startsWith(reg));
            const isSpecialWallet = specialWallets.some(wallet => nodeName[index].startsWith(wallet));
            const isDaoWallet = daoWallet.some(wallet => nodeName[index].startsWith(wallet));

            if (isSpecialCase && currentQuarter === 'big_picture') {
                x = -posX - padX;
                label.setAttribute('text-anchor', 'end');
                label.style.fontSize = '0.714vw';
            } else if (isSpecialWallet && currentQuarter === 'big_picture') {
                x = (d.nodeLineWidth + d.visibleWidth) / 2 + (d.left ? padX : -posX);
                label.setAttribute('text-anchor', 'middle');
            } else if (registrarsCase && currentQuarter === 'big_picture') {
                x = -posX - padX;
                label.setAttribute('text-anchor', 'end');
            } else {
                switch (position) {
                    case 'left':
                        if (d.left || d.node.originalLayer === 0 && !forcePos)
                            return;
                        x = -posX - padX;
                        break;
    
                    case 'right':
                        if (!d.left || !forcePos)
                            return;
                        x = posX + padX;
                        break;
    
                    case 'center':
                        if (!forcePos && (d.left || d.node.originalLayer === 0))
                            return;
                        x = (d.nodeLineWidth + d.visibleWidth) / 2 + (d.left ? padX : -posX);
                        break;
                }
                label.setAttribute('text-anchor', textAnchor);
            }
            label.setAttribute('x', x);
        });
    }

    function calculateSankeySettings(baseThickness, baseFontSize) {
        const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
        
        const baseWidth = 1440;
    
        const thickness = (viewportWidth / baseWidth) * baseThickness;
        const fontSize = (viewportWidth / baseWidth) * baseFontSize;
    
        return {
            thickness: Math.max(10, Math.min(thickness, 150)), 
            fontSize: Math.max(8, Math.min(fontSize, 100))     
        };
    }

    function disableHoverEffects() {
        Plotly.relayout('sankeyDiagram', {
            'hovermode': false
        });
    }
    
    function enableHoverEffects() {
        Plotly.relayout('sankeyDiagram', {
            'hovermode': 'closest'
        });
    }

    // Main function to render sankey data
    const drawSankey = (quarter, walletFilter = null, useCategoryMode = categoryMode, useHideMode = hideMode) => {

        currentQuarter = quarter;
        currentWalletFilter = walletFilter;
        useCategoryMode = categoryMode;
        useHideMode = hideMode;

        isQuarter === 'big_picture' ? false : true;

        navigator.currentQuarter = quarter;
        navigator.walletFilter = walletFilter;
        navigator.categoryMode = useCategoryMode;
        navigator.hideMode = useHideMode;

        const daoWalletLegend = document.getElementById('daoWalletLegend');
        if (quarter === 'big_picture') {
            daoWalletLegend.style.display = 'flex';
        } else {
            daoWalletLegend.style.display = 'none';
        }

        // Adaptive layout

        function updateSankeyDiagramAfterOrientationChange() {
            sankeyContainer.style.width = `${getWidth}px`;
            sankeyContainer.style.height = `${getHeight}px`;
            drawSankey(currentQuarter, currentWalletFilter, categoryMode, hideMode);
        }

        function handleOrientationChange() {
            setTimeout(() => {
                updateSankeyDiagramAfterOrientationChange();
            }, 100);
        }

        window.addEventListener("orientationchange", handleOrientationChange);
        
        width = (window.innerWidth >= 1024) ? Math.max(getWidth, 800) : getWidth;
        if (categoryMode) {
            height = (window.innerWidth >= 1024) ? Math.max(getHeight, 600) : getHeight;
        } else {
            height = (window.innerWidth >= 1024) ? Math.max(getHeight - (10*window.innerHeight/820), 600) : getHeight;
        }

        sankeyContainer.style.width = `${width}px`;
        sankeyContainer.style.height = `${height}px`;

        // Button-killer

        const walletsButton = document.getElementById('walletsButton');
        const hideModeButton = document.getElementById('hideModeButton');

        if (quarter === 'big_picture') {
            walletsButton.disabled = true;
            walletsButton.classList.add('disabled-button');
            hideModeButton.disabled = false;
            hideModeButton.classList.remove('disabled-button');
        } else {
            walletsButton.disabled = false;
            walletsButton.classList.remove('disabled-button');
            hideModeButton.disabled = true;
            hideModeButton.classList.add('disabled-button');
        }
        // Sankey Settings
        fetch(`/data/${quarter}?category=${categoryMode}&hideMode=${useHideMode}${walletFilter ? `&wallet=${walletFilter}` : ''}`)
            .then(response => response.json())
            .then(data => {
                zoneSendersList = data.zoneSendersList || [];
                qtrSendersList = data.qtrSendersList || [];
                qtrReceiversList = data.qtrReceiversList || [];
                specialWallets = ['Ecosystem', 'Public Goods', 'Metagov', 'Community WG', 'Providers'];
                nodeName = data.nodes.map(node => node.bpIndex);

                    const settings = quarter === 'big_picture' ? calculateSankeySettings(15, 12) : calculateSankeySettings(100, 16)
                    const sankeyData = {
                        type: "sankey",
                        orientation: "h",
                        arrangement: "fixed",
                        node: {
                            pad: walletFilter ? 15*(window.innerHeight/820) : (quarter === 'big_picture' ? 1 : (5*window.innerHeight/820)),
                            thickness: walletFilter ? ((window.innerWidth >= 1024) ? 150*(window.innerWidth/1440) : 150) 
                            : (quarter === 'big_picture' ? ((window.innerWidth >= 1024) ? 15*window.innerWidth/1440 : 15) 
                            : ((window.innerWidth >= 1024) ? (100*window.innerWidth/1440) : 100)),
                            line: {
                                color: "grey",
                                width: quarter === 'big_picture' ? 1*(window.innerWidth/1440) : 0.5*(window.innerWidth/1440)
                            },
                            font: {
                                family: "montserrat",
                                size: 25,
                            },
                            label: quarter === 'big_picture' ? data.nodes.map(node => 
                                node.name.startsWith('DAO Wallet') ? '' : node.name
                            ) : data.nodes.map(node => node.name),
                            customdata: data.nodes.map(node => node.customdata),
                            color: quarter === 'big_picture' ? data.nodes.map(node => 
                                node.name.startsWith('DAO Wallet') ? 'rgba(250, 255, 232, 1)' : 'white'
                            ) : 'white',
                            x: data.nodes.map(node => node.x),
                            y: data.nodes.map(node => node.y),
                            hovertemplate: '%{label}<br>Value: %{value}<extra></extra>'
                        },
                        link: {
                            source: data.links.map(link => link.source),
                            target: data.links.map(link => link.target),
                            value: data.links.map(link => link.value),
                            color: data.links.map(link => link.color),
                            customdata: data.links.map(link => ({
                                label: link.label,
                                receipt: link.customdata.receipt
                            })),
                            hovertemplate: '%{customdata.label}<extra></extra>',
                        }
                    };

                    let shapes = [];
                    let annotations = [];

                    // Layers
                    if (quarter === 'big_picture') {
                        const quarterCount = data.conditions.quarterCount;
                        const border = 0.01;
                        const quarterNumber = (1 - border) / quarterCount;
                        let currentYear = 2022;
                        let currentQuarterIndex = 2;
                        for (let i = 1; i <= quarterCount; i++) {
                            const lineX = i * quarterNumber + border;
                            
                            shapes.push({
                                type: 'line',
                                x0: -0.05,
                                y0: 1.015,
                                x1: 1.05,
                                y1: 1.015,
                                xref: 'paper',
                                yref: 'paper',
                                line: {
                                    color: 'grey',
                                    width: (window.innerWidth >= 1024) ? 1*(window.innerHeight/820) : 1,
                                    dash: 'solid'
                                },
                            });

                            shapes.push({
                                type: 'line',
                                x0: lineX,
                                y0: -0.1,
                                x1: lineX,
                                y1: 1.1,
                                xref: 'paper',
                                yref: 'paper',
                                line: {
                                    color: 'grey',
                                    width: (window.innerWidth >= 1024) ? 1*(window.innerWidth/1440) : 1,
                                    dash: 'solid'
                                }, 
                            });

                            annotations.push({
                                x: ((i - 1) * quarterNumber + border + lineX) / 2,
                                y: 1.03,
                                xref: 'paper',
                                yref: 'paper',
                                font: {
                                    family: "poppins, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
                                    size: (window.innerWidth >= 1024) ? 43*(window.innerWidth/1440) : 43,
                                    color: 'black',
                                    weight: 900
                                },
                                showarrow: false,
                                text: `${currentYear}Q${currentQuarterIndex}`,
                                xanchor: 'center',
                                yanchor: 'middle'
                            });

                            annotations = annotations.map(annotation => ({
                                ...annotation,
                                clicktoshow: false,
                                captureevents: true,
                                xclick: annotation.x,
                                yclick: annotation.y
                            }));

                            currentQuarterIndex++;
                            if (currentQuarterIndex > 4) {
                                currentQuarterIndex = 1;
                                currentYear++;
                            }

                            layout = {
                                width: (window.innerWidth >= 1024) ? (450*quarterCount)*(width/1440) : 450*quarterCount,
                                height: (window.innerWidth >= 1024) ? 2000*(window.innerHeight/820) : 2000,
                                margin: { l: 0, r: 0, t: (window.innerWidth >= 1024) ? 100*(window.innerHeight/820) : 100, b: (window.innerWidth >= 1024) ? 100*(window.innerHeight/820) : 100},
                                shapes: shapes,
                                annotations: annotations,
                                font: {
                                    size: (window.innerWidth >= 1024) ? 12*(window.innerWidth/1440) : 14,
                                    family: "montserrat"
                                }, 
                                dragmode: 'none',
                                hovermode: 'closest',
                                clickmode: 'event',
                                paper_bgcolor: 'rgb(250, 251, 253)',
                                plot_bgcolor: 'rgb(250, 251, 253)'
                            };
                        };

                    } else { 
                        // const currentModel = data.model;
                        // annotations.push({
                        //     x: 0.8,
                        //     y: 0.8,
                        //     xref: 'paper',
                        //     yref: 'paper',
                        //     font: {
                        //         size: 10,
                        //         color: 'black'
                        //     },
                        //     showarrow: false,
                        //     text: `model: ${currentModel}`,
                        //     xanchor: 'center',
                        //     yanchor: 'middle'
                        // });
                        
                        if (walletFilter) {
                            layout = {
                                width: (window.innerWidth >= 1024) ?  width: 1440,
                                height: (window.innerWidth >= 1024) ? 900*(window.innerHeight/820) : 900,
                                margin: { l: (window.innerWidth >= 1024) ? window.innerWidth*0.01 : 50, r: (window.innerWidth >= 1024) ? window.innerWidth*0.01 : 50, t: 150*(window.innerHeight/820), b: 150*(window.innerHeight/820) },
                                dragmode: 'none',
                                hovermode: 'closest',
                                clickmode: 'event',
                                paper_bgcolor: 'rgb(250, 251, 253)',
                                plot_bgcolor: 'rgb(250, 251, 253)',
                                font: {
                                    family: "montserrat",
                                    size: (window.innerWidth >= 1024) ? 12*(window.innerWidth/1440) : 14,
                                }
                            };
                        } else {
                            layout = {
                                width: (window.innerWidth >= 1024) ? width : 1440,
                                height: (window.innerWidth >= 1024) ? 670*(window.innerHeight/820) : 670,
                                margin: { l: (window.innerWidth >= 1024) ? window.innerWidth*0.01 : 50, r: (window.innerWidth >= 1024) ? window.innerWidth*0.01 : 50, t: (window.innerWidth >= 1024) ? 50*(window.innerHeight/820) : 50, b: (window.innerWidth >= 1024) ? 200*(window.innerHeight/820) : 100 },
                                dragmode: 'none',
                                hovermode: 'closest',
                                clickmode: 'event',
                                paper_bgcolor: 'rgb(250, 251, 253)',
                                plot_bgcolor: 'rgb(250, 251, 253)',
                                font: {
                                    family: "montserrat",
                                    size: (window.innerWidth >= 1024) ? settings.fontSize : 14,
                                    weight: 400
                                }
                            };
                        }
                    };
                
                    const config = {
                        displayModeBar: false,
                        responsive: false,
                        scrollZoom: false,
                        doubleClick: false,
                        showTips: false,
                        showAxisDragHandles: false,
                        showAxisRangeEntryBoxes: false,
                        modeBarButtonsToRemove: ['zoom', 'pan', 'select', 'autoScale', 'resetScale'],
                    };
                

            window.scrollTo(0, 0);
            sankeyContainer.scrollTo(0, 0);
            
            // Listeners
            Plotly.react(sankeyDiv)
            .then(() => {
                sankeyDiv.removeAllListeners('plotly_click');
                if (quarter !== 'big_picture') {
                    if (!walletFilter) {
                        const container = sankeyDiv.querySelector('.user-select-none.svg-container');
                        const allSvgs = sankeyDiv.querySelectorAll('svg.main-svg');

                        const highestY = data.maxY;
                        const padding = 50*(window.innerHeight/820);
                        const newHeight = (highestY*(544*innerHeight/820)) + padding;
                    
                        container.style.height = `${newHeight}px`;
                        sankeyContainer.style.height = `${newHeight}px`
                    
                        allSvgs.forEach(svg => {
                            svg.setAttribute('height', newHeight);
                        });
                    
                        const plotArea = sankeyDiv.querySelector('.plot-container.plotly');
                        const currentViewBox = plotArea.getAttribute('viewBox').split(' ');
                        currentViewBox[3] = newHeight;
                        plotArea.setAttribute('viewBox', currentViewBox.join(' '));
                    
                        const clipPath = sankeyDiv.querySelector('clipPath rect');
                        if (clipPath) {
                            clipPath.setAttribute('height', newHeight);
                        }                
                    } else {
                        sankeyData.node.forEach((node, index) => {
                            if (specialWallets.some(wallet => node.name.startsWith(wallet))) {
                                sankeyData.node.thickness = sankeyData.node.thickness || {};
                                sankeyData.node.thickness[index] = 100;
                            }
                        });

                        const container = sankeyDiv.querySelector('.user-select-none.svg-container');
                        const allSvgs = sankeyDiv.querySelectorAll('svg.main-svg');

                        const newHeight = 1000*(window.innerHeight/820);

                        container.style.height = `${newHeight}px`;
                        sankeyContainer.style.height = `${newHeight}px`

                        allSvgs.forEach(svg => {
                            svg.setAttribute('height', newHeight);
                        });

                        const plotArea = sankeyDiv.querySelector('.plot-container.plotly');
                        const currentViewBox = plotArea.getAttribute('viewBox').split(' ');
                        currentViewBox[3] = newHeight;
                        plotArea.setAttribute('viewBox', currentViewBox.join(' '));
                    
                        const clipPath = sankeyDiv.querySelector('clipPath rect');
                        if (clipPath) {
                            clipPath.setAttribute('height', newHeight);
                        }              
                    }
                } else if (quarter === 'big_picture') {
                    const dragOverlay = document.createElement('div');
                    dragOverlay.style.position = 'absolute';
                    dragOverlay.style.userSelect = 'none';
                    dragOverlay.style.webkitUserSelect = 'none';
                    dragOverlay.style.mozUserSelect = 'none';
                    dragOverlay.style.msUserSelect = 'none';
                    dragOverlay.style.top = 0;
                    dragOverlay.style.left = 0;
                    dragOverlay.style.width = '100%';
                    dragOverlay.style.height = '100%';
                    dragOverlay.style.cursor = 'grab';
                    dragOverlay.style.background = 'transparent';
                    dragOverlay.style.display = 'none';
                    dragOverlay.style.zIndex = -1000;
                    sankeyContainer.appendChild(dragOverlay);
                
                    let isDragging = false;
                    let startX, startY;
                    let startScrollLeft, startScrollTop;
                    let lastX, lastY;
                    let animationFrameId = null;
                
                    function updateScroll() {
                        if (!isDragging) return;
                
                        const dx = lastX - startX;
                        const dy = lastY - startY;
                        sankeyContainer.scrollLeft = startScrollLeft - dx;
                        sankeyContainer.scrollTop = startScrollTop - dy;
                
                        animationFrameId = requestAnimationFrame(updateScroll);
                    }
                
                    function startDragging(event) {
                        if (event.button !== 0) return;
                        event.preventDefault();
                
                        isDragging = true;
                        startX = lastX = event.pageX;
                        startY = lastY = event.pageY;
                        startScrollLeft = sankeyContainer.scrollLeft;
                        startScrollTop = sankeyContainer.scrollTop;
                
                        dragOverlay.style.display = 'block';
                        dragOverlay.style.cursor = 'grabbing';
                        disableHoverEffects();
                
                        document.addEventListener('mousemove', onMouseMove);
                        document.addEventListener('mouseup', stopDragging);
                
                        animationFrameId = requestAnimationFrame(updateScroll);
                    }
                
                    function onMouseMove(event) {
                        if (!isDragging) return;
                        lastX = event.pageX;
                        lastY = event.pageY;
                    }
                
                    function stopDragging() {
                        if (!isDragging) return;
                
                        isDragging = false;
                        dragOverlay.style.display = 'none';
                        dragOverlay.style.cursor = 'grab';
                        enableHoverEffects();
                
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', stopDragging);
                
                        if (animationFrameId) {
                            cancelAnimationFrame(animationFrameId);
                        }
                    }
                
                    sankeyContainer.addEventListener('mousedown', startDragging);
                }
            });

            Plotly.react(sankeyDiv, [sankeyData], layout, config)
            .then(() => {
                sankeyNodeLabelsAlign(quarter === 'big_picture' ? 'right' : 'center', true);
                sankeyDiv.removeAllListeners('plotly_click');

                // if (quarter === 'big_picture') {
                //     sankeyDiv.on('plotly_clickannotation', function(eventData) {
                //         const clickedQuarter = eventData.annotation.text;
                //         if (clickedQuarter.match(/^\d{4}Q\d$/)) {
                //             drawSankey(clickedQuarter);
                //         }
                //     });
               if ((quarter !== 'big_picture') && (!walletFilter)) {
                    const nodes = document.getElementsByClassName('sankey-node');
                    const fontSizeMisc = (window.innerWidth >= 1024) ? `${12*window.innerWidth/1440}px` : '12px';
                    const fontSizebig = (window.innerWidth >= 1024) ? `${14*window.innerWidth/1440}px` : '14px';
                    Array.from(nodes).forEach((node, index) => {
                        const nodeName = data.nodes[index].bpIndex;
                        const label = node.getElementsByClassName('node-label')[0];
                        if (qtrSendersList.includes(nodeName)) {
                            label.style.fontSize = fontSizeMisc;
                            label.setAttribute('y', -2)
                        } else if (qtrReceiversList.includes(nodeName)) {
                            label.style.fontSize = fontSizeMisc;
                            label.setAttribute('y', -2)
                        } else if (nodeName.startsWith('Unspent')) {
                            label.style.fontSize = fontSizeMisc;
                            label.setAttribute('y', -2)
                        } else if (specialWallets.includes(nodeName)) {
                            label.style.fontSize = fontSizebig;
                            label.setAttribute('y', -2)
                        }
                    });
                }

                sankeyDiv.on('plotly_click', function(eventData) {
                    const clickedPoint = eventData.points[0].label;
                    if (specialWallets.includes(clickedPoint)) {
                        navigator.setWalletFilter(clickedPoint);
                        drawSankey(navigator.currentQuarter, clickedPoint, navigator.categoryMode, navigator.hideMode);
                        return;
                    }
                });
                
                sankeyDiv.on('plotly_click', function(eventData) {
                    const clickedPoint = eventData.points[0];
                    if (clickedPoint && clickedPoint.label) {
                        showRecipientDetails(clickedPoint.label);
                    }
                    
                    if (clickedPoint && clickedPoint.customdata && typeof clickedPoint.customdata === 'object' && 'receipt' in clickedPoint.customdata) {
                        const receipt = clickedPoint.customdata.receipt;
                        if (receipt && receipt !== 'Interquarter' && receipt !== 'Unspent') {
                            window.open(`https://etherscan.io/tx/${receipt}`, '_blank');
                        }
                    } else {
                    }
                });
            });

            const activeSpecialWallets = new Set(data.nodes
                .map(node => node.name)
                .filter(name => specialWallets.includes(name)));
        
            populateWallets(Array.from(activeSpecialWallets));
        
            const walletsButton = document.getElementById('walletsButton');
            if (quarter !== 'big_picture' && activeSpecialWallets.size > 0) {
                walletsButton.classList.remove('disabled-button');
            } else {
                walletsButton.classList.add('disabled-button');
            }
            navigator.updateUrlBar();
        });
    };

    fetch('/quarters')
    .then(response => response.json())
    .then(data => {
        populateQuarters(data.quarters);
        drawSankey('big_picture', null, categoryMode, hideMode);
    });

    // Init
    drawSankey('big_picture', null, true, hideMode);
});