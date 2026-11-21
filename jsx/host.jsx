(function (global) {
    var root = new File($.fileName).parent;
    var LF = { version: "0.3.4", actions: {}, helpers: {} };
    global.LF = LF;

    function quote(value) {
        return '"' + String(value).replace(/[\x00-\x1f\\"\u2028\u2029]/g, function (c) {
            var n = c.charCodeAt(0).toString(16);
            if (c === '"') return '\\"';
            if (c === '\\') return '\\\\';
            while (n.length < 4) n = "0" + n;
            return "\\u" + n;
        }) + '"';
    }

    function stringify(value, depth) {
        depth = depth || 0;
        if (depth > 64) throw new Error("JSON 响应嵌套层级过深。");
        if (value === null || typeof value === "undefined") return "null";
        var type = typeof value, parts = [], i, key;
        if (type === "string") return quote(value);
        if (type === "boolean") return value ? "true" : "false";
        if (type === "number") return isFinite(value) ? String(value) : "null";
        if (value instanceof Array) {
            for (i = 0; i < value.length; i++) parts.push(stringify(value[i], depth + 1));
            return "[" + parts.join(",") + "]";
        }
        for (key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] !== "function") {
                parts.push(quote(key) + ":" + stringify(value[key], depth + 1));
            }
        }
        return "{" + parts.join(",") + "}";
    }

    // CEP input is data, never executable ExtendScript.
    function parse(source) {
        source = String(source);
        var pos = 0;
        function fail() { throw new Error("JSON 数据格式无效，位置：" + pos); }
        function space() { while (/\s/.test(source.charAt(pos)) && pos < source.length) pos++; }
        function string() {
            var out = "", c, h, escapes = {'"':'"', '\\':'\\', '/':'/', b:'\b', f:'\f', n:'\n', r:'\r', t:'\t'};
            pos++;
            while (pos < source.length) {
                c = source.charAt(pos++);
                if (c === '"') return out;
                if (c === "\\") {
                    c = source.charAt(pos++);
                    if (c === "u") {
                        h = source.substr(pos, 4);
                        if (!/^[0-9a-fA-F]{4}$/.test(h)) fail();
                        out += String.fromCharCode(parseInt(h, 16)); pos += 4;
                    } else if (Object.prototype.hasOwnProperty.call(escapes, c)) out += escapes[c];
                    else fail();
                } else {
                    if (c.charCodeAt(0) < 32) fail();
                    out += c;
                }
            }
            fail();
        }
        function value(depth) {
            if (depth > 32) fail();
            space();
            var c = source.charAt(pos), out, key, match;
            if (c === '"') return string();
            if (c === "{" || c === "[") {
                var end = c === "{" ? "}" : "]", object = c === "{";
                out = object ? {} : []; pos++; space();
                if (source.charAt(pos) === end) { pos++; return out; }
                while (pos < source.length) {
                    if (object) {
                        space(); if (source.charAt(pos) !== '"') fail();
                        key = string(); space(); if (source.charAt(pos++) !== ":") fail();
                        if (key === "__proto__" || key === "constructor" || key === "prototype") fail();
                        out[key] = value(depth + 1);
                    } else out.push(value(depth + 1));
                    space(); c = source.charAt(pos++);
                    if (c === end) return out;
                    if (c !== ",") fail();
                }
                fail();
            }
            match = /^(true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(source.substr(pos));
            if (!match) fail();
            pos += match[0].length;
            if (match[0] === "true") return true;
            if (match[0] === "false") return false;
            if (match[0] === "null") return null;
            var number = Number(match[0]); if (!isFinite(number)) fail(); return number;
        }
        var result = value(0); space();
        if (pos !== source.length) fail();
        return result;
    }

    LF.json = { parse: parse, stringify: stringify };
    LF.run = function (command, input) {
        try {
            if (String(input || "").length > 1048576) throw new Error("请求数据过大。");
            var payload = typeof input === "string" ? parse(input || "{}") : (input || {});
            if (!payload || typeof payload !== "object" || payload instanceof Array) throw new Error("请求数据必须为对象。");
            if (!Object.prototype.hasOwnProperty.call(LF.actions, command)) throw new Error("未知操作：" + command);
            var result = LF.actions[command](payload);
            return stringify({ ok: true, data: result || {}, message: (result && result.message) || "" });
        } catch (error) {
            return stringify({ ok: false, error: String(error.message || error), line: error.line || null });
        }
    };
    LF.actions.ping = function () { return {version: LF.version, host: String(app.name), hostVersion: String(app.version)}; };
})($.global);

// CEP 11 can evaluate $.evalFile() in a different ExtendScript engine. Textual
// includes keep every action in the same engine as LF.run.
#include "core.jsx"
#include "artwork.jsx"
