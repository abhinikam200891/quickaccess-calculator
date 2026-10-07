/**
 * ============================================================================
 * BANKING CORE SHARED UTILITY LIBRARY
 * Standardized High-Precision Financial Math, Indian Currency Formatting,
 * Number-to-Words, Date Operations, and UI Service Layer
 * ============================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BankingCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BankingCore = {
    version: '2.5.0'
  };

  /* --------------------------------------------------------------------------
   * 1. PRECISION FINANCIAL ARITHMETIC & FORMATTING
   * -------------------------------------------------------------------------- */

  /**
   * Round to exact paise / decimal places to prevent IEEE-754 floating point drift
   * @param {number|string} value 
   * @param {number} decimals 
   * @returns {number}
   */
  BankingCore.round = function (value, decimals = 2) {
    const num = Number(value);
    if (isNaN(num)) return 0;
    const factor = Math.pow(10, decimals);
    return Math.round((num + Number.EPSILON) * factor) / factor;
  };

  /**
   * Parse arbitrary text into a clean float, stripping ₹, commas, spaces
   * @param {any} input 
   * @returns {number}
   */
  BankingCore.parseAmount = function (input) {
    if (typeof input === 'number') return isNaN(input) ? 0 : input;
    if (!input) return 0;
    const cleaned = String(input).replace(/[₹\s,]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  /**
   * Formats number in Indian Rupee format (Lakhs and Crores)
   * Example: 1234567.89 -> "₹ 12,34,567.89"
   * @param {number|string} amount 
   * @param {Object} options { showSymbol: true, decimals: 2 }
   * @returns {string}
   */
  BankingCore.formatINR = function (amount, options = {}) {
    const val = BankingCore.parseAmount(amount);
    const { showSymbol = true, decimals = 2 } = options;
    
    const isNegative = val < 0;
    const absVal = Math.abs(val);
    
    const rounded = BankingCore.round(absVal, decimals);
    const parts = rounded.toFixed(decimals).split('.');
    let integerPart = parts[0];
    const decimalPart = parts.length > 1 ? '.' + parts[1] : '';

    // Indian Numbering delimiter regex: last 3 digits, then groups of 2
    let lastThree = integerPart.substring(integerPart.length - 3);
    let otherNumbers = integerPart.substring(0, integerPart.length - 3);
    if (otherNumbers !== '') {
      lastThree = ',' + lastThree;
    }
    const formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;

    const symbolStr = showSymbol ? '₹ ' : '';
    const prefix = isNegative ? '-' : '';
    return prefix + symbolStr + formattedInteger + (decimals > 0 ? decimalPart : '');
  };

  /* --------------------------------------------------------------------------
   * 2. NUMBER TO WORDS (INDIAN NUMBERING SYSTEM)
   * -------------------------------------------------------------------------- */

  const ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];

  const TENS = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ];

  function convertTwoDigits(n) {
    if (n < 20) return ONES[n];
    const unit = n % 10;
    const ten = Math.floor(n / 10);
    return TENS[ten] + (unit > 0 ? ' ' + ONES[unit] : '');
  }

  function convertThreeDigits(n) {
    let str = '';
    const hundreds = Math.floor(n / 100);
    const remainder = n % 100;
    if (hundreds > 0) {
      str += ONES[hundreds] + ' Hundred';
      if (remainder > 0) str += ' and ';
    }
    if (remainder > 0) {
      str += convertTwoDigits(remainder);
    }
    return str;
  }

  /**
   * Convert currency number into English words using Indian numbering
   * e.g. 1532450.50 -> "Rupees Fifteen Lakh Thirty-Two Thousand Four Hundred and Fifty and Fifty Paise Only"
   * @param {number|string} amount 
   * @param {Object} opts { prefix: 'Rupees ', suffix: ' Only' }
   * @returns {string}
   */
  BankingCore.numberToWords = function (amount, opts = {}) {
    const val = BankingCore.parseAmount(amount);
    const { prefix = 'Rupees ', suffix = ' Only' } = opts;

    if (val === 0) return prefix + 'Zero' + suffix;

    const isNegative = val < 0;
    const absVal = Math.abs(val);
    const rupees = Math.floor(absVal);
    const paise = Math.round((absVal - rupees) * 100);

    let parts = [];

    // Indian Scale: Crores (1,00,00,000), Lakhs (1,00,000), Thousands (1,000), Hundreds (100)
    const crores = Math.floor(rupees / 10000000);
    const remCrores = rupees % 10000000;
    const lakhs = Math.floor(remCrores / 100000);
    const remLakhs = remCrores % 100000;
    const thousands = Math.floor(remLakhs / 1000);
    const remaining = remLakhs % 1000;

    if (crores > 0) {
      parts.push(BankingCore.numberToWords(crores, { prefix: '', suffix: '' }).trim() + ' Crore');
    }
    if (lakhs > 0) {
      parts.push(convertTwoDigits(lakhs) + ' Lakh');
    }
    if (thousands > 0) {
      parts.push(convertTwoDigits(thousands) + ' Thousand');
    }
    if (remaining > 0) {
      parts.push(convertThreeDigits(remaining));
    }

    let words = parts.join(' ').trim();
    if (isNegative) words = 'Minus ' + words;

    let result = prefix + words;
    if (paise > 0) {
      result += ' and ' + convertTwoDigits(paise) + ' Paise';
    }
    result += suffix;
    return result;
  };

  /* --------------------------------------------------------------------------
   * 3. DATE UTILITIES & FINANCIAL DAY COUNTING
   * -------------------------------------------------------------------------- */

  BankingCore.dates = {
    /**
     * Days between two dates
     * @param {Date|string} d1 
     * @param {Date|string} d2 
     * @param {boolean} inclusive Include end day?
     * @returns {number}
     */
    daysBetween: function (d1, d2, inclusive = false) {
      const date1 = new Date(d1);
      const date2 = new Date(d2);
      if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return 0;
      
      const ut1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
      const ut2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
      const diff = Math.floor((ut2 - ut1) / (1000 * 60 * 60 * 24));
      return inclusive ? Math.abs(diff) + 1 : Math.abs(diff);
    },

    /**
     * Parse date string DD/MM/YYYY or YYYY-MM-DD
     */
    parse: function (str) {
      if (!str) return null;
      if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
      
      // If Excel serial number (e.g. 44927)
      if (typeof str === 'number' || (!isNaN(Number(str)) && Number(str) > 20000)) {
        return BankingCore.dates.fromExcelSerial(Number(str));
      }

      if (typeof str === 'string') {
        // DD/MM/YYYY or DD-MM-YYYY
        const parts = str.split(/[\/\-\.]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) { // YYYY-MM-DD
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          } else { // DD-MM-YYYY
            return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          }
        }
      }
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    },

    /**
     * Format date into DD/MM/YYYY
     */
    formatDMY: function (date) {
      const d = BankingCore.dates.parse(date);
      if (!d) return '-';
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    },

    /**
     * Current Indian Financial Year (e.g., "2025-2026")
     */
    getFinancialYear: function (date = new Date()) {
      const d = BankingCore.dates.parse(date) || new Date();
      const month = d.getMonth() + 1; // 1-12
      const year = d.getFullYear();
      if (month >= 4) {
        return `${year}-${year + 1}`;
      } else {
        return `${year - 1}-${year}`;
      }
    }
  };

  /* --------------------------------------------------------------------------
   * 4. UI TOAST & NOTIFICATION SERVICE
   * -------------------------------------------------------------------------- */

  BankingCore.toast = {
    show: function (message, type = 'info', duration = 3500) {
      let container = document.getElementById('bank-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'bank-toast-container';
        document.body.appendChild(container);
      }

      const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
      };

      const toast = document.createElement('div');
      toast.className = `bank-toast ${type}`;
      toast.innerHTML = `
        <span style="font-size:1.2rem;">${icons[type] || 'ℹ️'}</span>
        <div style="flex:1;">${message}</div>
      `;

      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },
    success: (msg, dur) => BankingCore.toast.show(msg, 'success', dur),
    error: (msg, dur) => BankingCore.toast.show(msg, 'error', dur),
    warning: (msg, dur) => BankingCore.toast.show(msg, 'warning', dur),
    info: (msg, dur) => BankingCore.toast.show(msg, 'info', dur)
  };

  /* --------------------------------------------------------------------------
   * 5. TOOL REGISTRY (populated by main.js)
   * -------------------------------------------------------------------------- */

  // Filled at runtime by main.js from its KNOWN_PAGES_METADATA (single source of truth).
  BankingCore.tools = [];

  return BankingCore;
});
