/* Illustrator host core. ES3 syntax is required by ExtendScript. */
(function () {
    var A = LF.actions, H = LF.helpers;
    var state = { documentId: null, files: {} };
    var PI = Math.PI, EPSILON = 0.000001;

    function fail(message) { throw new Error(message); }
    function finite(value) { return typeof value === 'number' && isFinite(value); }
    function message(error) { return error && error.message ? String(error.message) : String(error); }
    function kind(item) { try { return String(item.typename); } catch (ignore) { return ''; } }
    function name(item) { try { return item.name || kind(item); } catch (ignore) { return '未命名对象'; } }
    function contains(array, value) {
        var i;
        for (i = 0; i < array.length; i++) { if (array[i] === value) { return true; } }
        return false;
    }
    function arrayOf(collection) {
        var out = [], i;
        if (!collection) { return out; }
        for (i = 0; i < collection.length; i++) { out.push(collection[i]); }
        return out;
    }
    function read(item, property, fallback) {
        try { var value = item[property]; return typeof value === 'undefined' ? fallback : value; }
        catch (ignore) { return fallback; }
    }
    function checkDocument() {
        if (!app.documents.length) { fail('请先打开一个 Illustrator 文档。'); }
        return app.activeDocument;
    }
    function belongs(item, document) {
        var parent = item, n = 0;
        try {
            while (parent && n++ < 100) {
                if (parent === document) { return true; }
                if (kind(parent) === 'Document') { return false; }
                parent = parent.parent;
            }
        } catch (ignore) {}
        return false;
    }
    function isEditable(item) {
        var parent = item, n = 0;
        if (read(item, 'editable', true) === false) { return false; }
        while (parent && n++ < 100 && kind(parent) !== 'Document') {
            if (read(parent, 'locked', false) || read(parent, 'hidden', false) || read(parent, 'visible', true) === false) { return false; }
            parent = read(parent, 'parent', null);
        }
        return true;
    }
    function gather(item, kinds, result) {
        var children, i;
        if (!kinds || contains(kinds, kind(item))) { if (!contains(result, item)) { result.push(item); } return; }
        if (kind(item) === 'GroupItem') {
            children = arrayOf(item.pageItems);
            for (i = 0; i < children.length; i++) { gather(children[i], kinds, result); }
        }
    }
    function items(selectedOnly, kinds) {
        var document = checkDocument(), source, result = [], i, parent, skip;
        source = arrayOf(selectedOnly ? document.selection : document.pageItems);
        for (i = 0; i < source.length; i++) {
            skip = false;
            if (selectedOnly && !kinds) {
                parent = read(source[i], 'parent', null);
                while (parent && kind(parent) !== 'Document') {
                    if (contains(source, parent)) { skip = true; break; }
                    parent = read(parent, 'parent', null);
                }
            }
            if (!skip) { gather(source[i], kinds, result); }
        }
        return result;
    }
    function batch(targets, callback, allowReadOnly) {
        var result = { processed: 0, skipped: 0, errors: [] }, i, itemName, value;
        if (!targets.length) { fail('请先选择至少一个可用的图稿对象。'); }
        for (i = 0; i < targets.length; i++) {
            itemName = name(targets[i]);
            try {
                if (!allowReadOnly && !isEditable(targets[i])) { fail('对象或其上层处于锁定或隐藏状态。'); }
                value = callback(targets[i], i);
                if (value === false) { result.skipped++; } else { result.processed++; }
            } catch (error) { result.errors.push({ name: itemName, error: message(error) }); }
        }
        return result;
    }
    function eachSelected(callback, kinds) { return batch(items(true, kinds), callback, false); }
    function bounds(item) {
        var b, current, i;
        if (item instanceof Array) {
            if (!item.length) { fail('空图稿没有边界。'); }
            b = bounds(item[0]);
            for (i = 1; i < item.length; i++) {
                current = bounds(item[i]);
                b = [Math.min(b[0], current[0]), Math.max(b[1], current[1]), Math.max(b[2], current[2]), Math.min(b[3], current[3])];
            }
            return b;
        }
        b = item.geometricBounds;
        return [Number(b[0]), Number(b[1]), Number(b[2]), Number(b[3])];
    }
    function matrixParts(matrix) {
        var a = Number(matrix.mValueA), b = Number(matrix.mValueB), c = Number(matrix.mValueC), d = Number(matrix.mValueD);
        var sx = Math.sqrt(a * a + b * b), sy = Math.sqrt(c * c + d * d), det = a * d - b * c;
        if (!finite(sx) || !finite(sy) || sx < EPSILON || sy < EPSILON || Math.abs(det) < EPSILON) { fail('图稿变换矩阵已退化，无法归一化。'); }
        return { a: a, b: b, c: c, d: d, scaleX: sx, scaleY: sy, rotation: Math.atan2(b, a) * 180 / PI,
            reflected: det < 0, shear: (a * c + b * d) / (sx * sy), determinant: det };
    }
    function normalizedAngle(angle) {
        angle = Number(angle) % 360;
        if (angle > 180) { angle -= 360; }
        if (angle <= -180) { angle += 360; }
        return angle;
    }
    function changeMatrix(matrix, scaleX, scaleY, angle) {
        var old = matrixParts(matrix), radians, a, b, c, d, inverse, out;
        if (Math.abs(old.shear) > 0.0001) { fail('含剪切变形的图稿无法自动归一化，请先在 Illustrator 中去除剪切。'); }
        if (!finite(scaleX) || !finite(scaleY) || scaleX <= 0 || scaleY <= 0 || scaleX > 10000 || scaleY > 10000 || !finite(angle)) {
            fail('缩放必须大于 0 且不超过 1000000%，角度必须为有效数值。');
        }
        radians = normalizedAngle(angle) * PI / 180;
        a = Math.cos(radians) * scaleX; b = Math.sin(radians) * scaleX;
        c = -Math.sin(radians) * scaleY * (old.reflected ? -1 : 1);
        d = Math.cos(radians) * scaleY * (old.reflected ? -1 : 1);
        inverse = { a: old.d / old.determinant, b: -old.b / old.determinant, c: -old.c / old.determinant, d: old.a / old.determinant };
        out = app.getIdentityMatrix();
        out.mValueA = a * inverse.a + c * inverse.b;
        out.mValueB = b * inverse.a + d * inverse.b;
        out.mValueC = a * inverse.c + c * inverse.d;
        out.mValueD = b * inverse.c + d * inverse.d;
        out.mValueTX = 0; out.mValueTY = 0;
        return out;
    }
    function fileOf(item) { var file = read(item, 'file', null); return file && file.fsName ? file : null; }
    function decoded(value) { try { return decodeURI(String(value)); } catch (ignore) { return String(value); } }
    function baseName(file) { return decoded(file.name); }
    function pathKey(path) { return String(path).replace(/\\/g, '/').toLowerCase(); }
    function safeFile(path) {
        var file = new File(path);
        if (!file.exists) { fail('文件不存在：' + file.fsName); }
        return file;
    }
    function linkedSelection() { return items(true, ['PlacedItem']); }
    function cancel() { return { cancelled: true, processed: 0, skipped: 0, errors: [] }; }
    function layerPath(item) {
        var parent = read(item, 'parent', null), names = [], limit = 0;
        while (parent && kind(parent) !== 'Document' && limit++ < 100) {
            if (kind(parent) === 'Layer') { names.unshift(name(parent)); }
            parent = read(parent, 'parent', null);
        }
        return names.join(' / ');
    }
    function artboardIndex(item, document) {
        var b, r, x, y, i;
        try { b = bounds(item); x = (b[0] + b[2]) / 2; y = (b[1] + b[3]) / 2; }
        catch (ignore) { return -1; }
        for (i = 0; i < document.artboards.length; i++) {
            r = document.artboards[i].artboardRect;
            if (x >= r[0] && x <= r[2] && y <= r[1] && y >= r[3]) { return i; }
        }
        return -1;
    }
    function metadata(file) {
        var key, cached, data, oldEncoding, value = { width: null, height: null, colorSpace: null, transparent: null, bitsPerChannel: null };
        var offset, marker, length, components, color, chunk;
        if (!file || !file.exists) { return value; }
        key = pathKey(file.fsName) + ':' + file.length + ':' + read(file, 'modified', '');
        cached = state.files[key]; if (cached) { return cached; }
        function u8(index) { return data.charCodeAt(index) & 255; }
        function u16(index) { return u8(index) * 256 + u8(index + 1); }
        function u32(index) { return u8(index) * 16777216 + u8(index + 1) * 65536 + u8(index + 2) * 256 + u8(index + 3); }
        try {
            oldEncoding = file.encoding; file.encoding = 'BINARY';
            if (!file.open('r')) { return value; }
            try { data = file.read(262144); } finally { file.close(); file.encoding = oldEncoding; }
            if (data.length >= 33 && data.substr(1, 3) === 'PNG' && u8(0) === 137) {
                value.width = u32(16); value.height = u32(20); color = u8(25);
                value.colorSpace = color === 0 || color === 4 ? 'Gray' : 'RGB';
                value.bitsPerChannel = u8(24);
                offset = 8;
                while (offset + 12 <= data.length) {
                    length = u32(offset); chunk = data.substr(offset + 4, 4);
                    if (length > data.length - offset - 12) { break; }
                    if (chunk === 'pHYs' && length === 9 && u8(offset + 16) === 1) {
                        value.dpiX = u32(offset + 8) * 0.0254; value.dpiY = u32(offset + 12) * 0.0254;
                    }
                    if (chunk === 'tRNS') { value.transparent = true; }
                    if (chunk === 'IEND' && value.transparent === null) { value.transparent = false; }
                    offset += length + 12;
                }
                // Alpha channel types are definitively transparent; for the
                // other types keep the tRNS/IEND verdict from the chunk loop.
                if (color === 4 || color === 6) { value.transparent = true; }
            } else if (data.length >= 4 && u16(0) === 65496) {
                offset = 2;
                while (offset + 4 < data.length) {
                    if (u8(offset) !== 255) { break; }
                    marker = u8(offset + 1); offset += 2;
                    if (marker === 255) { offset--; continue; }
                    if (marker === 217 || marker === 218) { break; }
                    if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) { continue; }
                    length = u16(offset); if (length < 2 || offset + length > data.length) { break; }
                    if (marker === 224 && length >= 16 && data.substr(offset + 2, 5) === 'JFIF\x00') {
                        var unit = u8(offset + 9), densityX = u16(offset + 10), densityY = u16(offset + 12);
                        if ((unit === 1 || unit === 2) && densityX > 0 && densityY > 0) {
                            value.dpiX = densityX * (unit === 2 ? 2.54 : 1); value.dpiY = densityY * (unit === 2 ? 2.54 : 1);
                        }
                    }
                    if ((marker >= 192 && marker <= 195) || (marker >= 197 && marker <= 199) || (marker >= 201 && marker <= 203) || (marker >= 205 && marker <= 207)) {
                        value.height = u16(offset + 3); value.width = u16(offset + 5); components = u8(offset + 7);
                        value.bitsPerChannel = u8(offset + 2);
                        value.colorSpace = components === 1 ? 'Gray' : (components === 3 ? 'RGB' : (components === 4 ? 'CMYK' : null));
                        value.transparent = false; break;
                    }
                    offset += length;
                }
            }
        } catch (ignore) { try { file.close(); file.encoding = oldEncoding; } catch (alsoIgnore) {} }
        state.files[key] = value;
        return value;
    }
    function documentState(document) {
        // The host hands back a new Document proxy on every access, so identity
        // comparison is unreliable. Key the metadata cache by document name+path.
        var id = '';
        try { id = String(document.name) + '|' + String(document.path || ''); } catch (ignore) {}
        if (state.documentId !== id) {
            state.documentId = id; state.files = {};
        }
    }
    function colorName(value) {
        var text = String(value || '').replace(/^.*\./, '').toLowerCase();
        if (text === 'rgb') { return 'RGB'; }
        if (text === 'cmyk') { return 'CMYK'; }
        if (text === 'gray' || text === 'grayscale') { return 'Gray'; }
        if (text === 'bitmap' || text === 'blackandwhite') { return 'Bitmap'; }
        if (text === 'lab') { return 'Lab'; }
        return value ? String(value) : null;
    }
    function rowFor(item, document) {
        var file = fileOf(item);
        var parts = null, meta = metadata(file), box, width, height, ppiX = null, ppiY = null;
        var naturalX = meta.dpiX > 0 ? 72 / meta.dpiX : 1, naturalY = meta.dpiY > 0 ? 72 / meta.dpiY : 1;
        var embedded = kind(item) === 'RasterItem' && read(item, 'embedded', true);
        try { parts = matrixParts(item.matrix); } catch (ignore) {}
        try {
            box = item.boundingBox; width = Math.abs(box[2] - box[0]); height = Math.abs(box[1] - box[3]);
            if (parts && width > EPSILON && height > EPSILON && meta.width && meta.height) {
                // boundingBox is already in document points (scaling applied),
                // so dividing by parts.scaleX again would inflate the PPI.
                ppiX = meta.width * 72 / width; ppiY = meta.height * 72 / height;
            }
        } catch (ignore2) {}
        return {
            name: name(item) === kind(item) && file ? baseName(file) : name(item), path: file ? file.fsName : '',
            missing: !embedded && (!file || !file.exists), embedded: !!embedded, kind: kind(item),
            layer: layerPath(item), artboard: artboardIndex(item, document), selected: !!read(item, 'selected', false),
            scaleX: parts ? parts.scaleX / naturalX * 100 : null, scaleY: parts ? parts.scaleY / naturalY * 100 : null,
            scaleBasis: meta.dpiX > 0 ? 'source-resolution' : '72-ppi-coordinate-basis',
            rotation: parts ? normalizedAngle(-parts.rotation) : null, reflected: parts ? !parts.reflected : null,
            sheared: parts ? Math.abs(parts.shear) > 0.0001 : null,
            ppiX: ppiX, ppiY: ppiY, colorSpace: colorName(kind(item) === 'RasterItem' ? read(item, 'imageColorSpace', meta.colorSpace) : meta.colorSpace),
            bitsPerChannel: read(item, 'bitsPerChannel', meta.bitsPerChannel),
            transparent: read(item, 'transparent', meta.transparent), overprint: read(item, 'overprint', null)
        };
    }
    A.scan = function () {
        var document, targets, rows = [], missing = 0, selected, i, row;
        if (!app.documents.length) { return { documentName: '', linkCount: 0, missingCount: 0, selectionCount: 0, rows: [] }; }
        document = checkDocument(); documentState(document);
        targets = items(false, ['PlacedItem', 'RasterItem']); selected = items(true);
        for (i = 0; i < targets.length; i++) {
            row = rowFor(targets[i], document); rows.push(row); if (row.missing) { missing++; }
        }
        return { documentName: document.name, linkCount: rows.length, missingCount: missing, selectionCount: selected.length, rows: rows };
    };
    // Lightweight status probe for panel refresh: counts only, no rowFor().
    // rowFor() reads image headers, decomposes matrices and walks layers for
    // every link; none of that data is shown by either slim panel.
    A.summary = function () {
        var document, targets, selected, missing = 0, i, item, file, embedded;
        if (!app.documents.length) { return { documentName: '', linkCount: 0, missingCount: 0, selectionCount: 0 }; }
        document = checkDocument(); documentState(document);
        targets = items(false, ['PlacedItem', 'RasterItem']);
        for (i = 0; i < targets.length; i++) {
            item = targets[i];
            embedded = kind(item) === 'RasterItem' && read(item, 'embedded', true);
            file = fileOf(item);
            if (!embedded && (!file || !file.exists)) { missing++; }
        }
        selected = items(true);
        return { documentName: document.name, linkCount: targets.length, missingCount: missing, selectionCount: selected.length };
    };

    function pdfOptions(payload, callback) {
        var pref = app.preferences.PDFFileOptions, page = pref.pageToOpen, crop = pref.pDFCropToBox, target;
        var mapping = { media: 'PDFMEDIABOX', crop: 'PDFCROPBOX', trim: 'PDFTRIMBOX', bleed: 'PDFBLEEDBOX', art: 'PDFARTBOX', bounding: 'PDFBOUNDINGBOX' };
        try {
            if (typeof payload.page !== 'undefined') {
                target = Number(payload.page);
                if (!finite(target) || target < 1 || target !== Math.floor(target)) { fail('PDF 页码必须为正整数。'); }
                pref.pageToOpen = target;
            }
            if (payload.crop) {
                if (!mapping[payload.crop]) { fail('未知的 PDF 裁切模式。'); }
                pref.pDFCropToBox = PDFBoxType[mapping[payload.crop]];
            }
            return callback();
        } finally { pref.pageToOpen = page; pref.pDFCropToBox = crop; }
    }
    A.place = function (payload) {
        var document = checkDocument(), paths = payload.paths || (payload.path ? [payload.path] : null), files, i, rect;
        if (!paths) { files = File.openDialog('选择要置入的文件', undefined, true); if (!files) { return cancel(); } paths = files instanceof Array ? files : [files]; }
        rect = document.artboards[document.artboards.getActiveArtboardIndex()].artboardRect;
        return pdfOptions(payload, function () {
            return batch(paths, function (path, index) {
                var file = safeFile(path.fsName || path), item = document.placedItems.add();
                try { item.file = file; item.position = [rect[0] + index * 12, rect[1] - index * 12]; item.selected = true; }
                catch (error) { try { item.remove(); } catch (ignore) {} throw error; }
            }, true);
        });
    };
    function trace(line) {
        try {
            var log = new File(Folder.temp.fsName + '/LinkForge.log'), stamp = new Date().toString();
            log.encoding = 'UTF-8';
            if (log.open('a')) { log.writeln(stamp + ' | ' + line); log.close(); }
        } catch (ignore) {}
    }
    // Folder.execute() often hands the folder to the shell without a visible,
    // focused window, so reveal first goes through scripts/reveal.ps1 (which
    // activates the window), then a plain shell call, then the folder itself.
    function revealScript() {
        var root, script;
        try { root = new File($.fileName).parent.parent; } catch (ignore) { return null; }
        if (!root || !root.fsName) { return null; }
        script = new File(root.fsName + '/scripts/reveal.ps1');
        try { return script.exists ? script : null; } catch (ignore2) { return null; }
    }
    function tempPath(name) { return Folder.temp.fsName + '/' + name; }

    function writeText(file, text) {
        try {
            file.encoding = 'UTF-8';
            if (!file.open('w')) { return false; }
            file.write(text);
            file.close();
            return true;
        } catch (ignore) {
            try { file.close(); } catch (ignore2) {}
            return false;
        }
    }

    function writeRaw(file, text) {
        try {
            if (!file.open('w')) { return false; }
            file.write(text);
            file.close();
            return true;
        } catch (ignore) {
            try { file.close(); } catch (ignore2) {}
            return false;
        }
    }

    function readText(file) {
        var text = '';
        try {
            if (!file.exists) { return ''; }
            file.encoding = 'UTF-8';
            if (file.open('r')) { text = file.read(); file.close(); }
        } catch (ignore) { return ''; }
        return text ? String(text).replace(/^\uFEFF/, '').replace(/[\r\n]+$/, '') : '';
    }

    // app.system() throws as soon as the command string carries a CJK or UNC
    // path, so the path never reaches a command line: it is written to a UTF-8
    // file and an ASCII-only launcher runs the script (vbs first, no console).
    function launchAndWait(item, resultFile) {
        var target = new File(tempPath('LinkForge-reveal.' + item.ext)), result = new File(resultFile), text = '', waited;
        try { if (result.exists) { result.remove(); } } catch (ignore) {}
        if (!writeRaw(target, item.body)) { trace(item.ext + ' write failed'); return ''; }
        try { if (!target.execute()) { trace(item.ext + ' execute false'); return ''; } }
        catch (error) { trace(item.ext + ' execute threw'); return ''; }
        for (waited = 0; waited < item.wait; waited++) {
            text = readText(result);
            if (text) { break; }
            try { $.sleep(100); } catch (ignore) { break; }
        }
        trace(item.ext + ' result=' + (text || 'none'));
        if (text && text.indexOf('error') === 0) { return ''; }
        return text;
    }

    function runReveal(file) {
        var script = revealScript(), pathFile = tempPath('LinkForge-reveal.txt'), resultFile = tempPath('LinkForge-reveal.result'),
            result = new File(resultFile), command, launchers, i;
        if (!script) { trace('ps1 missing'); return ''; }
        try { if (result.exists) { result.remove(); } } catch (ignore) {}
        if (!writeText(new File(pathFile), String(file.fsName))) { trace('path file failed'); return ''; }
        command = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + script.fsName + '" -PathFile "' + pathFile + '" -ResultFile "' + resultFile + '"';
        launchers = [
            { ext: 'vbs', wait: 40, body: 'Set sh = CreateObject("WScript.Shell")\r\nsh.Run "' + command.replace(/"/g, '""') + '", 0, False\r\n' },
            { ext: 'cmd', wait: 25, body: '@echo off\r\n' + command + '\r\n' }
        ];
        for (i = 0; i < launchers.length; i++) {
            if (launchAndWait(launchers[i], resultFile)) { return 'select'; }
        }
        return '';
    }

    // Last shell attempt: Explorer selects the file, without taking focus.
    function runExplorer(file) {
        var target = new File(tempPath('LinkForge-select.cmd'));
        var body = '@echo off\r\nexplorer.exe /select,"' + String(file.fsName) + '"\r\n';
        if (!writeRaw(target, body)) { return false; }
        try { return target.execute(); } catch (ignore) { return false; }
    }

    function osReveal(file) {
        var path = String(file.fsName), windows = $.os.indexOf('Windows') >= 0, code = null, folder;
        if (windows) {
            if (runReveal(file)) { return 'select'; }
            if (runExplorer(file)) { trace('explorer launcher sent'); return 'select'; }
            trace('shell reveal failed for ' + path);
        } else {
            try { code = app.system('open -R "' + path + '"'); }
            catch (ignore) { code = null; }
            if (code !== null && code !== 9009 && code !== 9001) { return 'select'; }
        }
        folder = file.parent;
        try { if (folder.exists && folder.execute()) { trace('fallback folder.execute ok'); return 'folder'; } }
        catch (ignore2) { trace('fallback folder.execute threw'); }
        return '';
    }
    A.reveal = function () {
        var targets = items(true, ['PlacedItem', 'RasterItem']), opened = {}, paths = [], method = '';
        var result = batch(targets, function (item) {
            var file = fileOf(item), folder, key, how;
            if (!file) { fail('该嵌入对象没有源文件。'); }
            folder = file.parent; key = pathKey(folder.fsName);
            if (!folder.exists) { fail('源文件夹已不存在：' + folder.fsName); }
            if (opened[key]) { return false; }
            how = osReveal(file);
            if (!how) { fail('系统无法打开源文件夹。'); }
            if (how === 'select') { method = 'select'; } else if (!method) { method = 'folder'; }
            opened[key] = true; paths.push(file.fsName);
        }, true);
        result.paths = paths;
        result.method = method;
        return result;
    };
    A.relink = function (payload) {
        var targets = linkedSelection(), file;
        if (!targets.length) { fail('请先选择链接图稿。'); }
        file = payload.path ? safeFile(payload.path) : File.openDialog('选择用于替换的链接文件');
        if (!file) { return cancel(); }
        return batch(targets, function (item) { item.relink(file); }, false);
    };
    A.relinkFolder = function (payload) {
        var targets = linkedSelection(), folder;
        if (!targets.length) { fail('请先选择链接图稿。'); }
        folder = payload.folder ? new Folder(payload.folder) : Folder.selectDialog('选择新的源文件夹');
        if (!folder) { return cancel(); } if (!folder.exists) { fail('文件夹不存在。'); }
        return batch(targets, function (item) {
            var source = fileOf(item); if (!source) { fail('无法获取该对象的源文件名。'); }
            item.relink(safeFile(folder.fsName + '/' + baseName(source)));
        }, false);
    };
    A.embed = function () { return eachSelected(function (item) { item.embed(); }, ['PlacedItem']); };
    function transform(payload, mode) {
        var result = eachSelected(function (item) {
            var parts = matrixParts(item.matrix), sx = parts.scaleX, sy = parts.scaleY, angle = parts.rotation, delta;
            var meta = metadata(fileOf(item)), naturalX = meta.dpiX > 0 ? 72 / meta.dpiX : 1, naturalY = meta.dpiY > 0 ? 72 / meta.dpiY : 1;
            if (mode === 'scale' || mode === 'all') { sx = naturalX; sy = naturalY; }
            if (mode === 'rotation' || mode === 'all') { angle = 0; }
            if (mode === 'set') {
                sx = Number(payload.scaleX) / 100 * naturalX; sy = Number(typeof payload.scaleY === 'undefined' ? payload.scaleX : payload.scaleY) / 100 * naturalY;
                angle = typeof payload.rotation === 'undefined' ? parts.rotation : -Number(payload.rotation);
            }
            delta = changeMatrix(item.matrix, sx, sy, angle);
            // Host transform arguments use y-up; PlacedItem.matrix reports y-down.
            delta.mValueB = -delta.mValueB; delta.mValueC = -delta.mValueC;
            item.transform(delta, true, true, true, true, 100, Transformation.CENTER);
        }, ['PlacedItem']);
        return result;
    }
    A.resetScale = function (payload) { return transform(payload, 'scale'); };
    A.resetRotation = function (payload) { return transform(payload, 'rotation'); };
    A.resetTransform = function (payload) { return transform(payload, 'all'); };
    A.setTransform = function (payload) { return transform(payload, 'set'); };
    function exactMatrix(item, target) {
        var fields = ['mValueA', 'mValueB', 'mValueC', 'mValueD', 'mValueTX', 'mValueTY'], i, current, delta, determinant;
        function same(left, right) {
            var index;
            for (index = 0; index < fields.length; index++) { if (Math.abs(left[fields[index]] - right[fields[index]]) > 0.001) { return false; } }
            return true;
        }
        try { item.matrix = target; } catch (ignore) {}
        current = item.matrix; if (same(current, target)) { return; }
        determinant = current.mValueA * current.mValueD - current.mValueB * current.mValueC;
        if (Math.abs(determinant) < EPSILON) { fail('无法保留已退化的置入矩阵。'); }
        delta = app.getIdentityMatrix();
        delta.mValueA = (target.mValueA * current.mValueD - target.mValueC * current.mValueB) / determinant;
        delta.mValueB = (target.mValueB * current.mValueD - target.mValueD * current.mValueB) / determinant;
        delta.mValueC = (-target.mValueA * current.mValueC + target.mValueC * current.mValueA) / determinant;
        delta.mValueD = (-target.mValueB * current.mValueC + target.mValueD * current.mValueA) / determinant;
        delta.mValueTX = target.mValueTX - delta.mValueA * current.mValueTX - delta.mValueC * current.mValueTY;
        delta.mValueTY = target.mValueTY - delta.mValueB * current.mValueTX - delta.mValueD * current.mValueTY;
        item.transform(delta, true, true, true, true, 100, Transformation.DOCUMENTORIGIN);
        if (!same(item.matrix, target)) { fail('宿主无法保留置入矩阵，已保留原始图稿。'); }
    }
    A.updatePdfPage = function (payload) {
        var targets = linkedSelection(), document = checkDocument();
        if (typeof payload.page === 'undefined') { fail('请提供 PDF 页码。'); }
        return pdfOptions(payload, function () {
            var result = batch(targets, function (item) {
                var source = fileOf(item), replacement = null, properties = ['name', 'note', 'opacity', 'blendingMode', 'artworkKnockout'], i;
                if (!source || !source.exists || !/\.(pdf|ai)$/i.test(baseName(source))) { fail('替换页码需要已链接且实际存在的 PDF 或 PDF 兼容的 AI 文件。'); }
                try {
                    replacement = document.placedItems.add(); replacement.file = source;
                    replacement.move(item, ElementPlacement.PLACEBEFORE); exactMatrix(replacement, item.matrix);
                    for (i = 0; i < properties.length; i++) { replacement[properties[i]] = item[properties[i]]; }
                    replacement.selected = true; item.remove();
                } catch (error) { if (replacement) { try { replacement.remove(); } catch (ignore) {} } throw error; }
            }, false);
            return result;
        });
    };
    H.requireDocument = checkDocument; H.items = items; H.eachSelected = eachSelected;
    H.mmToPt = function (mm) { return Number(mm) * 72 / 25.4; };
    H.bounds = bounds; H.fileOf = fileOf; H.isEditable = isEditable; H.batch = batch;
    H.matrixParts = matrixParts; H.changeMatrix = changeMatrix; H.pathKey = pathKey;
    H.message = message;
}());
