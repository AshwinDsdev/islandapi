//pageutil.js


export const utils =
{
    /**
     * @function togglePageOpacity
     * @description Sets the page opacity. It can be used to show and hide the page conent.
     * @param {number} val - The value in-between 0 and 1.
     * @example
     * // Example usage of the function
     * togglePageOpacity(0.5);
     */
    togglePageOpacity: function (val)
    {
        document.body.style.opacity = val;
    },

    /**
     * @function showPage
     * @description Shows or hide the page.
     * @param {boolean} val - The value can be true or false.
     * @example
     * // Example usage of the function
     * showPage(false);
     */
    showPage: function (val)
    {
        document.body.style.opacity = val ? 1 : 0;
    },

    /**
     * @function togglePageDisplay
     * @description Sets the page display. It can be used to show and hide the page conent.
     * @param {string} val - The value can be 'block' or 'none'.
     * @example
     * // Example usage of the function
     * togglePageDisplay('none');
     */

    togglePageDisplay: function (val)
    {
        document.body.style.display = val;
    },

    /**
     * Get an element by its XPath.
     * @param {string} xpath - The XPath of the element.
     * @param {Document} [context=document] - The context in which to search for the XPath.
     * @returns {Element|null} The first element matching the XPath, or null if no match is found.
     */
    getElementByXPath: function (xpath, context = document)
    {
        const result = document.evaluate(xpath, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue;
    }
}