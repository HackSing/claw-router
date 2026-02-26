"use strict";
/**
 * @aiwaretop/claw-router — Configuration
 *
 * Merges user-supplied config with sensible defaults.
 * All fields are optional; missing values fall back to defaults.
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveConfig = resolveConfig;
var types_1 = require("./router/types");
// ── Default model mapping ───────────────────────────────────────────────────
var DEFAULT_TIERS = (_a = {},
    _a[types_1.Tier.TRIVIAL] = { primary: 'default' },
    _a[types_1.Tier.SIMPLE] = { primary: 'default' },
    _a[types_1.Tier.MODERATE] = { primary: 'default' },
    _a[types_1.Tier.COMPLEX] = { primary: 'default' },
    _a[types_1.Tier.EXPERT] = { primary: 'default' },
    _a);
/**
 * Merge user config over defaults.
 */
function resolveConfig(raw) {
    var _a, _b;
    var tiers = __assign({}, DEFAULT_TIERS);
    if (raw === null || raw === void 0 ? void 0 : raw.tiers) {
        for (var _i = 0, _c = Object.entries(raw.tiers); _i < _c.length; _i++) {
            var _d = _c[_i], key = _d[0], val = _d[1];
            if (val)
                tiers[key] = __assign(__assign({}, tiers[key]), val);
        }
    }
    var thresholds = (raw === null || raw === void 0 ? void 0 : raw.thresholds) && raw.thresholds.length === 4
        ? raw.thresholds
        : __spreadArray([], types_1.DEFAULT_THRESHOLDS, true);
    var weights = __assign({}, types_1.DEFAULT_WEIGHTS);
    if ((_a = raw === null || raw === void 0 ? void 0 : raw.scoring) === null || _a === void 0 ? void 0 : _a.weights) {
        for (var _e = 0, _f = Object.entries(raw.scoring.weights); _e < _f.length; _e++) {
            var _g = _f[_e], key = _g[0], val = _g[1];
            if (typeof val === 'number')
                weights[key] = val;
        }
    }
    return {
        tiers: tiers,
        thresholds: thresholds,
        weights: weights,
        logging: (_b = raw === null || raw === void 0 ? void 0 : raw.logging) !== null && _b !== void 0 ? _b : false,
    };
}
