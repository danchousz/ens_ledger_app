document.addEventListener('DOMContentLoaded', () => {

    let hideMode = false;
    let currentWalletFilter = null;
    let zoneSendersList = [];
    let qtrSendersList = []
    let nodeName;
    let currentQuarter = 'big_picture';
    let specialWallets = ['Ecosystem', 'Public Goods', 'Metagov', 'Community WG', 'Providers'];
    let registrars = ['Old Registrar', 'New Registrar'];
    let daoWallet = ['DAO Wallet'];
    let bannerCounter = 0;
    let openBanners = new Set();


    const sankeyContainer = document.querySelector('.sankey-container');
    const sankeyDiv = document.getElementById('sankeyDiagram');
    const isDesktop = window.innerWidth >= 768;
    const hideModeContainer = document.getElementById('hideModeContainer');

    // Desktop Modals

        // Identify Modal

        if (isDesktop) {

            const identifyDiv = document.getElementById('identifyDiv');
            const identifyBackdrop = document.getElementById('identifyBackdrop');
            const identifyButton = document.getElementById('identifyButton');

            identifyButton.addEventListener('click', function() {
                identifyDiv.style.display = 'block';
                loadTransactions();
            });
            identifyBackdrop.addEventListener('click', function() {
                identifyDiv.style.display = 'none';
            });

            // Download Modal

            const downloadDiv = document.getElementById('downloadDiv');
            const downloadBackdrop = document.getElementById('downloadBackdrop');
            const downloadButton = document.getElementById('downloadButton');

            downloadButton.addEventListener('click', function() {
                downloadDiv.style.display = 'block';
            });

            downloadBackdrop.addEventListener('click', function() {
                downloadDiv.style.display = 'none';
            });

            const exportCSV = document.getElementById('exportCSV');
            const exportXLSX = document.getElementById('exportXLSX');
            const exportJSON = document.getElementById('exportJSON');
            const exportSVG = document.getElementById('exportSVG');
            const exportPNG = document.getElementById('exportPNG');

            exportCSV.addEventListener('click', () => 
                exportData('csv')
            );
            exportXLSX.addEventListener('click', () => 
                exportData('xlsx')
            );
            exportJSON.addEventListener('click', () => 
                exportData('json')
            );
            exportSVG.addEventListener('click', () => {
                exportCustomSVG('svg');
            });
            exportPNG.addEventListener('click', () => {
                exportCustomSVG('png');
            });

            const hideModeToggle = document.getElementById('hideModeCheckbox');

            hideModeToggle.addEventListener('change', function() {
                hideMode = this.checked;
                drawSankey(currentQuarter, currentWalletFilter, hideMode);
            });
    };
    
    // Common Modals

            // Recipient Details Modal

            const recipientDetailsDiv = document.getElementById('recipientDetailsDiv');
            const recipientDetailsBackdrop = document.getElementById('recipientDetailsBackdrop');

            recipientDetailsBackdrop.addEventListener('click', function() {
                recipientDetailsDiv.style.display = 'none';
            });


    // Navigator and stuff for handling navigation

    class LedgerNavigator {
        constructor() {
          this.currentView = 'big_picture';
          this.currentQuarter = null;
          this.walletFilter = null;
          this.hideMode = false;
      
          window.addEventListener('popstate', (event) => {
            if (event.state) {
              this.loadState(event.state);
            }
          });
        }

        updateUrlBar(initialLoad = false) {
            let path = '/';
            const params = new URLSearchParams();
        
            if (this.currentView === 'quarter' || this.currentView === 'wallet') {
                path += `quarter/${this.currentQuarter}`;
                if (this.walletFilter) {
                    path += `/${encodeURIComponent(this.walletFilter)}`;
                }
            }
        
            const url = path + (params.toString() ? `?${params.toString()}` : '');
            if (!initialLoad) {
                history.pushState(this.getState(), '', url);
            } else {
                history.replaceState(this.getState(), '', url);
            }
        }

        getState() {
            return {
              view: this.currentView,
              quarter: this.currentQuarter,
              wallet: this.walletFilter,
              hideMode: this.hideMode
            };
        }
        
        loadState(state) {
            this.currentView = state.view;
            this.currentQuarter = state.quarter;
            this.walletFilter = state.wallet;
            this.hideMode = state.hideMode;
        
            this.updateDiagram();
            updateContextButton();
        }
          
        updateDiagram() {
            drawSankey(
                this.currentView === 'big_picture' ? 'big_picture' : this.currentQuarter,
                this.walletFilter,
                this.hideMode
            );
        }

        setBigPicture() {
            this.currentView = 'big_picture';
            this.currentQuarter = null;
            this.walletFilter = null;
            this.updateDiagram();
            this.updateUrlBar();
        }
          
        setQuarter(quarter, isPlotlyClick) {
            this.currentView = 'quarter';
            this.currentQuarter = quarter;
            this.walletFilter = null;
            this.updateUrlBar();
            if (!isPlotlyClick) {
                this.updateDiagram();
            }
        }
          
        setWalletFilter(wallet) {
            if (this.currentQuarter) {
              this.currentView = 'wallet';
              this.walletFilter = wallet;
              this.updateDiagram();
              this.updateUrlBar();
            } else {
              console.error('Cannot set wallet filter without a quarter selected');
            }
        }
    }

    function addHideModeDevice() {
        if (!document.getElementById('mobileHideModeContainer')) {
            const mobileHideModeToggle = document.createElement('div');
            mobileHideModeToggle.id = 'mobileHideModeContainer';
            mobileHideModeToggle.classList.add('field', 'field--inline');
            mobileHideModeToggle.style.display = 'flex';
            mobileHideModeToggle.style.position = 'absolute';
            mobileHideModeToggle.style.top = '7%';
            mobileHideModeToggle.style.left = '8%';
        
            mobileHideModeToggle.innerHTML = `
                <input type="checkbox" id="mobileHideModeCheckbox" class="checkbox">
                <div id="hideModeToggle" class="field__description">Hide DAO Wallet and Endowment</div>
            `;
        
            sankeyContainer.appendChild(mobileHideModeToggle);
        
            const mobileHideModeCheckbox = document.getElementById('mobileHideModeCheckbox');
            mobileHideModeCheckbox.addEventListener('change', function() {
                hideMode = this.checked;
                drawSankey(currentQuarter, currentWalletFilter, hideMode);
            });
        }
    }

    function parseUrl() {
        const path = window.location.pathname;
        const parts = path.split('/').filter(Boolean);
    
        let view = 'big_picture';
        let quarter = null;
        let wallet = null;
    
        if (parts[0] === 'quarter') {
            view = 'quarter';
            quarter = parts[1];
            if (parts.length >= 3) {
                view = 'wallet';
                wallet = decodeURIComponent(parts[2]);
            }
        }
    
        return { view, quarter, wallet };
    }

    function updateContextButton() {
        const contextButtonContainer = document.getElementById('contextButtonContainer');
        const contextButton = document.getElementById('contextButton');
        const contextButtonText = document.getElementById('contextButtonText');
        
        if (navigator.currentView === 'big_picture') {
            contextButtonContainer.style.display = 'none';
        } else {
            contextButtonContainer.style.display = 'block';
            
            if (navigator.walletFilter) {
                contextButtonText.textContent = `Back to Quarter ${navigator.currentQuarter}`;
                contextButton.onclick = () => {
                    navigator.setQuarter(navigator.currentQuarter);
            };
            } else {
                contextButtonText.textContent = 'Full View';
                contextButton.onclick = () => {
                    navigator.setBigPicture();
                };
            }
        }
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
                        <div class="button--submit">Submit</div>
                        <span class="checkmark" style="display: none;">✓</span>
                    </td>
                `;

                const submitButton = row.querySelector('.button--submit');
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

    function generateFileName(format, recipient) {
        let fileName = '';
        if (recipient) {
            fileName += `${recipient}.${format}`;
        } else {
            if (navigator.currentView === 'big_picture') {
                fileName = `big_picture_ledger.${format}`;
            } else if (navigator.currentView === 'quarter') {
                fileName = `${navigator.currentQuarter}_ledger.${format}`;
            } else if (navigator.currentView === 'wallet') {
                const formattedWallet = navigator.walletFilter.replace(/ /g, '_');
                fileName = `${formattedWallet}_${navigator.currentQuarter}_ledger.${format}`;
            }
        }
        return fileName;
    }

    function saveAsCSV(data, recipient) {
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => row[header]).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const fileName = generateFileName('csv', recipient);
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
    
    function saveAsXLSX(data, recipient) {
        const fileName = generateFileName('xlsx', recipient);
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Data");
        XLSX.writeFile(wb, fileName);
    }
    
    function saveAsJSON(data, recipient) {
        const fileName = generateFileName('json', recipient);
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
                        saveAsCSV(formattedData, false);
                        break;
                    case 'xlsx':
                        saveAsXLSX(formattedData, false);
                        break;
                    case 'json':
                        saveAsJSON(formattedData, false);
                        break;
                }
            });
    }
    
    function addSaveButtons(detailsContent, transactions, recipientName) {
        const saveButtonsContainer = document.createElement('div');
        saveButtonsContainer.style.cssText = `
            display: flex;
            justify-content: center;
            border-bottom: solid 20px white;
        `;
    
        const buttonStyle = `
            padding: 1vw 2.35vw;
            margin: 0 2vw;
            background-color: #3888ff;
            color: white;
            border: none;
            cursor: pointer;
            border-radius: 1vw;
            font-size: 1.28vw;
            font-family: satoshi;
        `;

    
        ['XLSX', 'CSV', 'JSON'].forEach((format, index) => {
        const button = document.createElement('button');
        button.textContent = `Save as ${format}`;
        button.style.cssText = buttonStyle;
        

        button.onmouseover = () => button.style.opacity = '0.8';
        button.onmouseout = () => button.style.opacity = '1';
        
        button.onclick = () => saveTableAs(format.toLowerCase(), transactions, recipientName);
        saveButtonsContainer.appendChild(button);
    });
    
        detailsContent.appendChild(saveButtonsContainer);
    } 
    
    function saveTableAs(format, transactions, recipientName) {
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
                saveAsXLSX(tableData, recipientName);
                break;
            case 'csv':
                saveAsCSV(tableData, recipientName);
                break;
            case 'json':
                saveAsJSON(tableData, recipientName);
                break;
        }
    }

    function exportCustomSVG(format = 'svg', chartElement) {
        const sankeyDiv = document.getElementById('sankeyDiagram');
        const targetElement = chartElement || sankeyDiv;
        const plotSVG = targetElement.getElementsByTagName('svg')[0];
        const gd = targetElement._fullLayout;
    
        const shapes = navigator.currentView === 'big_picture' ? gd.shapes : [];
        const annotations = navigator.currentView === 'big_picture' ? gd.annotations : [];
    
        const svgCopy = plotSVG.cloneNode(true);
    
        const nodeLabels = svgCopy.querySelectorAll('.node-label');
        nodeLabels.forEach(label => {
            label.style.fontFamily = 'Satoshi, sans-serif';
        });
    
        let width = parseFloat(svgCopy.getAttribute('width'));
        let height = parseFloat(svgCopy.getAttribute('height'));
    
        // Проверяем, вызывается ли функция из модального окна категории
        const isFromCategoryModal = chartElement && chartElement.id === 'categorySankeyChart';
    
        // Применяем правила о максимальной высоте только для режима big_picture и если не из модального окна
        if (!isFromCategoryModal && navigator.currentView === 'big_picture') {
            const maxHeight = 2000;
            if (height > maxHeight) {
                height = maxHeight;
                svgCopy.setAttribute('height', height);
                svgCopy.setAttribute('viewBox', `0 0 ${width} ${height}`);
                
                const clipPath = svgCopy.querySelector('clipPath');
                if (clipPath) {
                    const rect = clipPath.querySelector('rect');
                    if (rect) {
                        rect.setAttribute('height', height);
                    }
                }
            }
        }
    
        const overlayGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        overlayGroup.setAttribute('class', 'overlay-group');
    
        shapes.forEach((shape, index) => {
            const shapeElem = createSVGShape(shape, width, height);
            if (shapeElem) {
                overlayGroup.appendChild(shapeElem);
            }
        });
    
        annotations.forEach((annotation, index) => {
            const annotationElem = createSVGAnnotation(annotation, width, height);
            if (annotationElem) {
                overlayGroup.appendChild(annotationElem);
            }
        });
    
        svgCopy.appendChild(overlayGroup);
    
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(svgCopy);
        
        svgString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
                    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
                    svgString;
    
        if (format === 'svg') {
            const blob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
            const url = URL.createObjectURL(blob);
    
            let fileName;
            if (isFromCategoryModal) {
                const title = document.getElementById('categorySankeyTitle').textContent;
                fileName = `${title.replace(' - ', '_')}.svg`;
            } else {
                fileName = generateFileName('svg');
            }
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
                canvas.height = height;
                const ctx = canvas.getContext('2d');
    
                ctx.drawImage(img, 0, 0);
    
                canvas.toBlob(function(blob) {
                    const url = URL.createObjectURL(blob);
    
                    let fileName;
                    if (isFromCategoryModal) {
                        const title = document.getElementById('categorySankeyTitle').textContent;
                        fileName = `${title.replace(' - ', '_')}.png`;
                    } else {
                        fileName = generateFileName('png');
                    }
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
    
        const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Satoshi:wght@400;700&display=swap');
            text, .node-label {
                font-family: 'Satoshi', sans-serif !important;
            }
        `;
        svgCopy.insertBefore(style, svgCopy.firstChild);
    }

    function createSVGShape(shape, width, height) {        const svgns = "http://www.w3.org/2000/svg";
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
                    elem.setAttribute('y1', 0.05 * height);
                    elem.setAttribute('y2', 0.05 * height);
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
    
    function createSVGAnnotation(annotation, width, height) {        const svgns = "http://www.w3.org/2000/svg";
        const g = document.createElementNS(svgns, 'g');
    
        try {
            let x;
            let y;
                        
            const text = document.createElementNS(svgns, 'text');
            text.textContent = annotation.text;

            if (text.textContent.startsWith('2')) {
                y = 0.01 * height;
            } else {
                y = 0.03 * height;
            }
            x = (annotation.x - 0.0075) * width;
            
            text.setAttribute('x', x);
            text.setAttribute('y', y);
            text.setAttribute('text-anchor', annotation.xanchor);
            text.setAttribute('dominant-baseline', 'hanging');
            text.setAttribute('font-family', 'satoshi');
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

    function showRecipientDetails(recipientName, isCategory) {        
        const specialWallets = ['Ecosystem', 'Public Goods', 'Metagov', 'Community WG', 'Providers'];
        if (recipientName === 'DAO Wallet' || specialWallets.includes(recipientName)) {
            return;
        }
    
        fetch(`/recipient_details/${encodeURIComponent(recipientName)}?isCategory=${isCategory}`)
            .then(response => response.json())
            .then(data => {
                if (!data.transactions || data.transactions.length === 0) {
                    return;
                }

                data.transactions.sort((a, b) => new Date(b.Date) - new Date(a.Date));
    
                const tableHeaders = isCategory
                    ? ['Date', 'Amount', 'USD Value', 'From', 'Address', 'Counterparty', 'TX']
                    : ['Date', 'Amount', 'USD Value', 'From', 'Address', 'Item', 'TX'];
    
                const colorMap = {
                    'USDC': '#5294e2',
                    'ETH': '#b97cf3',
                    'ENS': '#5ac8fa'
                };
                
                const tableRows = data.transactions.map(tx => {
                    const txLink = tx.From_name !== 'Providers'
                        ? `<a href="https://etherscan.io/tx/${tx['Transaction Hash']}" target="_blank" style="color: #2f7cff; text-decoration: none;">${tx['Transaction Hash'].substring(0, 6)}...</a>`
                        : `<a href="https://www.tally.xyz/gov/ens/proposal/63865530602418424570813160277709124551851041237648860550576561576702951975816" target="_blank" style="color: #2f7cff; text-decoration: none;">Stream`;
                        

                    const recipientLink = tx.From_name !== 'Providers'
                        ? isDesktop 
                            ? `<a href="https://etherscan.io/address/${tx['To']}" target="_blank" style="color: #2f7cff; text-decoration: none;">${tx['To']}</a>`
                            : `<a href="https://etherscan.io/address/${tx['To']}" target="_blank" style="color: #2f7cff; text-decoration: none;">${tx['To'].substring(0, 6)}</a>`
                        : `<a href="https://www.tally.xyz/gov/ens/proposal/63865530602418424570813160277709124551851041237648860550576561576702951975816" target="_blank" style="color: #2f7cff; text-decoration: none;">${tx.To_name}`;

                    const formattedValue = parseFloat(tx.Value).toLocaleString('en-US', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 1
                    });
        
                    const roundedDOT_USD = Math.round(parseFloat(tx.DOT_USD)).toLocaleString('en-US');
                    const amountColor = colorMap[tx.Symbol] || 'white';
                
                    const crossLink = isCategory
                    ? tx.To_name
                    : tx.To_category;

                    return isCategory
                        ? `<tr style="text-align: center; font-family: satoshi; font-size: 1.14vw;">
                             <td>${tx.Date}</td>
                            <td>
                                <span style="color: ${amountColor}; font-weight: bold;">${formattedValue} ${tx.Symbol}</span>
                            </td>                           
                             <td>${roundedDOT_USD}</td>
                             <td>${tx.From_name}</td>
                             <td>${recipientLink}</td>
                             <td>${crossLink}</td>
                             <td>${txLink}</td>
                           </tr>`
                        : `<tr style="text-align: center; font-family: satoshi; font-size: 1.14vw">
                             <td>${tx.Date}</td>
                            <td>
                                <span style="color: ${amountColor}; font-weight: bold;">${formattedValue} ${tx.Symbol}</span>
                            </td>                         
                             <td>${roundedDOT_USD}</td>
                             <td>${tx.From_name}</td>
                             <td>${recipientLink}</td>
                             <td>${crossLink}</td>
                             <td>${txLink}</td>
                           </tr>`;
                }).join('');

                const summaryStyle = isDesktop 
                ? 'text-align: center; font-size: 1.14vw; background-color: white; padding: 1.07vw; border-radius: 0.71vw; margin-bottom: 1.42vw; font-family: satoshi;'
                : 'text-align: center; font-size: 2vw; background-color: white; padding: 1.07vw; border-radius: 0.71vw; margin-bottom: 2.5vw; font-family: satoshi;'

                const summaryHtml = `
                    <p style="${summaryStyle}">
                        ${isCategory ? 'Category' : 'Counterparty'} '${recipientName}' received 
                        <span style="color: ${colorMap['ETH']}">${data.summary.ETH} ETH</span>, 
                        <span style="color: ${colorMap['USDC']}">${data.summary.USDC} USDC</span> and 
                        <span style="color: ${colorMap['ENS']}">${data.summary.ENS} ENS</span>, 
                        which is the equivalent of <strong>${data.summary.total_usd} USD</strong> at the moment of transactions.
                    </p>
                `;

                const tableHeaderStyle = isDesktop
                ? 'border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; background-color: #f2f2f2; font-size: 1.14vw; font-family: satoshi;'
                : 'border: 0.071vw solid #ddd; padding: 0.857vw; text-align: center; background-color: #f2f2f2; font-size: 2vw; font-family: satoshi;'

                const tableRowsStyle = isDesktop
                ? 'border: 0.071vw solid #ddd; padding: 0.857vw;'
                : 'border: 0.071vw solid #ddd; padding: 0.857vw; font-size: 2vw'
    
                const tableHtml = `
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                ${tableHeaders.map(header => `<th style="${tableHeaderStyle}">${header}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows.replace(/<td/g, `<td style="${tableRowsStyle}"`)}
                        </tbody>
                    </table>
                `;
            
    
                const quarterData = groupDataByField(data.transactions, 'Quarter');
                const senderData = groupDataByField(data.transactions, 'From_name');
                const thirdChartData = isCategory
                    ? groupDataByField(data.transactions, 'To_name')
                    : groupDataByField(data.transactions, 'To_category');
                const thirdChartTitle = isCategory ? 'Counterparties' : 'Category';

                const chartsStyle = isDesktop 
                ? 'background-color: white; padding: 1.42vw; border-radius: 0.71vw; margin-bottom: 1.42vw;'
                : 'background-color: white; border-radius: 0.71vw; margin-bottom: 2.5vw;'

                const chartsHeaderStyle = isDesktop 
                ? 'text-align: center; margin-bottom: 1.42vw; font-size: 1.28vw; font-family: satoshi;'
                : 'text-align: center; margin-bottom: 1.42vw; font-size: 2vw; font-family: satoshi;'

                const chartsHtml = `
                    <div style="${chartsStyle}">
                        <div style="${chartsHeaderStyle}">Distribution by</div>
                        <div style="display: flex; justify-content: space-between; width: 100%; font-size: 1.07vw; font-family: satoshi">
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
                    <div style="background-color: white; padding: 1.42vw; border-radius: 0.71vw;">
                        ${tableHtml}
                    </div>
                    <div id="saveButtonsContainer"></div>
                `;
    
                const recipientDetailsDiv = document.getElementById('recipientDetailsDiv');
                const detailsContent = document.getElementById('detailsContent');
                detailsContent.innerHTML = `
                    ${summaryHtml}
                    ${contentHtml}
                `;

                if (isDesktop) {
                    addSaveButtons(document.getElementById('saveButtonsContainer'), data.transactions, recipientName);  
                }  
                recipientDetailsDiv.style.display = 'block';
    
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
                <h4 style="text-align: center; margin: 0 0 0.71vw 0; font-size: 14px">${title}</h4>
                <div style="width: 100%; aspect-ratio: 1 / 1; position: relative;">
                    <canvas id="${chartId}"></canvas>
                </div>
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
                            ctx.font = 'bold 0.857vw satoshi';
                            ctx.fillText(percentage + '%', x, y);
                        });
                    });
                    ctx.restore();
                },
                // afterRender: function(chart) {
                //     const legendContainer = document.getElementById(`${chart.canvas.id}Legend`);
                //     legendContainer.innerHTML = '';
    
                //     const itemsPerRow = 3;
                //     let currentRow;
    
                //     chart.legend.legendItems.forEach((item, index) => {
                //         if (index % itemsPerRow === 0) {
                //             currentRow = document.createElement('div');
                //             currentRow.style.display = 'flex';
                //             currentRow.style.justifyContent = 'center';
                //             currentRow.style.width = '100%';
                //             currentRow.style.marginBottom = '0.305vw';
                //             legendContainer.appendChild(currentRow);
                //         }
    
                //         const legendItem = document.createElement('div');
                //         legendItem.style.display = 'flex';
                //         legendItem.style.alignItems = 'center';
                //         legendItem.style.marginRight = '0.71vw';
                //         legendItem.style.fontSize = '1vw';
    
                //         const colorBox = document.createElement('span');
                //         colorBox.style.width = '0.71vw';
                //         colorBox.style.height = '0.71vw';
                //         colorBox.style.backgroundColor = item.fillStyle;
                //         colorBox.style.marginRight = '0.305vw';
    
                //         const label = document.createElement('span');
                //         label.textContent = item.text;
    
                //         legendItem.appendChild(colorBox);
                //         legendItem.appendChild(label);
                //         currentRow.appendChild(legendItem);
                //     });
                // }
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
                label.setAttribute('opacity', '0.6', 'important');
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

    function updateNodeLabels() {
        const nodeLabels = document.querySelectorAll('#categorySankeyChart .node-label');
        nodeLabels.forEach((label, index) => {
            if (index > 0) {  // Если это не первый узел
                label.setAttribute('x', '40');
                label.setAttribute('text-anchor', 'start');
            } else {
                label.setAttribute('x', '-40');
                label.setAttribute('text-anchor', 'end');
            }
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

    const sideMenu = document.getElementById('sideMenu');
    const collapseButton = document.getElementById('collapseButton');
    const contextButton = document.querySelector('.context-button');
    let isSideMenuExpanded = true;

    const mobileCloseButton = document.getElementById('toChartButton');

    mobileCloseButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        sideMenu.style.display = 'none';
    });

    collapseButton.addEventListener('click', () => {
        if (isDesktop) {
            if (isSideMenuExpanded) {
                sideMenu.classList.add('collapsed');
                sideMenu.classList.remove('expanding');
                contextButton.classList.add('collapsed')
                sankeyDiv.style.marginLeft = '0.71vw';
                isSideMenuExpanded = false;
            } else {
                sideMenu.classList.remove('collapsed');
                sideMenu.classList.add('expanding');
                contextButton.classList.remove('collapsed')
                sankeyDiv.style.marginLeft = '22.5vw';
                isSideMenuExpanded = true;

                setTimeout(() => {
                    sideMenu.classList.remove('expanding');
                }, 300); 
            }
            
            if (navigator.currentView !== 'big_picture') {
                drawSankey(currentQuarter, currentWalletFilter, hideMode);
            }
        }
    });

    function enableHoverEffects() {
        Plotly.relayout('sankeyDiagram', {
            'hovermode': 'closest'
        });
    }

    function createFlowBanner(flowInfo, etherscanUrl, txHash) {
        const container = document.getElementById('flowBannerContainer');
        const banner = document.createElement('div');
        banner.className = 'flow-banner';
        banner.id = `flowBanner-${txHash}`;    
        
        const bannerTextStyle = isDesktop 
        ? 'font-size: 1vw'
        : 'font-size: 1.8vw';

        if (etherscanUrl) {
            banner.innerHTML = `
                <span class="close-button">&times;</span>
                <div class="typography--medium" style="${bannerTextStyle}">${flowInfo}</div>
                <a class="typography" href="${etherscanUrl}" target="_blank" style="${bannerTextStyle}">View on Etherscan</a>
            `;
        } else {
            banner.innerHTML = `
            <span class="close-button">&times;</span>
            <div class="typography--medium" style="${bannerTextStyle}">${flowInfo}</div>
        `;
        }
    
        container.appendChild(banner);
    
        setTimeout(() => {
            banner.classList.add('show');
        }, 10);

        openBanners.add(txHash);

        setTimeout(function() {
            banner.classList.remove('show');
            setTimeout(() => {
                banner.remove();
                openBanners.delete(txHash);
            }, 300);
        }, 10000)
    
        const closeButton = banner.querySelector('.close-button');
        closeButton.addEventListener('click', function() {
            banner.classList.remove('show');
            setTimeout(() => {
                banner.remove();
                openBanners.delete(txHash);
            }, 300);
        });
        if (!isDesktop) {
            closeButton.style.display = 'none';
        }
    }

    function shakeBanner(txHash) {
        const banner = document.getElementById(`flowBanner-${txHash}`);
        if (banner) {
            banner.classList.add('shake');
            banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            

            setTimeout(() => {
                banner.classList.remove('shake');
            }, 820); 
        }
    }

    function formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        } else {
            return num.toString();
        }
    }

    function showCategorySankeyChart(category, quarter) {
        const modal = document.getElementById('categorySankeyModal');
        const modalTitle = document.getElementById('categorySankeyTitle');
        const chartDiv = document.getElementById('categorySankeyChart');
        const savePNGButton = document.getElementById('saveCategoryPNG');
        const saveSVGButton = document.getElementById('saveCategorySVG');
    
        const getWidth = window.innerWidth;
        const getHeight = window.innerHeight;
    
        const heightCalibration = getHeight / 820;
        const widthCalibration = getWidth / 1440;
    
        modalTitle.textContent = `${category} - ${quarter}`;
        modal.style.display = 'block';

        if (savePNGButton) {
            savePNGButton.onclick = function() {
                console.log('PNG button clicked');
                exportCustomSVG('png', chartDiv);
            };
        } else {
            console.error('PNG button not found');
        }
    
        if (saveSVGButton) {
            saveSVGButton.onclick = function() {
                console.log('SVG button clicked');
                exportCustomSVG('svg', chartDiv);
            };
        } else {
            console.error('SVG button not found');
        }

        window.onclick = function(event) {
            if (event.target == modal) {
                modal.style.display = 'none';
                Plotly.purge('categorySankeyChart');
            }
        }

        fetch(`/category-sankey-data/${encodeURIComponent(category)}/${quarter}`)
        .then(response => response.json())
        .then(({ data, layout }) => {
            const config = {
                displayModeBar: false,
                responsive: true
            };
    
            Plotly.react(chartDiv, data, {
                ...layout,
                width: widthCalibration*1200,
                height: heightCalibration*500,
                font: {
                    size: 14 * widthCalibration,
                    family: "satoshi"
                },
                margin: { l: 150*widthCalibration, r: 200*widthCalibration, b: 40*heightCalibration, t: 40*heightCalibration },
            }, config).then(() => {
                updateNodeLabels();
                
                chartDiv.on('plotly_click', function(eventData) {
                    const clickedPoint = eventData.points[0];
                    console.log('Clicked point:', clickedPoint);
                    
                    if (clickedPoint.label !== category) {
                        const recipientName = clickedPoint.label.split(' - ')[1];
                        
                        if (clickedPoint.childrenNodes) {
                            showRecipientDetails(recipientName, false);
                        } else {
                            const txDetails = clickedPoint.customdata;
                            if (txDetails) {
                                const bannerId = `${category}-${txDetails.to}-${quarter}`;
                                
                                if (openBanners.has(bannerId)) {
                                    shakeBanner(bannerId);
                                    console.log(bannerId);
                                } else {
                                    const flowInfo = `${txDetails.date}: <b>${txDetails.from}</b> sent ${txDetails.value} ${txDetails.symbol} (${txDetails.usd} USD) to <b>${txDetails.to}</b>`;
                                    const etherscanUrl = txDetails.receipt ? `https://etherscan.io/tx/${txDetails.receipt}` : null;
                                    createFlowBanner(flowInfo, etherscanUrl, bannerId);
                                }
                            }
                        }
                    }
                });
            });
        })
        .catch(error => console.error('Error:', error));
    }
        
    function showContractorsDropdown(category, clickX, clickY, dropdownQuarter, categoryValue, sender, layout) {
    
        const dropdown = document.getElementById('contractorsDropdown');
        const title = document.getElementById('dropdownTitle');
        const list = document.getElementById('contractorsList');
    
        list.innerHTML = '';
    
        const formattedCategoryValue = formatNumber(categoryValue);

        if (isDesktop) {
            title.innerHTML = `
                <div class="title-container">
                    <span class="category-title">${category} ${formattedCategoryValue}</span>
                    <button class="category-chart-button" title="Visualize">
                        <img src="/data/icons/ChartIcon.svg" alt="Category chart icon">
                    </button>
                </div>
            `;
        
            const chartButton = title.querySelector('.category-chart-button');
            chartButton.addEventListener('click', function(e) {
                e.stopPropagation();
                showCategorySankeyChart(category, dropdownQuarter);
            });
        } else {
            title.textContent = `${category} ${formattedCategoryValue}`;
        }

    
        title.style.cursor = 'pointer';
        title.style.transition = 'background-color 0.3s';
        title.onmouseover = () => { title.style.backgroundColor = '#f0f0f0'; };
        title.onmouseout = () => { title.style.backgroundColor = 'transparent'; };

        title.onclick = function(e) {
            if (e.target.closest('.category-chart-button')) {
                e.stopPropagation();
                showCategorySankeyChart(category, dropdownQuarter);
            } else {
                dropdown.style.display = 'none';
                return showRecipientDetails(category, true);
            }
        }
    
        let url = `/contractors/${encodeURIComponent(category)}?quarter=${dropdownQuarter}`;
    
        if (sender) {
            url += `&sender=${encodeURIComponent(sender)}`;
        }
    
        fetch(url)
            .then(response => response.json())
            .then(contractors => {
                if (contractors.length === 1 && contractors[0].name === category) {
                    showRecipientDetails(category, false);
                    return;
                }
                if (contractors.length === 0) {
                    return;
                } else {
                    contractors.sort((a, b) => b.value - a.value);
    
                    contractors.forEach((contractor, index) => {
                        const li = document.createElement('li');
                        li.style.display = 'flex';
                        li.style.justifyContent = 'space-between';
                        li.style.alignItems = 'center';
                        li.style.cursor = 'pointer';
                        li.style.transition = 'background-color 0.3s';

                        if (isDesktop) {
                            li.style.padding = '0.357vw';
                        }
    
                        li.onmouseover = () => { li.style.backgroundColor = '#f0f0f0'; };
                        li.onmouseout = () => { li.style.backgroundColor = 'transparent'; };
    
                        const img = document.createElement('img');

                        if (isDesktop) {
                            img.style.width = '2.35vw';
                            img.style.height = '2.35vw';
                            img.style.marginRight = '0.71vw';
                        } else {
                            img.style.width = '7vw';
                            img.style.height = '7vw';
                            img.style.marginRight = '3.5vw';
                        }

                        img.style.borderRadius = '50%';
    
                        const formats = ['jpg', 'png', 'svg', 'gif', 'webp'];
                        const folders = ['avatars', 'static_avatars'];
                        let avatarFound = false;
    
                        function tryNextFormat(folderIndex, formatIndex) {
                            if (folderIndex >= folders.length) {
                                img.src = `https://avatars.jakerunzer.com/${contractor.name}`;
                                return;
                            }
    
                            if (formatIndex >= formats.length) {
                                tryNextFormat(folderIndex + 1, 0);
                                return;
                            }
    
                            const folder = folders[folderIndex];
                            const format = formats[formatIndex];
                            fetch(`/${folder}/${contractor.name}.${format}`)
                                .then(response => {
                                    if (response.ok) {
                                        avatarFound = true;
                                        img.src = `/${folder}/${contractor.name}.${format}`;
                                    } else {
                                        tryNextFormat(folderIndex, formatIndex + 1);
                                    }
                                })
                                .catch(() => tryNextFormat(folderIndex, formatIndex + 1));
                        }
    
                        tryNextFormat(0, 0);
    
                        const nameSpan = document.createElement('span');
                        nameSpan.textContent = `${contractor.name}`;
                        nameSpan.style.flex = '1';
    
                        const valueSpan = document.createElement('span');
                        valueSpan.textContent = formatNumber(contractor.value);
                        valueSpan.style.marginLeft = '0.714vw';
    
                        const leftDiv = document.createElement('div');
                        leftDiv.style.display = 'flex';
                        leftDiv.style.alignItems = 'center';
                        leftDiv.appendChild(img);
                        leftDiv.appendChild(nameSpan);
    
                        li.appendChild(leftDiv);
                        li.appendChild(valueSpan);
    
                        li.onclick = function() {
                            showRecipientDetails(contractor.name, false);
                            dropdown.style.display = 'none';
                        };
                        list.appendChild(li);
                    });
                }
    
                dropdown.style.display = 'block';
                const dropdownRect = dropdown.getBoundingClientRect();

                let left;
                
                if (navigator.currentView === 'big_picture' || navigator.currentView === 'quarter' && !isSideMenuExpanded) {
                    left = Math.min(clickX, layout.width - dropdownRect.width);
                } else if (navigator.currentView === 'wallet') {
                    if (isSideMenuExpanded) {
                        left = layout.width - dropdownRect.width + window.innerWidth*0.225;
                    } else {
                        left = layout.width - dropdownRect.width
                    }
                } else {
                    left = Math.min(clickX, layout.width - dropdownRect.width + window.innerWidth*0.225);
                }
                let top = clickY;
                if (isDesktop) {
                    const isReversed = navigator.currentView !== 'wallet' ? ('big_picture' ? (clickY + dropdownRect.height) > layout.height * 0.75 : (clickY) > layout.height * 0.8) : true;
        
                    if (isReversed) {
                        top = clickY - dropdownRect.height;
                        if (navigator.currentView === 'quarter' || navigator.currentView === 'wallet') {
                            dropdown.style.flexDirection = 'column';
                        } else {
                            dropdown.style.flexDirection = 'column-reverse';
                        }
                        console.log('reversed!', isReversed, clickY, layout.height);
                    } else {
                        dropdown.style.flexDirection = 'column';
                        console.log('not reversed!', isReversed, clickY, layout.height);
                    }
                    
                    if (navigator.currentView === 'big_picture') {
                    left = Math.max(0, Math.min(left, layout.width - dropdownRect.width));
                    top = Math.max(0, Math.min(top, layout.height - dropdownRect.height));
                    }

                    if (navigator.currentView === 'quarter' || navigator.currentView === 'wallet') {
                        dropdown.style.maxHeight = '500px';
                    }
        
                    dropdown.style.left = `${left}px`;
                    dropdown.style.top = `${top}px`;
                } else {
                    dropdown.style.display = 'flex';
                    dropdown.style.position = 'fixed';
                    dropdown.style.left = `50%`;
                    dropdown.style.top = `50%`;
                    dropdown.style.transform = 'translate(-50%, -50%)';
                    dropdown.style.width = '80%';
                    dropdown.style.height = '80%';
                    dropdown.style.flexDirection = 'column';
                }
        
                function closeDropdownOnOutsideClick(event) {
                    if (!dropdown.contains(event.target)) {
                        dropdown.style.display = 'none';
                        document.removeEventListener('click', closeDropdownOnOutsideClick);
                    }
                }
    
                setTimeout(() => {
                    document.addEventListener('click', closeDropdownOnOutsideClick);
                }, 0);
            })
            .catch(error => {
                console.error('Error fetching contractors:', error);
            });
    }
    function closeContractorsDropdown(event) {
        const dropdown = document.getElementById('contractorsDropdown');
        const isClickInside = dropdown.contains(event.target);

        if (!isClickInside && dropdown.style.display === 'block') {
            dropdown.style.display = 'none';
        }
    }

    function getMonthRange(quarterIndex) {
        switch(quarterIndex) {
            case 1: return 'Jan-Mar';
            case 2: return 'Apr-Jun';
            case 3: return 'Jul-Sep';
            case 4: return 'Oct-Dec';
            default: return '';
        }
    }

    // Main function to render sankey data
    const drawSankey = (quarter, walletFilter = null, useHideMode = hideMode) => {
        currentQuarter = quarter;
        currentWalletFilter = walletFilter;
        useHideMode = hideMode;
        navigator.currentQuarter = quarter;
        navigator.walletFilter = walletFilter;
        navigator.hideMode = useHideMode;

        // Adaptive layout

        function updateSankeyDiagramAfterOrientationChange() {
            sankeyContainer.style.width = `${getWidth}px`;
            sankeyContainer.style.height = `${getHeight}px`;
            drawSankey(currentQuarter, currentWalletFilter, hideMode);
        }

        function handleOrientationChange() {
            setTimeout(() => {
                updateSankeyDiagramAfterOrientationChange();
            }, 100);
        }

        window.addEventListener("orientationchange", handleOrientationChange);

        const getWidth = window.innerWidth;
        const getHeight = window.innerHeight;

        const heightCalibration = getHeight / 820;
        const widthCalibration = getWidth / 1440;
        
        width = isDesktop ? Math.max(getWidth, 800) : getWidth;
        height = isDesktop ? Math.max(getHeight, 600) : getHeight;
        
        let url;
        if (quarter === 'big_picture') {
          navigator.currentView = 'big_picture';
          url = `/data/big_picture?hideMode=${hideMode}`;
        } else if (walletFilter) {
          navigator.currentView = 'wallet';
          url = `/data/${quarter}/${walletFilter}`;
        } else {
          navigator.currentView = 'quarter';
          url = `/data/${quarter}`;
        }

        // Button-killer

        if (navigator.currentView !== 'big_picture') {
            hideModeContainer.style.display = 'none';
        } else {
            hideModeContainer.style.display = 'flex';
        }

        // Sankey Settings
        fetch(url)
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
                            pad: walletFilter ? 15*heightCalibration : (quarter === 'big_picture' ? 1 : (5*heightCalibration)),
                            thickness: walletFilter ? (isDesktop ? 150*widthCalibration : 150) 
                            : (quarter === 'big_picture' ? (isDesktop ? 15*widthCalibration : 15) 
                            : (isDesktop ? 100*widthCalibration : 100)),
                            line: {
                                color: "grey",
                                width: quarter === 'big_picture' ? 1*widthCalibration : 0.5*widthCalibration
                            },
                            font: {
                                family: "satoshi",
                                color: "black",
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
                                receipt: link.customdata.receipt,
                                date: link.customdata.date,
                                from: link.customdata.from,
                                to: link.customdata.to,
                                value: link.customdata.value,
                                symbol: link.customdata.symbol,
                                usd: link.customdata.usd,
                                qtr: link.customdata.qtr,
                                addr: link.customdata.addr,
                            })),
                            hoverlabel: {align: "left", bordercolor: "white", bgcolor: "white", font: {color: "black", size: 14, family: "Satoshi"}},
                            hovertemplate: '%{customdata.label}<extra></extra>',
                        }
                    };

                    let shapes = [];
                    let annotations = [];

                    // Layers
                    if (navigator.currentQuarter === 'big_picture') {
                        const quarterCount = data.conditions.quarterCount;
                        const border = 0.01;
                        const quarterNumber = (1 - border) / quarterCount;
                        let currentYear = 2022;
                        let currentQuarterIndex = 2;
                        for (let i = 1; i <= quarterCount; i++) {
                            const lineX = i * quarterNumber + border;

                            shapes.push({
                                type: 'line',
                                x0: lineX,
                                y0: 0,
                                x1: lineX,
                                y1: isDesktop ? 1.085 : 1.15,
                                xref: 'paper',
                                yref: 'paper',
                                line: {
                                    color: 'grey',
                                    width: isDesktop ? 1*widthCalibration : 1,
                                    dash: 'solid'
                                }, 
                            });
                            
                            shapes.push({
                                type: 'line',
                                x0: -0.05,
                                y0: 1,
                                x1: 1.05,
                                y1: 1,
                                xref: 'paper',
                                yref: 'paper',
                                line: {
                                    color: 'grey',
                                    width: isDesktop ? 1*heightCalibration : 1,
                                    dash: 'solid'
                                },
                            });

                            const monthRange = getMonthRange(currentQuarterIndex);
        
                            const annotationX = (lineX + border) - quarterNumber;

                            if (monthRange === 'Jan-Mar' || i === 1) {
                                annotations.push({
                                    x: annotationX,
                                    y: 1.02,
                                    xref: 'paper',
                                    yref: 'paper',
                                    font: {
                                        family: "satoshi",
                                        size: isDesktop ? 36*widthCalibration : 36,
                                        color: 'black',
                                        weight: 900
                                    },
                                    showarrow: false,
                                    text: `${currentYear}`,
                                    xanchor: 'center',
                                    yanchor: 'bottom'
                                });
                            }
                            
                            annotations.push({
                                x: annotationX,
                                y: 1.02,
                                xref: 'paper',
                                yref: 'paper',
                                font: {
                                    family: "satoshi",
                                    size: isDesktop ? 26*widthCalibration : 24,
                                    color: 'black',
                                    weight: 600
                                },
                                showarrow: false,
                                text: monthRange,
                                xanchor: 'center',
                                yanchor: 'top',
                                quarterIndex: i
                            });
                    
                            currentQuarterIndex++;
                            if (currentQuarterIndex > 4) {
                                currentQuarterIndex = 1;
                                currentYear++;
                            }

                            layout = {
                                width: isDesktop ? (600*quarterCount)*(width/1440) : 600*quarterCount,
                                height: isDesktop ? 2000*heightCalibration : 2000,
                                margin: { 
                                    l: 0, 
                                    r: 0, 
                                    t: isDesktop ? 2000*heightCalibration*0.05 : 100, 
                                    b: 0
                                },
                                shapes: shapes,
                                annotations: annotations,
                                font: {
                                    size: isDesktop ? 12*widthCalibration : 14,
                                    family: "satoshi",
                                }, 
                                dragmode: 'none',
                                hovermode: 'closest',
                                clickmode: 'event',
                                paper_bgcolor: 'white',
                                plot_bgcolor: 'white',
                            };
                        };

                    } else { 
                        // const currentModel = data.model;
                        // annotations.push({
                        //     x: 0.9,
                        //     y: 0.9,
                        //     xref: 'paper',
                        //     yref: 'paper',
                        //     font: {
                        //         size: 18,
                        //         color: 'black'
                        //     },
                        //     showarrow: false,
                        //     text: `model: ${currentModel}`,
                        //     xanchor: 'center',
                        //     yanchor: 'middle',
                        //     dragmode: 'none',
                        // });

                        annotations.push({
                            x: isDesktop 
                            ? navigator.currentView === 'quarter' 
                                ? isSideMenuExpanded 
                                    ? 1 
                                    : 0.985
                                : 1
                            : 0.985,
                            y: isDesktop 
                            ? navigator.currentView === 'quarter' ? 1.25 : 1.15
                            : 1.05,
                            xref: 'paper',
                            yref: 'paper',
                            font: {
                                size: isDesktop ? 18*widthCalibration : 18,
                                color: 'black',
                                family: "satoshi"
                            },
                            showarrow: false,
                            text: navigator.currentView === 'quarter' 
                            ? `Quarter: ${navigator.currentQuarter}`
                            : `Quarter: ${navigator.currentQuarter}, Wallet: ${navigator.walletFilter}`,
                            xanchor: 'end',
                            yanchor: 'middle',
                            dragmode: 'none',
                        });
                        
                        if (walletFilter) {
                            layout = {
                                width: isDesktop ? (isSideMenuExpanded ? (0.77*getWidth) : getWidth) : 1440,
                                height: isDesktop ? 900*heightCalibration : 900,
                                margin: { 
                                    l: isDesktop ? (isSideMenuExpanded ? getWidth*0.04 : getWidth*0.01) : 50,
                                    r: isDesktop ? getWidth*0.01 : 50, 
                                    t: isDesktop ? 150*heightCalibration : 150, 
                                    b: isDesktop ? 150*heightCalibration : 150 },
                                dragmode: 'none',
                                hovermode: 'closest',
                                clickmode: 'event',
                                paper_bgcolor: 'white',
                                plot_bgcolor: 'white',
                                annotations: annotations,
                                font: {
                                    family: "satoshi",
                                    size: isDesktop ? 12*widthCalibration : 14,
                                }
                            };
                        } else {
                            layout = {
                                width: isDesktop ? (isSideMenuExpanded ? (0.77*getWidth) : getWidth) : 1440,
                                height: isDesktop ? 670*heightCalibration : 670,
                                margin: { 
                                    l: isDesktop ? (isSideMenuExpanded ? getWidth*0.04 : getWidth*0.01) : 50,
                                    r: isDesktop ? getWidth*0.01 : 50, 
                                    t: isDesktop ? 150*heightCalibration : 150, 
                                    b: isDesktop ? 150*heightCalibration : 150 },
                                dragmode: 'none',
                                hovermode: 'closest',
                                clickmode: 'event',
                                annotations: annotations,
                                paper_bgcolor: 'white',
                                plot_bgcolor: 'white',
                                font: {
                                    family: "satoshi",
                                    size: isDesktop ? settings.fontSize : 14,
                                    weight: 400
                                },
                                cursor: 'pointer',
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

            if (navigator.currentView !== 'big_picture') {
                if (isDesktop) {
                    sankeyContainer.style.setProperty('overflow', 'hidden');
                } else {
                    sankeyContainer.style.setProperty('overflow', 'auto');
                }
            } else {
                sankeyContainer.style.setProperty('overflow', 'auto');
            }

            if (!isDesktop && navigator.currentView === 'big_picture') {
                addHideModeDevice();
            } else if (!isDesktop && navigator.currentView !== 'big_picture') {
                const mobileHideModeContainer = document.getElementById('mobileHideModeContainer');
                if (mobileHideModeContainer) {
                    mobileHideModeContainer.remove();
                }
            }
            
            // Listeners
            Plotly.react(sankeyDiv)
            .then(() => {
                sankeyDiv.removeAllListeners('plotly_click');
                if (navigator.currentQuarter !== 'big_picture') {
                    if (!walletFilter) {
                        const highestY = data.maxY;
                        const padding = 50*heightCalibration;
                        const newHeight = (highestY*(544*innerHeight/820)) + padding;
                        const selectNonecontainer = sankeyDiv.querySelector('.user-select-none.svg-container');
                        const allSvgs = sankeyDiv.querySelectorAll('svg.main-svg');
                    
                        selectNonecontainer.style.height = `${newHeight}px`;
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
    
                        const newHeight = 1000*heightCalibration;
                        const selectNonecontainer = sankeyDiv.querySelector('.user-select-none.svg-container');
                        const allSvgs = sankeyDiv.querySelectorAll('svg.main-svg');
    
                        selectNonecontainer.style.height = `${newHeight}px`;
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
                } else {
                    if (isDesktop) {
                        sankeyContainer.style.height = '100vh';
                        sankeyDiv.style.height = '100%';
                    } else {
                        sankeyContainer.style.height = '2000px';
                        sankeyDiv.style.height = '100%';
                    }
                } 
                if (isDesktop) {
                    if (navigator.currentQuarter === 'big_picture') {
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
                        dragOverlay.style.cursor = 'grabbing';
                        dragOverlay.style.background = 'transparent';
                        dragOverlay.style.display = 'none';
                        dragOverlay.style.zIndex = -1000;
                        sankeyContainer.appendChild(dragOverlay);
                    
                        let isDragging = false;
                        let startX, startY;
                        let startScrollLeft, startScrollTop;
                        let lastX, lastY;
                        let animationFrameId = null;

                        const debounce = (func, delay) => {
                            let inDebounce;
                            return function() {
                                const context = this;
                                const args = arguments;
                                clearTimeout(inDebounce);
                                inDebounce = setTimeout(() => func.apply(context, args), delay);
                            }
                        }

                        const debouncedEnableHoverEffects = debounce(enableHoverEffects, 100);
                    
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
                    
                            document.addEventListener('mousemove', throttledMouseMove);
                            document.addEventListener('mouseup', stopDragging);
                    
                            animationFrameId = requestAnimationFrame(updateScroll);
                        }
                    
                        function onMouseMove(event) {
                            if (!isDragging) return;
                            lastX = event.pageX;
                            lastY = event.pageY;
                        }

                        function throttle(func, limit) {
                            let inThrottle;
                            return function() {
                                const args = arguments;
                                const context = this;
                                if (!inThrottle) {
                                    func.apply(context, args);
                                    inThrottle = true;
                                    setTimeout(() => inThrottle = false, limit);
                                }
                            }
                        }
                        
                        const throttledMouseMove = throttle(onMouseMove, 1);
                    
                        function stopDragging() {
                            if (!isDragging) return;
                    
                            isDragging = false;
                            dragOverlay.style.display = 'none';
                            dragOverlay.style.cursor = 'grab';
                            enableHoverEffects();
                    
                            document.removeEventListener('mousemove', throttledMouseMove);
                            document.removeEventListener('mouseup', stopDragging);

                            debouncedEnableHoverEffects();
                    
                            if (animationFrameId) {
                                cancelAnimationFrame(animationFrameId);
                            }
                        }

                        if (navigator.currentView === 'quarter') {
                            sankeyContainer.removeChild(dragOverlay);
                        }
                    
                        sankeyContainer.addEventListener('mousedown', startDragging);
                    }
                }
            });

            Plotly.react(sankeyDiv, [sankeyData], layout, config)
            .then(() => {
                sankeyNodeLabelsAlign(quarter === 'big_picture' ? 'right' : 'center', true);
                sankeyDiv.removeAllListeners('plotly_click');
                

                const annotationElements = sankeyDiv.querySelectorAll('.annotation-text-g');
                annotationElements.forEach((el, index) => {
                    el.style.pointerEvents = 'all';
                    el.style.cursor = 'pointer';
                });

                const rectLabelElement = sankeyDiv.querySelectorAll('.sankey-node');
                rectLabelElement.forEach((el, index) => {
                    el.style.pointerEvents = 'all';
                    el.style.cursor = 'pointer';
                });

                const textLabelElement = sankeyDiv.querySelectorAll('.node-label');
                textLabelElement.forEach((el, index) => {
                    el.style.pointerEvents = 'all';
                    el.style.cursor = 'pointer';
                });

                const plotlyElement = sankeyDiv.querySelector('.js-plotly-plot .plotly .cursor-crosshair');
                if (plotlyElement) {
                    if (navigator.currentView !== 'big_picture') {
                        plotlyElement.style.setProperty('cursor', 'default', 'important');
                    } 
                }

                function getYear(quarterIndex) {
                    if (quarterIndex <= 3) {
                        return 2022;
                    }
                    const baseYear = 2022;
                    const yearOffset = Math.floor(quarterIndex / 4);
                    return baseYear + yearOffset;
                }

                if (navigator.currentQuarter === 'big_picture') {
                    sankeyDiv.on('plotly_clickannotation', function(eventData) {
                        const clickedQuarter = eventData.annotation.text;
                        const quarterIndex = eventData.annotation.quarterIndex;
                        const year = getYear(quarterIndex);
                        const quarterMap = {'Jan-Mar': 'Q1', 'Apr-Jun': 'Q2', 'Jul-Sep': 'Q3', 'Oct-Dec': 'Q4'};
                        const clicked = `${year}${quarterMap[clickedQuarter]}`;

                        if (clicked.match(/^\d{4}Q\d$/)) {
                            navigator.setQuarter(clicked);
                        }
                    });
                }

               if ((quarter !== 'big_picture') && (!walletFilter)) {
                    const nodes = document.getElementsByClassName('sankey-node');
                    const fontSizeMisc = isDesktop ? `${12*widthCalibration}px` : '12px';
                    const fontSizebig = isDesktop ? `${14*widthCalibration}px` : '14px';
                    Array.from(nodes).forEach((node, index) => {
                        const nodeName = data.nodes[index].bpIndex;
                        const label = node.getElementsByClassName('node-label')[0];
                        if (qtrSendersList.includes(nodeName)) {
                            label.style.fontSize = fontSizeMisc;
                            label.setAttribute('y', -2)
                            label.setAttribute('opacity', '0.6')
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

                if (navigator.currentView !== 'wallet') {
                    const nodes = document.getElementsByClassName('sankey-node');
                    Array.from(nodes).forEach((node, index) => {
                        const nodeName = data.nodes[index].name;
                        const listNames = data.nodes[index].customdata.toNames;
                        const bpIndex = data.nodes[index].customdata.bpIndex;
                        const label = node.getElementsByClassName('node-label')[0];
                        if (specialWallets.includes(nodeName)) {
                            label.style.fontWeight = '550';
                        } else {
                            if (listNames.length === 1 && listNames[0] === nodeName && nodeName !== 'Dissolution' && bpIndex !== "Community SG (2023Q1)" && nodeName !== 'DAO Wallet') {
                                label.style.fontStyle = 'italic';
                            }
                        }
                        if (nodeName === 'Dissolution') {
                            label.style.opacity = 0.4;
                        }
                    });
                }

                sankeyDiv.on('plotly_click', function(eventData) {
                    const clickedPoint = eventData.points[0];
                    console.log('Clicked point:', clickedPoint);
                
                    if (clickedPoint.childrenNodes) {
                        if (navigator.currentView === 'big_picture') {
                            if (specialWallets.includes(clickedPoint.label)) {
                                const bpIndex = clickedPoint.customdata.bpIndex;
                                const match = bpIndex.match(/\((\d{4}Q\d)\)/);
                                if (match) {
                                    const quarter = match[1];
                                    navigator.setQuarter(quarter, true);
                                    navigator.setWalletFilter(clickedPoint.label);
                                }
                            } else {
                                const dropdownQuarter = (clickedPoint.customdata.bpIndex).match(/\((\d{4}Q\d)\)/)[1];
                                const dropdownValue = clickedPoint.value;
                                const dropdownSender = clickedPoint.targetLinks[0].customdata.from;
                                showContractorsDropdown(
                                    clickedPoint.label,
                                    isSideMenuExpanded ? (0.225*getWidth + clickedPoint.originalX) : clickedPoint.originalX,
                                    clickedPoint.originalY + 2000*heightCalibration*0.05,
                                    dropdownQuarter,
                                    dropdownValue,
                                    dropdownSender,
                                    { width: layout.width, height: layout.height }
                                );
                            }
                        } else {
                            if (specialWallets.includes(clickedPoint.label)) {
                                navigator.setWalletFilter(clickedPoint.label);
                            } else {
                                if (clickedPoint.label !== 'Unspent') {
                                    const dropdownValue = clickedPoint.value;
                                    showContractorsDropdown(
                                        clickedPoint.label,
                                        isSideMenuExpanded ? (0.04*getWidth + 0.225*getWidth + clickedPoint.originalX) : clickedPoint.originalX,
                                        clickedPoint.originalY + 150*heightCalibration,
                                        currentQuarter,
                                        dropdownValue,
                                        null,
                                        { width: layout.width, height: layout.height }
                                    );
                                }
                            }
                        }
                    } else {
                        if (clickedPoint.customdata) {
                            const txDetails = clickedPoint.customdata;
                            const txHash = txDetails.receipt;
                
                            if (!openBanners.has(txHash) && txHash !== 'Interquarter' && txHash !== 'Unspent') {
                                const flowInfo = `${txDetails.date}: <b>${txDetails.from}</b> sent ${txDetails.value} ${txDetails.symbol} (${txDetails.usd} USD) to <b>${txDetails.to}</b>`;
                                const etherscanUrl = `https://etherscan.io/tx/${txHash}`;
                                createFlowBanner(flowInfo, etherscanUrl, txHash);
                            } else if (txHash === 'Interquarter' || txHash === 'Unspent') {
                                const uniqueID = `${txHash}${txDetails.date}${txDetails.from}${txDetails.symbol}`;
                                if (openBanners.has(uniqueID)) {
                                    return shakeBanner(uniqueID);
                                }
                                const flowInfo = `<b>${txDetails.from}</b> had ${txDetails.value} ${txDetails.symbol} unspent in <b>${txDetails.qtr}</b>`;
                                createFlowBanner(flowInfo, false, uniqueID);
                            } else {
                                shakeBanner(txHash);
                            }
                        }
                    }
                });
            });

            const activeSpecialWallets = new Set(data.nodes
                .map(node => node.name)
                .filter(name => specialWallets.includes(name)));
        
            populateWallets(Array.from(activeSpecialWallets));
        
            navigator.updateUrlBar();
        }) 
        .finally(() => {
            updateContextButton();
          });
    };

    const navigator = new LedgerNavigator();

    const initialState = parseUrl();
    navigator.loadState(initialState);
    navigator.updateUrlBar(true);
});