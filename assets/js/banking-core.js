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
    if (isNaN(num) || !isFinite(num)) return 0;
    const sign = num < 0 ? -1 : 1;
    const absNum = Math.abs(num);
    const factor = Math.pow(10, decimals);
    const roundedAbs = Math.round((absNum + Number.EPSILON) * factor) / factor;
    return roundedAbs === 0 ? 0 : sign * roundedAbs;
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
    if (isNaN(val) || !isFinite(val)) return (showSymbol ? '₹ ' : '') + '0.00';

    const roundedVal = BankingCore.round(val, decimals);
    const isNegative = roundedVal < 0;
    const absVal = Math.abs(roundedVal);

    if (absVal > 999999999999999) {
      return (isNegative ? '-' : '') + (showSymbol ? '₹ ' : '') + absVal.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    }

    const parts = absVal.toFixed(decimals).split('.');
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
   * e.g. 1532450.50 -> "Rupees Fifteen Lakh Thirty Two Thousand Four Hundred and Fifty and Fifty Paise Only"
   * @param {number|string} amount 
   * @param {Object} opts { prefix: 'Rupees ', suffix: ' Only' }
   * @returns {string}
   */
  BankingCore.numberToWords = function (amount, opts = {}) {
    const val = BankingCore.parseAmount(amount);
    const { prefix = 'Rupees ', suffix = ' Only' } = opts;

    if (isNaN(val) || !isFinite(val)) return (prefix ? prefix : '') + 'Zero' + suffix;

    const roundedVal = BankingCore.round(val, 2);
    if (roundedVal === 0) return (prefix ? prefix : '') + 'Zero' + suffix;

    const isNegative = roundedVal < 0;
    const absVal = Math.abs(roundedVal);
    const rupees = Math.floor(absVal);
    const paise = Math.round((absVal - rupees) * 100);

    function convertInteger(n) {
      if (n === 0) return '';
      let parts = [];
      const crores = Math.floor(n / 10000000);
      const remCrores = n % 10000000;
      const lakhs = Math.floor(remCrores / 100000);
      const remLakhs = remCrores % 100000;
      const thousands = Math.floor(remLakhs / 1000);
      const remaining = remLakhs % 1000;

      if (crores > 0) {
        parts.push(convertInteger(crores) + ' Crore');
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
      return parts.join(' ').trim();
    }

    const rupeeWords = convertInteger(rupees);
    const paiseWords = paise > 0 ? convertTwoDigits(paise) : '';
    const negPrefix = isNegative ? 'Minus ' : '';

    if (rupees > 0 && paise > 0) {
      return negPrefix + prefix + rupeeWords + ' and ' + paiseWords + ' Paise' + suffix;
    } else if (rupees > 0) {
      return negPrefix + prefix + rupeeWords + suffix;
    } else {
      return negPrefix + paiseWords + ' Paise' + suffix;
    }
  };

  /* --------------------------------------------------------------------------
   * 3. DATE UTILITIES & FINANCIAL DAY COUNTING
   * -------------------------------------------------------------------------- */

  BankingCore.dates = {
    /**
     * Converts an Excel numeric serial date (e.g. 44927) into a JavaScript Date.
     * Handles Excel's 1900 leap-year quirk accurately.
     * @param {number|string} serial
     * @returns {Date|null}
     */
    fromExcelSerial: function (serial) {
      const s = Number(serial);
      if (isNaN(s) || s <= 0) return null;
      // Lotus 1-2-3 / Excel bug: day 60 is Feb 29, 1900 which never existed in reality
      const days = s > 60 ? s - 1 : s;
      const excelEpochUtc = Date.UTC(1899, 11, 31);
      const ms = excelEpochUtc + Math.round(days * 86400 * 1000);
      const d = new Date(ms);
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    },

    /**
     * Days between two dates. Returns signed difference (negative if d2 is before d1)
     * so financial calculators can detect and flag inverted dates.
     * @param {Date|string|number} d1 
     * @param {Date|string|number} d2 
     * @param {boolean} inclusive Include start and end day?
     * @returns {number}
     */
    daysBetween: function (d1, d2, inclusive = false) {
      const date1 = BankingCore.dates.parse(d1);
      const date2 = BankingCore.dates.parse(d2);
      if (!date1 || !date2 || isNaN(date1.getTime()) || isNaN(date2.getTime())) return 0;
      
      const ut1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
      const ut2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
      const diff = Math.floor((ut2 - ut1) / (1000 * 60 * 60 * 24));
      if (inclusive) {
        return diff >= 0 ? diff + 1 : diff - 1;
      }
      return diff;
    },

    /**
     * Parse date string DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, compact YYYYMMDD, or Excel serial.
     * Strictly verifies day, month, and year against rollover (e.g. 31/02/2026 -> null).
     * Rejects invalid or standalone numbers like "5".
     * @param {Date|string|number} str
     * @returns {Date|null}
     */
    parse: function (str) {
      if (!str && str !== 0) return null;
      if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
      
      if (typeof str === 'number') {
        return (str >= 10000 && str <= 100000) ? BankingCore.dates.fromExcelSerial(str) : null;
      }

      if (typeof str === 'string') {
        const s = str.trim();
        if (!s) return null;

        // Excel serial as string (5-digit number > 20000)
        if (/^\d{5}$/.test(s)) {
          const num = Number(s);
          if (num >= 20000 && num <= 100000) return BankingCore.dates.fromExcelSerial(num);
          return null;
        }

        // 8-digit compact date YYYYMMDD (e.g., "20260513")
        if (/^\d{8}$/.test(s)) {
          const y = parseInt(s.substring(0, 4), 10);
          const m = parseInt(s.substring(4, 6), 10);
          const d = parseInt(s.substring(6, 8), 10);
          if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2150) return null;
          const dt = new Date(y, m - 1, d);
          if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt;
          return null;
        }

        // Delimited formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
        const parts = s.split(/[\/\-\.]/);
        if (parts.length === 3) {
          let y, m, d;
          if (parts[0].length === 4) { // YYYY-MM-DD
            y = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10);
            d = parseInt(parts[2], 10);
          } else { // DD-MM-YYYY
            d = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10);
            y = parseInt(parts[2], 10);
          }
          if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
          if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2150) return null;
          const dt = new Date(y, m - 1, d);
          // Strictly reject calendar rollover (e.g., 31/02/2026 -> 3 March)
          if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
            return dt;
          }
          return null;
        }
      }
      return null;
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
      // If embedded in the QuickAccess shell iframe, delegate toast to parent window for unified UX
      try {
        if (window.parent && window.parent !== window && window.parent.BankingCore && window.parent.BankingCore.toast) {
          window.parent.BankingCore.toast.show(message, type, duration);
          return;
        }
      } catch (e) {
        // Cross-origin restriction fallback: render locally
      }

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
      const iconSpan = document.createElement('span');
      iconSpan.style.fontSize = '1.2rem';
      iconSpan.textContent = icons[type] || 'ℹ️';
      const msgDiv = document.createElement('div');
      msgDiv.style.flex = '1';
      msgDiv.textContent = message;
      toast.appendChild(iconSpan);
      toast.appendChild(msgDiv);

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

  // Filled at runtime by main.js from toolRegistry (dynamically detected tools).
  BankingCore.tools = [];

  return BankingCore;
});
