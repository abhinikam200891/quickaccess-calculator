// --- 1. CORE APPLICATION STATE & MULTI-VIEW CACHE ---
    const framePool = new Map();
    let currentViewId = 'dashboard';

    // --- 1. DYNAMIC PAGE DISCOVERY & REGISTRY ---
    const PAGES_CONFIG = {
        folder: 'tools/'   // every calculator page lives here; list is built by scripts/scan-pages.ps1
    };

    // Dashboard is the one built-in (non-file) view
    const DASHBOARD_TOOL = {
        id: 'dashboard',
        name: 'Dashboard',
        icon: '📊',
        file: '',
        category: 'Overview',
        desc: 'Executive overview, stats & branch checklist',
        keywords: ['dashboard', 'overview', 'stats', 'tasks', 'summary', 'home', 'cockpit'],
        color: '#6366F1',
        rgb: '99, 102, 241'
    };

    // SINGLE SOURCE OF TRUTH for known pages (name, icon, category, color, keywords).
    // Unlisted files are still auto-detected and get a generated name/icon/color.
    // BankingCore.tools is only filled from this at runtime - never duplicate it elsewhere.
    const KNOWN_PAGES_METADATA = {
        'arb discount_overdue interest.html': {
            id: 'arb-discount',
            file: 'ARB DISCOUNT_OVERDUE INTEREST.HTML',
            name: 'ARB Savlat & Overdue',
            icon: '🪙',
            category: 'Loans & Recovery',
            desc: 'Compromise settlement & overdue interest',
            keywords: ['arb', 'savlat', 'discount', 'overdue', 'interest', 'settlement', 'compromise', 'loan'],
            color: '#A855F7',
            rgb: '168, 85, 247'
        },
        'arb samopchar.html': {
            id: 'arb-samopchar',
            file: 'ARB SAMOPCHAR.html',
            name: 'ARB Samopchar (D1)',
            icon: '📜',
            category: 'Loans & Recovery',
            desc: 'Arbitration recovery D1 prastav',
            keywords: ['arb', 'samopchar', 'd1', 'prastav', 'arbitration', 'npa', 'recovery', 'court', 'legal'],
            color: '#F97316',
            rgb: '249, 115, 22'
        },
        'cash denomination.html': {
            id: 'cash-denomination',
            file: 'Cash Denomination.html',
            name: 'Cash Denomination',
            icon: '💵',
            category: 'Branch Utilities',
            desc: 'Cash count by note & coin, tally vs book balance',
            keywords: ['cash', 'denomination', 'denomation', 'notes', 'coins', 'tally', 'counter', 'teller', 'vault', 'closing', 'balance'],
            color: '#10B981',
            rgb: '16, 185, 129'
        },
        'date.html': {
            id: 'date',
            file: 'DATE.HTML',
            name: 'Date Calculator',
            icon: '📅',
            category: 'Branch Utilities',
            desc: 'Banking day-count duration & dates',
            keywords: ['date', 'day', 'days', 'duration', 'calendar', 'count', 'offset', 'tenure'],
            color: '#14B8A6',
            rgb: '20, 184, 166'
        },
        'dds.html': {
            id: 'dds',
            file: 'DDS.html',
            name: 'DDS Interest',
            icon: '🧮',
            category: 'Deposits & Savings',
            desc: 'Daily deposit pigmy interest with Excel upload',
            keywords: ['dds', 'deposit', 'daily', 'pigmy', 'interest', 'excel', 'upload', 'scheme'],
            color: '#10B981',
            rgb: '16, 185, 129'
        },
        'dividend.html': {
            id: 'dividend',
            file: 'DIVIDEND.HTML',
            name: 'Dividend',
            icon: '💰',
            category: 'Shares & Dividends',
            desc: 'Shareholder dividend distribution',
            keywords: ['dividend', 'share', 'shares', 'shareholder', 'distribution', 'capital', 'profit'],
            color: '#F59E0B',
            rgb: '245, 158, 11'
        },
        'emi.html': {
            id: 'emi',
            file: 'EMI.HTML',
            name: 'EMI Calculator',
            icon: '🔢',
            category: 'Loans & Advances',
            desc: 'Amortization & reducing balance schedule',
            keywords: ['emi', 'loan', 'repayment', 'amortization', 'schedule', 'reducing', 'interest', 'principal'],
            color: '#3B82F6',
            rgb: '59, 130, 246'
        },
        'lakhpati.html': {
            id: 'lakhpati',
            file: 'LAKHPATI.HTML',
            name: 'Lakhpati Penalty',
            icon: '⚠️',
            category: 'Penalties & Overdue',
            desc: 'Lakhpati RD penalty calculations',
            keywords: ['lakhpati', 'penalty', 'fine', 'rd', 'recurring', 'delayed', 'charges'],
            color: '#EF4444',
            rgb: '239, 68, 68'
        },
        'loan charges.html': {
            id: 'loan-charges',
            file: 'LOAN CHARGES.HTML',
            name: 'Loan Charges',
            icon: '📝',
            category: 'Loans & Advances',
            desc: 'Sanction deductions & fee matrix',
            keywords: ['loan', 'charges', 'sanction', 'deductions', 'fees', 'insurance', 'share', 'processing'],
            color: '#F43F5E',
            rgb: '244, 63, 94'
        },
        'numtext.html': {
            id: 'numtext',
            file: 'NUMTEXT.html',
            name: 'Number to Words',
            icon: '🔤',
            category: 'Branch Utilities',
            desc: 'Indian currency to words in English for cheques & vouchers',
            keywords: ['numtext', 'number', 'words', 'cheque', 'voucher', 'currency', 'rupees', 'convert', 'spelling'],
            color: '#8B5CF6',
            rgb: '139, 92, 246'
        },
        'saving.html': {
            id: 'saving',
            file: 'SAVING.HTML',
            name: 'Saving Interest',
            icon: '💵',
            category: 'Deposits & Savings',
            desc: 'Savings interest from monthly minimum balances',
            keywords: ['saving', 'savings', 'interest', 'sb', 'minimum', 'balance', 'monthly', 'statement'],
            color: '#06B6D4',
            rgb: '6, 182, 212'
        }
    };

    // Extended 20-color luxury fintech palette for dynamic & future-proof UI
    const FINTECH_PALETTE = [
        { name: 'Indigo', color: '#6366F1', rgb: '99, 102, 241' },
        { name: 'Emerald', color: '#10B981', rgb: '16, 185, 129' },
        { name: 'Blue', color: '#3B82F6', rgb: '59, 130, 246' },
        { name: 'Amber', color: '#F59E0B', rgb: '245, 158, 11' },
        { name: 'Violet', color: '#8B5CF6', rgb: '139, 92, 246' },
        { name: 'Rose', color: '#F43F5E', rgb: '244, 63, 94' },
        { name: 'Teal', color: '#14B8A6', rgb: '20, 184, 166' },
        { name: 'Orange', color: '#F97316', rgb: '249, 115, 22' },
        { name: 'Cyan', color: '#06B6D4', rgb: '6, 182, 212' },
        { name: 'Pink', color: '#EC4899', rgb: '236, 72, 153' },
        { name: 'Sapphire', color: '#2563EB', rgb: '37, 99, 235' },
        { name: 'Forest', color: '#059669', rgb: '5, 150, 105' },
        { name: 'Crimson', color: '#EF4444', rgb: '239, 68, 68' },
        { name: 'Purple', color: '#7C3AED', rgb: '124, 58, 237' },
        { name: 'Gold', color: '#D97706', rgb: '217, 119, 6' },
        { name: 'Marine', color: '#0891B2', rgb: '8, 145, 178' },
        { name: 'Wine', color: '#BE185D', rgb: '190, 24, 93' },
        { name: 'Slate', color: '#475569', rgb: '71, 85, 105' },
        { name: 'UltraIndigo', color: '#4F46E5', rgb: '79, 70, 229' },
        { name: 'Jade', color: '#0D9488', rgb: '13, 148, 136' }
    ];

    // Comprehensive banking & operations smart rules for automatic categorization & icons
    const SMART_MODULE_RULES = [
        {
            keywords: ['denom', 'cash', 'note', 'currency', 'counter', 'teller', 'bundle', 'tally', 'box', 'vault_cash', 'drawer'],
            icon: '💵',
            category: 'Cash & Counter Operations',
            desc: 'Cash denomination counter & currency tally sheet',
            searchTerms: ['denomination', 'denomation', 'cash', 'currency', 'notes', 'coins', 'counter', 'teller', 'bundle', 'tally', '500', '200', '100', '50', '20', '10'],
            theme: { color: '#10B981', rgb: '16, 185, 129' }
        },
        {
            keywords: ['gold', 'silver', 'metal', 'ornament', 'jewel', 'bullion', 'girvi', 'bandhak', 'appraisal', 'pawn', 'carat', 'karat'],
            icon: '🪙',
            category: 'Gold & Asset Valuation',
            desc: 'Gold loan appraisal, ornament purity & valuation',
            searchTerms: ['gold', 'silver', 'jewel', 'ornament', 'metal', 'girvi', 'bandhak', 'purity', 'carat', 'karat', 'bullion', 'appraisal'],
            theme: { color: '#F59E0B', rgb: '245, 158, 11' }
        },
        {
            keywords: ['cctv', 'camera', 'surveillance', 'security', 'dvr', 'nvr', 'footage', 'guard', 'alarm', 'fire', 'access'],
            icon: '📹',
            category: 'Security & Surveillance',
            desc: 'Branch security, CCTV camera monitoring & surveillance log',
            searchTerms: ['cctv', 'camera', 'surveillance', 'video', 'footage', 'recording', 'dvr', 'nvr', 'security', 'guard', 'safety', 'branch'],
            theme: { color: '#6366F1', rgb: '99, 102, 241' }
        },
        {
            keywords: ['locker', 'vault', 'safe', 'custody', 'strongroom', 'key', 'almirah'],
            icon: '🔐',
            category: 'Locker & Custody Services',
            desc: 'Safe deposit locker rent, custody & vault registers',
            searchTerms: ['locker', 'vault', 'safe', 'custody', 'strongroom', 'key', 'rent', 'deposit', 'agreement'],
            theme: { color: '#8B5CF6', rgb: '139, 92, 246' }
        },
        {
            keywords: ['cheque', 'check', 'cts', 'clearing', 'dd', 'draft', 'payorder', 'voucher', 'slip', 'token', 'inward', 'outward'],
            icon: '📑',
            category: 'Cheques & Clearing Operations',
            desc: 'CTS cheque clearing, vouchers & pay orders',
            searchTerms: ['cheque', 'check', 'cts', 'clearing', 'dd', 'draft', 'payorder', 'voucher', 'slip', 'token', 'micr', 'inward', 'outward'],
            theme: { color: '#06B6D4', rgb: '6, 182, 212' }
        },
        {
            keywords: ['deposit', 'fd', 'rd', 'pigmy', 'dds', 'term', 'reinvestment', 'cumulative', 'maturity'],
            icon: '🧮',
            category: 'Deposits & Investments',
            desc: 'Deposit interest, maturity & recurring scheme calculations',
            searchTerms: ['deposit', 'fixed', 'recurring', 'fd', 'rd', 'pigmy', 'dds', 'term', 'maturity', 'interest', 'compound'],
            theme: { color: '#14B8A6', rgb: '20, 184, 166' }
        },
        {
            keywords: ['saving', 'sb', 'ca', 'current', 'balance', 'passbook', 'minbal', 'average_balance'],
            icon: '💳',
            category: 'Accounts & Balances',
            desc: 'Savings bank interest from monthly minimum balances',
            searchTerms: ['saving', 'savings', 'current', 'sb', 'ca', 'balance', 'statement', 'passbook', 'minbal', 'account'],
            theme: { color: '#0284C7', rgb: '2, 132, 199' }
        },
        {
            keywords: ['loan', 'borrow', 'mortgage', 'advance', 'credit', 'overdraft', 'od', 'cc', 'limit', 'hypothecation', 'pledge', 'charge'],
            icon: '📝',
            category: 'Loans & Advances',
            desc: 'Sanction deductions, share capital, legal & processing fees',
            searchTerms: ['loan', 'borrow', 'advance', 'credit', 'charges', 'processing', 'fees', 'mortgage', 'overdraft', 'cc', 'od', 'sanction'],
            theme: { color: '#F43F5E', rgb: '244, 63, 94' }
        },
        {
            keywords: ['emi', 'repay', 'amort', 'installment', 'schedule', 'tenure', 'reducing'],
            icon: '🔢',
            category: 'EMI & Repayments',
            desc: 'Reducing balance loan repayment & amortization schedule',
            searchTerms: ['emi', 'repayment', 'amortization', 'installment', 'schedule', 'principal', 'interest', 'reducing', 'tenure'],
            theme: { color: '#3B82F6', rgb: '59, 130, 246' }
        },
        {
            keywords: ['samopchar', 'arb', 'npa', 'recovery', 'court', 'legal', 'notice', 'prastav', 'lokadalat', 'decree', 'suit'],
            icon: '📜',
            category: 'Recovery & Legal',
            desc: 'Arbitration NPA D1 recovery prastav calculation',
            searchTerms: ['samopchar', 'arb', 'd1', 'npa', 'recovery', 'legal', 'court', 'notice', 'prastav', 'arbitration', 'decree'],
            theme: { color: '#F97316', rgb: '249, 115, 22' }
        },
        {
            keywords: ['savlat', 'discount', 'overdue', 'penalty', 'fine', 'penal', 'delayed', 'default', 'lakhpati'],
            icon: '⚠️',
            category: 'Penalties & Overdue',
            desc: 'Overdue interest, savlat settlement & penalty calculations',
            searchTerms: ['penalty', 'fine', 'overdue', 'savlat', 'discount', 'delayed', 'penal', 'default', 'lakhpati', 'bounce'],
            theme: { color: '#EF4444', rgb: '239, 68, 68' }
        },
        {
            keywords: ['tax', 'gst', 'tds', 'tcs', 'incometax', 'cess', 'pan', 'tan', 'itr', 'audit'],
            icon: '🧾',
            category: 'Tax & Compliance',
            desc: 'Tax deductions, GST calculator & TDS compliance',
            searchTerms: ['tax', 'gst', 'tds', 'tcs', 'incometax', 'pan', 'tan', 'audit', 'compliance', 'cess', 'challan'],
            theme: { color: '#7C3AED', rgb: '124, 58, 237' }
        },
        {
            keywords: ['insurance', 'bima', 'pmjjby', 'pmsby', 'apy', 'pension', 'policy', 'premium', 'claim'],
            icon: '🛡️',
            category: 'Insurance & Social Security',
            desc: 'Social security schemes & insurance premium tracker',
            searchTerms: ['insurance', 'bima', 'policy', 'premium', 'claim', 'pmjjby', 'pmsby', 'apy', 'pension', 'life', 'general'],
            theme: { color: '#059669', rgb: '5, 150, 105' }
        },
        {
            keywords: ['member', 'customer', 'kyc', 'cif', 'voter', 'aadhaar', 'identity', 'profile', 'user'],
            icon: '👤',
            category: 'Member & Customer KYC',
            desc: 'Member profile, CIF verification & KYC documentation',
            searchTerms: ['member', 'customer', 'kyc', 'cif', 'aadhaar', 'identity', 'profile', 'user', 'voter', 'pan', 'verification'],
            theme: { color: '#2563EB', rgb: '37, 99, 235' }
        },
        {
            keywords: ['transfer', 'neft', 'rtgs', 'imps', 'upi', 'remit', 'payout', 'payment'],
            icon: '🔄',
            category: 'Remittance & Transfers',
            desc: 'Inter-bank funds remittance & transfer reconciliation',
            searchTerms: ['transfer', 'neft', 'rtgs', 'imps', 'upi', 'remit', 'remittance', 'utr', 'payment', 'payout'],
            theme: { color: '#0284C7', rgb: '2, 132, 199' }
        },
        {
            keywords: ['dividend', 'share', 'equity', 'profit', 'patronage', 'bonus', 'capital'],
            icon: '💰',
            category: 'Shares & Dividends',
            desc: 'Shareholder dividend distribution calculations',
            searchTerms: ['dividend', 'share', 'shares', 'equity', 'capital', 'profit', 'patronage', 'bonus'],
            theme: { color: '#D97706', rgb: '217, 119, 6' }
        },
        {
            keywords: ['report', 'mis', 'register', 'ledger', 'summary', 'gl', 'daybook', 'scroll', 'sheet'],
            icon: '📊',
            category: 'Reports & Ledgers',
            desc: 'Branch MIS reports, general ledger & daily scroll',
            searchTerms: ['report', 'mis', 'register', 'ledger', 'summary', 'gl', 'daybook', 'scroll', 'sheet', 'daily'],
            theme: { color: '#4F46E5', rgb: '79, 70, 229' }
        },
        {
            keywords: ['interest', 'rate', 'roi', 'yield', 'apr', 'percentage'],
            icon: '📈',
            category: 'Interest & Rates',
            desc: 'Interest rate comparison & yield calculator',
            searchTerms: ['interest', 'rate', 'roi', 'yield', 'apr', 'percentage', 'slab', 'rates'],
            theme: { color: '#EC4899', rgb: '236, 72, 153' }
        },
        {
            keywords: ['date', 'day', 'calendar', 'duration', 'holiday', 'period', 'tenor', 'leap'],
            icon: '📅',
            category: 'Branch Utilities',
            desc: 'Banking day-count duration & dates calculation',
            searchTerms: ['date', 'day', 'calendar', 'duration', 'days', 'period', 'holiday', 'tenor'],
            theme: { color: '#0D9488', rgb: '13, 148, 136' }
        },
        {
            keywords: ['numtext', 'word', 'words', 'num', 'spell', 'convert', 'english', 'marathi', 'text'],
            icon: '🔤',
            category: 'Branch Utilities',
            desc: 'Indian currency to words in English for cheques & vouchers',
            searchTerms: ['numtext', 'words', 'number', 'spell', 'cheque', 'voucher', 'rupee', 'text', 'convert'],
            theme: { color: '#8B5CF6', rgb: '139, 92, 246' }
        },
        {
            keywords: ['audit', 'inspect', 'compliance', 'circular', 'rbi', 'guideline'],
            icon: '⚖️',
            category: 'Audit & Compliance',
            desc: 'Audit inspection checklist & compliance tracker',
            searchTerms: ['audit', 'inspect', 'compliance', 'circular', 'rbi', 'guideline', 'norm'],
            theme: { color: '#B45309', rgb: '180, 83, 9' }
        },
        {
            keywords: ['tool', 'util', 'config', 'setting', 'setup', 'sync', 'backup', 'export', 'import'],
            icon: '⚙️',
            category: 'Branch Utilities',
            desc: 'Branch operational utility and configuration helper',
            searchTerms: ['tool', 'util', 'utility', 'config', 'settings', 'setup', 'sync', 'backup', 'export'],
            theme: { color: '#475569', rgb: '71, 85, 105' }
        }
    ];

    function hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    function resolveToolMetadata(filepath, index = 0) {
        const basename = filepath.split(/[\\/]/).pop().trim();
        const key = basename.toLowerCase();

        if (KNOWN_PAGES_METADATA[key]) {
            return {
                ...KNOWN_PAGES_METADATA[key],
                file: filepath
            };
        }

        // Dynamically deduce name, icon, category, and theme colors for newly added files
        const rawName = basename.replace(/\.html?$/i, '');
        const id = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `tool-${index}`;
        
        // Banking acronym dictionary for clean title formatting
        const ACRONYMS = new Set(['ARB', 'DDS', 'EMI', 'RD', 'FD', 'NPA', 'CCTV', 'GST', 'TDS', 'CTS', 'NEFT', 'RTGS', 'KYC', 'ROI', 'RBI', 'MIS', 'PMJJBY', 'PMSBY', 'APY', 'CA', 'SB', 'ATM', 'UPI']);
        
        const words = rawName.replace(/[_\-]+/g, ' ').split(/\s+/).filter(Boolean);
        let formattedName = words.map(w => {
            const upper = w.toUpperCase();
            if (ACRONYMS.has(upper) || (w.length <= 4 && w === upper)) return upper;
            if (/[A-Z]/.test(w) && /[a-z]/.test(w)) return w;
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join(' ');
        if (!formattedName) formattedName = rawName;

        // Match against smart banking rules
        const lowerRaw = rawName.toLowerCase();
        let matchedRule = null;
        for (const rule of SMART_MODULE_RULES) {
            if (rule.keywords.some(kw => lowerRaw.includes(kw))) {
                matchedRule = rule;
                break;
            }
        }

        let icon = '⚡';
        let category = 'Branch Utilities';
        let desc = `${formattedName} module`;
        let keywords = [...words, rawName, formattedName];
        let theme = FINTECH_PALETTE[hashString(id) % FINTECH_PALETTE.length];

        if (matchedRule) {
            icon = matchedRule.icon;
            category = matchedRule.category;
            desc = matchedRule.desc;
            keywords = Array.from(new Set([...keywords, ...matchedRule.searchTerms]));
            theme = matchedRule.theme || theme;
        }

        return {
            id: id,
            name: formattedName || basename,
            icon: icon,
            category: category,
            file: filepath,
            desc: desc,
            keywords: keywords,
            color: theme.color,
            rgb: theme.rgb
        };
    }

    // The manifest (assets/js/pages-manifest.js) is the single source of truth for which pages exist.
    // It is regenerated by scripts/Refresh-Pages.bat (or kept live by the optional watcher).
    function reloadScriptManifest() {
        return new Promise((resolve) => {
            const old = document.getElementById('pages-manifest-script');
            if (old) old.remove();
            const s = document.createElement('script');
            s.id = 'pages-manifest-script';
            s.src = 'assets/js/pages-manifest.js?t=' + Date.now();
            s.onload = () => resolve(true);
            s.onerror = () => resolve(false);
            document.head.appendChild(s);
        });
    }

    async function scanForHtmlFiles() {
        await reloadScriptManifest();
        const list = Array.isArray(window.__DYNAMIC_PAGES__) ? window.__DYNAMIC_PAGES__ : [];
        // Case-insensitive de-duplication (Windows file system)
        const seen = new Map();
        list.forEach(raw => {
            const f = String(raw || '').trim();
            if (/\.html?$/i.test(f) && !seen.has(f.toLowerCase())) seen.set(f.toLowerCase(), f);
        });
        return Array.from(seen.values());
    }

    // Master tool registry - dynamically populated
    let toolRegistry = [DASHBOARD_TOOL];

    function renderNavMenu(tools) {
        const container = document.getElementById('dynamic-nav-container');
        if (!container) return;

        let html = `
            <div class="nav-category" style="--cat-color: #38BDF8;">
                <span class="cat-dot"></span>
                <span>Calculators & Tools</span>
                <span class="cat-line"></span>
            </div>
        `;

        tools.forEach(tool => {
            const isActive = currentViewId === tool.id;
            html += `
                <button class="nav-item ${isActive ? 'active' : ''}" 
                        id="nav-btn-${tool.id}" 
                        style="--item-color: ${tool.color}; --item-rgb: ${tool.rgb};" 
                        onclick="switchView('${tool.id}', this)"
                        title="${escapeHtml(tool.name)} — ${escapeHtml(tool.desc)}">
                    <span class="nav-indicator"></span>
                    <span class="nav-icon-box" style="background: rgba(${tool.rgb}, 0.15); color: ${tool.color};">
                        ${tool.icon}
                    </span>
                    <span class="nav-text">${escapeHtml(tool.name)}</span>
                    <span class="nav-active-pill"></span>
                    <span class="nav-arrow">→</span>
                </button>
            `;
        });

        container.innerHTML = html;
    }

    function applyDetectedFiles(files) {
        if (!files || files.length === 0) return;
        
        // Map files to tool objects
        const toolObjects = files.map((file, idx) => resolveToolMetadata(file, idx));

        // Sort detected HTML files strictly in alphabetical order by name
        toolObjects.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

        // Update master registry: Dashboard + Alphabetically sorted tools
        toolRegistry = [DASHBOARD_TOOL, ...toolObjects];

        // Keep BankingCore.tools in sync so any utility or component has the full dynamic toolset
        if (window.BankingCore) {
            window.BankingCore.tools = toolRegistry;
        }

        // Render navigation menu
        renderNavMenu(toolObjects);

        // Update tools ready count in Dashboard
        const toolsCountEl = document.getElementById('card-tools-count');
        if (toolsCountEl) {
            toolsCountEl.innerText = `${toolObjects.length} Tools Ready`;
        }

        // If Command Palette is open, dynamically re-filter so newly detected files show instantly
        const cmdOverlay = document.getElementById('cmdOverlay');
        if (cmdOverlay && cmdOverlay.style.display === 'flex') {
            filterCmdList();
        }

        // Sync active state
        if (currentViewId && currentViewId !== 'dashboard') {
            const activeBtn = document.getElementById(`nav-btn-${currentViewId}`);
            if (activeBtn) activeBtn.classList.add('active');
        }

        // If currently viewed tool was deleted from disk, return to dashboard
        if (currentViewId && currentViewId !== 'dashboard' && !toolObjects.some(t => t.id === currentViewId)) {
            switchView('dashboard');
            if (window.BankingCore && BankingCore.toast) {
                BankingCore.toast.info('The active module was removed from the folder.');
            }
        }

        // Handle hash routing if page loaded with specific #toolId
        const hashId = window.location.hash.replace('#', '').trim();
        if (hashId && toolRegistry.some(t => t.id === hashId)) {
            switchView(hashId);
        }
    }

    // Synchronous initial render from the manifest loaded in <head>
    if (Array.isArray(window.__DYNAMIC_PAGES__)) {
        applyDetectedFiles(window.__DYNAMIC_PAGES__);
    }

    let lastDetectedFilesJson = '';
    async function initDynamicPages() {
        try {
            const files = await scanForHtmlFiles();
            if (files && files.length > 0) {
                const currentJson = JSON.stringify(files);
                if (currentJson !== lastDetectedFilesJson) {
                    lastDetectedFilesJson = currentJson;
                    applyDetectedFiles(files);
                }
            }
        } catch(e) {
            console.error('[DynamicPages] Error initializing pages:', e);
        }
    }

    // Trigger dynamic discovery
    initDynamicPages();

    // Auto-scan on window focus (whenever user returns from Windows Explorer)
    window.addEventListener('focus', () => {
        initDynamicPages();
    });

    // Background auto-refresh polling every 2.5 seconds to catch live additions or removals
    setInterval(initDynamicPages, 2500);

    // --- 1.1 RESPONSIVE SIDEBAR MOBILE / TABLET CONTROLS ---
    function toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const backdrop = document.getElementById('sidebarBackdrop');
        const isOpen = sidebar.classList.toggle('sidebar-open');
        if (backdrop) backdrop.classList.toggle('active', isOpen);
    }

    function closeSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const backdrop = document.getElementById('sidebarBackdrop');
        if (sidebar) sidebar.classList.remove('sidebar-open');
        if (backdrop) backdrop.classList.remove('active');
    }

    // --- 2. MULTI-VIEW SWITCHER WITH FULL STATE PRESERVATION & ERROR HANDLING ---
    function renderFrameError(toolId, tool) {
        let errDiv = document.getElementById(`view-error-${toolId}`);
        if (!errDiv) {
            errDiv = document.createElement('div');
            errDiv.id = `view-error-${toolId}`;
            errDiv.className = 'view-frame active-view';
            errDiv.style.cssText = 'display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; padding:40px 20px; text-align:center; background:var(--bg-app);';
            errDiv.innerHTML = `
                <div style="background:var(--bg-surface); border:1px solid var(--border-default); border-radius:16px; padding:36px 32px; max-width:480px; box-shadow:var(--shadow-lg);">
                    <div style="font-size:2.8rem; margin-bottom:12px;">⚠️</div>
                    <h3 style="color:var(--bank-navy); font-size:1.2rem; font-weight:700; margin-bottom:8px;">
                        ${escapeHtml(tool.name)} Unavailable
                    </h3>
                    <p style="color:var(--text-muted); font-size:0.875rem; line-height:1.5; margin-bottom:20px;">
                        The file <code>${escapeHtml(tool.file)}</code> could not be loaded or is unreadable. Please check that the file exists in the designated folder.
                    </p>
                    <div style="display:flex; gap:10px; justify-content:center;">
                        <button class="btn btn-primary" onclick="retryFrame('${toolId}')" style="padding:8px 16px;">
                            🔄 Retry Loading
                        </button>
                        <button class="btn btn-outline" onclick="switchView('dashboard')" style="padding:8px 16px;">
                            📊 Return to Dashboard
                        </button>
                    </div>
                </div>
            `;
            document.getElementById('viewport-container').appendChild(errDiv);
        }
        const frame = framePool.get(toolId);
        if (frame) frame.classList.remove('active-view');
        errDiv.classList.add('active-view');
    }

    function retryFrame(toolId) {
        const errDiv = document.getElementById(`view-error-${toolId}`);
        if (errDiv) errDiv.classList.remove('active-view');
        const frame = framePool.get(toolId);
        if (frame) {
            frame.src = frame.src;
            frame.classList.add('active-view');
        }
    }

    function switchView(toolId, navBtn) {
        currentViewId = toolId;
        closeSidebar();
        const tool = toolRegistry.find(t => t.id === toolId);
        if (!tool) {
            if (window.BankingCore && BankingCore.toast) {
                BankingCore.toast.warning('Selected calculator module is not available.');
            }
            return;
        }

        // Update Topbar Title with rich badge and clear module description
        document.getElementById('active-tool-display').innerHTML = `
            <span class="tool-icon-badge" style="background: rgba(${tool.rgb}, 0.15); color: ${tool.color}; border: 1px solid rgba(${tool.rgb}, 0.3);">
                ${tool.icon}
            </span> 
            <span style="font-weight: 700; color: #0F172A; font-size: 0.95rem;">${escapeHtml(tool.name)}</span>
            <span class="tool-desc-pill" style="color: var(--text-muted); font-size: 0.775rem; font-weight: 500; margin-left: 6px; padding-left: 8px; border-left: 1px solid #CBD5E1;">${escapeHtml(tool.desc)}</span>
        `;

        // Update Active Nav Button
        document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
        if (navBtn) {
            navBtn.classList.add('active');
        } else {
            const btn = document.getElementById(`nav-btn-${toolId}`);
            if (btn) {
                btn.classList.add('active');
            } else {
                const buttons = document.querySelectorAll('.nav-item');
                buttons.forEach(b => {
                    if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(toolId)) {
                        b.classList.add('active');
                    }
                });
            }
        }

        // Hide Dashboard View
        const dashView = document.getElementById('dashboard-view');
        dashView.classList.remove('active-view');

        // Hide all frames & error containers
        framePool.forEach(frame => frame.classList.remove('active-view'));
        document.querySelectorAll('[id^="view-error-"]').forEach(el => el.classList.remove('active-view'));

        if (toolId === 'dashboard') {
            dashView.classList.add('active-view');
            updateDashboardMetrics();
            return;
        }

        // Check if iframe already exists in cache
        let frame = framePool.get(toolId);
        if (!frame) {
            frame = document.createElement('iframe');
            frame.className = 'view-frame';
            frame.src = PAGES_CONFIG.folder + tool.file;
            frame.title = tool.name;
            frame.id = `view-frame-${toolId}`;

            frame.onerror = function() {
                renderFrameError(toolId, tool);
            };

            frame.onload = function() {
                try {
                    if (frame.contentDocument) {
                        const title = frame.contentDocument.title || '';
                        if (title.includes('404') || title.includes('Not Found')) {
                            renderFrameError(toolId, tool);
                        }
                    }
                } catch(e) {}

                // Forward keyboard shortcuts from inside calculator iframe to parent workstation shell
                try {
                    if (frame.contentWindow) {
                        frame.contentWindow.addEventListener('keydown', function(e) {
                            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                                e.preventDefault();
                                openCmdPalette();
                            } else if (e.key === 'Escape') {
                                closeCmdPalette();
                                closeSidebar();
                            }
                        });
                    }
                } catch(e) {}
            };

            document.getElementById('viewport-container').appendChild(frame);
            framePool.set(toolId, frame);
        }

        frame.classList.add('active-view');
    }

    // --- 3. COMMAND PALETTE (CTRL + K) ---
    let selectedCmdIndex = 0;
    let filteredCmdTools = [];

    function openCmdPalette() {
        const overlay = document.getElementById('cmdOverlay');
        const input = document.getElementById('cmdInput');
        if (!overlay || !input) return;
        overlay.style.display = 'flex';
        input.value = '';
        filterCmdList();
        setTimeout(() => input.focus(), 30);
    }

    function closeCmdPalette() {
        const overlay = document.getElementById('cmdOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    function filterCmdList() {
        const input = document.getElementById('cmdInput');
        const rawQuery = (input ? input.value : '').trim();
        const resultsContainer = document.getElementById('cmdResults');
        const headerInfo = document.getElementById('cmdHeaderInfo');
        if (!resultsContainer) return;

        // Clean query: strip .html extension if typed
        const cleanQuery = rawQuery.toLowerCase().replace(/\.html?$/i, '').trim();
        const queryTokens = cleanQuery.split(/[\s,_\-]+/).filter(Boolean);

        filteredCmdTools = toolRegistry.filter(t => {
            if (!t) return false;
            if (queryTokens.length === 0) return true; // Show all tools when input is empty

            const name = (t.name || '').toLowerCase();
            const desc = (t.desc || '').toLowerCase();
            const id = (t.id || '').toLowerCase();
            const file = (t.file || '').toLowerCase();
            const cleanFile = file.replace(/\.html?$/i, '');
            const cat = (t.category || '').toLowerCase();
            const kw = Array.isArray(t.keywords) ? t.keywords.join(' ').toLowerCase() : (t.keywords || '').toLowerCase();

            // Direct filename match (e.g. "date.html")
            if (rawQuery && file.includes(rawQuery.toLowerCase())) return true;
            if (cleanQuery && cleanFile.includes(cleanQuery)) return true;

            const corpus = `${name} ${desc} ${id} ${file} ${cleanFile} ${cat} ${kw}`;

            // Check if every token typed by user matches within the tool's corpus
            return queryTokens.every(token => corpus.includes(token));
        });

        selectedCmdIndex = 0;

        if (headerInfo) {
            headerInfo.innerText = queryTokens.length === 0
                ? `${filteredCmdTools.length} tools available`
                : `${filteredCmdTools.length} match${filteredCmdTools.length === 1 ? '' : 'es'} found`;
        }

        if (filteredCmdTools.length === 0) {
            resultsContainer.innerHTML = `
                <div style="padding: 24px 16px; color: var(--text-muted); text-align: center;">
                    <div style="font-size: 1.6rem; margin-bottom: 6px;">🔍</div>
                    <div style="font-weight: 600; color: var(--bank-navy); font-size: 0.9rem;">No matching calculators found</div>
                    <div style="font-size: 0.75rem; margin-top: 4px;">Try searching by name, keyword (e.g. "cash", "loan", "emi", "interest"), or filename.</div>
                </div>
            `;
            return;
        }

        resultsContainer.innerHTML = filteredCmdTools.map((t, idx) => `
            <div class="cmd-item ${idx === 0 ? 'selected' : ''}" 
                 id="cmd-item-${t.id}"
                 style="--item-color: ${t.color}; --item-rgb: ${t.rgb};" 
                 onclick="selectCmdTool('${t.id}')">
                <div class="cmd-item-left">
                    <span class="cmd-item-icon" style="background: rgba(${t.rgb}, 0.12); border: 1px solid rgba(${t.rgb}, 0.25); color: ${t.color};">
                        ${t.icon}
                    </span>
                    <div style="min-width: 0; flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="cmd-item-name">${escapeHtml(t.name)}</span>
                            ${t.file ? `<span class="cmd-item-file">${escapeHtml(t.file)}</span>` : ''}
                        </div>
                        <div class="cmd-item-cat">${escapeHtml(t.category ? t.category + ' • ' + t.desc : t.desc)}</div>
                    </div>
                </div>
                <span class="badge" style="background: rgba(${t.rgb}, 0.12); color: ${t.color}; border: 1px solid rgba(${t.rgb}, 0.25); font-size: 0.65rem; white-space: nowrap;">Open ↵</span>
            </div>
        `).join('');
    }

    function handleCmdKey(e) {
        if (e.key === 'Escape') {
            closeCmdPalette();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (filteredCmdTools.length > 0) {
                selectedCmdIndex = (selectedCmdIndex + 1) % filteredCmdTools.length;
                highlightCmdItem();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (filteredCmdTools.length > 0) {
                selectedCmdIndex = (selectedCmdIndex - 1 + filteredCmdTools.length) % filteredCmdTools.length;
                highlightCmdItem();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredCmdTools.length > 0 && filteredCmdTools[selectedCmdIndex]) {
                selectCmdTool(filteredCmdTools[selectedCmdIndex].id);
            }
        }
    }

    function highlightCmdItem() {
        const items = document.querySelectorAll('.cmd-item');
        items.forEach((item, idx) => {
            if (idx === selectedCmdIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    function selectCmdTool(toolId) {
        closeCmdPalette();
        switchView(toolId);
    }

    // Global Key Listener for Ctrl+K and Escape
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            openCmdPalette();
        } else if (e.key === 'Escape') {
            closeCmdPalette();
            closeSidebar();
        }
    });

    // --- 4. ADVANCED DAILY BRANCH TASK HUB ---
    let tasks = JSON.parse(localStorage.getItem('banking_tasks_v3')) || [];

    let currentTaskFilter = 'all'; // 'all' | 'pending' | 'completed' | 'high'
    let taskSearchQuery = '';

    function saveTasks() {
        localStorage.setItem('banking_tasks_v3', JSON.stringify(tasks));
        renderTasks();
        updateTaskStats();
    }

    function updateTaskStats() {
        const total = tasks.length;
        const pending = tasks.filter(t => !t.done).length;
        const completed = tasks.filter(t => t.done).length;
        const high = tasks.filter(t => t.priority === 'high' && !t.done).length;
        const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

        // Update Stat Card 4
        const cardTaskCount = document.getElementById('card-task-count');
        if (cardTaskCount) cardTaskCount.innerText = `${pending} Pending`;

        const cardRate = document.getElementById('card-task-rate');
        if (cardRate) cardRate.innerText = `${pct}% Completed`;

        // Update Progress Bar & Text
        const bar = document.getElementById('taskProgressBar');
        if (bar) bar.style.width = `${pct}%`;

        const pText = document.getElementById('taskProgressText');
        if (pText) pText.innerText = `${completed} of ${total} Done (${pct}%)`;

        // Update Filter Badge Counts
        const cntAll = document.getElementById('cnt-all');
        const cntPending = document.getElementById('cnt-pending');
        const cntCompleted = document.getElementById('cnt-completed');
        const cntHigh = document.getElementById('cnt-high');
        if (cntAll) cntAll.innerText = total;
        if (cntPending) cntPending.innerText = pending;
        if (cntCompleted) cntCompleted.innerText = completed;
        if (cntHigh) cntHigh.innerText = high;
    }

    function renderTasks() {
        const list = document.getElementById('taskList');
        if (!list) return;

        let filtered = tasks;
        if (currentTaskFilter === 'pending') filtered = filtered.filter(t => !t.done);
        else if (currentTaskFilter === 'completed') filtered = filtered.filter(t => t.done);
        else if (currentTaskFilter === 'high') filtered = filtered.filter(t => t.priority === 'high' && !t.done);

        if (taskSearchQuery) {
            filtered = filtered.filter(t => t.text.toLowerCase().includes(taskSearchQuery.toLowerCase()));
        }

        if (filtered.length === 0) {
            list.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 36px 16px; background: var(--bg-subtle); border-radius: 10px; border: 1px dashed var(--border-default);">
                    <div style="font-size: 1.8rem; margin-bottom: 4px;">✨</div>
                    <div style="font-weight: 700; color: var(--bank-navy); font-size: 0.9rem;">No tasks in this view</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 3px;">Use the input form above to add branch checklist items.</div>
                </div>
            `;
            return;
        }

        list.innerHTML = filtered.map(t => {
            const priorityClass = t.priority === 'high' ? 'priority-high' : (t.priority === 'low' ? 'priority-low' : 'priority-medium');
            const priorityLabel = t.priority === 'high' ? '🔴 High' : (t.priority === 'low' ? '🟢 Low' : '🟡 Medium');

            return `
                <div class="task-row ${t.done ? 'is-done' : ''} ${t.priority === 'high' && !t.done ? 'is-urgent' : ''}">
                    <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; cursor: pointer;" onclick="toggleTask(${t.id})">
                        <input type="checkbox" ${t.done ? 'checked' : ''} class="task-checkbox" onclick="event.stopPropagation(); toggleTask(${t.id})">
                        <div style="flex: 1; min-width: 0;">
                            <div class="task-text">${escapeHtml(t.text)}</div>
                            <div class="task-meta-row">
                                <span class="badge ${priorityClass}">${priorityLabel}</span>
                                ${t.dueDate ? `<span class="task-due-pill">📅 Due: ${t.dueDate}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="task-delete-btn" onclick="deleteTask(${t.id})" title="Delete Task">✕</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function addTask() {
        const input = document.getElementById('newTaskInput');
        const text = input.value.trim();
        if (!text) return;

        const priority = document.getElementById('taskPrioritySelect').value;
        const dueDate = document.getElementById('taskDueDateInput').value || new Date().toISOString().split('T')[0];

        tasks.unshift({
            id: Date.now(),
            text: text,
            priority: priority,
            dueDate: dueDate,
            done: false
        });

        input.value = '';
        saveTasks();
    }

    function toggleTask(id) {
        const t = tasks.find(x => x.id === id);
        if (t) {
            t.done = !t.done;
            saveTasks();
        }
    }

    function deleteTask(id) {
        tasks = tasks.filter(x => x.id !== id);
        saveTasks();
    }

    function clearCompletedTasks() {
        const initialCount = tasks.length;
        tasks = tasks.filter(t => !t.done);
        if (tasks.length !== initialCount) {
            saveTasks();
        }
    }

    function setTaskFilter(filter, btn) {
        currentTaskFilter = filter;
        document.querySelectorAll('.task-filter-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        renderTasks();
    }

    function handleTaskSearch(query) {
        taskSearchQuery = query.trim();
        renderTasks();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.innerText = text;
        return div.innerHTML;
    }

    // --- 5. DASHBOARD METRICS ---

    function updateDashboardMetrics() {
        const now = new Date();
        const fy = window.BankingCore ? BankingCore.dates.getFinancialYear(now) : '2026-2027';
        const cardFy = document.getElementById('card-fy');
        if (cardFy) cardFy.innerText = `FY ${fy}`;

        const dateStr = now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        const sysDate = document.getElementById('system-date-display');
        if (sysDate) sysDate.innerText = `🗓️ ${dateStr}`;

        // Default Due Date input to today
        const dueDateInput = document.getElementById('taskDueDateInput');
        if (dueDateInput && !dueDateInput.value) {
            dueDateInput.value = now.toISOString().split('T')[0];
        }

        updateTaskStats();
        renderTasks();
    }

    window.onload = function() {
        updateDashboardMetrics();
        initDynamicPages();
    };
