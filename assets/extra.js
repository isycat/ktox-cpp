(function() {
    const DESKTOP_BP_VAL = 52;
    const TABLET_BP_VAL = 40;
    const DESKTOP_BP = DESKTOP_BP_VAL + "em";
    const TABLET_BP = TABLET_BP_VAL + "em";

    // Standard breakpoints used by Material for MkDocs
    const desktopRegex = /76\.[1-3]\d*em|12[12]\d*px|76\.2\d*em/gi;
    const tabletRegex = /60(\.0+)?em|59\.9\d*em|9[56]\d*px/gi;

    // 2. Hook matchMedia & innerWidth for JS-driven layout
    const origMatchMedia = window.matchMedia;
    window.matchMedia = function(query) {
        if (typeof query !== 'string') return origMatchMedia.apply(window, arguments);
        const patched = query.replace(desktopRegex, DESKTOP_BP).replace(tabletRegex, TABLET_BP);
        return origMatchMedia.call(window, patched);
    };

    try {
        const desc = Object.getOwnPropertyDescriptor(window, 'innerWidth');
        if (desc && desc.configurable) {
            Object.defineProperty(window, 'innerWidth', {
                get: function() {
                    const actual = document.documentElement.clientWidth || window.outerWidth || 0;
                    const emInPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
                    const desktopPx = 76.25 * emInPx;
                    if (actual >= (DESKTOP_BP_VAL * emInPx) && actual < desktopPx) return Math.ceil(desktopPx + 1);
                    return actual;
                },
                configurable: true
            });
        }
    } catch (e) {}

    // 3. Patching Stylesheets
    const patchedSheets = new WeakSet();

    const patchSheet = (sheet) => {
        if (!sheet || patchedSheets.has(sheet)) return;
        try {
            const rules = sheet.cssRules || sheet.rules;
            if (!rules) return;
            for (let i = 0; i < rules.length; i++) {
                const rule = rules[i];
                if (rule.media && (desktopRegex.test(rule.media.mediaText) || tabletRegex.test(rule.media.mediaText))) {
                    rule.media.mediaText = rule.media.mediaText.replace(desktopRegex, DESKTOP_BP).replace(tabletRegex, TABLET_BP);
                } else if (rule.type === 3 && rule.styleSheet) { // @import
                    patchSheet(rule.styleSheet);
                }
            }
            patchedSheets.add(sheet);
        } catch (e) {
            // CORS fallback
            if (sheet.ownerNode && !sheet.ownerNode.dataset.patched) {
                patchExternal(sheet.ownerNode);
            }
        }
    };

    async function patchExternal(node) {
        if (node.dataset.patched || node._patching) return;
        node._patching = true;
        try {
            const href = node.href || node.getAttribute('href');
            const css = node.tagName === 'STYLE' ? node.textContent : await (await fetch(href)).text();
            if (desktopRegex.test(css) || tabletRegex.test(css)) {
                const style = document.createElement('style');
                style.textContent = css.replace(desktopRegex, DESKTOP_BP).replace(tabletRegex, TABLET_BP);
                style.dataset.patchedBy = href || 'inline';
                node.parentNode.insertBefore(style, node.nextSibling);
                node.disabled = true;
                node.dataset.patched = 'true';
            }
        } catch (e) {} finally { delete node._patching; }
    }

    const scan = () => {
        for (let i = 0; i < document.styleSheets.length; i++) patchSheet(document.styleSheets[i]);
        document.querySelectorAll('style:not([data-patched-by])').forEach(s => {
            if (desktopRegex.test(s.textContent)) patchExternal(s);
        });
    };

    // 4. Intercept mutations
    new MutationObserver(() => scan()).observe(document.documentElement, { childList: true, subtree: true });

    // Initial and periodic scan
    scan();
    let count = 0;
    const int = setInterval(() => { scan(); if (++count > 20) clearInterval(int); }, 200);
    ['DOMContentLoaded', 'load', 'pageshow'].forEach(ev => window.addEventListener(ev, scan));
})();
