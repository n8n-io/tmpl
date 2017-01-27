/**
 * @module tmpl
 *
 * tmpl          - Root function, returns the template value, render with data
 * tmpl.hasExpr  - Test the existence of a expression inside a string
 * tmpl.loopKeys - Get the keys for an 'each' loop (used by `_each`)
 */
//#if 0 // only in the unprocessed source
/* eslint no-unused-vars: [2, {args: "after-used", varsIgnorePattern: "tmpl"}] */
/* global brackets, riot */
//#endif
//#define LIST_GETTERS 0

// IIFE for tmpl()
//#if ES6
export
//#endif
var tmpl = (function () {
  //
  // Closure data
  // --------------------------------------------------------------------------
  var _cache = {}

  //
  // Runtime Functions
  // --------------------------------------------------------------------------

  /**
   * The exposed tmpl function returns the template value from the cache, render with data.
   *
   * @param   {string} str  - Expression or template with zero or more expressions
   * @param   {Object} data - A Tag instance, for setting the context
   * @returns {*} Raw value of the expression or template to render
   * @private
   */
  function _tmpl (str, data) {
    if (!str) return str  // catch falsy values here

    //#if DEBUG
    /*eslint no-console: 0 */
    if (data && data._debug_) {
      data._debug_ = 0
      if (!_cache[str]) {
        _cache[str] = _create(str, 1)  // request debug output
        var rs = typeof riot === 'undefined'
          ? '(riot undefined)' : JSON.stringify(riot.settings)

        console.log('--- DEBUG' +
          '\n riot.settings: ' + rs + '\n data: ' + JSON.stringify(data))
      }
    }
    //#endif

    // At this point, the expressions must have been parsed, it only remains to construct
    // the function (if it is not in the cache) and call it to replace expressions with
    // their values. data (`this`) is a Tag instance, _logErr is the error handler.

    return (_cache[str] || (_cache[str] = _create(str))).call(data, _logErr)
  }

  /**
   * Checks for an expression within a string, using the current brackets.
   *
   * @param   {string } str - String where to search
   * @returns {boolean} `true` if the string contains an expression.
   * @function
   */
  _tmpl.hasExpr = brackets.hasExpr

  /**
   * Parses the `each` expression to detect how to map the collection data to the
   * children tags. Used by riot browser/tag/each.js
   *
   * {key, i in items} -> { key, pos, val }
   *
   * @param   {String} expr - string passed in the 'each' attribute
   * @returns {Object} The object needed to check how the items in the collection
   *   should be mapped to the children tags.
   * @function
   */
  _tmpl.loopKeys = brackets.loopKeys

  /**
   * Clears the internal cache of compiled expressions.
   *
   * @function
   */
  // istanbul ignore next
  _tmpl.clearCache = function () { _cache = {} }

  /**
   * Holds a custom function to handle evaluation errors.
   *
   * This property allows to detect errors _in the evaluation_, by setting its value to a
   * function that receives the generated Error object, augmented with an object `riotData`
   * containing the properties `tagName` and `_riot_id` of the context at error time.
   *
   * Other (usually fatal) errors, such as "Parse Error" generated by the Function
   * constructor, are not intercepted.
   *
   * If this property is not set, or set to falsy, as in previous versions the error
   * is silently ignored.
   *
   * @type {function}
   * @static
   */
  _tmpl.errorHandler = null

  /**
   * Output an error message through the `_tmpl.errorHandler` function and
   * the console object.
   * @param {Error}  err - The Error instance generated by the exception
   * @param {object} ctx - The context
   * @private
   */
  function _logErr (err, ctx) {
    // add some data to the Error object
    err.riotData = {
      tagName: ctx && ctx.__ && ctx.__.tagName,
      _riot_id: ctx && ctx._riot_id  //eslint-disable-line camelcase
    }

    // user error handler
    if (_tmpl.errorHandler) _tmpl.errorHandler(err)
    else if (
      typeof console !== 'undefined' &&
      typeof console.error === 'function'
    ) {
      if (err.riotData.tagName) {
        console.error('Riot template error thrown in the <%s> tag', err.riotData.tagName)
      }
      console.error(err)
    }
  }

  /**
   * Creates a function instance to get a value from the received template string.
   *
   * It'll halt the app if the expression has errors (Parse Error or SyntaxError).
   *
   * @param {string} str - The template. Can include zero or more expressions
   * @returns {Function} An instance of Function with the compiled template.
   * @private
   */
  function _create (str) {
    var expr = _getTmpl(str)

    if (expr.slice(0, 11) !== 'try{return ') expr = 'return ' + expr

//#if DEBUG
    if (arguments.length > 1) console.log('--- getter:\n    `' + expr + '`\n---')
//#elif LIST_GETTERS
    //console.log(' In: `%s`\nOUT: `%s`', str, expr)
//#endif
/*#if CSP
    return safeEval.func('E', expr + ';')
//#else */
    // Now, we can create the function to return by calling the Function constructor.
    // The parameter `E` is the error handler for runtime only.
    return new Function('E', expr + ';')    // eslint-disable-line no-new-func
//#endif
  }

  //
  // Compilation
  // --------------------------------------------------------------------------

  // Regexes for `_getTmpl` and `_parseExpr`
  var
    CH_IDEXPR = String.fromCharCode(0x2057),
    RE_CSNAME = /^(?:(-?[_A-Za-z\xA0-\xFF][-\w\xA0-\xFF]*)|\u2057(\d+)~):/,
    RE_QBLOCK = RegExp(brackets.S_QBLOCKS, 'g'),
    RE_DQUOTE = /\u2057/g,
    RE_QBMARK = /\u2057(\d+)~/g     // string or regex marker, $1: array index

  /**
   * Parses an expression or template with zero or more expressions enclosed with
   * the current brackets.
   *
   * @param   {string} str - Raw template string, without comments
   * @returns {string} Processed template, ready for evaluation.
   * @private
   */
  function _getTmpl (str) {
    var
      qstr = [],                      // hidden qblocks
      expr,
      parts = brackets.split(str.replace(RE_DQUOTE, '"'), 1)  // get text/expr parts

    // We can have almost anything as expressions, except comments... hope
    if (parts.length > 2 || parts[0]) {
      var i, j, list = []

      for (i = j = 0; i < parts.length; ++i) {

        expr = parts[i]

        if (expr && (expr = i & 1               // every odd element is an expression

            ? _parseExpr(expr, 1, qstr)         // mode 1 convert falsy values to "",
                                                // except zero
            : '"' + expr                        // ttext: convert to js literal string
                .replace(/\\/g, '\\\\')         // this is html, preserve backslashes
                .replace(/\r\n?|\n/g, '\\n')    // normalize eols
                .replace(/"/g, '\\"') +         // escape inner double quotes
              '"'                               // enclose in double quotes

          )) list[j++] = expr

      }

      expr = j < 2 ? list[0]                    // optimize code for 0-1 parts
           : '[' + list.join(',') + '].join("")'

    } else {

      expr = _parseExpr(parts[1], 0, qstr)      // single expressions as raw value
    }

    // Restore quoted strings and regexes
    if (qstr[0]) {
      expr = expr.replace(RE_QBMARK, function (_, pos) {
        return qstr[pos]
          .replace(/\r/g, '\\r')
          .replace(/\n/g, '\\n')
      })
    }
    return expr
  }

  var
    RE_BREND = {
      '(': /[()]/g,
      '[': /[[\]]/g,
      '{': /[{}]/g
    }

  /**
   * Parses an individual expression `{expression}` or shorthand `{name: expression, ...}`
   *
   * For shorthand names, riot supports a limited subset of the full w3c/html specs of
   * non-quoted identifiers (closer to CSS1 that CSS2).
   *
   * The regex used for recognition is `-?[_A-Za-z\xA0-\xFF][-\w\xA0-\xFF]*`.
   *
   * This regex accepts almost all ISO-8859-1 alphanumeric characters within an html
   * identifier. Doesn't works with escaped codepoints, but you can use Unicode code points
   * beyond `\u00FF` by quoting the names (not recommended).
   *
   * @param   {string} expr   - The expression, without brackets
   * @param   {number} asText - 0: raw value, 1: falsy as "", except 0
   * @param   {Array}  qstr   - Where to store hidden quoted strings and regexes
   * @returns {string} Code to evaluate the expression.
   * @see {@link http://www.w3.org/TR/CSS21/grammar.html#scanner}
   *      {@link http://www.w3.org/TR/CSS21/syndata.html#tokenization}
   * @private
   */
  function _parseExpr (expr, asText, qstr) {

    // Replace non-empty qstrings with a marker that includes its index into the array
    // of replaced qstrings (by hiding regexes and strings here we avoid complications
    // through all the code without affecting the logic).
    //
    // Also, converts whitespace into compacted spaces and trims surrounding spaces
    // and some inner tokens, mainly brackets and separators.
    // We need convert embedded `\r` and `\n` as these chars break the evaluation.
    //
    // WARNING:
    //   Trim and compact is not strictly necessary, but it allows optimized regexes.
    //   Do not touch the next block until you know how/which regexes are affected.

    expr = expr
          .replace(RE_QBLOCK, function (s, div) {   // hide strings & regexes
            return s.length > 2 && !div ? CH_IDEXPR + (qstr.push(s) - 1) + '~' : s
          })
          .replace(/\s+/g, ' ').trim()
          .replace(/\ ?([[\({},?\.:])\ ?/g, '$1')

    if (expr) {
      var
        list = [],
        cnt = 0,
        match

      // Try to match the first name in the possible shorthand list
      while (expr &&
            (match = expr.match(RE_CSNAME)) &&
            !match.index                          // index > 0 means error
        ) {
        var
          key,
          jsb,
          re = /,|([[{(])|$/g

        // Search the next unbracketed comma or the end of 'expr'.
        // If a openning js bracket is found ($1), skip the block,
        // if found the end of expr $1 will be empty and the while loop exits.

        expr = RegExp.rightContext                // before replace
        key  = match[2] ? qstr[match[2]].slice(1, -1).trim().replace(/\s+/g, ' ') : match[1]

        while (jsb = (match = re.exec(expr))[1]) skipBraces(jsb, re)

        jsb  = expr.slice(0, match.index)
        expr = RegExp.rightContext

        list[cnt++] = _wrapExpr(jsb, 1, key)
      }

      // For shorthands, the generated code returns an array with expression-name pairs
      expr = !cnt ? _wrapExpr(expr, asText)
           : cnt > 1 ? '[' + list.join(',') + '].join(" ").trim()' : list[0]
    }
    return expr

    // Skip bracketed block, uses the str value in the closure
    function skipBraces (ch, re) {
      var
        mm,
        lv = 1,
        ir = RE_BREND[ch]

      ir.lastIndex = re.lastIndex
      while (mm = ir.exec(expr)) {
        if (mm[0] === ch) ++lv
        else if (!--lv) break
      }
      re.lastIndex = lv ? expr.length : ir.lastIndex
    }
  }

  // Matches a varname, excludes object keys. $1: lookahead, $2: variable name
  // istanbul ignore next: not both
  var // eslint-disable-next-line max-len
    JS_CONTEXT = '"in this?this:' + (typeof window !== 'object' ? 'global' : 'window') + ').',
    JS_VARNAME = /[,{][\$\w]+(?=:)|(^ *|[^$\w\.{])(?!(?:typeof|true|false|null|undefined|in|instanceof|is(?:Finite|NaN)|void|NaN|new|Date|RegExp|Math)(?![$\w]))([$_A-Za-z][$\w]*)/g,
    JS_NOPROPS = /^(?=(\.[$\w]+))\1(?:[^.[(]|$)/

  /**
   * Generates code to evaluate an expression avoiding breaking on undefined vars.
   *
   * This function include a try..catch block only if needed, if this block is not included,
   * the generated code has no return statement.
   *
   * This `isFinite`, `isNaN`, `Date`, `RegExp`, and `Math` keywords are not wrapped
   * for context detection (defaults to the global object).
   *
   * @param   {string}  expr   - Normalized expression, without brackets
   * @param   {boolean} asText - If trueish, the output is converted to text, not raw values
   * @param   {string}  [key]  - For shorthands, the key name
   * @returns {string}  Compiled expression.
   * @private
   */
  function _wrapExpr (expr, asText, key) {
    var tb

    expr = expr.replace(JS_VARNAME, function (match, p, mvar, pos, s) {
      if (mvar) {
        pos = tb ? 0 : pos + match.length         // check only if needed

        // this, window, and global needs try block too
        if (mvar !== 'this' && mvar !== 'global' && mvar !== 'window') {
          match = p + '("' + mvar + JS_CONTEXT + mvar
          if (pos) tb = (s = s[pos]) === '.' || s === '(' || s === '['
        } else if (pos) {
          tb = !JS_NOPROPS.test(s.slice(pos))     // needs try..catch block?
        }
      }
      return match
    })

    if (tb) {
      expr = 'try{return ' + expr + '}catch(e){E(e,this)}'
    }

    if (key) {  // shorthands
      // w/try : function(){try{return expr}catch(e){E(e,this)}}.call(this)?"name":""
      // no try: (expr)?"name":""
      // ==> 'return [' + expr_list.join(',') + '].join(" ").trim()'
      expr = (tb
          ? 'function(){' + expr + '}.call(this)' : '(' + expr + ')'
        ) + '?"' + key + '":""'

    } else if (asText) {
      // w/try : function(v){try{v=expr}catch(e){E(e,this)};return v||v===0?v:""}.call(this)
      // no try: function(v){return (v=(expr))||v===0?v:""}.call(this)
      // ==> 'return [' + text_and_expr_list.join(',') + '].join("")'
      expr = 'function(v){' + (tb
          ? expr.replace('return ', 'v=') : 'v=(' + expr + ')'
        ) + ';return v||v===0?v:""}.call(this)'
    }
    // else if (!asText)
    //  no try: return expr
    //  w/try : try{return expr}catch(e){E(e,this)}   // returns undefined if error

    return expr
  }

  //#if !NODE
  _tmpl.version = brackets.version = 'WIP'
  //#endif

  return _tmpl

})()
